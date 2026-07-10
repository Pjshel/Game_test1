import { describe, expect, it } from 'vitest';
import { Registry } from '../src/core/ecs/registry';

interface TestComponents {
  pos: { x: number; y: number };
  hp: number;
  tag: string;
}

describe('Registry(轻量ECS)', () => {
  it('id 单调递增,create/get/destroy 闭环', () => {
    const reg = new Registry<TestComponents>();
    const a = reg.create({ hp: 3 });
    const b = reg.create({ hp: 5 });
    expect(b).toBeGreaterThan(a);
    expect(reg.get(a)?.hp).toBe(3);
    expect(reg.destroy(a)).toBe(true);
    expect(reg.destroy(a)).toBe(false);
    expect(reg.get(a)).toBeUndefined();
    expect(reg.count()).toBe(1);
  });

  it('view 只返回持有全部指定组件的实体,顺序=插入顺序', () => {
    const reg = new Registry<TestComponents>();
    const a = reg.create({ hp: 1, pos: { x: 0, y: 0 } });
    reg.create({ hp: 2 }); // 无 pos,应被过滤
    const c = reg.create({ hp: 3, pos: { x: 1, y: 1 } });
    const ids = Array.from(reg.view('pos', 'hp')).map(([id]) => id);
    expect(ids).toEqual([a, c]);
  });

  it('迭代期间销毁后续实体是安全的', () => {
    const reg = new Registry<TestComponents>();
    const ids = [reg.create({ hp: 1 }), reg.create({ hp: 2 }), reg.create({ hp: 3 })];
    const visited: number[] = [];
    for (const [id] of reg.view('hp')) {
      visited.push(id);
      if (id === ids[0]) {
        reg.destroy(ids[1]!); // 销毁尚未访问到的实体
      }
    }
    expect(visited).toEqual([ids[0], ids[2]]);
  });

  it('clear 清空全部实体', () => {
    const reg = new Registry<TestComponents>();
    reg.create({ hp: 1 });
    reg.create({ hp: 2 });
    reg.clear();
    expect(reg.count()).toBe(0);
  });
});
