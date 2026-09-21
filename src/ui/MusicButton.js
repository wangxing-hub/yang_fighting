import { FONT } from '../config.js';
import { isMuted, toggleMute, unlockAudio, startMusic } from '../systems/audio.js';

/**
 * 右上风格统一的音乐开关：点一下静音 / 再点开回来（键盘 M 也行）。
 * 放在两个场景同一个位置，切场景时不会跳。
 */
export function addMusicButton(scene, x = 640, y = 30) {
  const btn = scene.add
    .text(x, y, '', {
      fontFamily: FONT,
      fontSize: '16px',
      color: '#f7ead0',
      backgroundColor: 'rgba(20,14,10,0.62)',
      padding: { x: 12, y: 5 },
    })
    .setOrigin(0.5)
    .setDepth(9900)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true });

  const paint = () => btn.setText(isMuted() ? '♪ 音乐：关（M）' : '♪ 音乐：开（M）');
  const flip = () => {
    toggleMute();
    paint();
  };
  const firstTouch = () => {
    unlockAudio();
    startMusic();
  };

  btn.on('pointerdown', firstTouch);
  btn.on('pointerdown', flip);
  scene.input.keyboard.on('keydown-M', flip);
  // 点画面别处也算"用户手势"，顺手把音乐开起来
  scene.input.on('pointerdown', firstTouch);
  scene.input.keyboard.on('keydown', firstTouch);

  paint();
  return btn;
}
