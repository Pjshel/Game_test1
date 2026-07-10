import Phaser from 'phaser';
import type { FeelParams } from '../core/feel';
import type { SimEvent } from '../core/sim';
import type { EntityId } from '../core/ecs/registry';
import { Sfx } from './sfx';

/**
 * Juice 导演(宪法§6清单,WP1.5 灵魂之一):
 * 消费模拟层事件,负责顿帧、震屏三档、受击闪白、几何粒子与三层音效。
 * 顿帧的实现是表现层暂停注入 dt——模拟层确定性不受任何影响。
 */
export class JuiceDirector {
  private hitStopMs = 0;
  private readonly flashFrames = new Map<EntityId, number>();
  private playerFlash = 0;
  readonly sfx = new Sfx();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getParams: () => FeelParams,
    private readonly toPx: (tiles: number) => number,
  ) {}

  onEvents(events: readonly SimEvent[]): void {
    const juice = this.getParams().juice;
    const camera = this.scene.cameras.main;
    for (const event of events) {
      switch (event.type) {
        case 'playerFired':
          this.sfx.fire();
          break;
        case 'enemyFired':
          this.sfx.enemyFire();
          break;
        case 'targetHit':
          this.hitStopMs = Math.max(this.hitStopMs, juice.hitStopHitMs);
          if (juice.shakeHit > 0) {
            camera.shake(60, juice.shakeHit);
          }
          this.flashFrames.set(event.id, 2);
          this.burst(event.x, event.y, 4, 0xf2f6f9, 90);
          this.sfx.hit();
          break;
        case 'targetKilled':
          this.hitStopMs = Math.max(this.hitStopMs, juice.hitStopKillMs);
          if (juice.shakeKill > 0) {
            camera.shake(90, juice.shakeKill);
          }
          this.burst(event.x, event.y, 12, 0xffd27a, 200);
          this.sfx.kill();
          break;
        case 'playerHit':
          if (juice.shakeKill > 0) {
            camera.shake(110, juice.shakeKill);
          }
          this.playerFlash = 2;
          this.burst(event.x, event.y, 6, 0xff8a7a, 130);
          this.sfx.playerHit();
          break;
        case 'playerDied':
          if (juice.shakeBig > 0) {
            camera.shake(180, juice.shakeBig);
          }
          camera.flash(220, 224, 86, 75);
          this.sfx.death();
          break;
        case 'roomReset':
          camera.fadeFrom(180, 11, 14, 17);
          this.sfx.respawn();
          break;
        case 'orbPicked':
          this.sfx.orb();
          break;
        case 'targetsRespawned':
          this.sfx.respawn();
          break;
      }
    }
  }

  /**
   * 换算本帧应注入模拟的 dt:顿帧期间返回 0(世界冻结,渲染照常)。
   * 返回值和剩余顿帧一起推进,不依赖系统时钟。
   */
  consumeDt(frameDtMs: number): number {
    if (this.hitStopMs <= 0) {
      return frameDtMs;
    }
    this.hitStopMs -= frameDtMs;
    return 0;
  }

  /** 实体本帧是否处于受击闪白(2 帧,敌我皆有) */
  isFlashing(id: EntityId): boolean {
    return (this.flashFrames.get(id) ?? 0) > 0;
  }

  isPlayerFlashing(): boolean {
    return this.playerFlash > 0;
  }

  /** 每渲染帧结束时调用,推进闪白帧计数 */
  tickFrame(): void {
    for (const [id, frames] of this.flashFrames) {
      if (frames <= 1) {
        this.flashFrames.delete(id);
      } else {
        this.flashFrames.set(id, frames - 1);
      }
    }
    if (this.playerFlash > 0) {
      this.playerFlash -= 1;
    }
  }

  /** 几何粒子:小方块向随机方向散开并消隐(表现层随机,不碰模拟) */
  private burst(tileX: number, tileY: number, count: number, color: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const size = 3 + Math.random() * 4;
      const piece = this.scene.add
        .rectangle(this.toPx(tileX), this.toPx(tileY), size, size, color)
        .setDepth(6);
      const angle = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 30;
      this.scene.tweens.add({
        targets: piece,
        x: piece.x + Math.cos(angle) * dist,
        y: piece.y + Math.sin(angle) * dist,
        alpha: 0,
        duration: life + Math.random() * 80,
        onComplete: () => piece.destroy(),
      });
    }
  }
}
