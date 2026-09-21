/**
 * 用无头 Chrome 打开游戏、收集控制台报错、截图，方便在命令行里验证画面。
 *
 *   node tools/screenshot.mjs [url] [out.png] [waitMs] [按键脚本]
 *
 * 例：
 *   node tools/screenshot.mjs http://localhost:5173/ /tmp/bank.png 4000
 *   node tools/screenshot.mjs http://localhost:5173/ /tmp/walk.png 3000 "d:1200,e:400"
 *   # 按键脚本里也支持 wait:毫秒（纯等待）和 eval:表达式（在页面里执行，用来
 *   # 直接跳到某个场景验证画面），例如：
 *   node tools/screenshot.mjs http://localhost:5173/ /tmp/lake.png 3000 \
 *     "eval:window.game.scene.getScene('BankScene').scene.start('LakeScene',{from:'street'}),wait:2500"
 *   # tap:x y 可以在视口坐标点一下（配合 SHOT_SIZE / SHOT_TOUCH 用来测手机触摸）
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '/tmp/bank.png';
const waitMs = Number(process.argv[4] || 4000);
const keyScript = process.argv[5] || '';
// 第 6 个参数：截图前在页面里执行的表达式（用于对比验证，例如隐藏某个角色）
const evalBeforeShot = process.argv[6] || '';
// 环境变量：SHOT_SIZE=390x844（默认 1280x720）用来看手机竖屏 / 横屏的样子，
// SHOT_TOUCH=1 打开触摸模拟（配合手机尺寸用）
const shotSize = (process.env.SHOT_SIZE || '1280x720').split('x').map(Number);
const shotTouch = process.env.SHOT_TOUCH === '1';
const port = 9333 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-shot-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

chrome.stderr.on('data', (d) => {
  const s = String(d);
  if (/error|Error/.test(s) && !/DevTools listening|GPU|Vulkan|Fontconfig/.test(s)) {
    process.stderr.write(`[chrome] ${s}`);
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 把按键脚本切成一个个步骤。用逗号分隔，但括号里的逗号不算
 * （eval: 后面往往会写 `{from:'street'}` 这种带逗号的表达式）。
 */
function splitSteps(script) {
  const steps = [];
  let depth = 0;
  let cur = '';
  for (const ch of script) {
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      steps.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  steps.push(cur);
  return steps.map((s) => s.trim()).filter(Boolean);
}

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome 调试端口');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

const messages = [];
const errors = [];
let nextId = 1;

function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMessage);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMessage);
  });
}

async function main() {
  const wsUrl = await getTarget();
  const ws = await connect(wsUrl);

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      messages.push(`[${msg.params.type}] ${text}`);
      if (msg.params.type === 'error') errors.push(text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception?.description || d.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(msg.params.entry.text);
    }
  });

  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');
  await send(ws, 'Page.enable');
  // 固定视口为 1280x720，避免截图里出现缩放/黑边
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: shotSize[0] || 1280,
    height: shotSize[1] || 720,
    deviceScaleFactor: 1,
    mobile: shotTouch,
  });
  if (shotTouch) {
    await send(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // 让鼠标事件也生成 touch 事件，这样 tap: 步骤在手机尺寸下就是"点屏幕"
    await send(ws, 'Emulation.setEmitTouchEventsForMouse', {
      enabled: true,
      configuration: 'mobile',
    });
  }
  await send(ws, 'Page.navigate', { url });
  await sleep(waitMs);

  const KEY_MAP = {
    w: { key: 'w', code: 'KeyW', vk: 87 },
    a: { key: 'a', code: 'KeyA', vk: 65 },
    s: { key: 's', code: 'KeyS', vk: 83 },
    d: { key: 'd', code: 'KeyD', vk: 68 },
    e: { key: 'e', code: 'KeyE', vk: 69 },
    b: { key: 'b', code: 'KeyB', vk: 66 },
    j: { key: 'j', code: 'KeyJ', vk: 74 },
    k: { key: 'k', code: 'KeyK', vk: 75 },
    l: { key: 'l', code: 'KeyL', vk: 76 },
    m: { key: 'm', code: 'KeyM', vk: 77 },
    r: { key: 'r', code: 'KeyR', vk: 82 },
    enter: { key: 'Enter', code: 'Enter', vk: 13 },
    up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
    down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
    left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
    right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
    space: { key: ' ', code: 'Space', vk: 32 },
  };

  for (const step of splitSteps(keyScript)) {
    // wait:1200 表示纯等待（用来等转场、动画等）
    if (step.startsWith('wait:')) {
      await sleep(Number(step.split(':')[1] || 500));
      continue;
    }
    // eval:表达式 直接在页面里跑，方便跳到某个场景或改状态
    if (step.startsWith('eval:')) {
      await send(ws, 'Runtime.evaluate', {
        expression: step.slice(5),
        returnByValue: true,
      });
      await sleep(120);
      continue;
    }
    // tap:960 300 在视口坐标 (960,300) 点一下（配合 SHOT_TOUCH=1 就是触摸）
    if (step.startsWith('tap:')) {
      const [tx, ty] = step
        .slice(4)
        .trim()
        .split(/\s+/)
        .map(Number);
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: tx,
        y: ty,
        button: 'left',
        clickCount: 1,
      });
      await sleep(60);
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: tx,
        y: ty,
        button: 'left',
        clickCount: 1,
      });
      await sleep(150);
      continue;
    }
    // 前缀 ! 表示这个键按下后不松开（截图时人物还在走）
    // click:x:y 在画面坐标点一下（开始菜单这类需要点击的地方用得上）
    if (step.startsWith('click:')) {
      const [, cx, cy] = step.split(':').map(Number);
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: cx,
        y: cy,
        button: 'left',
        clickCount: 1,
      });
      await sleep(90);
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: cx,
        y: cy,
        button: 'left',
        clickCount: 1,
      });
      await sleep(400);
      continue;
    }
    const keepHold = step.startsWith('!');
    const [name, holdRaw] = (keepHold ? step.slice(1) : step).split(':');
    const k = KEY_MAP[name.toLowerCase()];
    if (!k) continue;
    const hold = Number(holdRaw || 300);
    // 方向键 / Enter / 空格这些"有名字"的键要用 rawKeyDown 才送得进去，
    // 普通字符键则要带 text 才是正常的输入事件
    const named = k.key.length > 1;
    await send(ws, 'Input.dispatchKeyEvent', {
      type: named ? 'rawKeyDown' : 'keyDown',
      key: k.key,
      code: k.code,
      windowsVirtualKeyCode: k.vk,
      nativeVirtualKeyCode: k.vk,
      ...(named ? {} : { text: k.key }),
    });
    await sleep(hold);
    if (!keepHold) {
      await send(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: k.key,
        code: k.code,
        windowsVirtualKeyCode: k.vk,
        nativeVirtualKeyCode: k.vk,
      });
      await sleep(150);
    }
  }

  const state = await send(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const scene = window.game && (window.game.scene.getScenes(true)[0] || window.game.scene.getScene('BankScene'));
      const p = scene && scene.player;
      return JSON.stringify({
        title: document.title,
        hasGame: !!window.game,
        sceneKey: scene && scene.scene ? scene.scene.key : null,
        sceneActive: !!(scene && scene.scene.isActive()),
        player: p ? { x: Math.round(p.x), y: Math.round(p.y), anim: p.anims.currentAnim ? p.anims.currentAnim.key : null, facing: p.facing } : null,
        huang: scene && scene.huang ? {
          x: Math.round(scene.huang.x),
          y: Math.round(scene.huang.y),
          anim: scene.huang.anims.currentAnim ? scene.huang.anims.currentAnim.key : null,
          facing: scene.huang.facing,
          joined: !!scene.huang.joined,
          gap: Math.round(Phaser.Math.Distance.Between(scene.huang.x, scene.huang.y, scene.player.x, scene.player.y)),
        } : null,
        yang: scene && scene.yang ? {
          x: Math.round(scene.yang.x),
          y: Math.round(scene.yang.y),
          anim: scene.yang.anims.currentAnim ? scene.yang.anims.currentAnim.key : null,
          facing: scene.yang.facing,
          joined: !!scene.yang.joined,
          gap: Math.round(Phaser.Math.Distance.Between(scene.yang.x, scene.yang.y, scene.player.x, scene.player.y)),
        } : null,
        yangNpc: scene && scene.yangNpc ? {
          x: Math.round(scene.yangNpc.npc.x),
          y: Math.round(scene.yangNpc.npc.y),
          facing: scene.yangNpc.npc.facing,
          joined: !!scene.yangNpc.npc.joined,
        } : null,
        toast: scene && scene.children.list.some((o) => o.type === 'Container' && o.depth === 9700),
        yangJoinedRegistry: !!(scene && scene.registry.get('yangJoined')),
        dialogue: scene && scene.dialogue ? {
          open: scene.dialogue.isOpen,
          index: scene.dialogue.index,
          name: scene.dialogue.nameText ? scene.dialogue.nameText.text : null,
          text: scene.dialogue.bodyText ? scene.dialogue.bodyText.text : null,
        } : null,
        trailLength: scene && scene.followTrail ? scene.followTrail.points.length : 0,
        hasBubble: !!(scene && scene.bubble),
        bubbleText: scene && scene.bubble ? scene.bubble.list[1].text : null,
        obstacleCount: scene && scene.obstacles ? scene.obstacles.getChildren().length : 0,
        hint: scene && scene.hint ? scene.hint.text : null,
        hintVisible: scene && scene.hint ? scene.hint.visible : null,
        loadingRemoved: !document.getElementById('loading'),
        bootError: (document.getElementById('boot-error') || {}).textContent || '',
        // 打斗场景用的探针：位置 / 血量 / 状态机 / 场上的飞行道具
        fight: scene && scene.player && scene.enemies ? {
          player: {
            x: Math.round(scene.player.gx),
            y: Math.round(scene.player.gy),
            hp: scene.player.hp,
            state: scene.player.state,
            act: scene.player.act ? scene.player.act.name : null,
            facing: scene.player.facing,
            jz: Math.round(scene.player.jz),
          },
          enemies: scene.enemies.map((e) => ({
            id: e.charId,
            x: Math.round(e.gx),
            y: Math.round(e.gy),
            hp: e.hp,
            state: e.state,
            act: e.act ? e.act.name : null,
            jz: Math.round(e.jz),
          })),
          projectiles: (scene.projectiles || []).map((p) => ({
            n: p.name,
            x: Math.round(p.gx),
            y: Math.round(p.gy),
            z: Math.round(p.z),
          })),
          token: !!scene.attackToken,
          over: !!scene.over,
        } : null,
      });
    })()`,
    returnByValue: true,
  });

  if (evalBeforeShot) {
    await send(ws, 'Runtime.evaluate', { expression: evalBeforeShot, returnByValue: true });
    await sleep(400);
  }

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log('--- 页面状态 ---');
  console.log(state.result.value);
  if (messages.length) {
    console.log('--- 控制台 ---');
    messages.slice(0, 20).forEach((m) => console.log(m));
  }
  console.log('--- 错误 ---');
  console.log(errors.length ? errors.join('\n') : '（无）');
  console.log(`截图已保存：${out}`);

  ws.close();
  chrome.kill('SIGKILL');
  fs.rmSync(profile, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  chrome.kill('SIGKILL');
  process.exit(1);
});
