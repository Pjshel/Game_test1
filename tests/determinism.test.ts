import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/command';
import { Simulation, type SimEvent } from '../src/core/sim';
import { fnv1a32 } from './helpers/hash';
import { makeParams } from './helpers/params';

/**
 * WP1.5 交付物 A4:无头确定性测试。
 * 固定种子 + 固定命令序列驱动 1000 tick,末态快照与事件统计的哈希恒定。
 * 参数独立于 feel.json(灰盒调参不破坏指纹),并刻意调成高压场景,
 * 使 1000 tick 内覆盖 击杀/掉球/拾取/受击/死亡/整房重置/靶群重生 全部分支
 * ——下方对事件计数的断言保证覆盖面不会静默退化。
 */

const SEED = 0xc0ffee;
const DIAG = Math.SQRT1_2;

/** 高压覆盖参数:无盾玩家 + 三还击靶快射 + 高射速 + 大拾取半径(实测9类事件全触发) */
function coverageParams() {
  return makeParams({
    player: { maxHp: 4, maxShield: 0, shieldRegenPerS: 0 },
    weapon: { fireRate: 6 },
    energy: { orbPickupRadius: 3 },
    enemies: {
      countStatic: 1,
      countWanderer: 1,
      countFighter: 3,
      fighterFirePeriodS: 0.4,
    },
    flow: { respawnDelayS: 0.5 },
  });
}

const DIRS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: DIAG, dy: DIAG },
  { dx: 0, dy: 0 }, // 停顿段:站桩挨打,保证受击/死亡分支被走到
  { dx: 0, dy: 1 },
  { dx: -DIAG, dy: DIAG },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 0 },
  { dx: 0, dy: -1 },
] as const;

function commandsForTick(tick: number): Command[] {
  const commands: Command[] = [];
  const dir = DIRS[Math.floor(tick / 40) % DIRS.length]!;
  if (dir.dx !== 0 || dir.dy !== 0) {
    commands.push({ type: 'move', dx: dir.dx, dy: dir.dy });
  }
  if (tick >= 30) {
    commands.push({ type: 'fire' }); // 30 tick 后扳机一直按住
  }
  return commands;
}

function runFixedSequence(): { hash: string; eventCounts: Record<string, number> } {
  const sim = new Simulation(coverageParams(), SEED);
  const eventCounts: Record<string, number> = {};
  for (let tick = 0; tick < 1000; tick++) {
    for (const event of sim.step(commandsForTick(tick))) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }
  }
  return { hash: fnv1a32(JSON.stringify({ snapshot: sim.snapshot(), eventCounts })), eventCounts };
}

describe('determinism(1000 tick)', () => {
  it('固定种子+固定命令序列的末态哈希恒为固定值', () => {
    expect(runFixedSequence().hash).toBe('7015187f');
  });

  it('指纹场景覆盖全部核心分支(覆盖面哨兵)', () => {
    const { eventCounts } = runFixedSequence();
    expect(eventCounts['playerFired'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['targetHit'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['targetKilled'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['orbPicked'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['enemyFired'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['playerHit'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['playerDied'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['roomReset'] ?? 0).toBeGreaterThan(0);
    expect(eventCounts['targetsRespawned'] ?? 0).toBeGreaterThan(0);
  });

  it('重复运行产生完全相同的哈希(自洽性)', () => {
    expect(runFixedSequence().hash).toBe(runFixedSequence().hash);
  });

  it('不同种子产生不同的演化(种子确实在起作用)', () => {
    const run = (seed: number): string => {
      const sim = new Simulation(coverageParams(), seed);
      for (let tick = 0; tick < 200; tick++) {
        sim.step(commandsForTick(tick));
      }
      return fnv1a32(JSON.stringify(sim.snapshot()));
    };
    expect(run(1)).not.toBe(run(2));
  });

  it('事件序列本身可复现(回放钩子的前置条件)', () => {
    const collect = (): string[] => {
      const sim = new Simulation(coverageParams(), SEED);
      const log: SimEvent[] = [];
      for (let tick = 0; tick < 300; tick++) {
        log.push(...sim.step(commandsForTick(tick)));
      }
      return log.map((e) => JSON.stringify(e));
    };
    expect(collect()).toEqual(collect());
  });
});
