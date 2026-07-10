import { describe, expect, it } from 'vitest';
import feelRaw from '../src/content/feel.json';
import { parseFeelParams } from '../src/core/feel';

/**
 * 数据表执法(内容即数据军规):交付的 src/content/feel.json 必须通过
 * schema 校验——灰盒调参后导出的 JSON 回填仓库时,CI 在此拦截非法数据,
 * 避免"CI 全绿但 Pages 启动即黑屏"。
 */
describe('src/content/feel.json', () => {
  it('通过 FeelParamsSchema 校验', () => {
    expect(() => parseFeelParams(feelRaw)).not.toThrow();
  });

  it('关键 v0 锚点仍在宪法§5节奏带宽内(结构性哨兵,可随定稿升版调整)', () => {
    const params = parseFeelParams(feelRaw);
    // 敌弹速度系数落在 1.1~1.3(单弹永远躲得掉)
    expect(params.enemies.bulletSpeedMul).toBeGreaterThanOrEqual(1.1);
    expect(params.enemies.bulletSpeedMul).toBeLessThanOrEqual(1.3);
    // 玩家横穿16格 ≈ 2~4 秒
    const crossSeconds = 16 / params.player.moveSpeed;
    expect(crossSeconds).toBeGreaterThan(2);
    expect(crossSeconds).toBeLessThan(4);
  });
});
