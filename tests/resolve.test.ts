import { describe, expect, it } from 'vitest';
import { CommandSchema } from '../src/core/command';
import { resolveCommands } from '../src/shell/input/resolve';

const NO_DIR = { dx: 0, dy: 0 };

describe('resolveCommands(输入→命令映射)', () => {
  it('无输入时不产生命令', () => {
    expect(resolveCommands(NO_DIR, null, false)).toEqual([]);
  });

  it('键盘单轴输入映射为单条 move 命令', () => {
    expect(resolveCommands({ dx: 1, dy: 0 }, null, false)).toEqual([
      { type: 'move', dx: 1, dy: 0 },
    ]);
  });

  it('键盘斜向输入被归一化(斜向不加速)', () => {
    const [command] = resolveCommands({ dx: 1, dy: -1 }, null, false);
    expect(command).toBeDefined();
    if (command?.type !== 'move') {
      throw new Error('expected move command');
    }
    expect(Math.hypot(command.dx, command.dy)).toBeCloseTo(1, 10);
  });

  it('摇杆激活时优先于键盘;次单位幅度原样保留', () => {
    const [command] = resolveCommands({ dx: 1, dy: 0 }, { dx: 0.3, dy: 0.4 }, false);
    expect(command).toEqual({ type: 'move', dx: 0.3, dy: 0.4 });
  });

  it('开火按住 → 追加 fire 命令;松开 → 无', () => {
    expect(resolveCommands(NO_DIR, null, true)).toEqual([{ type: 'fire' }]);
    const both = resolveCommands({ dx: 1, dy: 0 }, null, true);
    expect(both).toEqual([{ type: 'move', dx: 1, dy: 0 }, { type: 'fire' }]);
  });

  it('非有限分量不产生 move(防御性)', () => {
    expect(resolveCommands({ dx: Number.NaN, dy: 0 }, null, false)).toEqual([]);
    expect(resolveCommands(NO_DIR, { dx: Number.POSITIVE_INFINITY, dy: 0 }, false)).toEqual([]);
  });

  it('产出的命令一定通过模拟层边界校验(CommandSchema)', () => {
    const cases = [
      resolveCommands({ dx: 1, dy: 1 }, null, true),
      resolveCommands({ dx: -1, dy: 0 }, null, false),
      resolveCommands(NO_DIR, { dx: -0.9, dy: 0.1 }, true),
    ];
    for (const commands of cases) {
      for (const command of commands) {
        expect(() => CommandSchema.parse(command)).not.toThrow();
      }
    }
  });
});
