import { describe, expect, it } from 'vitest';
import type { Command } from '../src/core/command';
import { Simulation } from '../src/core/sim';
import { fnv1a32 } from './helpers/hash';

/**
 * WP0 交付物 5:确定性测试。
 * 固定命令序列驱动 300 tick,终态哈希必须恒等于固定值——
 * 任何让模拟结果漂移的改动(浮点顺序、速度常量、命令语义)都会在此失败。
 */

const DIAG = Math.SQRT1_2; // 斜向归一化分量,与 shell 输入层同源

function commandsForTick(tick: number): Command[] {
  // 确定性模式:四段循环——横移 / 斜移 / 静止 / 同 tick 双命令
  const phase = tick % 20;
  if (phase < 6) {
    return [{ type: 'move', dx: 1, dy: 0 }];
  }
  if (phase < 12) {
    return [{ type: 'move', dx: -DIAG, dy: DIAG }];
  }
  if (phase < 16) {
    return []; // 静止:tick 仍推进
  }
  return [
    { type: 'move', dx: 0, dy: -1 },
    { type: 'move', dx: -0.25, dy: 0 },
  ];
}

function runFixedSequence(): string {
  const sim = new Simulation({ spawnX: 100, spawnY: 100 });
  for (let tick = 0; tick < 300; tick++) {
    sim.step(commandsForTick(tick));
  }
  return fnv1a32(JSON.stringify(sim.snapshot()));
}

describe('determinism', () => {
  it('300 tick 固定命令序列的终态哈希恒为固定值', () => {
    expect(runFixedSequence()).toBe('f1587845');
  });

  it('重复运行产生完全相同的哈希(自洽性)', () => {
    expect(runFixedSequence()).toBe(runFixedSequence());
  });
});
