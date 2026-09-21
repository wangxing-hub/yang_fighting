import { CHARACTERS, COMBAT, SHEETS, STAGE } from '../config.js';
import { hitBurst, hitstop, puff, shake } from '../systems/effects.js';
import { sfxJump } from '../systems/audio.js';

const DIRS = ['down', 'up', 'left', 'right'];

/**
 * 所有角色（玩家和敌人）共用的战斗单位。
 *
 * 坐标系：gx / gy 是**脚底**在地面上的位置，jz 是跳起来的高度。
 * 渲染位置 = (gx, gy - jz)，深度用 gy 排（越靠下越靠前）。
 * 不用 Arcade 物理——判定全用手算的矩形，俯视格斗这样最好控。
 */
export default class Fighter extends Phaser.GameObjects.Sprite {
  constructor(scene, charId, x, y) {
    const cfg = CHARACTERS[charId];
    const walk = SHEETS[cfg.walkSheet];
    super(scene, x, y, cfg.walkSheet, cfg.idle.down);
    scene.add.existing(this);

    this.cfg = cfg;
    this.charId = charId;
    this.gx = x;
    this.gy = y;
    this.jz = 0;
    this.jv = 0;
    this.vx = 0;      // 击退 / 位移速度（地面）
    this.vy = 0;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.facing = 'left';
    this.state = 'idle';   // idle | walk | act | hurt | down
    this.act = null;
    this.actDone = false;
    this.invulnUntil = 0;
    this.hurtUntil = 0;
    this.cdUntil = 0;
    this.walkTime = 0;
    this.walkFrame = 0;
    this.bobPhase = 0;
    this.flashUntil = 0;
    this.downTween = null;

    this.shadow = scene.add
      .image(x, y, 'soft-shadow')
      .setOrigin(0.5, 0.5)
      .setAlpha(0.5)
      .setScale(0.62, 0.34);

    this.applySheet(cfg.walkSheet);
    this.setFrame(cfg.idle[this.facing]);
    this.syncPosition();
  }

  get alive() {
    return this.state !== 'down';
  }

  /** 换精灵表：同时换 scale 和 origin（每张表的人物大小、脚底位置都不一样） */
  applySheet(sheetId) {
    const s = SHEETS[sheetId];
    if (this.currentSheet === sheetId) {
      this.updateFlip();
      return;
    }
    this.currentSheet = sheetId;
    this.setTexture(sheetId);
    this.setOrigin(s.origin[0], s.origin[1]);
    this.setScale(s.scale);
    this.updateFlip();
  }

  /**
   * 行走表是四方向素材（左走有专门朝左的帧），不用镜像；
   * 攻击 / 投掷表**只画了一个朝向**（画面朝右），所以朝左出手时水平镜像一下，
   * 不然往左打的时候人还是朝右，看着就像"只能朝一个方向攻击"。
   */
  updateFlip() {
    this.setFlipX(this.currentSheet !== this.cfg.walkSheet && this.facing === 'left');
  }

  /**
   * 近战判定框：角色自己的站桩范围，朝当前朝向伸出去 reach。
   *
   * 竖直方向要单独算——朝上和朝下伸出去的是「身前的地面」：
   *   朝上：从头顶往上 reach；朝下：从脚底往下 reach。
   * 以前上下共用一个居中矩形，导致朝下只能打到自己身前 40 像素，朝左朝右却够得着，
   * 看起来就是「只能朝一个方向攻击」。
   */
  meleeRect(m) {
    const bw = this.cfg.body.w;
    const half = bw / 2;
    if (this.facing === 'left') {
      return new Phaser.Geom.Rectangle(this.gx - half - m.reach, this.gy - m.h, m.reach, m.h);
    }
    if (this.facing === 'right') {
      return new Phaser.Geom.Rectangle(this.gx + half, this.gy - m.h, m.reach, m.h);
    }
    // 上下：判定宽度用身宽 + 一点余量，免得稍微错开一点就落空
    const wide = bw + 40;
    const y = this.facing === 'up' ? this.gy - m.h - m.reach : this.gy;
    return new Phaser.Geom.Rectangle(this.gx - wide / 2, y, wide, m.reach);
  }

  /** 屏幕上的碰撞盒（脚底对齐，宽 x 高） */
  get rect() {
    const { w, h } = this.cfg.body;
    return new Phaser.Geom.Rectangle(this.gx - w / 2, this.gy - h, w, h);
  }

  /** 受击范围的高度区间：判断飞行道具从头顶还是脚底下过去（跳跃躲针头） */
  get hurtTop() {
    return this.jz + 10;
  }

  get hurtBottom() {
    return this.jz + this.displayHeight * 0.92;
  }

  /** 头顶点（飘字、特效定位） */
  get headY() {
    return this.gy - this.jz - this.displayHeight - 8;
  }

  /** 想往哪个方向走：{ x, y } 归一化前；返回真正采用的方向 */
  moveIntent(x, y, dt, speed) {
    const len = Math.hypot(x, y);
    if (len < 0.01) {
      this.state = 'idle';
      return false;
    }
    const nx = x / len;
    const ny = y / len;
    this.gx += nx * speed * dt;
    this.gy += ny * speed * dt;
    this.facing = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : ny < 0 ? 'up' : 'down';
    this.updateFlip();
    this.state = 'walk';
    return true;
  }

  /**
   * 只按输入方向定朝向、不移动。
   * 玩家按攻击的那一瞬间先调它，就能做到「边走边打也是打向正在走的方向」，
   * 停下之后朝向也保持最后走的方向。
   */
  aimFromInput(x, y) {
    const len = Math.hypot(x, y);
    if (len < 0.01) return;
    const nx = x / len;
    const ny = y / len;
    this.facing = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : ny < 0 ? 'up' : 'down';
    this.updateFlip();
  }

  /** 每帧都调：位置同步、动画推进、动作判定、边界钳制 */
  update(dt, now) {
    if (this.state === 'down') {
      this.syncPosition();
      return;
    }

    // 动作推进（手动逐帧，方便精确对齐判定帧）
    if (this.act) this.updateAct(dt, now);
    else this.updateWalkAnim(dt);

    // 跳跃
    if (this.jz > 0 || this.jv > 0) {
      this.jv -= COMBAT.jump.g * dt;
      this.jz += this.jv * dt;
      if (this.jz <= 0) {
        this.jz = 0;
        this.jv = 0;
        puff(this.scene, this.gx, this.gy, 0.9);
      }
    }

    // 击退衰减
    if (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) {
      this.gx += this.vx * dt;
      this.gy += this.vy * dt;
      const k = Math.max(0, 1 - COMBAT.knockDecay * dt);
      this.vx *= k;
      this.vy *= k;
    } else {
      this.vx = 0;
      this.vy = 0;
    }

    if (this.state === 'hurt' && now >= this.hurtUntil) this.state = 'idle';

    this.clampToStage();
    this.syncPosition();
    this.setTint(this.flashUntil > now ? 0xffb4a2 : 0xffffff);
  }

  updateWalkAnim(dt) {
    const frames = this.cfg.dirs[this.facing];
    if (this.state === 'walk' && this.jz <= 0) {
      this.walkTime += dt;
      const step = 1 / this.cfg.walkFps;
      while (this.walkTime >= step) {
        this.walkTime -= step;
        this.walkFrame = (this.walkFrame + 1) % frames.length;
      }
      this.applySheet(this.cfg.walkSheet);
      this.setFrame(frames[this.walkFrame]);
      this.bobPhase += dt * 9;
      const bob = 1 - 0.02 * Math.abs(Math.sin(this.bobPhase));
      this.setScale(SHEETS[this.cfg.walkSheet].scale, SHEETS[this.cfg.walkSheet].scale * bob);
    } else {
      this.applySheet(this.cfg.walkSheet);
      this.setFrame(this.cfg.idle[this.facing]);
      const s = SHEETS[this.cfg.walkSheet].scale;
      this.setScale(s);
    }
  }

  /**
   * 起手一个动作。actName 对应 config 里的 acts 键。
   * 返回 false 表示现在出不了手（在硬直 / 冷却中 / 已经在出手）。
   *
   * instant = true（玩家）：**按下就出判定 / 就出道具**，动画只是表现，
   *   不再等动画走到第几帧，所以手感是"按了就打到"。
   * instant = false（敌人 AI）：还是等动画走到 hitFrame 才出手，
   *   保留起手动作当预警，玩家看得见、躲得开。
   */
  startAct(actName, now, instant = false) {
    if (this.state === 'hurt' || this.state === 'down' || this.act) return false;
    const a = this.cfg.acts[actName];
    if (!a || now < this.cdUntil) return false;
    this.act = { name: actName, cfg: a, frame: 0, t: 0, fired: false };
    this.actDone = false;
    this.state = 'act';
    this.vx = 0;
    this.vy = 0;
    this.cdUntil = now + (a.cd || 0); // 冷却从按下那一刻算，不是从动画放完算
    this.applySheet(a.sheet);
    this.setFrame(0);
    if (instant) this.fireAct();
    return true;
  }

  /** 出判定：近战开一次攻击框，投掷掷出道具（一个动作只出一次） */
  fireAct() {
    const a = this.act;
    if (!a || a.fired) return;
    a.fired = true;
    if (a.cfg.melee) this.scene.resolveMelee(this, a.cfg);
    else if (a.cfg.projectile) this.scene.spawnProjectile(this, a.cfg);
  }

  updateAct(dt, now) {
    const a = this.act;
    const total = SHEETS[a.cfg.sheet].frames;
    a.t += dt;
    const step = 1 / a.cfg.fps;
    while (a.t >= step) {
      a.t -= step;
      a.frame += 1;
      if (a.frame >= total) {
        this.finishAct(now);
        return;
      }
    }
    this.setFrame(Math.min(a.frame, total - 1));

    // AI 的判定帧：走到 hitFrame 才出手（玩家在 startAct 里已经立刻出了）
    if (!a.fired && a.frame >= a.cfg.hitFrame) this.fireAct();
  }

  finishAct(now) {
    this.act = null;
    this.actDone = true;
    this.state = 'idle';
    this.applySheet(this.cfg.walkSheet);
  }

  /** 跳一下（只有站在地上才能跳） */
  jump() {
    if (this.state === 'hurt' || this.state === 'down' || this.jz > 0 || this.act) return false;
    this.jv = COMBAT.jump.v;
    this.jz = 1;
    puff(this.scene, this.gx, this.gy, 0.8);
    sfxJump();
    return true;
  }

  /** 挨一下。返回 false 表示这次没打中（无敌 / 已经倒下） */
  takeHit({ damage, knock, fromX, fromY, source }, now) {
    if (!this.alive || now < this.invulnUntil) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.flashUntil = now + 130;
    this.invulnUntil = now + COMBAT.invuln;
    this.act = null;

    const dx = this.gx - fromX;
    const dy = this.gy - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.vx = (dx / len) * knock;
    this.vy = (dy / len) * knock;

    hitBurst(this.scene, this.gx, this.gy - this.cfg.body.h - this.jz, {
      damage,
      strong: damage >= 12,
    });
    hitstop(this.scene, COMBAT.hitstop);
    shake(this.scene, damage >= 12 ? 0.008 : 0.004, 150);
    this.scene.onFighterHit?.(this, source);

    if (this.hp <= 0) {
      this.knockOut();
    } else {
      this.state = 'hurt';
      this.hurtUntil = now + COMBAT.hitstun;
    }
    return true;
  }

  knockOut() {
    this.state = 'down';
    this.act = null;
    this.vx = 0;
    this.vy = 0;
    this.shadow.setAlpha(0.25);
    this.downTween = this.scene.tweens.add({
      targets: this,
      angle: this.facing === 'left' ? -82 : 82,
      alpha: 0.82,
      duration: 420,
      ease: 'Cubic.easeOut',
    });
    this.scene.onFighterDown?.(this);
  }

  /** 别走出可行走区域（左上角是湖水，shore 里那几段把左边界往里收） */
  clampToStage() {
    const w = STAGE.walk;
    let left = w.left;
    for (const s of STAGE.shore) {
      if (this.gy < s.y1) {
        left = Math.max(left, s.left);
        break;
      }
    }
    this.gx = Phaser.Math.Clamp(this.gx, left, w.right);
    this.gy = Phaser.Math.Clamp(this.gy, w.top, w.bottom);
  }

  /** 和另一个角色的距离（脚底） */
  distanceTo(other) {
    return Math.hypot(other.gx - this.gx, other.gy - this.gy);
  }

  faceTo(x, y) {
    const dx = x - this.gx;
    const dy = y - this.gy;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  }

  syncPosition() {
    this.setPosition(this.gx, this.gy - this.jz);
    this.setDepth(this.gy);
    const k = 1 - Math.min(0.62, this.jz / 340);
    this.shadow.setPosition(this.gx, this.gy - 2).setScale(0.62 * k, 0.34 * k).setDepth(this.gy - 1);
  }

  /** 朝向前方一格的落点（AI 走位用） */
  forwardPoint(dist) {
    const d = {
      left: [-1, 0],
      right: [1, 0],
      up: [0, -1],
      down: [0, 1],
    }[this.facing];
    return { x: this.gx + d[0] * dist, y: this.gy + d[1] * dist };
  }
}
