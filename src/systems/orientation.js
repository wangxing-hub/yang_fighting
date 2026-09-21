/**
 * 手机模式的横屏处理。
 *
 * 三种情况：
 *  1. 浏览器愿意转（正常手机浏览器）：requestFullscreen + screen.orientation.lock('landscape')，
 *     转过去之后视口就是横的，什么都不用做。
 *  2. 浏览器转不了（微信/QQ 内置浏览器、系统"竖屏锁定"）：视口一直是竖的，
 *     那就**把游戏自己转 90°** 铺满屏幕——玩家把手机横过来看就能玩，界面不会缩成一条。
 *  3. 竖屏还没横过来：盖一层提示（不挡触摸），几秒后自己淡掉。
 *
 * 自己转 90° 之后浏览器给的触摸坐标是"转过"的，所以顺带把 Phaser 的
 * 指针换算 `input.transformPointer` 反向转回来，不然点哪都不准。
 */

/** 当前是不是"游戏被我们自己转了 90°" */
let forced = false;
let patched = false;
let hintHiddenAt = 0;

/** 和 config 里的画布尺寸保持一致（这里不 import，免得循环依赖） */
const GAME_W = 1280;
const GAME_H = 720;

function gameRoot() {
  return document.getElementById('game-root');
}

function gameCanvas() {
  return document.querySelector('#game-root canvas');
}

/** 尽量让浏览器自己转过去（不然就只能靠我们转） */
export async function requestLandscape() {
  const el = gameRoot() || document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    /* iOS / 内置浏览器不支持，忽略 */
  }
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    /* 同上 */
  }
}

/** 让 Phaser 按最新视口重新排版 */
function refit() {
  const scale = window.game?.scale;
  if (scale && scale.refresh) scale.refresh();
}

/** 把自己转 90° 的样式盖上去：给 body 加类 + 算好画布该多大 */
function stampForcedStyles() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const body = document.body;
  if (!body) return;
  // 1280x720 塞进"转过 90° 之后"的视口：宽用视口高、高用视口宽
  const scale = Math.min(vh / GAME_W, vw / GAME_H);
  body.classList.add('forced-landscape');
  body.style.setProperty('--forced-canvas-w', `${Math.round(GAME_W * scale)}px`);
  body.style.setProperty('--forced-canvas-h', `${Math.round(GAME_H * scale)}px`);
}

function clearForcedStyles() {
  document.body?.classList.remove('forced-landscape');
}

/**
 * 挂一次：自己转过 90° 时，指针坐标要"反着转"再换算成画布像素。
 * （Phaser 原生那套是拿 canvas.getBoundingClientRect() 算的，转过之后那个矩形
 * 的长宽是换过的，直接算会偏到屏幕外面去，所以这里自己算。）
 */
function patchInput() {
  const input = window.game?.input;
  const canvas = gameCanvas();
  if (!input || !canvas || patched || typeof input.transformPointer !== 'function') return;
  patched = true;
  const original = input.transformPointer.bind(input);

  input.transformPointer = function (pointer, pageX, pageY, wasMove) {
    if (!forced) return original(pointer, pageX, pageY, wasMove);

    const rect = canvas.getBoundingClientRect(); // 转过之后是外接矩形，中心仍是画布中心
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 未旋转画布的 CSS 尺寸是"换个方向"的：W = rect.height, H = rect.width
    const u = (pageY - cy) + rect.height / 2;
    const v = -(pageX - cx) + rect.width / 2;
    const x = (u * canvas.width) / rect.height;
    const y = (v * canvas.height) / rect.width;

    const p0 = pointer.position;
    const p1 = pointer.prevPosition;
    p1.x = p0.x;
    p1.y = p0.y;
    const h = pointer.smoothFactor;
    if (wasMove && h !== 0) {
      p0.x = x * h + p1.x * (1 - h);
      p0.y = y * h + p1.y * (1 - h);
    } else {
      p0.x = x;
      p0.y = y;
    }
  };
}

function updateHint(portrait, mobile) {
  const hint = document.getElementById('rotate-hint');
  if (!hint) return;
  // 自己已经转过 90° 了：只在刚进手机模式时提示几秒，别一直挡着
  const brief = mobile && portrait && performance.now() < hintHiddenAt;
  if (brief) {
    hint.style.display = 'flex';
    hint.style.opacity = '1';
  } else {
    hint.style.display = 'none';
  }
}

/** 按当前视口和模式排版：该自己转就转，横过来了就还原 */
export function applyLayout() {
  patchInput();
  const mobile = window.game?.registry?.get('inputMode') === 'mobile';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vh > vw;
  const wantForced = mobile && portrait;

  if (wantForced) {
    if (!forced) hintHiddenAt = performance.now() + 4200; // 第一次进来提示一下
    forced = true;
    stampForcedStyles();
  } else if (forced) {
    forced = false;
    clearForcedStyles();
  }

  updateHint(portrait, mobile);
  refit();
  // 转屏 / 工具栏收放时尺寸报得晚，多刷几次
  [60, 200, 500, 900].forEach((ms) => setTimeout(() => {
    if (forced) stampForcedStyles();
    refit();
  }, ms));
}

/** 在 main.js 里调一次：监听尺寸变化 + 每秒兜底检查一次 */
export function watchOrientation() {
  applyLayout();
  ['resize', 'orientationchange', 'fullscreenchange', 'webkitfullscreenchange'].forEach((ev) =>
    window.addEventListener(ev, applyLayout)
  );
  window.visualViewport?.addEventListener('resize', applyLayout);
  // 有些内置浏览器不派发 resize，兜一下
  setInterval(applyLayout, 1000);
  return applyLayout;
}
