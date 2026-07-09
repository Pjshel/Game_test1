import { describe, expect, it } from 'vitest';
import { CommandSchema } from '../src/core/command';
import { resolveMoveCommands } from '../src/shell/input/resolve';

describe('resolveMoveCommands(输入→命令映射)', () => {
  it('无输入时不产生命令', () => {
    expect(resolveMoveCommands({ dx: 0, dy: 0 }, null)).toEqual([]);
  });

  it('键盘单轴输入映射为单条 move 命令', () => {
    expect(resolveMoveCommands({ dx: 1, dy: 0 }, null)).toEqual([{ type: 'move', dx: 1, dy: 0 }]);
  });

  it('键盘斜向输入被归一化(斜向不加速)', () => {
    const [command] = resolveMoveCommands({ dx: 1, dy: -1 }, null);
    expect(command).toBeDefined();
    expect(Math.hypot(command!.dx, command!.dy)).toBeCloseTo(1, 10);
    expect(command!.dx).toBeCloseTo(Math.SQRT1_2, 10);
    expect(command!.dy).toBeCloseTo(-Math.SQRT1_2, 10);
  });

  it('摇杆激活时优先于键盘', () => {
    const [command] = resolveMoveCommands({ dx: 1, dy: 0 }, { dx: 0, dy: -0.5 });
    expect(command).toEqual({ type: 'move', dx: 0, dy: -0.5 });
  });

  it('摇杆的次单位幅度原样保留(模拟量输入)', () => {
    const [command] = resolveMoveCommands({ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.4 });
    expect(command).toEqual({ type: 'move', dx: 0.3, dy: 0.4 });
  });

  it('非有限分量不产生命令(防御性)', () => {
    expect(resolveMoveCommands({ dx: Number.NaN, dy: 0 }, null)).toEqual([]);
    expect(resolveMoveCommands({ dx: 0, dy: 0 }, { dx: Number.POSITIVE_INFINITY, dy: 0 })).toEqual(
      [],
    );
  });

  it('产出的命令一定通过模拟层边界校验(CommandSchema)', () => {
    const cases = [
      resolveMoveCommands({ dx: 1, dy: 1 }, null),
      resolveMoveCommands({ dx: -1, dy: 0 }, null),
      resolveMoveCommands({ dx: 0, dy: 0 }, { dx: -0.9, dy: 0.1 }),
    ];
    for (const commands of cases) {
      for (const command of commands) {
        expect(() => CommandSchema.parse(command)).not.toThrow();
      }
    }
  });
});
