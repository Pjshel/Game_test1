import Phaser from 'phaser';
import type { FeelParams } from '../core/feel';
import type { EntityId } from '../core/ecs/registry';
import { FixedStepDriver, ROOM_H, ROOM_W, Simulation, type SimSnapshot } from '../core/sim';
import { DebugPanel } from './debug/panel';
import { FireInput } from './input/fire';
import { KeyboardInput } from './input/keyboard';
import { VirtualJoystick } from './input/joystick';
import { resolveCommands } from './input/resolve';
import { JuiceDirector } from './juice';

/** 每格像素数:16×9 格 → 960×540 画布 */
export const TILE_PX = 60;
export const WORLD_WIDTH = ROOM_W * TILE_PX;
export const WORLD_HEIGHT = ROOM_H * TILE_PX;

const COLORS = {
  floor: 0x14181e,
  grid: 0x1d232b,
  wall: 0x2a323d,
  player: 0x4fd1c5,
  static: 0x8a94a3,
  wanderer: 0xe8b04b,
  fighter: 0xe0564b,
  bulletPlayer: 0xd7f7f2,
  bulletEnemy: 0xff8a7a,
  orb: 0x7ce0ff,
  flash: 0xffffff,
  hp: 0xe0564b,
  shield: 0x5aa9e6,
  energy: 0x4fd1c5,
} as const;

interface EntityView {
  obj: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc;
  baseColor: number;
  hpBar?: Phaser.GameObjects.Rectangle;
}

/**
 * 灰盒手感房唯一场景:驱动 60Hz 模拟、按快照 + alpha 插值渲染色块、
 * 顿帧/震屏/闪白经 JuiceDirector、HUD 与调参面板。零美术素材。
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private driver!: FixedStepDriver;
  private juice!: JuiceDirector;
  private prev!: SimSnapshot;
  private curr!: SimSnapshot;

  private keyboard!: KeyboardInput;
  private joystick!: VirtualJoystick;
  private fire!: FireInput;

  private readonly views = new Map<EntityId, EntityView>();
  private lockMarker!: Phaser.GameObjects.Triangle;
  private aimLine!: Phaser.GameObjects.Line;
  private hpPips: Phaser.GameObjects.Rectangle[] = [];
  private shieldPips: Phaser.GameObjects.Rectangle[] = [];
  private energyFill!: Phaser.GameObjects.Rectangle;
  private energyBarWidth = 220;

  constructor(
    private readonly params: FeelParams,
    private readonly seed: number,
  ) {
    super('game');
  }

  create(): void {
    this.sim = new Simulation(this.params, this.seed);
    this.driver = new FixedStepDriver(this.sim);
    this.juice = new JuiceDirector(
      this,
      () => this.sim.getParams(),
      (tiles) => tiles * TILE_PX,
    );
    this.prev = this.sim.snapshot();
    this.curr = this.prev;

    this.drawRoom();
    this.lockMarker = this.add
      .triangle(0, 0, 0, 10, 6, 0, 12, 10, COLORS.player)
      .setDepth(8)
      .setVisible(false);
    this.aimLine = this.add
      .line(0, 0, 0, 0, 0, 0, COLORS.player, 0.35)
      .setOrigin(0, 0)
      .setLineWidth(2)
      .setDepth(4);

    this.buildHud();

    // 右键菜单会吞掉 mouseup 导致开火状态卡死;鼠标在本游戏里只是开火键
    this.input.mouse?.disableContextMenu();

    this.keyboard = new KeyboardInput(this);
    this.fire = new FireInput(this);
    this.joystick = new VirtualJoystick(this, (x, y) => this.fire.claimsPointer(x, y));

    // 首次交互解锁音频(浏览器自动播放策略)
    this.input.on('pointerdown', () => this.juice.sfx.unlock());
    this.input.keyboard?.on('keydown', () => this.juice.sfx.unlock());

    new DebugPanel(
      () => this.sim.getParams(),
      (next) => this.sim.applyParams(next),
    ).mount();
  }

  override update(_time: number, delta: number): void {
    const dt = this.juice.consumeDt(delta); // 顿帧:世界冻结,渲染继续
    const alpha = this.driver.advance(
      dt,
      () => {
        this.prev = this.sim.snapshot();
        return resolveCommands(
          this.keyboard.direction(),
          this.joystick.direction(),
          this.fire.sampleHeld(),
        );
      },
      (events) => this.juice.onEvents(events),
    );
    this.curr = this.sim.snapshot();

    this.syncWorld(alpha);
    this.syncHud();
    this.juice.tickFrame(delta);
  }

  // ---- rendering ----

  private drawRoom(): void {
    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, COLORS.floor)
      .setDepth(0);
    for (let gx = 1; gx < ROOM_W; gx++) {
      this.add
        .line(0, 0, gx * TILE_PX, 0, gx * TILE_PX, WORLD_HEIGHT, COLORS.grid)
        .setOrigin(0, 0)
        .setDepth(0);
    }
    for (let gy = 1; gy < ROOM_H; gy++) {
      this.add
        .line(0, 0, 0, gy * TILE_PX, WORLD_WIDTH, gy * TILE_PX, COLORS.grid)
        .setOrigin(0, 0)
        .setDepth(0);
    }
    // 四面墙:画在内界边缘(碰撞在 core,视觉在此)
    const t = 8;
    this.add.rectangle(WORLD_WIDTH / 2, t / 2, WORLD_WIDTH, t, COLORS.wall).setDepth(1);
    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - t / 2, WORLD_WIDTH, t, COLORS.wall)
      .setDepth(1);
    this.add.rectangle(t / 2, WORLD_HEIGHT / 2, t, WORLD_HEIGHT, COLORS.wall).setDepth(1);
    this.add
      .rectangle(WORLD_WIDTH - t / 2, WORLD_HEIGHT / 2, t, WORLD_HEIGHT, COLORS.wall)
      .setDepth(1);
  }

  private buildHud(): void {
    this.add
      .text(14, WORLD_HEIGHT - 26, 'WASD/摇杆 移动 · 按住鼠标/按钮 开火', {
        fontSize: '13px',
        color: '#5b6673',
      })
      .setDepth(20);
    this.energyFill = this.add
      .rectangle(14, 54, this.energyBarWidth, 8, COLORS.energy)
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.add
      .rectangle(14, 54, this.energyBarWidth, 8)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x3a4450)
      .setDepth(20);
  }

  private syncHud(): void {
    const p = this.curr.player;
    this.syncPips(this.hpPips, p.maxHp, p.hp, 14, 20, COLORS.hp);
    this.syncPips(this.shieldPips, p.maxShield, Math.floor(p.shield), 14, 38, COLORS.shield);
    this.energyFill.width = Math.max(0, (p.energy / p.energyMax) * this.energyBarWidth);
  }

  private syncPips(
    pips: Phaser.GameObjects.Rectangle[],
    max: number,
    value: number,
    x0: number,
    y: number,
    color: number,
  ): void {
    while (pips.length < max) {
      pips.push(this.add.rectangle(0, y, 12, 12, color).setOrigin(0, 0.5).setDepth(20));
    }
    for (let i = 0; i < pips.length; i++) {
      const pip = pips[i]!;
      pip.setVisible(i < max);
      pip.setPosition(x0 + i * 16, y);
      pip.setAlpha(i < value ? 1 : 0.18);
    }
  }

  private syncWorld(alpha: number): void {
    const seen = new Set<EntityId>();
    const prevById = new Map<EntityId, { x: number; y: number }>();
    for (const t of this.prev.targets) {
      prevById.set(t.id, t);
    }
    for (const b of this.prev.bullets) {
      prevById.set(b.id, b);
    }
    for (const o of this.prev.orbs) {
      prevById.set(o.id, o);
    }
    prevById.set(this.prev.player.id, this.prev.player);

    // 玩家
    const player = this.curr.player;
    seen.add(player.id);
    const playerView = this.ensureView(player.id, () => ({
      obj: this.add.rectangle(0, 0, 0.7 * TILE_PX, 0.7 * TILE_PX, COLORS.player).setDepth(5),
      baseColor: COLORS.player,
    }));
    this.place(playerView, prevById.get(player.id), player, alpha);
    playerView.obj.setAlpha(player.invulnerable ? 0.55 : 1); // 无敌帧半透明提示
    this.applyFlash(playerView, this.juice.isPlayerFlashing());

    // 靶子
    for (const target of this.curr.targets) {
      seen.add(target.id);
      const color = COLORS[target.kind];
      const view = this.ensureView(target.id, () => ({
        obj: this.add.rectangle(0, 0, 0.8 * TILE_PX, 0.8 * TILE_PX, color).setDepth(5),
        baseColor: color,
        hpBar: this.add.rectangle(0, 0, 0.8 * TILE_PX, 4, 0xf2f6f9).setDepth(7),
      }));
      this.place(view, prevById.get(target.id), target, alpha);
      view.hpBar
        ?.setPosition(view.obj.x, view.obj.y - 0.62 * TILE_PX)
        .setSize(Math.max(2, (target.hp / target.maxHp) * 0.8 * TILE_PX), 4);
      this.applyFlash(view, this.juice.isFlashing(target.id));
    }

    // 子弹与能量球
    for (const bullet of this.curr.bullets) {
      seen.add(bullet.id);
      const color = bullet.fromPlayer ? COLORS.bulletPlayer : COLORS.bulletEnemy;
      const view = this.ensureView(bullet.id, () => ({
        obj: this.add.circle(0, 0, bullet.fromPlayer ? 6 : 8, color).setDepth(6),
        baseColor: color,
      }));
      this.place(view, prevById.get(bullet.id), bullet, alpha);
    }
    for (const orb of this.curr.orbs) {
      seen.add(orb.id);
      const view = this.ensureView(orb.id, () => ({
        obj: this.add.circle(0, 0, 9, COLORS.orb, 0.9).setDepth(4),
        baseColor: COLORS.orb,
      }));
      this.place(view, prevById.get(orb.id), orb, alpha);
    }

    // 清理消失的实体
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.obj.destroy();
        view.hpBar?.destroy();
        this.views.delete(id);
      }
    }

    // 锁定标记(宪法§2:锁定目标头顶小标记);三角形默认中心原点,直接对准目标 x
    const lockedId = this.curr.lockedTargetId;
    const lockedView = lockedId === null ? undefined : this.views.get(lockedId);
    if (lockedView) {
      this.lockMarker
        .setVisible(true)
        .setPosition(lockedView.obj.x, lockedView.obj.y - 0.85 * TILE_PX);
    } else {
      this.lockMarker.setVisible(false);
    }

    // 瞄准指示短线:有锁定目标时指向实际弹道方向,否则指向移动朝向
    const px = playerView.obj.x;
    const py = playerView.obj.y;
    let aimX = player.aimX;
    let aimY = player.aimY;
    if (lockedView) {
      const dx = lockedView.obj.x - px;
      const dy = lockedView.obj.y - py;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        aimX = dx / len;
        aimY = dy / len;
      }
    }
    this.aimLine.setTo(px, py, px + aimX * 0.8 * TILE_PX, py + aimY * 0.8 * TILE_PX);
  }

  private ensureView(id: EntityId, build: () => EntityView): EntityView {
    let view = this.views.get(id);
    if (!view) {
      view = build();
      this.views.set(id, view);
    }
    return view;
  }

  private place(
    view: EntityView,
    prev: { x: number; y: number } | undefined,
    curr: { x: number; y: number },
    alpha: number,
  ): void {
    const from = prev ?? curr;
    view.obj.setPosition(
      (from.x + (curr.x - from.x) * alpha) * TILE_PX,
      (from.y + (curr.y - from.y) * alpha) * TILE_PX,
    );
  }

  private applyFlash(view: EntityView, flashing: boolean): void {
    const target = view.obj;
    if (target instanceof Phaser.GameObjects.Rectangle) {
      target.setFillStyle(flashing ? COLORS.flash : view.baseColor);
    } else {
      target.setFillStyle(flashing ? COLORS.flash : view.baseColor, target.fillAlpha);
    }
  }
}
