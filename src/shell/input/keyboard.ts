import Phaser from 'phaser';
import type { Direction } from './resolve';

interface MoveKeys {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * 键盘输入:WASD 为主,方向键为等价备用(方向键不受键盘布局/输入法影响,
 * 是 WASD 失灵时的兜底)。键盘插件不可用时(纯触屏设备)方向恒为零。
 */
export class KeyboardInput {
  private readonly keys: MoveKeys | null;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    this.keys = keyboard
      ? {
          w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
          a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
          s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
          d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
          up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
          left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
          down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
          right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        }
      : null;
  }

  direction(): Direction {
    if (!this.keys) {
      return { dx: 0, dy: 0 };
    }
    const k = this.keys;
    return {
      dx: (k.d.isDown || k.right.isDown ? 1 : 0) - (k.a.isDown || k.left.isDown ? 1 : 0),
      dy: (k.s.isDown || k.down.isDown ? 1 : 0) - (k.w.isDown || k.up.isDown ? 1 : 0),
    };
  }
}
