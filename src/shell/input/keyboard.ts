import Phaser from 'phaser';
import type { Direction } from './resolve';

interface WasdKeys {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
}

/** WASD 键盘输入。键盘插件不可用时(纯触屏设备)方向恒为零。 */
export class KeyboardInput {
  private readonly keys: WasdKeys | null;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    this.keys = keyboard
      ? {
          w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
          a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
          s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
          d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        }
      : null;
  }

  direction(): Direction {
    if (!this.keys) {
      return { dx: 0, dy: 0 };
    }
    return {
      dx: (this.keys.d.isDown ? 1 : 0) - (this.keys.a.isDown ? 1 : 0),
      dy: (this.keys.s.isDown ? 1 : 0) - (this.keys.w.isDown ? 1 : 0),
    };
  }
}
