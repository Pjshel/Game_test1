import Phaser from 'phaser';

/**
 * 开火输入(宪法§3:开火=按住的主动决策):
 * 桌面 = 鼠标左键按住(仅左键,坐标不参与瞄准);移动端 = 屏幕右下角开火按钮。
 * 按钮按指针 id 归属释放事件,其他手指扫过不打断开火;
 * 顿帧窗口内的快速点按会被锁存,在下一个 tick 采样时生效。
 */
export class FireInput {
  private mouseHeld = false;
  private buttonHeld = false;
  private tapLatch = false;
  private buttonPointerId: number | null = null;
  private readonly button: Phaser.GameObjects.Arc | null = null;
  private readonly buttonCenter = { x: 0, y: 0 };
  private static readonly BUTTON_RADIUS = 46;

  constructor(scene: Phaser.Scene) {
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch && pointer.button === 0) {
        this.mouseHeld = true;
        this.tapLatch = true;
      }
    });
    const mouseRelease = (pointer: Phaser.Input.Pointer): void => {
      if (!pointer.wasTouch && pointer.button === 0) {
        this.mouseHeld = false;
      }
    };
    scene.input.on('pointerup', mouseRelease);
    scene.input.on('pointerupoutside', mouseRelease);

    if (scene.sys.game.device.input.touch) {
      const { width, height } = scene.scale;
      this.buttonCenter.x = width - 84;
      this.buttonCenter.y = height - 84;
      this.button = scene.add
        .circle(this.buttonCenter.x, this.buttonCenter.y, FireInput.BUTTON_RADIUS, 0xe0564b, 0.22)
        .setStrokeStyle(2, 0xe0564b, 0.6)
        .setDepth(20)
        .setInteractive();
      this.button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.buttonPointerId = pointer.id;
        this.buttonHeld = true;
        this.tapLatch = true;
        this.button?.setFillStyle(0xe0564b, 0.45);
      });
      // 释放只认按下按钮的那根手指;其他指针的 up/out 不打断开火
      const buttonRelease = (pointer: Phaser.Input.Pointer): void => {
        if (pointer.id !== this.buttonPointerId) {
          return;
        }
        this.buttonPointerId = null;
        this.buttonHeld = false;
        this.button?.setFillStyle(0xe0564b, 0.22);
      };
      this.button.on('pointerup', buttonRelease);
      this.button.on('pointerout', buttonRelease);
      // 兜底:手指在按钮外任何位置抬起也按 id 释放
      scene.input.on('pointerup', buttonRelease);
      scene.input.on('pointerupoutside', buttonRelease);
    }
  }

  /** 该触摸是否落在开火按钮上(供摇杆忽略此类触摸) */
  claimsPointer(x: number, y: number): boolean {
    if (!this.button) {
      return false;
    }
    const dx = x - this.buttonCenter.x;
    const dy = y - this.buttonCenter.y;
    return dx * dx + dy * dy <= FireInput.BUTTON_RADIUS * FireInput.BUTTON_RADIUS * 2.25;
  }

  /**
   * 每 tick 采样一次:按住为真;顿帧期间完成的快速点按经锁存补发一次。
   */
  sampleHeld(): boolean {
    const held = this.mouseHeld || this.buttonHeld || this.tapLatch;
    this.tapLatch = false;
    return held;
  }
}
