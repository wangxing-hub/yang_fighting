/**
 * 银行外面的街道：一张 1280*2 宽的长街（全部用 Canvas 代码画，不占加载体积）。
 *
 * 竖向分层和《潘尔赛的日常》那套场景一致：
 *   0-130   天空（云 + 远处屋顶剪影）
 *   130-300 沿街建筑，左边是银行门脸
 *   300-430 人行道（铺砖 + 盲道 + 路缘石）
 *   444-620 马路（边线 / 中央虚线 / 斑马线 / 井盖）
 *   620-720 对面人行道
 *
 * 这里**只画背景**：树、路灯、长椅、消防栓、车这些道具都没有——
 * 打斗场地要干净，整条街（人行道 + 马路 + 对面人行道）都能走。
 * 暗角单独一张 1280x720 的贴图（street-vignette），贴在镜头上，不跟着世界滚。
 */
import { FONT, GAME_HEIGHT, GAME_WIDTH, STAGE } from '../config.js';
import { seeded, roundRect, radialEllipse, linear, makeTexture } from './canvasKit.js';

const S = STAGE.street;
/** 背景画多宽、多高（同一时刻只有 1280 宽出现在画面上，其余靠镜头滚） */
const W = STAGE.world.width;
const H = STAGE.world.height;
const SKY_H = S.skyH;
const BUILD_BOTTOM = S.buildBottom;
const WALK_BOTTOM = S.walkBottom;
const ROAD_TOP = S.roadTop;
const ROAD_BOTTOM = S.roadBottom;
const BANK = S.bank;

function drawSky(ctx) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, SKY_H, [
    [0, '#7fb0d6'],
    [0.55, '#b6d4e4'],
    [1, '#e2ecec'],
  ]);
  ctx.fillRect(0, 0, W, SKY_H);

  const rand = seeded(9911);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < Math.round(W / 230); i++) {
    const cx = 80 + rand() * (W - 160);
    const cy = 22 + rand() * 64;
    const s = 0.7 + rand() * 0.7;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 62 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 34 * s, cy + 6 * s, 34 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 38 * s, cy + 4 * s, 40 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 远处屋顶剪影
  ctx.fillStyle = 'rgba(120, 140, 160, 0.55)';
  const rand2 = seeded(4242);
  let x = -20;
  while (x < W + 20) {
    const w = 60 + rand2() * 90;
    const h = 26 + rand2() * 44;
    ctx.fillRect(x, SKY_H - h, w, h);
    x += w + 6;
  }
}

function drawShop(ctx, x0, x1, top, bodyColor, roofColor) {
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x0, top, x1 - x0, BUILD_BOTTOM - top);
  ctx.fillStyle = roofColor;
  ctx.fillRect(x0 - 6, top - 14, x1 - x0 + 12, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(x0 - 6, top + 2, x1 - x0 + 12, 4);

  const winW = 76;
  const gap = 26;
  for (let wx = x0 + 28; wx + winW < x1 - 20; wx += winW + gap) {
    const wy = top + 46;
    ctx.fillStyle = '#3d5568';
    roundRect(ctx, wx, wy, winW, 68, 5);
    ctx.fill();
    ctx.fillStyle = linear(ctx, wx, wy, wx, wy + 68, [
      [0, 'rgba(210,232,240,0.85)'],
      [1, 'rgba(120,160,180,0.7)'],
    ]);
    roundRect(ctx, wx + 3, wy + 3, winW - 6, 62, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wx + 12, wy + 62);
    ctx.lineTo(wx + 40, wy + 8);
    ctx.stroke();
  }
  // 空调外机
  ctx.fillStyle = '#9aa5ad';
  roundRect(ctx, x1 - 74, top + 24, 52, 34, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(x1 - 48, top + 41, 12, 0, Math.PI * 2);
  ctx.fill();
}

function drawBankFacade(ctx) {
  const { x0, x1, doorX0, doorX1 } = BANK;
  ctx.fillStyle = linear(ctx, 0, 96, 0, BUILD_BOTTOM, [
    [0, '#efe6d2'],
    [0.6, '#e2d6bd'],
    [1, '#cdbfa4'],
  ]);
  ctx.fillRect(x0, 96, x1 - x0, BUILD_BOTTOM - 96);
  ctx.fillStyle = '#c9b79b';
  ctx.fillRect(x0 - 10, 84, x1 - x0 + 20, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(x0 - 10, 106, x1 - x0 + 20, 5);

  // 三角山花
  ctx.fillStyle = '#e6dac2';
  ctx.beginPath();
  ctx.moveTo(x0 + 20, 84);
  ctx.lineTo((x0 + x1) / 2, 30);
  ctx.lineTo(x1 - 20, 84);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9a44c';
  ctx.lineWidth = 4;
  ctx.stroke();

  // 柱子
  [x0 + 26, x1 - 60].forEach((px) => {
    ctx.fillStyle = linear(ctx, px, 0, px + 34, 0, [
      [0, '#f3ead8'],
      [0.5, '#ded1b6'],
      [1, '#bfae90'],
    ]);
    ctx.fillRect(px, 130, 34, BUILD_BOTTOM - 130);
    ctx.fillStyle = '#cbb998';
    ctx.fillRect(px - 4, 122, 42, 12);
    ctx.fillRect(px - 4, BUILD_BOTTOM - 12, 42, 12);
  });

  // 招牌带
  ctx.fillStyle = '#2a1d13';
  roundRect(ctx, x0 + 92, 118, x1 - x0 - 184, 56, 8);
  ctx.fill();
  ctx.strokeStyle = '#c9a44c';
  ctx.lineWidth = 3;
  roundRect(ctx, x0 + 98, 124, x1 - x0 - 196, 44, 6);
  ctx.stroke();
  ctx.fillStyle = '#e8cf94';
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('桂 圆 银 行', (x0 + x1) / 2, 147);

  // 玻璃门
  ctx.fillStyle = '#2f4658';
  roundRect(ctx, doorX0 - 8, 186, doorX1 - doorX0 + 16, BUILD_BOTTOM - 186, 6);
  ctx.fill();
  ctx.fillStyle = linear(ctx, 0, 186, 0, BUILD_BOTTOM, [
    [0, 'rgba(206,232,240,0.9)'],
    [1, 'rgba(140,180,196,0.85)'],
  ]);
  roundRect(ctx, doorX0, 192, doorX1 - doorX0, BUILD_BOTTOM - 198, 4);
  ctx.fill();
  ctx.strokeStyle = '#c9a44c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo((doorX0 + doorX1) / 2, 192);
  ctx.lineTo((doorX0 + doorX1) / 2, BUILD_BOTTOM - 6);
  ctx.stroke();
  ctx.fillStyle = '#c9a44c';
  ctx.fillRect(doorX0 - 10, BUILD_BOTTOM - 8, doorX1 - doorX0 + 20, 8);

  // 台阶
  ctx.fillStyle = '#d8ccb2';
  ctx.fillRect(doorX0 - 26, BUILD_BOTTOM, doorX1 - doorX0 + 52, 10);
  ctx.fillStyle = '#c8bb9e';
  ctx.fillRect(doorX0 - 14, BUILD_BOTTOM + 10, doorX1 - doorX0 + 28, 8);
}

function drawSidewalk(ctx) {
  ctx.fillStyle = linear(ctx, 0, BUILD_BOTTOM, 0, WALK_BOTTOM, [
    [0, '#d9d4c8'],
    [1, '#c6c1b4'],
  ]);
  ctx.fillRect(0, BUILD_BOTTOM, W, WALK_BOTTOM - BUILD_BOTTOM);

  const tile = 62;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#a9a396';
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, BUILD_BOTTOM);
    ctx.lineTo(x, WALK_BOTTOM);
    ctx.stroke();
  }
  for (let y = BUILD_BOTTOM; y <= WALK_BOTTOM; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // 盲道
  ctx.fillStyle = '#d8b95e';
  ctx.fillRect(0, WALK_BOTTOM - 22, W, 16);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#b99a3f';
  for (let x = 6; x < W; x += 18) ctx.fillRect(x, WALK_BOTTOM - 20, 8, 12);
  ctx.restore();

  // 路缘石
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(0, WALK_BOTTOM, W, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, ROAD_TOP - 4, W, 4);
}

function drawRoad(ctx) {
  ctx.fillStyle = linear(ctx, 0, ROAD_TOP, 0, ROAD_BOTTOM, [
    [0, '#4c5058'],
    [0.5, '#43474e'],
    [1, '#383c42'],
  ]);
  ctx.fillRect(0, ROAD_TOP, W, ROAD_BOTTOM - ROAD_TOP);

  ctx.fillStyle = 'rgba(240,238,225,0.75)';
  ctx.fillRect(0, ROAD_TOP + 12, W, 5);
  ctx.fillRect(0, ROAD_BOTTOM - 18, W, 5);

  const midY = (ROAD_TOP + ROAD_BOTTOM) / 2;
  ctx.fillStyle = 'rgba(233,205,120,0.85)';
  for (let x = -20; x < W + 40; x += 96) ctx.fillRect(x, midY - 4, 54, 8);

  // 斑马线：沿街每隔一段一条
  ctx.fillStyle = 'rgba(240,238,225,0.8)';
  for (let zx = 150; zx < W; zx += 900) {
    for (let x = zx; x < zx + 210; x += 44) {
      ctx.fillRect(x, ROAD_TOP + 24, 26, ROAD_BOTTOM - ROAD_TOP - 48);
    }
  }

  // 井盖
  ctx.fillStyle = '#33373d';
  ctx.strokeStyle = 'rgba(180,180,180,0.35)';
  ctx.lineWidth = 3;
  for (let mx = 1010; mx < W; mx += 780) {
    ctx.beginPath();
    ctx.ellipse(mx, ROAD_BOTTOM - 46, 34, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(mx, ROAD_BOTTOM - 46, 24, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 补丁 / 裂纹
  const rand = seeded(31337);
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#2f3338';
  for (let i = 0; i < Math.round(W / 220); i++) {
    const x = rand() * W;
    const y = ROAD_TOP + 30 + rand() * (ROAD_BOTTOM - ROAD_TOP - 60);
    ctx.beginPath();
    ctx.ellipse(x, y, 24 + rand() * 40, 8 + rand() * 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFarSide(ctx) {
  ctx.fillStyle = linear(ctx, 0, ROAD_BOTTOM, 0, H, [
    [0, '#cfcabd'],
    [1, '#b9b4a7'],
  ]);
  ctx.fillRect(0, ROAD_BOTTOM, W, H - ROAD_BOTTOM);
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(0, ROAD_BOTTOM, W, 10);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#9d988b';
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 62) {
    ctx.beginPath();
    ctx.moveTo(x, ROAD_BOTTOM + 10);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  // 对面人行道远处的树影和栏杆（画在背景里，不挡路）
  ctx.fillStyle = 'rgba(90,110,80,0.35)';
  for (let x = 40; x < W; x += 210) {
    ctx.beginPath();
    ctx.ellipse(x, H - 26, 74, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,116,104,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, H - 16);
  ctx.lineTo(W, H - 16);
  ctx.stroke();
}

function drawBackground(ctx) {
  drawSky(ctx);
  // 银行在左边（开局就在银行门口），一路往右都是沿街店铺
  drawShop(ctx, -10, 424, 152, '#e9d9bd', '#c9a17a');
  drawShop(ctx, 856, 1560, 146, '#dfd2c4', '#a98d7a');
  drawShop(ctx, 1560, W + 10, 150, '#e6dcc6', '#b8946f');
  drawBankFacade(ctx);
  drawSidewalk(ctx);
  drawRoad(ctx);
  drawFarSide(ctx);

  // 午后暖光，沿街撒几片
  for (let x = 420; x < W; x += 820) {
    radialEllipse(ctx, x, 250, 520, 300, [
      [0, 'rgba(255, 232, 176, 0.18)'],
      [1, 'rgba(255, 232, 176, 0)'],
    ]);
  }
}

/** 暗角：贴在镜头上（屏幕坐标），所以单独一张 1280x720 */
function drawVignette(ctx) {
  const w = GAME_WIDTH;
  const h = GAME_HEIGHT;
  radialEllipse(ctx, w / 2, h / 2, Math.max(w, h) * 0.78, Math.max(w, h) * 0.62, [
    [0, 'rgba(0,0,0,0)'],
    [0.72, 'rgba(0,0,0,0)'],
    [1, 'rgba(20, 16, 12, 0.4)'],
  ]);
}

/** 建出街道背景（street-bg，世界那么大）和暗角（street-vignette，画面那么大） */
export function createStreetArt(scene) {
  if (!scene.textures.exists('street-bg')) {
    makeTexture(scene, 'street-bg', W, H, drawBackground);
  }
  if (!scene.textures.exists('street-vignette')) {
    makeTexture(scene, 'street-vignette', GAME_WIDTH, GAME_HEIGHT, drawVignette);
  }
}
