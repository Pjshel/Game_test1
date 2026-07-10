import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/command';
import { Simulation, type SimEvent } from '../src/core/sim';
import { fnv1a32 } from './helpers/hash';
import { makeParams } from './helpers/params';

/**
 * WP1.5 交付物 A4:无头确定性测试。
 * 固定种子 + 固定命令序列驱动 1000 tick,末态快照与事件统计的哈希恒定。
 * 参数用测试基线(独立于 feel.json)——灰盒调参不会破坏此指纹。
 * 任何让模拟漂移的改动(系统顺序、RNG消耗点、浮点路径)都会在此失败。
 */

const SEED = 0xc0ffee;
const DIAG = Math.SQRT1_2;

const DIRS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: DIAG, dy: DIAG },
  { dx: 0, dy: 1 },
  { dx: -DIAG, dy: DIAG },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 0 }, // 停顿段
  { dx: 0, dy: -1 },
  { dx: DIAG, dy: -DIAG },
];

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

function runFixedSequence(): string {
  const sim = new Simulation(makeParams(), SEED);
  const eventCounts: Record<string, number> = {};
  for (let tick = 0; tick < 1000; tick++) {
    for (const event of sim.step(commandsForTick(tick))) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }
  }
  return fnv1a32(JSON.stringify({ snapshot: sim.snapshot(), eventCounts }));
}

describe('determinism(1000 tick)', () => {
  it('固定种子+固定命令序列的末态哈希恒为固定值', () => {
    expect(runFixedSequence()).toBe('2bdab941');
  });

  it('重复运行产生完全相同的哈希(自洽性)', () => {
    expect(runFixedSequence()).toBe(runFixedSequence());
  });

  it('不同种子产生不同的演化(种子确实在起作用)', () => {
    const run = (seed: number): string => {
      const sim = new Simulation(makeParams(), seed);
      for (let tick = 0; tick < 200; tick++) {
        sim.step(commandsForTick(tick));
      }
      return fnv1a32(JSON.stringify(sim.snapshot()));
    };
    expect(run(1)).not.toBe(run(2));
  });

  it('事件序列本身可复现(回放钩子的前置条件)', () => {
    const collect = (): string[] => {
      const sim = new Simulation(makeParams(), SEED);
      const log: SimEvent[] = [];
      for (let tick = 0; tick < 300; tick++) {
        log.push(...sim.step(commandsForTick(tick)));
      }
      return log.map((e) => JSON.stringify(e));
    };
    expect(collect()).toEqual(collect());
  });
});
