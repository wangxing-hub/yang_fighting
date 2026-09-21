import Fighter from './Fighter.js';
import { AI } from '../config.js';

/**
 * 敌人 AI：一个"贴身压迫"（潘尔赛），一个"远程拉扯"（黄姐）。
 *
 * 核心是**轮流出手**——同一时刻只有一个敌人能发动攻击（攻击令牌在场景里维护），
 * 另一个只能走位，这样 1v2 才不会被连到死。
 */
export default class Enemy extends Fighter {
  constructor(scene, charId, x, y, target) {
    super(scene, charId, x, y);
    this.ai = AI[charId];
    this.target = target;
    this.thinkAt = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeFlipAt = 0;
    this.nextAttackAt = scene.time.now + 800 + Math.random() * 1000;
  }

  control(dt, now) {
    if (this.state === 'down') return;
    if (this.act || this.state === 'hurt') {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    if (now >= this.thinkAt) {
      this.think(now);
      this.thinkAt = now + AI.thinkEvery;
    }

    if (this.moveX === 0 && this.moveY === 0) {
      this.state = 'idle';
      if (this.target?.alive) this.faceTo(this.target.gx, this.target.gy);
      return;
    }
    this.moveIntent(this.moveX, this.moveY, dt, this.ai.speed);
  }

  think(now) {
    const p = this.target;
    this.moveX = 0;
    this.moveY = 0;
    if (!p || !p.alive) return;

    const dx = p.gx - this.gx;
    const dy = p.gy - this.gy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // 1) 能出手就出手（要先拿到攻击令牌）
    if (now >= this.nextAttackAt && dist < this.ai.keep.max + 70) {
      const meleeReady = dist < 130 && this.ready(this.ai.melee, now);
      const rangedReady = this.ai.ranged.filter((name) => this.ready(name, now));
      const wantRanged = Math.random() < this.ai.rangedChance || !meleeReady;
      const choice = wantRanged
        ? rangedReady[Math.floor(Math.random() * rangedReady.length)]
        : this.ai.melee;

      if (choice && this.scene.claimAttackToken(this)) {
        this.faceTo(p.gx, p.gy);
        if (this.startAct(choice, now)) {
        this.nextAttackAt = now + (this.ai.cool[choice] || 1500) + Math.random() * 300;
          return;
        }
        this.scene.releaseAttackToken(this);
      }
    }

    // 2) 走位：太远就靠过去，太近就往后撤，距离合适就绕圈
    const keep = this.ai.keep;
    if (now >= this.strafeFlipAt) {
      this.strafeSign *= -1;
      this.strafeFlipAt = now + this.ai.strafeFlip * (0.7 + Math.random() * 0.6);
    }
    if (dist > keep.max) {
      this.moveX = nx;
      this.moveY = ny;
    } else if (dist < keep.min) {
      this.moveX = -nx;
      this.moveY = -ny;
    } else {
      // 绕圈，同时轻微地修距离，免得两个人一直站在同一条直线上
      this.moveX = -ny * this.strafeSign + nx * 0.22;
      this.moveY = nx * this.strafeSign + ny * 0.22;
    }

    // 3) 两个敌人之间保持距离，别叠在一起
    const other = this.scene.enemies.find((e) => e !== this && e.alive);
    if (other) {
      const ox = this.gx - other.gx;
      const oy = this.gy - other.gy;
      const od = Math.hypot(ox, oy) || 1;
      if (od < AI.separation) {
        const push = (AI.separation - od) / AI.separation;
        this.moveX += (ox / od) * push * 1.6;
        this.moveY += (oy / od) * push * 1.6;
      }
    }

    // 4) 别贴着舞台边界走（贴边容易卡住，也难看）
    const away = this.edgeAway();
    if (away) {
      this.moveX += away.x;
      this.moveY += away.y;
    }
  }

  edgeAway() {
    const r = this.scene.stageRect;
    const pad = 130;
    let x = 0;
    let y = 0;
    if (this.gx < r.left + pad) x += 1;
    if (this.gx > r.right - pad) x -= 1;
    if (this.gy < r.top + pad) y += 1;
    if (this.gy > r.bottom - pad) y -= 1;
    return x || y ? { x, y } : null;
  }

  ready(actName, now) {
    return Boolean(this.cfg.acts[actName]) && now >= this.nextAttackAt;
  }
}
