import Phaser from 'phaser';
import type { Direction } from './resolve';

const BASE_RADIUS = 56;
const THUMB_RADIUS = 24;

/**
 * 触屏虚拟摇杆:手指按下处浮现摇杆底盘,拖动方向与幅度映射为移动方向。
 * 仅响应触摸指针(鼠标用户走 WASD),松开即释放并归零。
 */
export class VirtualJoystick {
  private readonly base: Phaser.GameObjects.Arc;
  private readonly thumb: Phaser.GameObjects.Arc;
  private activePointerId: number | null = null;
  private dir: Direction = { dx: 0, dy: 0 };

  constructor(scene: Phaser.Scene, ignorePointer?: (x: number, y: number) => boolean) {
    this.base = scene.add
      .circle(0, 0, BASE_RADIUS, 0xffffff, 0.06)
      .setStrokeStyle(2, 0xffffff, 0.25)
      .setVisible(false)
      .setDepth(10);
    this.thumb = scene.add.circle(0, 0, THUMB_RADIUS, 0xffffff, 0.2).setVisible(false).setDepth(11);

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch || this.activePointerId !== null) {
        return;
      }
      if (ignorePointer?.(pointer.x, pointer.y)) {
        return; // 该触摸属于开火按钮等其他控件
      }
      this.activePointerId = pointer.id;
      this.base.setPosition(pointer.x, pointer.y).setVisible(true);
      this.thumb.setPosition(pointer.x, pointer.y).setVisible(true);
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.activePointerId) {
        return;
      }
      const vx = pointer.x - this.base.x;
      const vy = pointer.y - this.base.y;
      const length = Math.hypot(vx, vy);
      if (length === 0) {
        this.dir = { dx: 0, dy: 0 };
        this.thumb.setPosition(this.base.x, this.base.y);
        return;
      }
      const clamped = Math.min(length, BASE_RADIUS);
      const nx = vx / length;
      const ny = vy / length;
      this.thumb.setPosition(this.base.x + nx * clamped, this.base.y + ny * clamped);
      this.dir = { dx: (nx * clamped) / BASE_RADIUS, dy: (ny * clamped) / BASE_RADIUS };
    });

    const release = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id !== this.activePointerId) {
        return;
      }
      this.activePointerId = null;
      this.dir = { dx: 0, dy: 0 };
      this.base.setVisible(false);
      this.thumb.setVisible(false);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  /** 摇杆被按住时返回当前方向,未激活时返回 null(键盘接管)。 */
  direction(): Direction | null {
    return this.activePointerId === null ? null : { ...this.dir };
  }
}
