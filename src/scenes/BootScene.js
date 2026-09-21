import { CHARACTERS, FONT, GAME_HEIGHT, GAME_WIDTH, SHEETS } from '../config.js';
import { createSoftShadow } from '../art/canvasKit.js';
import { createHitTextures, createPropTextures } from '../art/props.js';
import { createStreetArt } from '../art/street.js';

/** 加载所有素材 + 生成代码画的贴图（飞行道具、阴影、特效），带进度条 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const barW = 520;
    const frame = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, barW, 18, 0x2a211a, 0.9)
      .setStrokeStyle(2, 0xc9a44c, 0.7);
    const fill = this.add
      .rectangle(GAME_WIDTH / 2 - barW / 2 + 2, GAME_HEIGHT / 2 + 60, 0, 12, 0xc9a44c, 1)
      .setOrigin(0, 0.5);
    const pct = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, '正在加载素材…', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#d9c39a',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '泡面杨大战神雕侠侣', {
        fontFamily: FONT,
        fontSize: '44px',
        color: '#f7ead0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.load.on('progress', (v) => {
      fill.width = (barW - 4) * v;
      pct.setText(`正在加载素材… ${Math.round(v * 100)}%`);
    });

    // 这里只加载标题页就要用的三个头像（几十 KB），让标题页立刻能出来；
    // 人物精灵表交给 TitleScene 在后台慢慢拉（见 TitleScene.queueFightAssets）
    Object.values(CHARACTERS).forEach((c) => {
      if (!this.textures.exists(c.avatar)) {
        this.load.image(c.avatar, `assets/small/${c.avatar.replace('-', '_')}.webp`);
      }
    });
  }

  create() {
    createSoftShadow(this);
    createPropTextures(this);
    createHitTextures(this);
    createStreetArt(this);
    document.getElementById('loading')?.remove();
    this.scene.start('TitleScene');
  }
}
