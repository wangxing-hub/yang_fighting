import { GAME_HEIGHT, GAME_WIDTH } from './config.js';
import { watchOrientation } from './systems/orientation.js';
import * as audio from './systems/audio.js';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import FightScene from './scenes/FightScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#15100d',
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, FightScene],
};

// 方便在控制台里调试：game.scene.getScene('FightScene')
window.game = new Phaser.Game(config);

// 浏览器要求先有用户手势才能出声：第一次点屏幕 / 按键盘就把音频解锁
const unlock = () => {
  audio.unlockAudio();
  audio.startMusic();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// 调试用：window.audio.renderPreview(8) 可以把音乐离线渲染出来量音量
window.audio = audio;

// 手机模式 + 竖屏时提示玩家把手机横过来
watchOrientation();
