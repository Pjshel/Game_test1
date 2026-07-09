import { z } from 'zod';

/**
 * 命令式输入(联机预留军规):外部世界只能通过 Command 影响模拟层。
 * WP0 仅有 move 一种命令;dx/dy 为方向分量,生产方(shell)负责归一化,
 * schema 在边界上强制每轴取值范围 [-1, 1]。
 */
export const MoveCommandSchema = z.object({
  type: z.literal('move'),
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
});

export const CommandSchema = z.discriminatedUnion('type', [MoveCommandSchema]);

export type MoveCommand = z.infer<typeof MoveCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
