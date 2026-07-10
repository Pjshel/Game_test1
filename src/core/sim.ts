import { CommandSchema, type Command } from './command';
import { Registry, type EntityId } from './ecs/registry';
import type { FeelParams } from './feel';
import { parseFeelParams } from './feel';
import {
  circlesOverlap,
  clampToRect,
  dist2,
  hasLineOfSight,
  normalize,
  type Rect,
  type Vec2,
} from './geometry';
import { RngService } from './rng';

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/** 房间尺寸(格):16 格宽为宪法基准,9 格高匹配 16:9 画布 */
export const ROOM_W = 16;
export const ROOM_H = 9;

/** 碰撞半径(格)——非调参项,保持固定 */
const PLAYER_RADIUS = 0.35;
const TARGET_RADIUS = 0.4;
const BULLET_RADIUS = 0.12;

/** 靶子重生时与玩家的最小距离(格) */
const SPAWN_MIN_DIST_FROM_PLAYER = 4;

export type TargetKind = 'static' | 'wanderer' | 'fighter';
type Kind = 'player' | TargetKind | 'bulletPlayer' | 'bulletEnemy' | 'orb';

interface Components {
  kind: Kind;
  pos: Vec2;
  /** 速度向量(格/秒);子弹与游走靶使用 */
  vel: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  damage: number;
  /** 游走靶:距下次换向的 tick 数 */
  wanderTicks: number;
  /** 还击靶:距下次开火的 tick 数 */
  fireTicks: number;
}

export type SimEvent =
  | { type: 'playerFired'; x: number; y: number; dirX: number; dirY: number }
  | { type: 'targetHit'; id: EntityId; x: number; y: number }
  | { type: 'targetKilled'; id: EntityId; kind: TargetKind; x: number; y: number }
  | { type: 'enemyFired'; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number; hpAfter: number; shieldAfter: number }
  | { type: 'playerDied' }
  | { type: 'orbPicked'; energyAfter: number }
  | { type: 'targetsRespawned' }
  | { type: 'roomReset' };

export interface TargetSnapshot {
  readonly id: EntityId;
  readonly kind: TargetKind;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface BulletSnapshot {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly fromPlayer: boolean;
}

export interface OrbSnapshot {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
}

export interface SimSnapshot {
  readonly tick: number;
  readonly phase: 'playing' | 'deathFreeze';
  readonly room: { readonly w: number; readonly h: number };
  readonly player: {
    readonly id: EntityId;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
    readonly maxHp: number;
    readonly shield: number;
    readonly maxShield: number;
    readonly energy: number;
    readonly energyMax: number;
    readonly invulnerable: boolean;
    readonly aimX: number;
    readonly aimY: number;
  };
  readonly lockedTargetId: EntityId | null;
  readonly targets: readonly TargetSnapshot[];
  readonly bullets: readonly BulletSnapshot[];
  readonly orbs: readonly OrbSnapshot[];
}

/**
 * 灰盒手感房模拟(WP1.5)。固定步长 60Hz,纯 TypeScript、完全确定:
 * 随机只来自注入的 RngService.combatStream,时间只来自 tick 计数,
 * 参数只来自构造注入的 FeelParams(调试面板经 applyParams 热更)。
 * 系统按固定顺序执行(见 step 内注释)——顺序即确定性的一部分。
 * 武器与靶子按 WP1.5 约束硬编码,逻辑住 core、渲染住 shell。
 */
export class Simulation {
  private params: FeelParams;
  private readonly rng: RngService;
  private readonly registry = new Registry<Components>();

  private tick = 0;
  private phase: 'playing' | 'deathFreeze' = 'playing';
  private freezeTicksLeft = 0;

  private playerId: EntityId = 0;
  private shield: number;
  private shieldRegenAcc = 0;
  private energy: number;
  private iframeTicksLeft = 0;
  private ticksSinceHit = Number.MAX_SAFE_INTEGER;
  private fireCooldownTicks = 0;
  /** 最近一次非零移动方向;无锁定目标时的射击朝向(宪法§2) */
  private aimDir: Vec2 = { x: 1, y: 0 };
  private lockedTargetId: EntityId | null = null;
  private respawnTicksLeft = -1;

  /** 房间内界(可行走区域) */
  static readonly bounds: Rect = { x: 0, y: 0, w: ROOM_W, h: ROOM_H };
  /** 四面墙体(位于内界之外),供视线判定与未来房型复用 */
  static readonly walls: readonly Rect[] = [
    { x: -1, y: -1, w: ROOM_W + 2, h: 1 },
    { x: -1, y: ROOM_H, w: ROOM_W + 2, h: 1 },
    { x: -1, y: 0, w: 1, h: ROOM_H },
    { x: ROOM_W, y: 0, w: 1, h: ROOM_H },
  ];

  constructor(
    params: FeelParams,
    seed: number,
    /** 初始靶子的显式布点(测试与未来房间模板用);缺省走随机落点。重生始终随机。 */
    initialTargets?: readonly { kind: TargetKind; x: number; y: number }[],
  ) {
    this.params = parseFeelParams(params);
    this.rng = new RngService(seed);
    this.shield = this.params.player.maxShield;
    this.energy = this.params.energy.max;
    this.playerId = this.registry.create({
      kind: 'player',
      pos: { x: ROOM_W / 2, y: ROOM_H / 2 },
      hp: this.params.player.maxHp,
      maxHp: this.params.player.maxHp,
      radius: PLAYER_RADIUS,
    });
    if (initialTargets) {
      for (const t of initialTargets) {
        this.spawnTargetAt(t.kind, { x: t.x, y: t.y });
      }
    } else {
      this.spawnTargets();
    }
  }

  /** 调试面板热更参数;非法参数抛 ZodError 且不生效 */
  applyParams(raw: unknown): void {
    this.params = parseFeelParams(raw);
    const player = this.registry.get(this.playerId);
    if (player?.hp !== undefined) {
      player.maxHp = this.params.player.maxHp;
      player.hp = Math.min(player.hp, player.maxHp);
    }
    this.shield = Math.min(this.shield, this.params.player.maxShield);
    this.energy = Math.min(this.energy, this.params.energy.max);
  }

  /** 返回参数的独立副本;修改副本不影响模拟(写入只能走 applyParams 的校验门) */
  getParams(): FeelParams {
    return structuredClone(this.params);
  }

  /**
   * 推进恰好一个 tick。命令先整批校验(全有或全无,非法抛 ZodError 且状态不变),
   * 后按固定系统顺序执行。返回本 tick 产生的事件,供表现层做 juice。
   */
  step(commands: readonly Command[]): SimEvent[] {
    const parsed = commands.map((raw) => CommandSchema.parse(raw));
    const events: SimEvent[] = [];

    if (this.phase === 'deathFreeze') {
      // 死亡定格:世界静止,只倒计时;归零后整房重置
      this.freezeTicksLeft -= 1;
      if (this.freezeTicksLeft <= 0) {
        this.resetRoom();
        events.push({ type: 'roomReset' });
      }
      this.tick += 1;
      return events;
    }

    // 输入意图:move 取最后一条(多输入源以后到者为准),fire 取存在性
    let moveDir: Vec2 = { x: 0, y: 0 };
    let fireHeld = false;
    for (const command of parsed) {
      if (command.type === 'move') {
        moveDir = { x: command.dx, y: command.dy };
      } else {
        fireHeld = true;
      }
    }

    // 系统固定顺序:移动 → 索敌 → 玩家开火 → 靶子AI → 弹体推进 →
    // 玩家弹命中 → 敌弹命中 → 拾取 → 回盾 → 重生 → 计时
    this.playerMoveSystem(moveDir);
    this.autoAimSystem();
    this.playerFireSystem(fireHeld, events);
    this.wandererSystem();
    this.fighterSystem(events);
    this.bulletMoveSystem();
    this.playerBulletHitSystem(events);
    this.enemyBulletHitSystem(events);
    this.orbPickupSystem(events);
    this.shieldRegenSystem();
    this.respawnSystem(events);

    if (this.iframeTicksLeft > 0) {
      this.iframeTicksLeft -= 1;
    }
    if (this.ticksSinceHit < Number.MAX_SAFE_INTEGER) {
      this.ticksSinceHit += 1;
    }
    this.tick += 1;
    return events;
  }

  snapshot(): SimSnapshot {
    const player = this.registry.get(this.playerId);
    const pos = player?.pos ?? { x: ROOM_W / 2, y: ROOM_H / 2 };
    const targets: TargetSnapshot[] = [];
    const bullets: BulletSnapshot[] = [];
    const orbs: OrbSnapshot[] = [];
    for (const [id, c] of this.registry.view('kind', 'pos')) {
      if (c.kind === 'static' || c.kind === 'wanderer' || c.kind === 'fighter') {
        targets.push({
          id,
          kind: c.kind,
          x: c.pos.x,
          y: c.pos.y,
          hp: c.hp ?? 0,
          maxHp: c.maxHp ?? 0,
        });
      } else if (c.kind === 'bulletPlayer' || c.kind === 'bulletEnemy') {
        bullets.push({ id, x: c.pos.x, y: c.pos.y, fromPlayer: c.kind === 'bulletPlayer' });
      } else if (c.kind === 'orb') {
        orbs.push({ id, x: c.pos.x, y: c.pos.y });
      }
    }
    return {
      tick: this.tick,
      phase: this.phase,
      room: { w: ROOM_W, h: ROOM_H },
      player: {
        id: this.playerId,
        x: pos.x,
        y: pos.y,
        hp: player?.hp ?? 0,
        maxHp: this.params.player.maxHp,
        shield: this.shield,
        maxShield: this.params.player.maxShield,
        energy: this.energy,
        energyMax: this.params.energy.max,
        invulnerable: this.iframeTicksLeft > 0,
        aimX: this.aimDir.x,
        aimY: this.aimDir.y,
      },
      lockedTargetId: this.lockedTargetId,
      targets,
      bullets,
      orbs,
    };
  }

  // ---- systems ----

  private playerMoveSystem(moveDir: Vec2): void {
    const player = this.registry.get(this.playerId);
    if (!player?.pos) {
      return;
    }
    if (moveDir.x !== 0 || moveDir.y !== 0) {
      this.aimDir = normalize(moveDir);
      const perTick = this.params.player.moveSpeed / TICK_RATE;
      player.pos = clampToRect(
        { x: player.pos.x + moveDir.x * perTick, y: player.pos.y + moveDir.y * perTick },
        PLAYER_RADIUS,
        Simulation.bounds,
      );
    }
  }

  /** 自动索敌(宪法§2):有视线的最近敌人;无手动切换,只随距离自然换锁 */
  private autoAimSystem(): void {
    const player = this.registry.get(this.playerId);
    if (!player?.pos) {
      return;
    }
    let best: EntityId | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (const [id, c] of this.registry.view('kind', 'pos')) {
      if (c.kind !== 'static' && c.kind !== 'wanderer' && c.kind !== 'fighter') {
        continue;
      }
      if (!hasLineOfSight(player.pos, c.pos, Simulation.walls)) {
        continue;
      }
      const d2 = dist2(player.pos, c.pos);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = id;
      }
    }
    this.lockedTargetId = best;
  }

  private playerFireSystem(fireHeld: boolean, events: SimEvent[]): void {
    if (this.fireCooldownTicks > 0) {
      this.fireCooldownTicks -= 1;
    }
    if (!fireHeld || this.fireCooldownTicks > 0) {
      return;
    }
    // 能量闸:蓝不足则无法开火(本包要验证的压力节奏)
    if (this.energy < this.params.weapon.energyCost) {
      return;
    }
    const player = this.registry.get(this.playerId);
    if (!player?.pos) {
      return;
    }
    const locked =
      this.lockedTargetId === null ? undefined : this.registry.get(this.lockedTargetId);
    const dir = locked?.pos
      ? normalize({ x: locked.pos.x - player.pos.x, y: locked.pos.y - player.pos.y })
      : this.aimDir;
    if (dir.x === 0 && dir.y === 0) {
      return;
    }
    this.energy -= this.params.weapon.energyCost;
    this.fireCooldownTicks = Math.max(1, Math.round(TICK_RATE / this.params.weapon.fireRate));
    const speed = this.params.player.moveSpeed * this.params.weapon.bulletSpeedMul;
    this.registry.create({
      kind: 'bulletPlayer',
      pos: { x: player.pos.x + dir.x * PLAYER_RADIUS, y: player.pos.y + dir.y * PLAYER_RADIUS },
      vel: { x: dir.x * speed, y: dir.y * speed },
      radius: BULLET_RADIUS,
      damage: this.params.weapon.damage,
    });
    events.push({
      type: 'playerFired',
      x: player.pos.x,
      y: player.pos.y,
      dirX: dir.x,
      dirY: dir.y,
    });
  }

  private wandererSystem(): void {
    const speed = (this.params.player.moveSpeed * this.params.enemies.wandererSpeedMul) / TICK_RATE;
    for (const [, c] of this.registry.view('kind', 'pos')) {
      if (c.kind !== 'wanderer') {
        continue;
      }
      c.wanderTicks = (c.wanderTicks ?? 0) - 1;
      if (c.wanderTicks <= 0 || c.vel === undefined) {
        // 0.5~1.5 秒换一次方向;可原地停顿(约 1/5 概率)
        const stop = this.rng.combatStream.chance(0.2);
        c.vel = stop ? { x: 0, y: 0 } : this.rollUnitDir();
        c.wanderTicks = this.rng.combatStream.int(30, 90);
      }
      c.pos = clampToRect(
        { x: c.pos.x + c.vel.x * speed, y: c.pos.y + c.vel.y * speed },
        TARGET_RADIUS,
        Simulation.bounds,
      );
    }
  }

  private fighterSystem(events: SimEvent[]): void {
    const player = this.registry.get(this.playerId);
    if (!player?.pos) {
      return;
    }
    const speed = this.params.player.moveSpeed * this.params.enemies.bulletSpeedMul;
    for (const [, c] of this.registry.view('kind', 'pos')) {
      if (c.kind !== 'fighter') {
        continue;
      }
      c.fireTicks = (c.fireTicks ?? 0) - 1;
      if (c.fireTicks > 0) {
        continue;
      }
      if (!hasLineOfSight(c.pos, player.pos, Simulation.walls)) {
        continue;
      }
      c.fireTicks = Math.max(1, Math.round(this.params.enemies.fighterFirePeriodS * TICK_RATE));
      const dir = normalize({ x: player.pos.x - c.pos.x, y: player.pos.y - c.pos.y });
      if (dir.x === 0 && dir.y === 0) {
        continue;
      }
      this.registry.create({
        kind: 'bulletEnemy',
        pos: { x: c.pos.x + dir.x * TARGET_RADIUS, y: c.pos.y + dir.y * TARGET_RADIUS },
        vel: { x: dir.x * speed, y: dir.y * speed },
        radius: BULLET_RADIUS,
        damage: this.params.enemies.bulletDamage,
      });
      events.push({ type: 'enemyFired', x: c.pos.x, y: c.pos.y });
    }
  }

  private bulletMoveSystem(): void {
    const dead: EntityId[] = [];
    for (const [id, c] of this.registry.view('kind', 'pos', 'vel')) {
      if (c.kind !== 'bulletPlayer' && c.kind !== 'bulletEnemy') {
        continue;
      }
      c.pos = {
        x: c.pos.x + c.vel.x / TICK_RATE,
        y: c.pos.y + c.vel.y / TICK_RATE,
      };
      const r = c.radius ?? BULLET_RADIUS;
      const b = Simulation.bounds;
      if (
        c.pos.x < b.x + r ||
        c.pos.x > b.x + b.w - r ||
        c.pos.y < b.y + r ||
        c.pos.y > b.y + b.h - r
      ) {
        dead.push(id); // 触墙即灭
      }
    }
    for (const id of dead) {
      this.registry.destroy(id);
    }
  }

  private playerBulletHitSystem(events: SimEvent[]): void {
    const spentBullets: EntityId[] = [];
    const killedTargets: EntityId[] = [];
    for (const [bulletId, bullet] of this.registry.view('kind', 'pos')) {
      if (bullet.kind !== 'bulletPlayer') {
        continue;
      }
      for (const [targetId, target] of this.registry.view('kind', 'pos')) {
        if (target.kind !== 'static' && target.kind !== 'wanderer' && target.kind !== 'fighter') {
          continue;
        }
        if (killedTargets.includes(targetId)) {
          continue;
        }
        if (
          !circlesOverlap(
            bullet.pos,
            bullet.radius ?? BULLET_RADIUS,
            target.pos,
            target.radius ?? TARGET_RADIUS,
          )
        ) {
          continue;
        }
        spentBullets.push(bulletId);
        target.hp = (target.hp ?? 0) - (bullet.damage ?? 0);
        // 击退:沿弹道方向位移(v0 锚点 0.3~0.5 格),仍受墙体钳制
        const knock = normalize(bullet.vel ?? { x: 0, y: 0 });
        target.pos = clampToRect(
          {
            x: target.pos.x + knock.x * this.params.enemies.knockbackTiles,
            y: target.pos.y + knock.y * this.params.enemies.knockbackTiles,
          },
          target.radius ?? TARGET_RADIUS,
          Simulation.bounds,
        );
        events.push({ type: 'targetHit', id: targetId, x: target.pos.x, y: target.pos.y });
        if ((target.hp ?? 0) <= 0) {
          killedTargets.push(targetId);
          events.push({
            type: 'targetKilled',
            id: targetId,
            kind: target.kind,
            x: target.pos.x,
            y: target.pos.y,
          });
          // 进攻产能量:击杀掉落能量球(局内系统定义§2 三定律)
          this.registry.create({
            kind: 'orb',
            pos: { x: target.pos.x, y: target.pos.y },
            radius: 0.15,
          });
        }
        break; // 一颗子弹只命中一个目标
      }
    }
    for (const id of spentBullets) {
      this.registry.destroy(id);
    }
    for (const id of killedTargets) {
      this.registry.destroy(id);
    }
    // 快照不变量:锁定 id 永远指向在场实体;锁定目标被击杀则立即解锁
    if (this.lockedTargetId !== null && killedTargets.includes(this.lockedTargetId)) {
      this.lockedTargetId = null;
    }
  }

  private enemyBulletHitSystem(events: SimEvent[]): void {
    // 无敌帧期间敌弹穿过角色(宪法§4),不销毁
    if (this.iframeTicksLeft > 0) {
      return;
    }
    const player = this.registry.get(this.playerId);
    if (!player?.pos || player.hp === undefined) {
      return;
    }
    for (const [bulletId, bullet] of this.registry.view('kind', 'pos')) {
      if (bullet.kind !== 'bulletEnemy') {
        continue;
      }
      if (!circlesOverlap(bullet.pos, bullet.radius ?? BULLET_RADIUS, player.pos, PLAYER_RADIUS)) {
        continue;
      }
      this.registry.destroy(bulletId);
      // 受击优先扣盾,溢出伤血;血绝不自然恢复(宪法§4)
      const damage = bullet.damage ?? 0;
      const fromShield = Math.min(this.shield, damage);
      this.shield -= fromShield;
      player.hp -= damage - fromShield;
      this.shieldRegenAcc = 0;
      this.ticksSinceHit = 0;
      this.iframeTicksLeft = Math.round(this.params.player.iframesS * TICK_RATE);
      events.push({
        type: 'playerHit',
        x: player.pos.x,
        y: player.pos.y,
        hpAfter: player.hp,
        shieldAfter: this.shield,
      });
      if (player.hp <= 0) {
        this.phase = 'deathFreeze';
        this.freezeTicksLeft = Math.max(1, Math.round(this.params.flow.deathFreezeS * TICK_RATE));
        events.push({ type: 'playerDied' });
      }
      return; // 无敌帧已开启,本 tick 至多结算一次受击
    }
  }

  private orbPickupSystem(events: SimEvent[]): void {
    const player = this.registry.get(this.playerId);
    if (!player?.pos) {
      return;
    }
    const picked: EntityId[] = [];
    for (const [id, c] of this.registry.view('kind', 'pos')) {
      if (c.kind !== 'orb') {
        continue;
      }
      if (circlesOverlap(c.pos, 0, player.pos, this.params.energy.orbPickupRadius)) {
        picked.push(id);
      }
    }
    for (const id of picked) {
      this.registry.destroy(id);
      this.energy = Math.min(this.params.energy.max, this.energy + this.params.energy.orbEnergy);
      events.push({ type: 'orbPicked', energyAfter: this.energy });
    }
  }

  private shieldRegenSystem(): void {
    const delayTicks = Math.round(this.params.player.shieldRegenDelayS * TICK_RATE);
    if (this.ticksSinceHit < delayTicks || this.shield >= this.params.player.maxShield) {
      return;
    }
    // 盾以整数点数回复:每秒累积 regenPerS,攒满 1 点入账
    this.shieldRegenAcc += this.params.player.shieldRegenPerS / TICK_RATE;
    while (this.shieldRegenAcc >= 1 && this.shield < this.params.player.maxShield) {
      this.shield += 1;
      this.shieldRegenAcc -= 1;
    }
  }

  private respawnSystem(events: SimEvent[]): void {
    let alive = 0;
    for (const [, c] of this.registry.view('kind')) {
      if (c.kind === 'static' || c.kind === 'wanderer' || c.kind === 'fighter') {
        alive += 1;
      }
    }
    if (alive > 0) {
      this.respawnTicksLeft = -1;
      return;
    }
    // 三类数量全为 0(调参面板可达):无兵可生,不起表也不发事件,避免空转刷屏
    const configured =
      this.params.enemies.countStatic +
      this.params.enemies.countWanderer +
      this.params.enemies.countFighter;
    if (configured === 0) {
      this.respawnTicksLeft = -1;
      return;
    }
    if (this.respawnTicksLeft < 0) {
      // 全灭:起表,1 秒后重生一组(练靶场性质,无门无波次)
      this.respawnTicksLeft = Math.round(this.params.flow.respawnDelayS * TICK_RATE);
      return;
    }
    this.respawnTicksLeft -= 1;
    if (this.respawnTicksLeft <= 0) {
      this.spawnTargets();
      this.respawnTicksLeft = -1;
      events.push({ type: 'targetsRespawned' });
    }
  }

  // ---- helpers ----

  private spawnTargets(): void {
    const kinds: TargetKind[] = [];
    for (let i = 0; i < this.params.enemies.countStatic; i++) {
      kinds.push('static');
    }
    for (let i = 0; i < this.params.enemies.countWanderer; i++) {
      kinds.push('wanderer');
    }
    for (let i = 0; i < this.params.enemies.countFighter; i++) {
      kinds.push('fighter');
    }
    const player = this.registry.get(this.playerId);
    const playerPos = player?.pos ?? { x: ROOM_W / 2, y: ROOM_H / 2 };
    for (const kind of kinds) {
      this.spawnTargetAt(kind, this.rollSpawnPos(playerPos));
    }
  }

  private spawnTargetAt(kind: TargetKind, pos: Vec2): void {
    const maxHp = kind === 'fighter' ? 4 : 3; // WP1.5 硬编码:A/B 3血,C 4血
    this.registry.create({
      kind,
      pos: clampToRect(pos, TARGET_RADIUS, Simulation.bounds),
      hp: maxHp,
      maxHp,
      radius: TARGET_RADIUS,
      wanderTicks: 0,
      fireTicks: Math.max(1, Math.round(this.params.enemies.fighterFirePeriodS * TICK_RATE)),
    });
  }

  /**
   * 拒绝采样生成单位方向:只用四则运算与 sqrt(IEEE 精确舍入),
   * 避开 Math.cos/sin 的引擎近似差异——跨引擎确定性军规。
   */
  private rollUnitDir(): Vec2 {
    for (let attempt = 0; attempt < 32; attempt++) {
      const x = this.rng.combatStream.range(-1, 1);
      const y = this.rng.combatStream.range(-1, 1);
      const len2 = x * x + y * y;
      if (len2 > 0.01 && len2 <= 1) {
        const len = Math.sqrt(len2);
        return { x: x / len, y: y / len };
      }
    }
    return { x: 1, y: 0 };
  }

  /** 距玩家至少 4 格的随机落点;20 次重掷后接受任意点(房间小时防死循环) */
  private rollSpawnPos(playerPos: Vec2): Vec2 {
    const b = Simulation.bounds;
    let pos: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };
    for (let attempt = 0; attempt < 20; attempt++) {
      pos = {
        x: this.rng.combatStream.range(b.x + 1, b.x + b.w - 1),
        y: this.rng.combatStream.range(b.y + 1, b.y + b.h - 1),
      };
      if (dist2(pos, playerPos) >= SPAWN_MIN_DIST_FROM_PLAYER * SPAWN_MIN_DIST_FROM_PLAYER) {
        return pos;
      }
    }
    return pos;
  }

  /** 死亡定格结束:整房与玩家状态全部重置(RNG 流不回卷,继续前进) */
  private resetRoom(): void {
    this.registry.clear();
    this.phase = 'playing';
    this.freezeTicksLeft = 0;
    this.shield = this.params.player.maxShield;
    this.shieldRegenAcc = 0;
    this.energy = this.params.energy.max;
    this.iframeTicksLeft = 0;
    this.ticksSinceHit = Number.MAX_SAFE_INTEGER;
    this.fireCooldownTicks = 0;
    this.aimDir = { x: 1, y: 0 };
    this.lockedTargetId = null;
    this.respawnTicksLeft = -1;
    this.playerId = this.registry.create({
      kind: 'player',
      pos: { x: ROOM_W / 2, y: ROOM_H / 2 },
      hp: this.params.player.maxHp,
      maxHp: this.params.player.maxHp,
      radius: PLAYER_RADIUS,
    });
    this.spawnTargets();
  }
}

/**
 * Accumulator 模式固定步长驱动器:把渲染帧可变 dt 折算为 0..N 个固定 tick,
 * 返回残余比例 alpha ∈ [0, 1) 供插值。时间只能由外部注入,自身不读时钟。
 */
export class FixedStepDriver {
  /** 单帧 dt 钳制上限(毫秒),防标签页挂起恢复后的补帧雪崩 */
  static readonly MAX_FRAME_MS = 250;

  private accumulatorMs = 0;

  constructor(private readonly sim: Simulation) {}

  /**
   * 注入一帧真实流逝时间;每个 tick 调用一次 getCommands,
   * tick 产生的事件经 onTick 回调转发(表现层 juice 的数据源)。
   */
  advance(
    frameDtMs: number,
    getCommands: () => readonly Command[],
    onTick?: (events: SimEvent[]) => void,
  ): number {
    const dt = Number.isFinite(frameDtMs)
      ? Math.min(Math.max(frameDtMs, 0), FixedStepDriver.MAX_FRAME_MS)
      : 0;
    this.accumulatorMs += dt;
    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS;
      const events = this.sim.step(getCommands());
      if (onTick) {
        onTick(events);
      }
    }
    return this.accumulatorMs / TICK_MS;
  }
}
