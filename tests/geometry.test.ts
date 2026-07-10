import { describe, expect, it } from 'vitest';
import {
  circlesOverlap,
  clampToRect,
  hasLineOfSight,
  normalize,
  segmentIntersectsRect,
  type Rect,
} from '../src/core/geometry';

const WALL: Rect = { x: 4, y: 0, w: 1, h: 4 };

describe('segmentIntersectsRect', () => {
  it('横穿矩形 → 相交', () => {
    expect(segmentIntersectsRect({ x: 0, y: 2 }, { x: 10, y: 2 }, WALL)).toBe(true);
  });

  it('绕过矩形 → 不相交', () => {
    expect(segmentIntersectsRect({ x: 0, y: 6 }, { x: 10, y: 6 }, WALL)).toBe(false);
  });

  it('线段止于矩形之前 → 不相交', () => {
    expect(segmentIntersectsRect({ x: 0, y: 2 }, { x: 3.5, y: 2 }, WALL)).toBe(false);
  });

  it('端点在矩形内部 → 相交', () => {
    expect(segmentIntersectsRect({ x: 4.5, y: 2 }, { x: 10, y: 2 }, WALL)).toBe(true);
  });

  it('垂直线段与平行轴处理正确(d=0 分支)', () => {
    expect(segmentIntersectsRect({ x: 4.5, y: -2 }, { x: 4.5, y: 6 }, WALL)).toBe(true);
    expect(segmentIntersectsRect({ x: 3, y: -2 }, { x: 3, y: 6 }, WALL)).toBe(false);
  });
});

describe('hasLineOfSight', () => {
  it('无遮挡 → 有视线;墙在中间 → 无视线(宪法§2:墙后不锁)', () => {
    expect(hasLineOfSight({ x: 0, y: 2 }, { x: 3, y: 2 }, [WALL])).toBe(true);
    expect(hasLineOfSight({ x: 0, y: 2 }, { x: 8, y: 2 }, [WALL])).toBe(false);
  });

  it('空墙列表恒有视线', () => {
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 100, y: 100 }, [])).toBe(true);
  });
});

describe('clampToRect / normalize / circlesOverlap', () => {
  it('钳制考虑半径', () => {
    const bounds: Rect = { x: 0, y: 0, w: 16, h: 9 };
    expect(clampToRect({ x: -5, y: 4 }, 0.35, bounds)).toEqual({ x: 0.35, y: 4 });
    expect(clampToRect({ x: 20, y: 20 }, 0.35, bounds)).toEqual({ x: 15.65, y: 8.65 });
  });

  it('normalize:单位化、零向量与非有限输入返回零', () => {
    const n = normalize({ x: 3, y: 4 });
    expect(n.x).toBeCloseTo(0.6, 10);
    expect(n.y).toBeCloseTo(0.8, 10);
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(normalize({ x: Number.NaN, y: 1 })).toEqual({ x: 0, y: 0 });
  });

  it('circlesOverlap 含相切边界', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1)).toBe(true);
    expect(circlesOverlap({ x: 0, y: 0 }, 1, { x: 2.01, y: 0 }, 1)).toBe(false);
  });
});
