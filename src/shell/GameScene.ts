import Phaser from 'phaser';
import { FixedStepDriver, Simulation, type SimSnapshot } from '../core/sim';
import { KeyboardInput } from './input/keyboard';
import { VirtualJoystick } from './input/joystick';
import { resolveMoveCommands } from './input/resolve';

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;
const PLAYER_SIZE = 24;

/**
 * WP0 唯一场景:驱动 60Hz 模拟,把 core 快照渲染为方块,
 * 用残余时间 alpha 在前后两个 tick 快照之间插值。
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private driver!: FixedStepDriver;
  private prev!: SimSnapshot;
  private curr!: SimSnapshot;
  private square!: Phaser.GameObjects.Rectangle;
  private keyboard!: KeyboardInput;
  private joystick!: VirtualJoystick;

  constructor() {
    super('game');
  }

  create(): void {
    this.sim = new Simulation({ spawnX: WORLD_WIDTH / 2, spawnY: WORLD_HEIGHT / 2 });
    this.driver = new FixedStepDriver(this.sim);
    this.prev = this.sim.snapshot();
    this.curr = this.prev;

    this.square = this.add.rectangle(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      0x4fd1c5,
    );
    this.add.text(12, 12, 'WASD move · touch & drag for joystick', {
      fontSize: '14px',
      color: '#8a94a3',
    });

    this.keyboard = new KeyboardInput(this);
    this.joystick = new VirtualJoystick(this);
  }

  override update(_time: number, delta: number): void {
    const alpha = this.driver.advance(delta, () => {
      this.prev = this.sim.snapshot();
      return resolveMoveCommands(this.keyboard.direction(), this.joystick.direction());
    });
    this.curr = this.sim.snapshot();

    const before = this.prev.entities[0];
    const after = this.curr.entities[0];
    if (before && after) {
      this.square.setPosition(
        Phaser.Math.Linear(before.x, after.x, alpha),
        Phaser.Math.Linear(before.y, after.y, alpha),
      );
    }
  }
}
