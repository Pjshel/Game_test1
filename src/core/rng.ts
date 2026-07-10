/**
 * 种子化 RNG 服务(WP1.5 交付物 A2)。
 * 双流架构:genStream(生成,WP5 启用)与 combatStream(战斗,本包使用)
 * 各自独立推进,互不干扰——同一种子下抽楼层不会影响战斗随机序列。
 * 实现为 mulberry32:仅用整数位运算与 Math.imul,IEEE754 下跨平台确定。
 * core 内一切随机必须经由本服务注入(ESLint 护栏已禁 Math.random)。
 */

export class RngStream {
  private state: number;

  constructor(seed: number) {
    // 归一化到 32 位无符号;种子 0 与 2^32 同余亦可用
    this.state = seed >>> 0;
  }

  /** [0, 1) 均匀分布 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 均匀分布 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 以概率 p 返回 true */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export class RngService {
  readonly genStream: RngStream;
  readonly combatStream: RngStream;

  constructor(seed: number) {
    // 用固定盐派生两条独立流,避免同起点导致序列重合
    this.genStream = new RngStream((seed ^ 0x9e3779b9) >>> 0);
    this.combatStream = new RngStream((seed ^ 0x85ebca6b) >>> 0);
  }
}
