import { describe, expect, it } from 'vitest';
import { MOVE_SPEED_PER_TICK, Simulation, TICK_MS, TICK_RATE } from '../src/core/sim';

describe('Simulation.step', () => {
  it('move 命令按速度常量改变坐标', () => {
    const sim = new Simulation();
    sim.step([{ type: 'move', dx: 1, dy: 0 }]);
    expect(sim.snapshot().entities[0]).toEqual({ id: 0, x: MOVE_SPEED_PER_TICK, y: 0 });
  });

  it('同一 tick 内多条命令依次叠加', () => {
    const sim = new Simulation();
    sim.step([
      { type: 'move', dx: 1, dy: 0 },
      { type: 'move', dx: 0, dy: 1 },
    ]);
    const entity = sim.snapshot().entities[0];
    expect(entity).toEqual({ id: 0, x: MOVE_SPEED_PER_TICK, y: MOVE_SPEED_PER_TICK });
  });

  it('空命令列表:位置不变,tick 仍推进', () => {
    const sim = new Simulation({ spawnX: 7, spawnY: 8 });
    sim.step([]);
    expect(sim.snapshot()).toEqual({ tick: 1, entities: [{ id: 0, x: 7, y: 8 }] });
  });

  it('spawn 选项决定初始坐标,默认为原点', () => {
    expect(new Simulation({ spawnX: 3, spawnY: 4 }).snapshot().entities[0]).toMatchObject({
      x: 3,
      y: 4,
    });
    expect(new Simulation().snapshot().entities[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('拒绝越界分量(dx > 1)', () => {
    const sim = new Simulation();
    expect(() => sim.step([{ type: 'move', dx: 2, dy: 0 }])).toThrow();
  });

  it('拒绝 NaN 分量', () => {
    const sim = new Simulation();
    expect(() => sim.step([{ type: 'move', dx: Number.NaN, dy: 0 }])).toThrow();
  });

  it('拒绝未知命令类型与缺字段命令', () => {
    const sim = new Simulation();
    expect(() => sim.step([{ type: 'jump' } as never])).toThrow();
    expect(() => sim.step([{ type: 'move', dx: 1 } as never])).toThrow();
  });
});

describe('Simulation.snapshot', () => {
  it('返回独立副本:修改快照不影响模拟内部状态', () => {
    const sim = new Simulation();
    const snap = sim.snapshot();
    (snap.entities[0] as { x: number }).x = 999;
    expect(sim.snapshot().entities[0]).toMatchObject({ x: 0 });
  });
});

describe('时基常量', () => {
  it('60Hz:TICK_MS 与 TICK_RATE 互为倒数', () => {
    expect(TICK_RATE).toBe(60);
    expect(TICK_MS * TICK_RATE).toBeCloseTo(1000, 10);
  });
});
