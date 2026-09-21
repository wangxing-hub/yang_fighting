import { FONT } from '../config.js';

/** 命中时炸开的星星 + 顿帧 + 屏幕震动 + 伤害数字，都集中在这里 */
export function hitBurst(scene, x, y, { damage = 0, strong = false } = {}) {
  const n = strong ? 7 : 4;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const dist = (strong ? 70 : 48) * (0.6 + Math.random() * 0.6);
    const star = scene.add
      .image(x, y, 'fx-star')
      .setDepth(9000)
      .setScale(0.35 + Math.random() * 0.3)
      .setAngle(Math.random() * 360);
    scene.tweens.add({
      targets: star,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist - 18,
      alpha: 0,
      scale: 0.1,
      angle: star.angle + 180,
      duration: 320 + Math.random() * 160,
      ease: 'Cubic.easeOut',
      onComplete: () => star.destroy(),
    });
  }
  if (damage > 0) damageNumber(scene, x, y - 40, damage);
}

export function damageNumber(scene, x, y, damage) {
  const t = scene.add
    .text(x, y, `-${damage}`, {
      fontFamily: FONT,
      fontSize: '30px',
      color: '#ffe9a8',
      fontStyle: 'bold',
      stroke: '#7a2b12',
      strokeThickness: 6,
    })
    .setOrigin(0.5)
    .setDepth(9500);
  scene.tweens.add({
    targets: t,
    y: y - 54,
    alpha: 0,
    duration: 720,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

/** 脚下扬起的尘土：起跳、落地、被打退都用 */
export function puff(scene, x, y, scale = 1, tint = 0xffffff) {
  const p = scene.add
    .image(x, y, 'fx-puff')
    .setDepth(9000)
    .setScale(0.4 * scale)
    .setTint(tint);
  scene.tweens.add({
    targets: p,
    scale: 1.1 * scale,
    alpha: 0,
    y: y - 14,
    duration: 420,
    ease: 'Sine.easeOut',
    onComplete: () => p.destroy(),
  });
}

/** 短促的顿帧：让打击感"实"一点 */
export function hitstop(scene, ms = 70) {
  if (scene.hitstopLeft > 0) return;
  scene.hitstopLeft = ms;
  scene.anims.pauseAll?.();
  scene.time.delayedCall(ms, () => {
    scene.hitstopLeft = 0;
    scene.anims.resumeAll?.();
  });
}

export function shake(scene, intensity = 0.006, duration = 160) {
  scene.cameras.main.shake(duration, intensity);
}
