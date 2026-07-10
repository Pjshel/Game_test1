import { describe, expect, it } from 'vitest';
import { RngService, RngStream } from '../src/core/rng';

describe('RngStream', () => {
  it('同一种子产生完全相同的序列', () => {
    const a = new RngStream(42);
    const b = new RngStream(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('不同种子产生不同序列', () => {
    const a = new RngStream(1);
    const b = new RngStream(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).every(Boolean);
    expect(same).toBe(false);
  });

  it('next 落在 [0, 1),range/int 落在边界内', () => {
    const rng = new RngStream(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
      const n = rng.int(2, 4);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('序列指纹恒定(跨版本回归守卫)', () => {
    const rng = new RngStream(123456789);
    const first = Array.from({ length: 4 }, () => rng.next());
    // 任何改动 mulberry32 实现都会在此失败——这是刻意的
    expect(first).toEqual([
      0.2577907438389957, 0.9707721115555614, 0.7853280142880976, 0.20616457983851433,
    ]);
  });
});

describe('RngService', () => {
  it('双流独立:消耗 combatStream 不影响 genStream', () => {
    const a = new RngService(99);
    const b = new RngService(99);
    for (let i = 0; i < 50; i++) {
      a.combatStream.next();
    }
    expect(a.genStream.next()).toBe(b.genStream.next());
  });

  it('两条流序列互不相同', () => {
    const service = new RngService(5);
    expect(service.genStream.next()).not.toBe(service.combatStream.next());
  });
});
