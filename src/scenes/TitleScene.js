import { CHARACTERS, FONT, GAME_HEIGHT, GAME_WIDTH, SHEETS, STAGE } from '../config.js';
import { linear, radialEllipse, makeTexture } from '../art/canvasKit.js';
import { requestLandscape } from '../systems/orientation.js';
import { setIntensity, startMusic } from '../systems/audio.js';
import { addMusicButton } from '../ui/MusicButton.js';

const MODES = [
  { id: 'desktop', label: '电脑模式', desc: 'WASD 走　J 普攻　K 投掷　空格 跳' },
  { id: 'mobile', label: '手机模式', desc: '左下摇杆走　右下 攻 / 掷 / 跳（横屏）' },
];

/** 开场界面：标题 + 三个角色 + 模式选择 + 开始 */
export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    this.mode = this.registry.get('inputMode') || (this.game.device.input.touch ? 'mobile' : 'desktop');
    // 暗色渐变打底，街道压在上面当"背景板"（半透明，不抢标题）
    this.add.image(0, 0, this.backdrop()).setOrigin(0).setDepth(-1000);
    this.add.image(0, 0, STAGE.artKey).setOrigin(0).setAlpha(0.3).setDepth(-990);

    this.add
      .text(GAME_WIDTH / 2, 92, '泡面杨大战神雕侠侣', {
        fontFamily: FONT,
        fontSize: '66px',
        color: '#fff3d6',
        fontStyle: 'bold',
        stroke: '#3a1f10',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 150, '第一关 · 银行门口 · 一个人打一对夫妻', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#e5cfa4',
      })
      .setOrigin(0.5);

    this.drawFighters();
    this.drawModes();
    this.drawStart();
    addMusicButton(this);
    setIntensity('title');
    this.queueFightAssets();

    this.cameras.main.fadeIn(300, 8, 6, 5);
  }

  /**
   * 人物精灵表在标题页后台下载：标题页只需要几十 KB 的头像就能显示，
   * 打架用的十来张图趁玩家看标题、选模式的时候悄悄拉完。
   * 加载进度直接显示在"开始挑战"按钮上，没下完就点会等它下完自动开始。
   */
  queueFightAssets() {
    const missing = Object.entries(SHEETS).filter(([key]) => !this.textures.exists(key));
    this.assetsReady = missing.length === 0;
    if (this.assetsReady) return;

    missing.forEach(([key, s]) => {
      this.load.spritesheet(key, s.path, { frameWidth: s.w, frameHeight: s.h });
    });
    this.load.on('progress', (v) => {
      this.startText?.setText(`素材加载中 ${Math.round(v * 100)}%`);
    });
    this.load.once('complete', () => {
      this.assetsReady = true;
      this.startText?.setText('开始挑战');
      if (this.pendingStart) this.launch();
    });
    this.load.start();
  }

  backdrop() {
    const key = 'title-bg';
    if (this.textures.exists(key)) return key;
    makeTexture(this, key, GAME_WIDTH, GAME_HEIGHT, (ctx, w, h) => {
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
        [0, '#2b1f18'],
        [0.55, '#1a1310'],
        [1, '#0d0a08'],
      ]);
      ctx.fillRect(0, 0, w, h);
      radialEllipse(ctx, w / 2, h * 0.42, 700, 340, [
        [0, 'rgba(255, 196, 120, 0.18)'],
        [1, 'rgba(255, 196, 120, 0)'],
      ]);
      ctx.fillStyle = 'rgba(201, 164, 76, 0.32)';
      ctx.fillRect(0, 186, w, 2);
    });
    return key;
  }

  /** 左边泡面杨（玩家），右边神雕侠侣（两个敌人） */
  drawFighters() {
    const yang = CHARACTERS.yang;
    const pan = CHARACTERS.pan;
    const huang = CHARACTERS.huang;

    this.avatarCard(yang, 300, 320, 1.5, '玩家', '#ffe9a8');
    this.add
      .text(300, 470, yang.name, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#fff3d6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(300, 502, '一个人打两个', { fontFamily: FONT, fontSize: '17px', color: '#c9b48a' })
      .setOrigin(0.5);

    this.add
      .text(640, 356, 'VS', {
        fontFamily: FONT,
        fontSize: '46px',
        color: '#d98b5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(995, 208, '神雕侠侣', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ffd7a8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.avatarCard(pan, 900, 320, 1.2, '', '#ffd7a8');
    this.avatarCard(huang, 1090, 320, 1.2, '', '#ffd7a8');
    this.add
      .text(900, 458, pan.name, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#fff3d6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(900, 488, '平底锅 · 螃蟹', { fontFamily: FONT, fontSize: '15px', color: '#c9b48a' })
      .setOrigin(0.5);
    this.add
      .text(900, 512, '贴身硬刚', { fontFamily: FONT, fontSize: '14px', color: '#9d8a67' })
      .setOrigin(0.5);

    this.add
      .text(1090, 458, huang.name, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#fff3d6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(1090, 488, '榴莲 · 针头', { fontFamily: FONT, fontSize: '15px', color: '#c9b48a' })
      .setOrigin(0.5);
    this.add
      .text(1090, 512, '远程拉扯', { fontFamily: FONT, fontSize: '14px', color: '#9d8a67' })
      .setOrigin(0.5);
  }

  avatarCard(cfg, x, y, scale = 1, tag = '', tagColor = '#ffe9a8') {
    const size = 132 * scale;
    this.add.image(x, y, cfg.avatar).setDisplaySize(size, size);
    if (tag) {
      this.add
        .text(x, y - size / 2 - 4, tag, {
          fontFamily: FONT,
          fontSize: '18px',
          color: tagColor,
          backgroundColor: 'rgba(20,14,10,0.7)',
          padding: { x: 8, y: 3 },
        })
        .setOrigin(0.5, 1);
    }
  }

  drawModes() {
    const y = 592;
    this.modeTexts = [];
    MODES.forEach((m, i) => {
      const x = i === 0 ? GAME_WIDTH / 2 - 220 : GAME_WIDTH / 2 + 220;
      const box = this.add
        .rectangle(x, y, 380, 74, 0x1d1613, 0.85)
        .setStrokeStyle(3, 0xc9a44c, 0.5)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x, y - 12, m.label, {
          fontFamily: FONT,
          fontSize: '26px',
          color: '#f7ead0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const desc = this.add
        .text(x, y + 18, m.desc, { fontFamily: FONT, fontSize: '14px', color: '#c0ab84' })
        .setOrigin(0.5);
      box.on('pointerdown', () => this.pick(m.id));
      this.modeTexts.push({ id: m.id, box, label, desc });
    });
    this.pick(this.mode);
  }

  pick(id) {
    this.mode = id;
    this.modeTexts.forEach((m) => {
      const on = m.id === id;
      m.box.setStrokeStyle(on ? 4 : 2, on ? 0xffd98a : 0xc9a44c, on ? 1 : 0.35);
      m.box.setFillStyle(on ? 0x33261c : 0x1d1613, 0.9);
      m.label.setColor(on ? '#fff3d6' : '#b9a67f');
    });
  }

  drawStart() {
    const y = 672;
    const btn = this.add
      .rectangle(GAME_WIDTH / 2, y, 420, 66, 0xc9a44c, 0.9)
      .setStrokeStyle(3, 0xffe9a8, 0.7)
      .setInteractive({ useHandCursor: true });
    this.startText = this.add
      .text(GAME_WIDTH / 2, y, '开始挑战', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#2a1a10',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const go = () => {
      startMusic(); // 用户手势里把音乐开起来
      if (!this.assetsReady) {
        // 素材还没下完：记一笔，下完自动进关
        this.pendingStart = true;
        this.startText.setText('素材准备中…');
        return;
      }
      this.launch();
    };
    btn.on('pointerdown', go);
    this.input.keyboard.on('keydown-ENTER', go);
    this.input.keyboard.on('keydown-SPACE', go);
  }

  launch() {
    if (this.launched) return;
    this.launched = true;
    this.registry.set('inputMode', this.mode);
    if (this.mode === 'mobile') requestLandscape();
    this.cameras.main.fadeOut(280, 8, 6, 5);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('FightScene'));
  }
}
