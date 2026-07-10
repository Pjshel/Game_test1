import { z } from 'zod';

/**
 * 命令式输入(联机预留军规):外部世界只能通过 Command 影响模拟层。
 * move:方向分量,生产方(shell)负责归一化,schema 在边界上强制每轴 [-1, 1];
 * fire:本 tick 扳机按住(持续开火 = 每 tick 一条 fire;宪法"开火即决策")。
 */
export const MoveCommandSchema = z.object({
  type: z.literal('move'),
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
});

export const FireCommandSchema = z.object({
  type: z.literal('fire'),
});

export const CommandSchema = z.discriminatedUnion('type', [MoveCommandSchema, FireCommandSchema]);

export type MoveCommand = z.infer<typeof MoveCommandSchema>;
export type FireCommand = z.infer<typeof FireCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
