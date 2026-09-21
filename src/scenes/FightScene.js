import {
  COMBAT,
  DIALOGUE,
  FONT,
  GAME_HEIGHT,
  GAME_WIDTH,
  KEYS,
  PROJECTILES,
  STAGE,
} from '../config.js';
import Player from '../objects/Player.js';
import Enemy from '../objects/Enemy.js';
import Projectile from '../objects/Projectile.js';
import Hud from '../ui/Hud.js';
import TouchControls from '../ui/TouchControls.js';
import { requestLandscape } from '../systems/orientation.js';
import { puff } from '../systems/effects.js';
import { setIntensity, sfxHit, sfxKo, sfxLose, sfxThrow, sfxWin } from '../systems/audio.js';
import { addMusicButton } from '../ui/MusicButton.js';
import DialogueBox from '../ui/DialogueBox.js';

const FACING_VEC = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/**
 * 第一关：桂圆银行门口的街道，杨凡 1v2 打潘尔赛和黄姐。
 * 场景负责：输入、命中结算、道具、攻击令牌、胜负。
 */
export default class FightScene extends Phaser.Scene {
  constructor() {
    super('FightScene');
  }

  create() {
    this.mode = this.registry.get('inputMode') || 'desktop';
    this.hitstopLeft = 0;
    this.projectiles = [];
    this.attackToken = null;
    this.over = false;
    this.combo = { count: 0, at: 0 };
    this.stageRect = { ...STAGE.walk };

    this.add.image(0, 0, STAGE.artKey).setOrigin(0, 0).setDepth(-1000);
    // 暗角是屏幕空间的（贴在镜头上，不跟着世界滚）
    this.add.image(0, 0, 'street-vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(6000);

    this.player = new Player(this, STAGE.spawn.yang.x, STAGE.spawn.yang.y);
    this.enemies = [
      new Enemy(this, 'pan', STAGE.spawn.pan.x, STAGE.spawn.pan.y, this.player),
      new Enemy(this, 'huang', STAGE.spawn.huang.x, STAGE.spawn.huang.y, this.player),
    ];
    this.enemies.forEach((e) => e.faceTo(this.player.gx, this.player.gy));
    this.player.facing = 'right';

    this.hud = new Hud(this, this.player, this.enemies);
    addMusicButton(this);
    // 剧情阶段的状态机：intro（开场对话）-> fight（打）-> outro（赢了的对话）-> done（结算）
    this.phase = 'intro';
    setIntensity('title');

    // 镜头：世界比画面宽一倍，跟着杨凡横向滚；竖直方向因为世界和画面同高，等于不动
    this.cameras.main.setBounds(0, 0, STAGE.world.width, STAGE.world.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(220, 140);
    this.setupKeys();
    if (this.mode === 'mobile') {
      this.touch = new TouchControls(this);
      this.touch.setVisible(false); // 开场对话期间先收起来
      this.input.once('pointerdown', () => requestLandscape());
    }

    // 进场保护：这段时间敌人不动手，让玩家看清站位
    this.introUntil = this.time.now + 1500;
    this.showIntroDialogue();
    this.cameras.main.fadeIn(320, 8, 6, 5);

    this.input.keyboard.on('keydown-' + KEYS.restart[0], () => this.scene.restart());
  }

  /** 开场那段对话；念完才开始打 */
  showIntroDialogue() {
    this.dialogue = new DialogueBox(this, DIALOGUE.intro, () => {
      this.dialogue = null;
      this.beginFight();
    });
  }

  beginFight() {
    this.phase = 'fight';
    setIntensity('fight');
    this.clearPendingInput();
    this.touch?.setVisible(true);
    this.introUntil = this.time.now + 800;
    this.flashText('开打！');
  }

  clearPendingInput() {
    this.pending.attack = false;
    this.pending.throw = false;
    this.pending.jump = false;
  }

  flashText(text) {
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, text, {
        fontFamily: FONT,
        fontSize: '56px',
        color: '#ffe9a8',
        fontStyle: 'bold',
        stroke: '#3a1f10',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(9750)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 240, yoyo: true, hold: 620, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------------ 输入

  setupKeys() {
    this.keyRefs = {};
    Object.entries(KEYS).forEach(([name, codes]) => {
      this.keyRefs[name] = codes.map((c) => this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[c]));
    });
    /**
     * 三个按钮用"按下就记一笔"的方式读取。
     * 不能只靠 Phaser.Input.Keyboard.JustDown：如果一帧特别长（手机卡一下），
     * 按下和松开刚好落在同一帧里，JustDown 就永远是 false——玩家会觉得"点了没反应"。
     * 这里在 keydown 事件里先把标记立起来，下一帧一定会被读走。
     */
    this.pending = { attack: false, throw: false, jump: false };
    ['attack', 'throw', 'jump'].forEach((name) => {
      this.keyRefs[name].forEach((k) => k.on('down', () => {
        this.pending[name] = true;
      }));
    });
  }

  held(name) {
    return this.keyRefs[name].some((k) => k.isDown);
  }

  justPressed(name) {
    return this.keyRefs[name].some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  readIntent() {
    // 自检用：setBotIntent({x,y,attack,...}) 可以顶掉这一帧的键盘输入，
    // 用来在命令行里跑"机器人试打"，测平衡（见 README 的 npm run fight 说明）
    if (this.botIntent) {
      const i = this.botIntent;
      this.botIntent = null;
      return i;
    }
    let x = 0;
    let y = 0;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) y -= 1;
    if (this.held('down')) y += 1;

    const intent = {
      x,
      y,
      attack: this.pending.attack || this.justPressed('attack'),
      throw: this.pending.throw || this.justPressed('throw'),
      jump: this.pending.jump || this.justPressed('jump'),
    };
    this.pending.attack = false;
    this.pending.throw = false;
    this.pending.jump = false;

    if (this.touch) {
      const v = this.touch.vector;
      if (Math.hypot(v.x, v.y) > 0.14) {
        intent.x = v.x;
        intent.y = v.y;
      }
      intent.attack = intent.attack || this.touch.take('attack');
      intent.throw = intent.throw || this.touch.take('throw');
      intent.jump = intent.jump || this.touch.take('jump');
    }
    return intent;
  }

  // ------------------------------------------------------------------ 每帧

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    if (this.hitstopLeft > 0) {
      this.hitstopLeft -= delta;
      return;
    }

    // 对话期间不接受战斗输入，人物只是站着（动画照常跑）
    const fighting = this.phase === 'fight';
    if (fighting) {
      // 每帧都读一次意图（把按下标记读走），但开打前那 0.8 秒不真的操作人物，
      // 免得"翻过最后一句对话"的那一下被当成跳跃 / 攻击
      const intent = this.readIntent();
      if (time >= this.introUntil && !this.over) this.player.control(intent, dt, time);
    }
    this.player.update(dt, time);

    const thinking = fighting && time >= this.introUntil && !this.over;
    this.enemies.forEach((e) => {
      if (thinking) e.control(dt, time);
      e.update(dt, time);
      if (!e.act) this.releaseAttackToken(e);
    });

    this.updateProjectiles(dt);
    this.overlapCheck();
    this.hud.update();
    this.checkEnd();
  }

  updateProjectiles(dt) {
    if (!this.projectiles.length) return;
    this.projectiles.forEach((p) => {
      p.update(dt);
      if (p.dead) return;
      const targets = [this.player, ...this.enemies];
      for (const t of targets) {
        if (this.isHostile(p.owner, t) && p.hits(t)) {
          this.applyHit(t, {
            damage: p.cfg.damage,
            knock: 250,
            fromX: p.gx,
            fromY: p.gy,
            source: p.owner,
          });
          p.kill();
          break;
        }
      }
    });
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /** 两个角色站得太近就互相推开一点，免得叠成一个人 */
  overlapCheck() {
    const all = [this.player, ...this.enemies].filter((f) => f.alive);
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.gx - a.gx;
        const dy = b.gy - a.gy;
        const d = Math.hypot(dx, dy);
        const minD = (a.cfg.body.w + b.cfg.body.w) * 0.42;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.gx -= nx * push;
          a.gy -= ny * push;
          b.gx += nx * push;
          b.gy += ny * push;
        }
      }
    }
  }

  checkEnd() {
    if (this.phase !== 'fight' || this.over) return;
    if (!this.player.alive) this.finish(false);
    else if (this.enemies.every((e) => !e.alive)) this.finish(true);
  }

  finish(win) {
    this.over = true;
    // 场上残留的道具一并清掉，免得赢了之后还被飞过来的锅砸到
    this.projectiles.forEach((p) => p.kill());
    this.projectiles = [];

    if (win) {
      sfxWin();
      this.cameras.main.flash(300, 255, 240, 190);
      this.phase = 'outro';
      this.time.delayedCall(1000, () => {
        this.dialogue = new DialogueBox(this, DIALOGUE.outro, () => {
          this.dialogue = null;
          this.showEndCard();
        });
      });
      return;
    }

    sfxLose();
    this.phase = 'done';
    this.time.delayedCall(700, () => {
      this.hud.banner('败  北', '按 R 再来一次，这次记得绕开螃蟹', '#ff9aa2');
      this.hud.setHint('按 R 重来');
      this.armRestartTap();
    });
  }

  /** 结算画面：点屏幕 / 按 R 重来（延后一点注册，免得被"看完最后一句"的那一下点掉） */
  showEndCard() {
    this.phase = 'done';
    this.hud.banner('第一关 · 完', '听潘尔赛说，佛山有个宋老师 · 按 R 再来一次', '#ffe9a8');
    this.hud.setHint('按 R 重来');
    this.armRestartTap();
  }

  armRestartTap() {
    this.time.delayedCall(600, () => {
      this.input.once('pointerdown', () => this.time.delayedCall(400, () => this.scene.restart()));
    });
  }

  // ------------------------------------------------------------------ 战斗结算

  /**
   * 近战判定：在角色前方开一个矩形，和别人的脚底碰撞盒相交就算打中。
   * 矩形本身就带着"前后左右"的范围，所以离得太远自然打不到（俯视格斗的手感）。
   */
  resolveMelee(attacker, cfg) {
    const box = attacker.meleeRect(cfg.melee);
    this.slash(attacker, box);

    const targets = [this.player, ...this.enemies].filter((f) => f !== attacker);
    for (const t of targets) {
      if (!t.alive || !this.isHostile(attacker, t)) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(box, t.rect)) {
        this.applyHit(t, {
          damage: cfg.damage,
          knock: cfg.knock || 250,
          fromX: attacker.gx,
          fromY: attacker.gy,
          source: attacker,
        });
      }
    }
  }

  /** 出手时那一道弧光（代码画的，没有素材） */
  slash(attacker, box) {
    const key = 'fx-slash';
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 128, 128);
      const ctx = tex.getContext();
      ctx.strokeStyle = 'rgba(255,248,220,0.92)';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(70, 64, 40, -1.05, 1.05);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,210,120,0.55)';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(70, 64, 40, -0.75, 0.75);
      ctx.stroke();
      tex.refresh();
    }
    const cx = box.centerX;
    const cy = box.centerY;
    const img = this.add
      .image(cx, cy, key)
      .setDepth(attacker.gy + 1)
      .setScale(0.9)
      .setAngle({ right: 0, left: 180, up: -90, down: 90 }[attacker.facing]);
    this.tweens.add({
      targets: img,
      alpha: 0,
      scale: 1.25,
      duration: 180,
      onComplete: () => img.destroy(),
    });
  }

  applyHit(target, hit) {
    const now = this.time.now;
    if (!target.takeHit(hit, now)) return;
    sfxHit(hit.damage);
    if (hit.source === this.player) {
      this.combo.count = now - this.combo.at < COMBAT.comboWindow ? this.combo.count + 1 : 1;
      this.combo.at = now;
      this.hud.setCombo(this.combo.count);
    }
  }

  /**
   * 谁能打到谁：玩家打谁都可以，**敌人的攻击只打玩家**。
   * 不然潘尔赛的平底锅会砸到黄姐，两个敌人自己就把自己解决了，关卡就没味了。
   */
  isHostile(attacker, target) {
    if (attacker === this.player) return true;
    return target === this.player;
  }

  /** 角色出手：从手的位置丢出道具 */
  spawnProjectile(attacker, cfg) {
    const name = cfg.projectile;
    const p = PROJECTILES[name];
    const v = FACING_VEC[attacker.facing];
    const x = attacker.gx + v.x * 48;
    const y = attacker.gy + v.y * 40 - (v.y > 0 ? 0 : 6);
    this.projectiles.push(new Projectile(this, name, { x, y, dirX: v.x, dirY: v.y, owner: attacker }));
    sfxThrow();
    puff(this, x, y - p.z * 0.6, 0.6, 0xfff0c8);
  }

  /** 攻击令牌：同一时刻只允许一个敌人发动攻击（1v2 的关键） */
  claimAttackToken(fighter) {
    if (this.attackToken && this.attackToken !== fighter && this.attackToken.act) return false;
    this.attackToken = fighter;
    return true;
  }

  releaseAttackToken(fighter) {
    if (this.attackToken === fighter) this.attackToken = null;
  }

  onFighterHit(fighter) {
    if (fighter === this.player) {
      this.combo.count = 0;
      this.hud.setCombo(0);
    }
  }

  onFighterDown(fighter) {
    puff(this, fighter.gx, fighter.gy, 1.3, 0xd8c39a);
    sfxKo();
  }
}
