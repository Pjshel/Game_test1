import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/command';
import { FixedStepDriver, Simulation, TICK_MS, type SimEvent } from '../src/core/sim';
import { makeParams } from './helpers/params';

function makeDriver(): { driver: FixedStepDriver; sim: Simulation; tickLog: () => number } {
  const sim = new Simulation(
    makeParams({ enemies: { countStatic: 0, countWanderer: 0, countFighter: 0 } }),
    1,
    [],
  );
  const driver = new FixedStepDriver(sim);
  return { driver, sim, tickLog: () => sim.snapshot().tick };
}

const NO_COMMANDS = (): Command[] => [];

describe('FixedStepDriver(accumulator 模式)', () => {
  it('注入恰好一个 tick 的时间:推进 1 tick,alpha 归零', () => {
    const { driver, tickLog } = makeDriver();
    const alpha = driver.advance(TICK_MS, NO_COMMANDS);
    expect(tickLog()).toBe(1);
    expect(alpha).toBeCloseTo(0, 10);
  });

  it('注入 2.5 个 tick 的时间:推进 2 tick,alpha ≈ 0.5', () => {
    const { driver, tickLog } = makeDriver();
    const alpha = driver.advance(TICK_MS * 2.5, NO_COMMANDS);
    expect(tickLog()).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 10);
  });

  it('不足一个 tick 的时间跨帧累积,凑满才推进', () => {
    const { driver, tickLog } = makeDriver();
    driver.advance(TICK_MS * 0.6, NO_COMMANDS);
    expect(tickLog()).toBe(0);
    driver.advance(TICK_MS * 0.6, NO_COMMANDS);
    expect(tickLog()).toBe(1);
  });

  it('alpha 始终落在 [0, 1)', () => {
    const { driver } = makeDriver();
    for (const dt of [1, 5, TICK_MS, TICK_MS * 1.9, 100, 250]) {
      const alpha = driver.advance(dt, NO_COMMANDS);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('单帧 dt 钳制在 MAX_FRAME_MS,防补帧雪崩', () => {
    const { driver, tickLog } = makeDriver();
    driver.advance(10_000, NO_COMMANDS);
    // 250ms × 60Hz = 恰好 15 tick
    expect(tickLog()).toBe(15);
  });

  it('非有限或为负的 dt 视为 0,不推进也不污染累积器', () => {
    const { driver, tickLog } = makeDriver();
    driver.advance(Number.NaN, NO_COMMANDS);
    driver.advance(Number.POSITIVE_INFINITY, NO_COMMANDS);
    driver.advance(-100, NO_COMMANDS);
    expect(tickLog()).toBe(0);
    driver.advance(TICK_MS, NO_COMMANDS);
    expect(tickLog()).toBe(1);
  });

  it('每个 tick 调用一次 getCommands,并把事件经 onTick 转发', () => {
    const { driver } = makeDriver();
    let calls = 0;
    const batches: SimEvent[][] = [];
    // 3.5 个 tick 的时间:避开 N×TICK_MS 的浮点等值边界,稳定推进 3 tick
    driver.advance(
      TICK_MS * 3.5,
      () => {
        calls += 1;
        return [{ type: 'fire' }];
      },
      (events) => batches.push(events),
    );
    expect(calls).toBe(3);
    expect(batches).toHaveLength(3);
    // 空场无锁定目标且从未移动过:aimDir 默认 (1,0),首 tick 应有开火事件
    expect(batches[0]!.some((e) => e.type === 'playerFired')).toBe(true);
  });
});
