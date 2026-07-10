import type { FeelParams } from '../../src/core/feel';
import { parseFeelParams } from '../../src/core/feel';

/**
 * 测试专用参数基线:与 v0 一致但独立于 src/content/feel.json——
 * 灰盒调参改动数据表不会破坏测试(尤其是确定性哈希)。
 */
const BASELINE: FeelParams = {
  player: {
    moveSpeed: 5.33,
    maxHp: 5,
    maxShield: 4,
    shieldRegenDelayS: 3,
    shieldRegenPerS: 1,
    iframesS: 0.6,
  },
  energy: { max: 200, orbEnergy: 10, orbPickupRadius: 1.2 },
  weapon: { fireRate: 2.5, damage: 1, energyCost: 1, bulletSpeedMul: 2 },
  enemies: {
    bulletSpeedMul: 1.2,
    fighterFirePeriodS: 1.5,
    wandererSpeedMul: 0.7,
    bulletDamage: 1,
    knockbackTiles: 0.4,
    countStatic: 2,
    countWanderer: 2,
    countFighter: 1,
  },
  flow: { respawnDelayS: 1, deathFreezeS: 0.5 },
  juice: {
    hitStopHitMs: 30,
    hitStopKillMs: 50,
    shakeHit: 0.002,
    shakeKill: 0.005,
    shakeBig: 0.01,
    flashFrames: 2,
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** 深合并覆盖项并经 schema 校验 */
export function makeParams(overrides: DeepPartial<FeelParams> = {}): FeelParams {
  const merged = structuredClone(BASELINE) as Record<string, Record<string, unknown>>;
  for (const [group, values] of Object.entries(overrides)) {
    Object.assign(merged[group]!, values);
  }
  return parseFeelParams(merged);
}
