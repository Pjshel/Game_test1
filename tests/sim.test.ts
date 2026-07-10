import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/command';
import { ROOM_H, ROOM_W, Simulation, type SimEvent } from '../src/core/sim';
import { makeParams } from './helpers/params';

const NOOP: Command[] = [];
const FIRE: Command[] = [{ type: 'fire' }];
const CX = ROOM_W / 2;
const CY = ROOM_H / 2;

function stepN(sim: Simulation, n: number, commands: Command[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    events.push(...sim.step(commands));
  }
  return events;
}

/** 空场:无靶子且各类数量为 0(重生也不会出现新靶) */
function emptyRoom(overrides: Parameters<typeof makeParams>[0] = {}) {
  const params = makeParams({
    enemies: { countStatic: 0, countWanderer: 0, countFighter: 0, ...overrides.enemies },
    ...overrides,
  });
  return params;
}

describe('移动与墙体', () => {
  it('move 按移速推进;持续向左最终被左墙钳制', () => {
    const sim = new Simulation(emptyRoom(), 1, []);
    const before = sim.snapshot().player.x;
    sim.step([{ type: 'move', dx: -1, dy: 0 }]);
    expect(sim.snapshot().player.x).toBeCloseTo(before - 5.33 / 60, 10);
    stepN(sim, 600, [{ type: 'move', dx: -1, dy: 0 }]);
    expect(sim.snapshot().player.x).toBeCloseTo(0.35, 10); // 玩家半径
  });

  it('死亡定格期间世界静止且忽略输入', () => {
    const params = emptyRoom({ player: { maxHp: 1, maxShield: 0 } });
    const sim = new Simulation(params, 1, [{ kind: 'fighter', x: CX + 2, y: CY }]);
    // 等待还击靶击杀玩家
    let died = false;
    for (let i = 0; i < 600 && !died; i++) {
      died = sim.step(NOOP).some((e) => e.type === 'playerDied');
    }
    expect(died).toBe(true);
    const frozen = sim.snapshot();
    expect(frozen.phase).toBe('deathFreeze');
    sim.step([{ type: 'move', dx: 1, dy: 0 }]);
    expect(sim.snapshot().player.x).toBe(frozen.player.x);
  });

  it('死亡定格结束后整房重置(血/能量回满,phase 回 playing)', () => {
    const params = emptyRoom({ player: { maxHp: 1, maxShield: 0 } });
    const sim = new Simulation(params, 1, [{ kind: 'fighter', x: CX + 2, y: CY }]);
    let reset = false;
    for (let i = 0; i < 900 && !reset; i++) {
      reset = sim.step(NOOP).some((e) => e.type === 'roomReset');
    }
    expect(reset).toBe(true);
    const snap = sim.snapshot();
    expect(snap.phase).toBe('playing');
    expect(snap.player.hp).toBe(1);
    expect(snap.player.energy).toBe(200);
    expect(snap.player.x).toBeCloseTo(CX, 10);
  });
});

describe('自动索敌与开火(宪法§2/§3)', () => {
  it('锁定有视线的最近敌人', () => {
    const sim = new Simulation(emptyRoom(), 1, [
      { kind: 'static', x: CX + 4, y: CY },
      { kind: 'static', x: CX - 6, y: CY },
    ]);
    sim.step(NOOP);
    const snap = sim.snapshot();
    const nearest = snap.targets.find((t) => t.x > CX)!;
    expect(snap.lockedTargetId).toBe(nearest.id);
  });

  it('开火朝锁定目标,消耗能量并进入射速冷却', () => {
    const sim = new Simulation(emptyRoom(), 1, [{ kind: 'static', x: CX + 4, y: CY }]);
    const events = stepN(sim, 2, FIRE);
    expect(events.filter((e) => e.type === 'playerFired')).toHaveLength(1); // 冷却生效
    const snap = sim.snapshot();
    expect(snap.player.energy).toBe(199); // 蓝耗1
    expect(snap.bullets).toHaveLength(1);
    expect(snap.bullets[0]!.fromPlayer).toBe(true);
    expect(snap.bullets[0]!.x).toBeGreaterThan(CX); // 朝右侧目标
  });

  it('无目标时朝移动朝向射击', () => {
    const sim = new Simulation(emptyRoom(), 1, []);
    stepN(sim, 3, [{ type: 'move', dx: 0, dy: -1 }]);
    sim.step([...FIRE]);
    const b0 = sim.snapshot().bullets[0]!;
    sim.step(NOOP);
    const b1 = sim.snapshot().bullets[0]!;
    expect(b1.y).toBeLessThan(b0.y); // 向上飞
    expect(b1.x).toBeCloseTo(b0.x, 10);
  });

  it('能量闸:蓝不足无法开火(宪法零耗保底属WP3,本包验证压力)', () => {
    const params = emptyRoom({ weapon: { energyCost: 150, fireRate: 10 } });
    const sim = new Simulation(params, 1, [{ kind: 'static', x: CX + 4, y: CY }]);
    const events = stepN(sim, 60, FIRE);
    expect(events.filter((e) => e.type === 'playerFired')).toHaveLength(1); // 200→50,第二发被闸
    expect(sim.snapshot().player.energy).toBe(50);
  });
});

describe('命中、击退与能量球(局内系统§2:进攻产能量)', () => {
  it('命中造成伤害并按弹道方向击退 0.4 格', () => {
    const params = emptyRoom({ enemies: { knockbackTiles: 0.4 } });
    const sim = new Simulation(params, 1, [{ kind: 'static', x: CX + 3, y: CY }]);
    let hit: SimEvent | undefined;
    for (let i = 0; i < 120 && !hit; i++) {
      hit = sim.step(FIRE).find((e) => e.type === 'targetHit');
    }
    expect(hit).toBeDefined();
    const target = sim.snapshot().targets[0]!;
    expect(target.hp).toBe(2); // 3血 - 1伤
    expect(target.x).toBeCloseTo(CX + 3 + 0.4, 9); // 沿+x击退
  });

  it('击杀掉落能量球,拾取回能', () => {
    const params = emptyRoom({ weapon: { energyCost: 5, fireRate: 10 } });
    const sim = new Simulation(params, 1, [{ kind: 'static', x: CX + 2, y: CY }]);
    let killed = false;
    let fired = 0;
    for (let i = 0; i < 300 && !killed; i++) {
      const events = sim.step(FIRE);
      fired += events.filter((e) => e.type === 'playerFired').length;
      killed = events.some((e) => e.type === 'targetKilled');
    }
    expect(killed).toBe(true);
    expect(fired).toBeGreaterThanOrEqual(3); // 3血靶至少3发
    expect(sim.snapshot().orbs).toHaveLength(1);
    // 走向能量球拾取
    let picked: SimEvent | undefined;
    for (let i = 0; i < 300 && !picked; i++) {
      picked = sim.step([{ type: 'move', dx: 1, dy: 0 }]).find((e) => e.type === 'orbPicked');
    }
    expect(picked).toBeDefined();
    expect(sim.snapshot().orbs).toHaveLength(0);
    // 松开扳机后不再耗蓝:结算 = 200 − 已开火数×5 + 回能10
    expect(sim.snapshot().player.energy).toBe(200 - fired * 5 + 10);
  });

  it('靶子全灭后按延迟重生一组', () => {
    const params = makeParams({
      enemies: { countStatic: 1, countWanderer: 0, countFighter: 0 },
      weapon: { fireRate: 10 },
      flow: { respawnDelayS: 0.5 },
    });
    const sim = new Simulation(params, 1, [{ kind: 'static', x: CX + 2, y: CY }]);
    let killedAt = -1;
    for (let i = 0; i < 300 && killedAt < 0; i++) {
      if (sim.step(FIRE).some((e) => e.type === 'targetKilled')) {
        killedAt = i;
      }
    }
    expect(killedAt).toBeGreaterThanOrEqual(0);
    let respawned = false;
    for (let i = 0; i < 40 && !respawned; i++) {
      respawned = sim.step(NOOP).some((e) => e.type === 'targetsRespawned');
    }
    expect(respawned).toBe(true);
    expect(sim.snapshot().targets).toHaveLength(1);
  });
});

describe('生存模型(宪法§4)', () => {
  it('受击优先扣盾,溢出伤血', () => {
    const params = emptyRoom({
      player: { maxShield: 1 },
      enemies: { bulletDamage: 2, fighterFirePeriodS: 0.3 },
    });
    const sim = new Simulation(params, 1, [{ kind: 'fighter', x: CX + 3, y: CY }]);
    let hitEvent: SimEvent | undefined;
    for (let i = 0; i < 300 && !hitEvent; i++) {
      hitEvent = sim.step(NOOP).find((e) => e.type === 'playerHit');
    }
    expect(hitEvent).toBeDefined();
    const snap = sim.snapshot();
    expect(snap.player.shield).toBe(0); // 盾1挡1
    expect(snap.player.hp).toBe(4); // 溢出1伤血
  });

  it('无敌帧期间敌弹穿过角色,不再受击', () => {
    const params = emptyRoom({
      player: { iframesS: 2 },
      enemies: { fighterFirePeriodS: 0.3 },
    });
    const sim = new Simulation(params, 1, [{ kind: 'fighter', x: CX + 3, y: CY }]);
    const events = stepN(sim, 150, NOOP); // 2.5秒:期间多发敌弹抵达
    const hits = events.filter((e) => e.type === 'playerHit');
    expect(hits).toHaveLength(1); // 后续弹在无敌帧内全部穿过
    expect(sim.snapshot().player.shield).toBe(3);
  });

  it('脱离受击后按延迟回盾;血绝不自然恢复', () => {
    const params = emptyRoom({
      player: { maxShield: 2, shieldRegenDelayS: 0.5, shieldRegenPerS: 2, maxHp: 5 },
      // 射击间隔拉长到3秒:先挨第一发,击杀后第二发永远不会出膛
      enemies: { bulletDamage: 3, fighterFirePeriodS: 3 },
      weapon: { damage: 4, fireRate: 10 }, // 一发清掉4血还击靶
    });
    const sim = new Simulation(params, 1, [{ kind: 'fighter', x: CX + 3, y: CY }]);
    // 阶段1:站桩挨一发(盾2挡2,溢出1伤血)
    let hitDone = false;
    for (let i = 0; i < 400 && !hitDone; i++) {
      hitDone = sim.step(NOOP).some((e) => e.type === 'playerHit');
    }
    expect(hitDone).toBe(true);
    expect(sim.snapshot().player.shield).toBe(0);
    const hpAfterHit = sim.snapshot().player.hp;
    expect(hpAfterHit).toBe(4);
    // 阶段2:在它下一发(3秒后)之前一枪打死还击靶
    let killed = false;
    for (let i = 0; i < 120 && !killed; i++) {
      killed = sim.step(FIRE).some((e) => e.type === 'targetKilled');
    }
    expect(killed).toBe(true);
    expect(sim.snapshot().targets).toHaveLength(0); // counts=0,不再重生
    // 阶段3:0.5s延迟 + 2点/秒 → 100 tick 内回满2点盾
    stepN(sim, 100, NOOP);
    expect(sim.snapshot().player.shield).toBe(2);
    expect(sim.snapshot().player.hp).toBe(hpAfterHit); // 血没有跟着回
  });
});

describe('命令边界(继承WP0语义)', () => {
  it('step 全有或全无:批内任一命令非法时状态不变', () => {
    const sim = new Simulation(emptyRoom(), 1, []);
    const before = sim.snapshot();
    expect(() =>
      sim.step([
        { type: 'move', dx: 1, dy: 0 },
        { type: 'move', dx: 5, dy: 0 },
      ]),
    ).toThrow();
    const after = sim.snapshot();
    expect(after.tick).toBe(before.tick);
    expect(after.player.x).toBe(before.player.x);
  });

  it('拒绝越界/NaN/未知命令', () => {
    const sim = new Simulation(emptyRoom(), 1, []);
    expect(() => sim.step([{ type: 'move', dx: 2, dy: 0 }])).toThrow();
    expect(() => sim.step([{ type: 'move', dx: Number.NaN, dy: 0 }])).toThrow();
    expect(() => sim.step([{ type: 'jump' } as never])).toThrow();
  });

  it('applyParams:非法参数拒绝且原参数保留;合法参数即时钳制', () => {
    const sim = new Simulation(emptyRoom(), 1, []);
    expect(() => sim.applyParams({ nonsense: true })).toThrow();
    expect(sim.getParams().player.maxHp).toBe(5);
    const next = structuredClone(sim.getParams());
    next.energy.max = 50;
    sim.applyParams(next);
    expect(sim.snapshot().player.energy).toBe(50); // 200 被钳到新上限
  });
});
