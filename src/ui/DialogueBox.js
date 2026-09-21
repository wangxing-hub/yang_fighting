import { CHARACTERS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { sfxBlip } from '../systems/audio.js';

const BOX = { x: 74, y: 508, w: GAME_WIDTH - 148, h: 192 };
const CHAR_MS = 26; // 打字机速度：每个字多少毫秒

/**
 * 剧情对话条：一条一条往下念，头像 + 名字 + 打字机正文。
 *
 *   按 J / 空格 / 回车 / 点屏幕 继续：
 *   正文还没打完就先补完这一句，打完了才翻到下一句。
 *
 * 念完最后一句会回调 onDone——关卡用它来切换"对话中 / 开打"的状态。
 */
export default class DialogueBox {
  constructor(scene, lines, onDone) {
    this.scene = scene;
    this.lines = lines;
    this.onDone = onDone;
    this.index = -1;
    this.shown = 0;
    this.open = true;
    this.build();
    this.bindInput();
    this.nextLine();
  }

  build() {
    const s = this.scene;
    const depth = 9950;
    const keep = { setScrollFactor: 0, setDepth: depth };

    this.panel = s.add
      .rectangle(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2, BOX.w, BOX.h, 0x14100c, 0.9)
      .setScrollFactor(0)
      .setDepth(depth)
      .setStrokeStyle(3, 0xc9a44c, 0.75);
    s.add
      .rectangle(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2 - 4, BOX.w - 14, BOX.h - 14, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setStrokeStyle(1, 0xc9a44c, 0.28);

    this.portraitRing = s.add
      .circle(BOX.x + 96, BOX.y + BOX.h / 2, 62, 0x2a1d13, 1)
      .setScrollFactor(0)
      .setDepth(depth)
      .setStrokeStyle(3, 0xc9a44c, 0.8);
    this.portrait = s.add
      .image(BOX.x + 96, BOX.y + BOX.h / 2, 'avatar-yang')
      .setDisplaySize(116, 116)
      .setScrollFactor(0)
      .setDepth(depth + 1);

    this.nameText = s.add
      .text(BOX.x + 180, BOX.y + 26, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setDepth(depth + 1);
    this.bodyText = s.add
      .text(BOX.x + 180, BOX.y + 64, '', {
        fontFamily: FONT,
        fontSize: '25px',
        color: '#f7ead0',
        lineSpacing: 10,
        wordWrap: { width: BOX.w - 230 },
      })
      .setScrollFactor(0)
      .setDepth(depth + 1);
    this.hint = s.add
      .text(BOX.x + BOX.w - 18, BOX.y + BOX.h - 20, 'J / 空格 继续 ▼', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#c9b48a',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);
    s.tweens.add({ targets: this.hint, alpha: 0.25, duration: 620, yoyo: true, repeat: -1 });

    this.objects = [this.panel, this.portraitRing, this.portrait, this.nameText, this.bodyText, this.hint];
    void keep;
  }

  bindInput() {
    const s = this.scene;
    this.onAdvance = () => this.advance();
    this.onKey = () => this.advance();
    s.input.on('pointerdown', this.onAdvance);
    ['SPACE', 'J', 'K', 'ENTER'].forEach((k) => s.input.keyboard.on(`keydown-${k}`, this.onKey));
  }

  unbindInput() {
    const s = this.scene;
    s.input.off('pointerdown', this.onAdvance);
    ['SPACE', 'J', 'K', 'ENTER'].forEach((k) => s.input.keyboard.off(`keydown-${k}`, this.onKey));
  }

  get line() {
    return this.lines[this.index];
  }

  nextLine() {
    this.index += 1;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.shown = 0;
    this.typeTimer?.remove();
    this.typeTimer = this.scene.time.addEvent({
      delay: CHAR_MS,
      loop: true,
      callback: () => this.tick(),
    });
    this.paint();
  }

  tick() {
    if (!this.open || this.shown >= this.line.text.length) return;
    this.shown += 1;
    // 每三个字"嘀"一声，像老游戏那样
    if (this.shown % 3 === 0) sfxBlip();
    this.paint();
  }

  paint() {
    const line = this.line;
    if (!line) return;
    const cfg = CHARACTERS[line.who];
    if (cfg?.avatar && this.portrait.texture.key !== cfg.avatar) this.portrait.setTexture(cfg.avatar);
    this.nameText.setText(cfg?.nick || cfg?.name || line.who);
    this.bodyText.setText(line.text.slice(0, this.shown));
  }

  /** 按一下：先补完这一句，已经补完就翻下一句 */
  advance() {
    if (!this.open) return;
    if (this.shown < this.line.text.length) {
      this.shown = this.line.text.length;
      this.paint();
      return;
    }
    this.nextLine();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.typeTimer?.remove();
    this.unbindInput();
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
    this.onDone?.();
  }
}
