import Phaser from 'phaser';
import { GameScene, WORLD_HEIGHT, WORLD_WIDTH } from './GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#12161c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 默认只跟踪 1 个触摸指针;放宽以便摇杆手指之外的手指也被跟踪/接管
  input: { activePointers: 3 },
  scene: [GameScene],
});
