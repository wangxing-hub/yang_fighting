/**
 * 飞行道具的贴图：投掷图里道具是跟在人物身上的，单独立不出来，
 * 所以这里用代码画——风格尽量贴近那套卡通素材（粗轮廓 + 高明度 + 暗部）。
 */
import { roundRect, radialEllipse, makeTexture } from './canvasKit.js';

const OUTLINE = '#3a2418';

function outline(ctx, w = 5) {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** 平底锅：侧着飞出去的铁锅，锅底朝前 */
function drawPan(ctx, w, h) {
  const cx = w * 0.34;
  const cy = h * 0.5;
  // 手柄
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  ctx.beginPath();
  ctx.moveTo(w * 0.2, -h * 0.06);
  ctx.lineTo(w * 0.86, -h * 0.11);
  ctx.lineTo(w * 0.86, h * 0.08);
  ctx.lineTo(w * 0.2, h * 0.06);
  ctx.closePath();
  ctx.fillStyle = '#4a3126';
  ctx.fill();
  outline(ctx, 4);
  ctx.restore();
  // 锅身
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.26, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5d6070';
  ctx.fill();
  outline(ctx, 5);
  // 锅底高光与内圈
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.05, cy - h * 0.05, w * 0.14, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8b90a4';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.02, cy + h * 0.02, w * 0.09, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3f4250';
  ctx.fill();
}

/** 螃蟹：横着飞，两只钳子张着 */
function drawCrab(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.55;
  // 腿
  ctx.strokeStyle = '#c8452c';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx + i * w * 0.12, cy + h * 0.1);
    ctx.lineTo(cx + i * w * 0.3 - w * 0.06, cy + h * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + i * w * 0.12, cy + h * 0.1);
    ctx.lineTo(cx + i * w * 0.3 + w * 0.06, cy + h * 0.34);
    ctx.stroke();
  }
  // 钳子
  [-1, 1].forEach((s) => {
    ctx.save();
    ctx.translate(cx + s * w * 0.32, cy - h * 0.12);
    ctx.rotate(s * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.11, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e2563a';
    ctx.fill();
    outline(ctx, 4);
    ctx.beginPath();
    ctx.moveTo(s * w * 0.08, -h * 0.02);
    ctx.lineTo(s * w * 0.2, -h * 0.12);
    ctx.lineTo(s * w * 0.2, h * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#f0704f';
    ctx.fill();
    outline(ctx, 4);
    ctx.restore();
  });
  // 身子
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.26, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e2563a';
  ctx.fill();
  outline(ctx, 5);
  // 眼睛
  [-1, 1].forEach((s) => {
    ctx.beginPath();
    ctx.arc(cx + s * w * 0.1, cy - h * 0.14, h * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8ec';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.arc(cx + s * w * 0.1, cy - h * 0.15, h * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1a12';
    ctx.fill();
  });
}

/** 榴莲：带尖刺的大果子 */
function drawDurian(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const rx = w * 0.38;
  const ry = h * 0.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#9a8b3a';
  ctx.fill();
  // 尖刺
  ctx.fillStyle = '#b8a44a';
  ctx.strokeStyle = '#5f5320';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx * 0.86;
    const y = cy + Math.sin(a) * ry * 0.86;
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(a) * 7, y + Math.cos(a) * 7);
    ctx.lineTo(cx + Math.cos(a) * rx * 1.18, cy + Math.sin(a) * ry * 1.18);
    ctx.lineTo(x + Math.sin(a) * 7, y - Math.cos(a) * 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(154,139,58,0.95)';
  ctx.fill();
  ctx.strokeStyle = '#5f5320';
  ctx.lineWidth = 4;
  ctx.stroke();
  radialEllipse(ctx, cx - rx * 0.3, cy - ry * 0.35, rx * 0.5, ry * 0.5, [
    [0, 'rgba(255,246,190,0.5)'],
    [1, 'rgba(255,246,190,0)'],
  ]);
}

/** 注射器：针尖朝右，飞出去的时候会自己转 */
function drawNeedle(ctx, w, h) {
  const cy = h * 0.5;
  // 针管
  ctx.beginPath();
  roundRect(ctx, w * 0.34, cy - h * 0.11, w * 0.5, h * 0.22, 5);
  ctx.fillStyle = '#e9f2f7';
  ctx.fill();
  outline(ctx, 4);
  // 药水
  ctx.beginPath();
  roundRect(ctx, w * 0.4, cy - h * 0.08, w * 0.22, h * 0.16, 3);
  ctx.fillStyle = '#8ad3c8';
  ctx.fill();
  // 推杆
  ctx.beginPath();
  roundRect(ctx, w * 0.22, cy - h * 0.13, w * 0.14, h * 0.26, 4);
  ctx.fillStyle = '#cfd8e0';
  ctx.fill();
  outline(ctx, 4);
  ctx.beginPath();
  roundRect(ctx, w * 0.13, cy - h * 0.17, w * 0.1, h * 0.34, 4);
  ctx.fillStyle = '#aeb8c4';
  ctx.fill();
  outline(ctx, 4);
  // 针头
  ctx.beginPath();
  ctx.moveTo(w * 0.84, cy - h * 0.035);
  ctx.lineTo(w * 0.99, cy);
  ctx.lineTo(w * 0.84, cy + h * 0.035);
  ctx.closePath();
  ctx.fillStyle = '#c9d4de';
  ctx.fill();
  ctx.strokeStyle = '#6d7a88';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 针尖滴的一滴
  ctx.beginPath();
  ctx.arc(w * 0.98, cy + h * 0.12, h * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = '#8ad3c8';
  ctx.fill();
}

/** 泡面：桶装方便面，飞行时桶身朝前 */
/**
 * 泡面：桶装方便面。
 * 之前画得太窄太高，看着像个纸杯——现在改成"上宽下窄的圆台"，
 * 桶口有个掀开一角的锡纸盖，冒两根弯弯的面出来，一眼能认出是泡面。
 */
function drawNoodle(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.56;
  const topW = w * 0.86;
  const botW = w * 0.6;
  const cupH = h * 0.46;
  const half = cupH / 2;
  // 桶身在某个 y 处的宽度（上宽下窄）
  const widthAt = (y) => topW + (botW - topW) * ((y + half) / cupH);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.08);

  // 桶身
  ctx.beginPath();
  ctx.moveTo(-topW / 2, -half);
  ctx.lineTo(topW / 2, -half);
  ctx.lineTo(botW / 2, half);
  ctx.quadraticCurveTo(0, half + 5, -botW / 2, half);
  ctx.closePath();
  ctx.fillStyle = '#f7f3e9';
  ctx.fill();
  outline(ctx, 5);

  // 红色腰封（贴着桶身的斜度）
  const bandTop = -half * 0.1;
  const bandBot = half * 0.42;
  const bw0 = widthAt(bandTop) / 2;
  const bw1 = widthAt(bandBot) / 2;
  ctx.beginPath();
  ctx.moveTo(-bw0, bandTop);
  ctx.lineTo(bw0, bandTop);
  ctx.lineTo(bw1, bandBot);
  ctx.lineTo(-bw1, bandBot);
  ctx.closePath();
  ctx.fillStyle = '#d8472f';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 腰封上的两条小字（抽象成两道白条就够了）
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(-bw0 * 0.5, bandTop + (bandBot - bandTop) * 0.26, bw0, 3);
  ctx.fillRect(-bw0 * 0.34, bandTop + (bandBot - bandTop) * 0.55, bw0 * 0.68, 3);

  // 桶口
  ctx.beginPath();
  ctx.ellipse(0, -half, topW / 2, topW * 0.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ded6c6';
  ctx.fill();
  outline(ctx, 4);

  // 掀开一角的锡纸盖
  ctx.save();
  ctx.translate(topW * 0.16, -half - 7);
  ctx.rotate(-0.42);
  ctx.beginPath();
  roundRect(ctx, -topW * 0.36, -6, topW * 0.7, 12, 5);
  ctx.fillStyle = '#eae3d4';
  ctx.fill();
  outline(ctx, 4);
  ctx.restore();

  // 冒出来的两根面
  ctx.strokeStyle = '#f0c250';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  [-topW * 0.12, topW * 0.12].forEach((dx, i) => {
    ctx.beginPath();
    ctx.moveTo(dx, -half - 1);
    ctx.quadraticCurveTo(dx + (i ? 6 : -6), -half - 9, dx + (i ? 1 : -1), -half - 14);
    ctx.stroke();
  });
  ctx.restore();
}
const DRAWERS = {
  pan: drawPan,
  crab: drawCrab,
  durian: drawDurian,
  needle: drawNeedle,
  noodle: drawNoodle,
};

const SIZES = {
  pan: [96, 96],
  crab: [96, 84],
  durian: [88, 88],
  needle: [120, 56],
  noodle: [74, 76],
};

/** 把所有飞行道具贴图建出来（key = `prop-<名字>`） */
export function createPropTextures(scene) {
  Object.entries(DRAWERS).forEach(([name, draw]) => {
    const key = `prop-${name}`;
    if (scene.textures.exists(key)) return;
    const [w, h] = SIZES[name];
    makeTexture(scene, key, w, h, draw);
  });
}

/** 命中时的星星 / 尘土（一套小贴图，命中特效和跳跃落地都用它） */
export function createHitTextures(scene) {
  if (!scene.textures.exists('fx-star')) {
    makeTexture(scene, 'fx-star', 72, 72, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? w * 0.46 : w * 0.18;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
      ctx.strokeStyle = '#d8892b';
      ctx.lineWidth = 4;
      ctx.stroke();
    });
  }
  if (!scene.textures.exists('fx-puff')) {
    makeTexture(scene, 'fx-puff', 96, 64, (ctx, w, h) => {
      radialEllipse(ctx, w / 2, h / 2, w / 2, h / 2, [
        [0, 'rgba(255,252,240,0.85)'],
        [0.55, 'rgba(232,222,200,0.45)'],
        [1, 'rgba(232,222,200,0)'],
      ]);
    });
  }
  // 敌人跑出画面时贴在屏幕边缘的小三角
  if (!scene.textures.exists('fx-arrow')) {
    makeTexture(scene, 'fx-arrow', 44, 56, (ctx, w, h) => {
      ctx.beginPath();
      ctx.moveTo(w - 4, h / 2);
      ctx.lineTo(6, 6);
      ctx.lineTo(6, h - 6);
      ctx.closePath();
      ctx.fillStyle = '#ffe9a8';
      ctx.fill();
      ctx.strokeStyle = '#7a2b12';
      ctx.lineWidth = 4;
      ctx.stroke();
    });
  }
}
