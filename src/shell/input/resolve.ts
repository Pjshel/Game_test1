import type { Command } from '../../core/command';

export interface Direction {
  dx: number;
  dy: number;
}

/**
 * 把输入设备状态合成为模拟层命令(纯函数,便于单测):
 * 摇杆激活时优先于键盘;向量长度超过 1 时归一化(斜向不加速);
 * 非有限分量或零向量不产生命令。
 */
export function resolveMoveCommands(keyboard: Direction, joystick: Direction | null): Command[] {
  const raw = joystick ?? keyboard;
  const length = Math.hypot(raw.dx, raw.dy);
  if (length === 0 || !Number.isFinite(length)) {
    return [];
  }
  const scale = length > 1 ? 1 / length : 1;
  return [{ type: 'move', dx: raw.dx * scale, dy: raw.dy * scale }];
}
