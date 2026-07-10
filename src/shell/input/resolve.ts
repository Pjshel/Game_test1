import type { Command } from '../../core/command';

export interface Direction {
  dx: number;
  dy: number;
}

/**
 * 把输入设备状态合成为模拟层命令(纯函数,便于单测):
 * 移动:摇杆激活时优先于键盘;向量长度超过 1 时归一化(斜向不加速);
 * 非有限分量或零向量不产生 move。开火:按住即每 tick 一条 fire——
 * 鼠标坐标不参与任何计算(宪法§2:鼠标只是另一个开火键)。
 */
export function resolveCommands(
  keyboard: Direction,
  joystick: Direction | null,
  fireHeld: boolean,
): Command[] {
  const commands: Command[] = [];
  const raw = joystick ?? keyboard;
  const length = Math.hypot(raw.dx, raw.dy);
  if (length > 0 && Number.isFinite(length)) {
    const scale = length > 1 ? 1 / length : 1;
    commands.push({ type: 'move', dx: raw.dx * scale, dy: raw.dy * scale });
  }
  if (fireHeld) {
    commands.push({ type: 'fire' });
  }
  return commands;
}
