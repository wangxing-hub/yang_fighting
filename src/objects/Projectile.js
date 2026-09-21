import { PROJECTILES, STAGE } from '../config.js';
import { puff } from '../systems/effects.js';

/**
 * 飞行道具：平底锅 / 螃蟹 / 榴莲 / 针头 / 泡面。
 *
 * 分两种弹道：
 *   straight：贴着某个高度直线飞（平底锅、针头），针头很低，可以跳过去；
 *   arc     ：抛物线，落地就碎（螃蟹、榴莲、泡面）。
 * z 是离地高度，挨打的判定会在 z 上和角色重叠才算命中，所以跳跃真的能躲。
 */
export default class Projectile {
  constructor(scene, name, { x, y, dirX, dirY, owner }) {
    const cfg = PROJECTILES[name];
    this.scene = scene;
    this.name = name;
    this.cfg = cfg;
    this.owner = owner;
    this.gx = x;
    this.gy = y;
    this.z = cfg.z;
    this.vz = cfg.kind === 'arc' ? 170 : 0;
    this.vx = dirX * cfg.speed;
    this.vy = dirY * cfg.speed * (cfg.kind === 'arc' ? 0.86 : 1);
    this.life = cfg.life;
    this.dead = false;

    this.sprite = scene.add
      .image(x, y - cfg.z, cfg.tex)
      .setDepth(y)
      .setScale(0.9);
    if (dirX < 0) this.sprite.setFlipX(true);

    this.shadow = scene.add
      .image(x, y, 'soft-shadow')
      .setAlpha(0.32)
      .setScale(0.36, 0.2)
      .setDepth(y - 1);
  }

  update(dt) {
    if (this.dead) return;
    this.gx += this.vx * dt;
    this.gy += this.vy * dt;
    this.life -= dt * 1000;

    if (this.cfg.kind === 'arc') {
      this.vz -= this.cfg.gravity * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.land();
        return;
      }
    }

    this.sprite.setPosition(this.gx, this.gy - this.z).setDepth(this.gy);
    if (this.cfg.spin) this.sprite.angle += this.cfg.spin * dt;
    const k = 1 - Math.min(0.6, this.z / 400);
    this.shadow.setPosition(this.gx, this.gy - 2).setDepth(this.gy - 1).setScale(0.36 * k, 0.2 * k);

    // 飞出场地（舞台外两百像素）或者寿命到了就收掉
    const w = STAGE.walk;
    const outside =
      this.gx < w.left - 220 || this.gx > w.right + 220 || this.gy < w.top - 220 || this.gy > w.bottom + 220;
    if (this.life <= 0 || outside) this.kill();
  }

  /** 命中判定：矩形重叠 + 高度区间重叠（跳跃躲低弹道靠这个） */
  hits(fighter) {
    if (this.dead || fighter === this.owner || !fighter.alive) return false;
    if (this.z < fighter.hurtTop || this.z > fighter.hurtBottom) return false;
    const r = this.cfg.r;
    const box = fighter.rect;
    return (
      this.gx + r > box.x &&
      this.gx - r < box.x + box.width &&
      this.gy + r * 0.6 > box.y &&
      this.gy - r * 0.6 < box.y + box.height
    );
  }

  land() {
    puff(this.scene, this.gx, this.gy, 1.1, 0xf0d9a8);
    this.kill();
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
