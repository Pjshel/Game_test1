import { CommandSchema, type Command } from './command';

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/** 实体每 tick 移动的世界单位数(v0 参数,灰盒阶段自由调整)。 */
export const MOVE_SPEED_PER_TICK = 3;

export interface EntitySnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface SimSnapshot {
  readonly tick: number;
  readonly entities: readonly EntitySnapshot[];
}

export interface SimulationOptions {
  spawnX?: number;
  spawnY?: number;
}

/**
 * 固定步长 60Hz 模拟骨架。纯 TypeScript、完全确定性:
 * 不引用 Phaser/DOM,不使用 Math.random/Date.now(ESLint 护栏强制)。
 * WP0 范围:单个实体按 move 命令改变坐标,无任何其他逻辑。
 */
export class Simulation {
  private tick = 0;
  private readonly player: { id: number; x: number; y: number };

  constructor(options: SimulationOptions = {}) {
    this.player = { id: 0, x: options.spawnX ?? 0, y: options.spawnY ?? 0 };
  }

  /**
   * 推进恰好一个 tick(1/60 秒)。命令在边界上经 zod 校验,
   * 非法命令抛出 ZodError;同 tick 多条 move 依次叠加生效。
   */
  step(commands: readonly Command[]): void {
    for (const raw of commands) {
      const command = CommandSchema.parse(raw);
      this.player.x += command.dx * MOVE_SPEED_PER_TICK;
      this.player.y += command.dy * MOVE_SPEED_PER_TICK;
    }
    this.tick += 1;
  }

  /** 返回当前状态的独立副本;调用方修改副本不会影响模拟状态。 */
  snapshot(): SimSnapshot {
    return {
      tick: this.tick,
      entities: [{ ...this.player }],
    };
  }
}

/**
 * Accumulator 模式的固定步长驱动器:把渲染帧的可变 dt 折算为
 * 0..N 次固定 tick,返回残余时间比例 alpha ∈ [0, 1) 供表现层插值。
 * 时间只能由外部注入(dt 参数),驱动器自身不读取时钟。
 */
export class FixedStepDriver {
  /** 单帧 dt 钳制上限(毫秒),防止标签页挂起恢复后的补帧雪崩。 */
  static readonly MAX_FRAME_MS = 250;

  private accumulatorMs = 0;

  constructor(private readonly sim: Simulation) {}

  /**
   * 注入一帧真实流逝时间。每触发一个 tick 调用一次 getCommands。
   * 非有限或为负的 dt 视为 0(防御外部输入)。
   */
  advance(frameDtMs: number, getCommands: () => readonly Command[]): number {
    const dt = Number.isFinite(frameDtMs)
      ? Math.min(Math.max(frameDtMs, 0), FixedStepDriver.MAX_FRAME_MS)
      : 0;
    this.accumulatorMs += dt;
    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS;
      this.sim.step(getCommands());
    }
    return this.accumulatorMs / TICK_MS;
  }
}
