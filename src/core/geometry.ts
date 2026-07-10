/** 纯几何工具:向量、AABB、线段相交与视线判定。单位:格(tile)。 */

export interface Vec2 {
  x: number;
  y: number;
}

/** 轴对齐矩形,(x, y) 为左上角 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 归一化;零向量与非有限输入返回 (0, 0) */
export function normalize(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y);
  if (length === 0 || !Number.isFinite(length)) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / length, y: v.y / length };
}

/**
 * 线段 [a, b] 是否与 AABB 相交(slab 法/Liang-Barsky)。
 * 端点恰在边上视为相交(保守判定)。
 */
export function segmentIntersectsRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tMin = 0;
  let tMax = 1;

  const slabs: Array<[number, number, number]> = [
    [dx, rect.x - a.x, rect.x + rect.w - a.x],
    [dy, rect.y - a.y, rect.y + rect.h - a.y],
  ];
  for (const [d, lo, hi] of slabs) {
    if (d === 0) {
      // 平行于该轴:起点必须落在 slab 内
      if (lo > 0 || hi < 0) {
        return false;
      }
    } else {
      let t1 = lo / d;
      let t2 = hi / d;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) {
        return false;
      }
    }
  }
  return true;
}

/** 视线判定:from→to 的线段不被任何墙体 AABB 遮挡(宪法§2:墙后不锁) */
export function hasLineOfSight(from: Vec2, to: Vec2, walls: readonly Rect[]): boolean {
  for (const wall of walls) {
    if (segmentIntersectsRect(from, to, wall)) {
      return false;
    }
  }
  return true;
}

/** 把点(带半径)钳制在矩形内部 */
export function clampToRect(pos: Vec2, radius: number, bounds: Rect): Vec2 {
  return {
    x: Math.min(Math.max(pos.x, bounds.x + radius), bounds.x + bounds.w - radius),
    y: Math.min(Math.max(pos.y, bounds.y + radius), bounds.y + bounds.h - radius),
  };
}

/** 圆与圆相交(用于子弹命中与拾取判定) */
export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  const r = ra + rb;
  return dist2(a, b) <= r * r;
}
