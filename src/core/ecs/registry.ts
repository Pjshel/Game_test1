/**
 * 轻量 ECS 注册表(WP1.5 交付物 A1):实体 = id + 组件字典。
 * 不引入第三方 ECS 库;迭代顺序 = 插入顺序(Map 语义),id 单调递增,
 * 两者共同保证系统遍历完全确定。系统本身只是按固定顺序调用的函数。
 */

export type EntityId = number;

export class Registry<C extends object> {
  private nextId: EntityId = 1;
  private readonly entities = new Map<EntityId, Partial<C>>();

  /** 创建实体并返回单调递增的 id */
  create(components: Partial<C>): EntityId {
    const id = this.nextId++;
    this.entities.set(id, components);
    return id;
  }

  /** 销毁实体;迭代期间销毁是安全的(Map 语义:已删除项不再被访问) */
  destroy(id: EntityId): boolean {
    return this.entities.delete(id);
  }

  has(id: EntityId): boolean {
    return this.entities.has(id);
  }

  get(id: EntityId): Partial<C> | undefined {
    return this.entities.get(id);
  }

  count(): number {
    return this.entities.size;
  }

  clear(): void {
    this.entities.clear();
  }

  /** 按插入顺序遍历持有全部指定组件的实体 */
  *view<K extends keyof C>(...keys: K[]): Generator<[EntityId, Partial<C> & Pick<C, K>]> {
    for (const [id, components] of this.entities) {
      if (keys.every((key) => components[key] !== undefined)) {
        yield [id, components as Partial<C> & Pick<C, K>];
      }
    }
  }

  /** 按插入顺序遍历全部实体 */
  all(): IterableIterator<[EntityId, Partial<C>]> {
    return this.entities.entries();
  }
}
