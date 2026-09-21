import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config.js';

const PANEL = 0x14100c;

/**
 * 血条 / 头像 / 结算。左上角是玩家的长条，右上角两个敌人的短条。
 * 头像用的是 assets/small/avatar_*.webp（素材里本来就带黄铜圆框）。
 */
export default class Hud {
  constructor(scene, player, enemies) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.bars = new Map();

    this.drawPlayer();
    enemies.forEach((e, i) => this.drawEnemy(e, i));
    this.drawStageTitle();
    this.drawOffscreenMarks();
  }

  /**
   * 世界比画面宽一倍，敌人可能跑到画面外。
   * 跑到画面外的时候，在屏幕左右边缘贴一个小箭头标出他在哪边、叫什么。
   */
  drawOffscreenMarks() {
    const s = this.scene;
    this.marks = this.enemies.map((e) => {
      const arrow = s.add
        .image(0, 0, 'fx-arrow')
        .setDepth(9680)
        .setScrollFactor(0)
        .setVisible(false);
      const label = s.add
        .text(0, 0, e.cfg.name, {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#fff3d6',
          fontStyle: 'bold',
          backgroundColor: 'rgba(20,14,10,0.72)',
          padding: { x: 7, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(9680)
        .setScrollFactor(0)
        .setVisible(false);
      return { enemy: e, arrow, label };
    });
  }

  drawBar(fighter, x, y, w, h, avatarSize, align) {
    const s = this.scene;
    const avatar = s.add
      .image(x + (align === 'right' ? w - avatarSize / 2 : avatarSize / 2), y, fighter.cfg.avatar)
      .setDisplaySize(avatarSize, avatarSize)
      .setDepth(9600)
      .setScrollFactor(0);
    const barX = align === 'right' ? x : x + avatarSize + 10;
    const left = s.add
      .rectangle(barX, y, w - avatarSize - 10, h, 0x2a211a, 0.85)
      .setOrigin(align === 'right' ? 1 : 0, 0.5)
      .setDepth(9600)
      .setStrokeStyle(2, 0xf2e6cc, 0.35)
      .setScrollFactor(0);
    const fill = s.add
      .rectangle(left.x, y, left.width, h - 6, 0xd94f3d, 1)
      .setOrigin(align === 'right' ? 1 : 0, 0.5)
      .setDepth(9601)
      .setScrollFactor(0);
    const label = s.add
      .text(x + (align === 'right' ? 0 : avatarSize + 14), y - h / 2 - 20, fighter.cfg.name, {
        fontFamily: FONT,
        fontSize: '19px',
        color: '#f7ead0',
        fontStyle: 'bold',
      })
      .setOrigin(align === 'right' ? 0 : 0, 0.5)
      .setDepth(9601)
      .setScrollFactor(0);
    this.bars.set(fighter, { left, fill, label, avatar, w: left.width, h: h - 6 });
  }

  drawPlayer() {
    this.drawBar(this.player, 26, 46, 420, 26, 62, 'left');
  }

  drawEnemy(fighter, i) {
    this.drawBar(fighter, GAME_WIDTH - 26 - 300, 44 + i * 62, 300, 20, 50, 'right');
  }

  drawStageTitle() {
    const s = this.scene;
    this.title = s.add
      .text(GAME_WIDTH / 2, 108, '第 1 关 · 银行门口', {
        fontFamily: FONT,
        fontSize: '40px',
        color: '#fff3d6',
        fontStyle: 'bold',
        stroke: '#3a1f10',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(9700)
      .setScrollFactor(0);
    this.title.setAlpha(0);
    s.tweens.add({ targets: this.title, alpha: 1, duration: 400 });
    s.tweens.add({ targets: this.title, alpha: 0, delay: 1700, duration: 700 });

    this.hint = s.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 22, this.hintText(), {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#f2e6cc',
        backgroundColor: 'rgba(18,12,9,0.55)',
        padding: { x: 12, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(9600)
      .setScrollFactor(0);

    // 连击数：打中第二下才出来
    this.comboText = s.add
      .text(GAME_WIDTH / 2, 170, '', {
        fontFamily: FONT,
        fontSize: '34px',
        color: '#ffe9a8',
        fontStyle: 'bold',
        stroke: '#7a2b12',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(9650)
      .setScrollFactor(0)
      .setAlpha(0);
  }

  hintText() {
    return this.scene.mode === 'mobile'
      ? '左下摇杆走路　·　右下 攻 / 掷 / 跳'
      : 'WASD 移动　·　J 普攻　·　K 投掷　·　空格 跳';
  }

  setHint(text) {
    this.hint.setText(text);
  }

  /** 连击数（3 连击以上才显示，带一点弹一下的感觉） */
  setCombo(count) {
    if (count < 2) {
      this.comboText.setAlpha(0);
      return;
    }
    this.comboText.setText(`${count} 连击！`).setAlpha(1).setScale(1.25);
    this.scene.tweens.add({ targets: this.comboText, scale: 1, duration: 160 });
  }

  update() {
    this.bars.forEach((bar, fighter) => {
      const ratio = Phaser.Math.Clamp(fighter.hp / fighter.maxHp, 0, 1);
      bar.fill.width = bar.w * ratio;
      bar.fill.setFillStyle(ratio > 0.5 ? 0xd94f3d : ratio > 0.22 ? 0xe08a2e : 0xf0c33c);
      bar.avatar.setAlpha(fighter.alive ? 1 : 0.42);
    });
    this.updateOffscreenMarks();
  }

  updateOffscreenMarks() {
    const cam = this.scene.cameras.main;
    this.marks.forEach(({ enemy, arrow, label }) => {
      const onScreen = enemy.alive && enemy.gx - cam.scrollX > 30 && enemy.gx - cam.scrollX < GAME_WIDTH - 30;
      if (onScreen || !enemy.alive) {
        arrow.setVisible(false);
        label.setVisible(false);
        return;
      }
      const left = enemy.gx < cam.scrollX + GAME_WIDTH / 2;
      const x = left ? 40 : GAME_WIDTH - 40;
      const y = Phaser.Math.Clamp(enemy.gy - 90 - cam.scrollY, 130, GAME_HEIGHT - 90);
      arrow.setVisible(true).setPosition(x, y).setFlipX(!left);
      label.setVisible(true).setPosition(x, y - 44);
    });
  }

  /** 结算横幅 */
  banner(text, sub, color = '#ffe9a8') {
    const s = this.scene;
    const panel = s.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 720, 220, PANEL, 0.82)
      .setDepth(9800)
      .setScrollFactor(0)
      .setStrokeStyle(3, 0xc9a44c, 0.6)
      .setScale(1, 0.7)
      .setAlpha(0);
    const main = s.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, text, {
        fontFamily: FONT,
        fontSize: '70px',
        color,
        fontStyle: 'bold',
        stroke: '#3a1f10',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(9801)
      .setScrollFactor(0)
      .setAlpha(0);
    const tip = s.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, sub, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#f2e6cc',
      })
      .setOrigin(0.5)
      .setDepth(9801)
      .setScrollFactor(0)
      .setAlpha(0);

    s.tweens.add({ targets: panel, alpha: 1, scaleY: 1, duration: 360, ease: 'Back.easeOut' });
    s.tweens.add({ targets: [main, tip], alpha: 1, duration: 360, delay: 120 });
  }
}
