/** 画贴图用的小工具（银行场景和街道场景共用） */

/** 可复现的伪随机数，保证每次生成的纹理一模一样 */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function radialEllipse(ctx, cx, cy, rx, ry, stops) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  return g;
}

export function makeTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = 'round';
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

/** 角色脚下的柔和阴影，多场景共用 */
export function createSoftShadow(scene, key = 'soft-shadow') {
  if (scene.textures.exists(key)) return;
  makeTexture(scene, key, 150, 64, (ctx, w, h) => {
    radialEllipse(ctx, w / 2, h / 2, w / 2, h / 2, [
      [0, 'rgba(40, 26, 14, 0.45)'],
      [0.6, 'rgba(40, 26, 14, 0.22)'],
      [1, 'rgba(40, 26, 14, 0)'],
    ]);
  });
}
