import Phaser from 'phaser';

/**
 * 开火输入(宪法§3:开火=按住的主动决策):
 * 桌面 = 鼠标任意键按住(坐标不参与瞄准);移动端 = 屏幕右下角开火按钮。
 * 按钮仅在触屏设备上显示;摇杆通过 claimsPointer 避开按钮区域。
 */
export class FireInput {
  private mouseHeld = false;
  private buttonHeld = false;
  private readonly button: Phaser.GameObjects.Arc | null = null;
  private readonly buttonCenter = { x: 0, y: 0 };
  private static readonly BUTTON_RADIUS = 46;

  constructor(scene: Phaser.Scene) {
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch) {
        this.mouseHeld = true;
      }
    });
    const mouseRelease = (pointer: Phaser.Input.Pointer): void => {
      if (!pointer.wasTouch) {
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
      this.button.on('pointerdown', () => {
        this.buttonHeld = true;
        this.button?.setFillStyle(0xe0564b, 0.45);
      });
      const buttonRelease = (): void => {
        this.buttonHeld = false;
        this.button?.setFillStyle(0xe0564b, 0.22);
      };
      this.button.on('pointerup', buttonRelease);
      this.button.on('pointerout', buttonRelease);
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

  held(): boolean {
    return this.mouseHeld || this.buttonHeld;
  }
}
