import { FONT, TOUCH } from '../config.js';

/**
 * 手机上的虚拟按键：左下摇杆（能斜着推、推多少走多快）+ 右下三个键（攻 / 掷 / 跳）。
 * 只负责记录状态，具体读取在 FightScene.readIntent 里。
 */
export default class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.vec = { x: 0, y: 0 };
    this.pressed = { attack: false, throw: false, jump: false };
    this.pointerId = null;
    this.build();
  }

  get vector() {
    return this.vec;
  }

  /** 取一次"刚按下"，取完就清掉 */
  take(id) {
    if (!this.pressed[id]) return false;
    this.pressed[id] = false;
    return true;
  }

  build() {
    const s = this.scene;
    this.objects = [];
    s.input.addPointer(3); // 一边推摇杆一边按攻击键需要多点触控

    const st = TOUCH.stick;
    const base = s.add
      .circle(st.x, st.y, st.base, 0x120d09, 0.3)
      .setDepth(9500)
      .setScrollFactor(0)
      .setStrokeStyle(3, 0xf2e6cc, 0.28)
      .setInteractive(new Phaser.Geom.Circle(st.base, st.base, st.hit), Phaser.Geom.Circle.Contains);

    const cross = s.add.graphics().setDepth(9501).setScrollFactor(0);
    cross.lineStyle(2, 0xf2e6cc, 0.16);
    cross.beginPath();
    cross.moveTo(st.x - st.max, st.y);
    cross.lineTo(st.x + st.max, st.y);
    cross.moveTo(st.x, st.y - st.max);
    cross.lineTo(st.x, st.y + st.max);
    cross.strokePath();

    this.knob = s.add
      .circle(st.x, st.y, st.knob, 0xf2e6cc, 0.3)
      .setDepth(9502)
      .setScrollFactor(0)
      .setStrokeStyle(3, 0xf2e6cc, 0.45);
    this.objects.push(base, cross, this.knob);

    const start = (p) => {
      if (this.pointerId !== null) return;
      this.pointerId = p.id;
      this.update(p);
      this.knob.setFillStyle(0xc9a44c, 0.45);
    };
    const move = (p) => {
      if (this.pointerId !== p.id) return;
      this.update(p);
    };
    const end = (p) => {
      if (this.pointerId !== p.id) return;
      this.pointerId = null;
      this.vec.x = 0;
      this.vec.y = 0;
      this.knob.setPosition(st.x, st.y).setFillStyle(0xf2e6cc, 0.3);
    };
    base.on('pointerdown', start);
    s.input.on('pointermove', move);
    s.input.on('pointerup', end);
    s.input.on('pointerupoutside', end);

    this.buttons = {};
    TOUCH.buttons.forEach((b) => this.makeButton(b));

    this.tip = s.add
      .text(st.x + 2, st.y - st.base - 24, '左边摇杆走路　·　右下 攻 / 掷 / 跳', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#f2e6cc',
        backgroundColor: 'rgba(20,14,10,0.55)',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(9503)
      .setScrollFactor(0)
      .setAlpha(0);
    this.objects.push(this.tip);
  }

  /** 整套按键显示 / 隐藏（开场对话时先收起来，别挡着对话条） */
  setVisible(v) {
    this.objects.forEach((o) => o.setVisible(v));
    if (!v) {
      this.vec.x = 0;
      this.vec.y = 0;
      this.pointerId = null;
    }
  }

  update(p) {
    const st = TOUCH.stick;
    let dx = p.x - st.x;
    let dy = p.y - st.y;
    const len = Math.hypot(dx, dy);
    if (len > st.max) {
      dx = (dx / len) * st.max;
      dy = (dy / len) * st.max;
    }
    this.knob.setPosition(st.x + dx, st.y + dy);
    if (len < st.dead) {
      this.vec.x = 0;
      this.vec.y = 0;
    } else {
      this.vec.x = dx / st.max;
      this.vec.y = dy / st.max;
    }
  }

  makeButton(b) {
    const s = this.scene;
    const circle = s.add
      .circle(b.x, b.y, b.r, b.color, 0.24)
      .setDepth(9501)
      .setScrollFactor(0)
      .setStrokeStyle(3, 0xffffff, 0.36)
      .setInteractive({ useHandCursor: true });
    const label = s.add
      .text(b.x, b.y, b.label, {
        fontFamily: FONT,
        fontSize: '34px',
        color: '#fff6e2',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(9502)
      .setScrollFactor(0);
    this.objects.push(circle, label);

    const press = () => {
      this.pressed[b.id] = true;
      circle.setFillStyle(b.color, 0.6);
    };
    const release = () => circle.setFillStyle(b.color, 0.24);
    circle.on('pointerdown', press);
    circle.on('pointerup', release);
    circle.on('pointerout', release);
    circle.on('pointerupoutside', release);
    this.buttons[b.id] = circle;
  }

}
