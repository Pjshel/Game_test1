import { z } from 'zod';

/**
 * 手感参数 schema(WP1.5 交付物 B12)。
 * 数值真源是 src/content/feel.json,经本 schema 校验后以构造参数注入
 * Simulation——core 不做任何全局读取。全部为宪法 v0 参数,灰盒自由调整。
 * 单位约定:长度=格(tile),时间=秒,速度=格/秒。
 */

const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();
const count = z.number().int().min(0).max(20);

export const FeelParamsSchema = z.object({
  player: z.object({
    /** 移速(格/秒);v0 锚点:16格房横穿约3秒 ≈ 5.33 */
    moveSpeed: positive,
    maxHp: z.number().int().min(1).max(99),
    maxShield: z.number().int().min(0).max(99),
    /** 脱离受击多少秒后开始回盾 */
    shieldRegenDelayS: nonNegative,
    /** 每秒回盾量 */
    shieldRegenPerS: nonNegative,
    /** 受击无敌帧时长(秒) */
    iframesS: nonNegative,
  }),
  energy: z.object({
    max: positive,
    /** 能量球回复量 */
    orbEnergy: positive,
    /** 能量球拾取半径(格) */
    orbPickupRadius: positive,
  }),
  weapon: z.object({
    /** 射速(发/秒) */
    fireRate: positive,
    damage: positive,
    /** 每发蓝耗;能量不足则无法开火(压力节奏验证点) */
    energyCost: nonNegative,
    /** 弹速 = 玩家移速 × 此系数 */
    bulletSpeedMul: positive,
  }),
  enemies: z.object({
    /** 敌弹速度 = 玩家移速 × 此系数(v0 锚点 1.1~1.3) */
    bulletSpeedMul: positive,
    /** 还击靶射击间隔(秒) */
    fighterFirePeriodS: positive,
    /** 游走靶速度 = 玩家移速 × 此系数 */
    wandererSpeedMul: positive,
    /** 敌弹伤害(v0:普通敌弹 1) */
    bulletDamage: z.number().int().min(0).max(99),
    /** 受击击退距离(格,v0 锚点 0.3~0.5) */
    knockbackTiles: nonNegative,
    countStatic: count,
    countWanderer: count,
    countFighter: count,
  }),
  flow: z.object({
    /** 靶子全灭后重生延迟(秒) */
    respawnDelayS: nonNegative,
    /** 死亡定格时长(秒) */
    deathFreezeS: nonNegative,
  }),
  juice: z.object({
    hitStopHitMs: nonNegative,
    hitStopKillMs: nonNegative,
    /** 震屏强度三档(Phaser camera shake intensity) */
    shakeHit: nonNegative,
    shakeKill: nonNegative,
    shakeBig: nonNegative,
    /** 受击闪白帧数(以 60Hz 帧为基准换算为毫秒,不随显示器刷新率漂移) */
    flashFrames: z.number().int().min(0).max(30),
  }),
});

export type FeelParams = z.infer<typeof FeelParamsSchema>;

/** 深拷贝并校验;供面板改参与测试构造使用 */
export function parseFeelParams(raw: unknown): FeelParams {
  return FeelParamsSchema.parse(raw);
}
