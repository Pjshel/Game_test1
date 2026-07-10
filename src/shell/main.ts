import Phaser from 'phaser';
import feelRaw from '../content/feel.json';
import { parseFeelParams } from '../core/feel';
import { GameScene, WORLD_HEIGHT, WORLD_WIDTH } from './GameScene';

// 数据表在边界上经 zod 校验(内容即数据军规);非法参数在启动时即失败
const params = parseFeelParams(feelRaw);

// 灰盒打靶用随机种子;确定性验证由测试用固定种子保证
const seed = Date.now() >>> 0;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#0b0e11',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 默认只跟踪 1 个触摸指针;摇杆+开火按钮需要至少 2 指并行
  input: { activePointers: 3 },
  scene: new GameScene(params, seed),
});
