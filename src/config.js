/**
 * 全局配置：第一关《银行门口 1v2》的全部可调参数都在这个文件里。
 * 想调手感、数值、AI 性格，优先改这里，不用动逻辑。
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/**
 * 精灵表参数，由 tools/build_assets.py 处理 pic/ 下的原图得到。
 *
 * 网页实际加载的是 assets/small/<名字>.webp（无损 webp）。
 * w/h 是**小图**里单帧的尺寸；scale 是把人物显示成目标高度所需的倍数；
 * origin 是「脚底中心」在帧内的比例位置——所有动画都用同一个脚底锚点，
 * 所以走来走去、换动作时脚不会飘、人不会跳。
 *
 * 行走表和投掷表里的人物本来画得不一样大（格子 832 比 672 大），
 * scale 已经按各表量出来的高度换算好了，改素材后重新跑 npm run assets 会打印新的数值。
 */
export const SHEETS = {
  yang_walk: { path: 'assets/small/yang_walk.webp', w: 126, h: 225, frames: 9, scale: 0.78, origin: [0.55, 0.9878] },
  yang_attack: { path: 'assets/small/yang_attack.webp', w: 241, h: 262, frames: 6, scale: 0.6638, origin: [0.488, 0.9912] },
  yang_strike: { path: 'assets/small/yang_strike.webp', w: 278, h: 265, frames: 6, scale: 0.6785, origin: [0.6376, 0.9589] },
  yang_noodle: { path: 'assets/small/yang_noodle.webp', w: 258, h: 262, frames: 6, scale: 0.6684, origin: [0.525, 0.9845] },
  pan_walk: { path: 'assets/small/pan_walk.webp', w: 139, h: 222, frames: 9, scale: 0.78, origin: [0.5046, 0.9854] },
  pan_strike: { path: 'assets/small/pan_strike.webp', w: 251, h: 261, frames: 6, scale: 0.6565, origin: [0.6038, 0.995] },
  pan_pan: { path: 'assets/small/pan_pan.webp', w: 272, h: 261, frames: 6, scale: 0.6574, origin: [0.631, 0.9937] },
  pan_crab: { path: 'assets/small/pan_crab.webp', w: 266, h: 262, frames: 6, scale: 0.6547, origin: [0.6584, 0.9939] },
  huang_walk: { path: 'assets/small/huang_walk.webp', w: 168, h: 200, frames: 9, scale: 0.78, origin: [0.5187, 0.9905] },
  huang_nurse: { path: 'assets/small/huang_nurse.webp', w: 148, h: 266, frames: 6, scale: 0.584, origin: [0.5288, 0.9934] },
  huang_durian: { path: 'assets/small/huang_durian.webp', w: 237, h: 265, frames: 6, scale: 0.5855, origin: [0.7059, 0.9958] },
  huang_needle: { path: 'assets/small/huang_needle.webp', w: 256, h: 258, frames: 6, scale: 0.6032, origin: [0.5764, 0.9944] },
};

/**
 * 角色。玩家和敌人共用同一套逻辑，差别全在这几个数上。
 *   dirs/idle：行走表里 9 帧怎么分组（素材是四方向站姿，不是步态循环）
 *   acts     ：动作表（fps 决定快慢，hitFrame 是第几帧出判定 / 出手）
 *   body     ：碰撞盒（屏幕像素，宽 x 高，脚底对齐）
 */
export const CHARACTERS = {
  yang: {
    id: 'yang',
    name: '杨凡',
    /** 对话里用的外号（他扔泡面，所以叫泡面杨） */
    nick: '泡面杨',
    avatar: 'avatar-yang',
    walkSheet: 'yang_walk',
    walkFps: 4.5,
    dirs: { down: [0, 1], up: [5], left: [2, 7], right: [8] },
    idle: { down: 0, up: 5, left: 2, right: 8 },
    body: { w: 54, h: 32 },
    speed: 282,
    hp: 130,
    acts: {
      strike: {
        // 普通攻击用「杨攻击动作雪碧图」
        sheet: 'yang_attack',
        fps: 16,
        hitFrame: 2, // 只有敌人 AI 会等这一帧出手；玩家按下就出判定（见 Fighter.startAct）
        damage: 9,
        knock: 270,
        cd: 240,
        melee: { reach: 96, h: 100 },
      },
      throw: {
        sheet: 'yang_noodle',
        fps: 14,
        hitFrame: 3,
        damage: 13,
        cd: 700,
        projectile: 'noodle',
      },
    },
  },

  pan: {
    id: 'pan',
    name: '潘尔赛',
    nick: '潘尔赛',
    avatar: 'avatar-pan',
    walkSheet: 'pan_walk',
    walkFps: 4.5,
    dirs: { down: [0, 1], up: [4], left: [3, 7], right: [6, 8] },
    idle: { down: 0, up: 4, left: 3, right: 6 },
    body: { w: 56, h: 32 },
    speed: 212,
    hp: 95,
    acts: {
      strike: {
        sheet: 'pan_strike',
        fps: 11,
        hitFrame: 2,
        damage: 8,
        knock: 250,
        cd: 1100,
        melee: { reach: 92, h: 100 },
      },
      pan: {
        sheet: 'pan_pan',
        fps: 11,
        hitFrame: 3,
        damage: 12,
        cd: 2400,
        projectile: 'pan',
      },
      crab: {
        sheet: 'pan_crab',
        fps: 10,
        hitFrame: 3,
        damage: 10,
        cd: 3000,
        projectile: 'crab',
      },
    },
  },

  huang: {
    id: 'huang',
    name: '黄姐',
    nick: '黄姐',
    avatar: 'avatar-huang',
    // 常态移动换成「护士黄姐移动雪碧图」：这张 6 帧是同一个朝向的走路循环
    // （每帧轮廓宽度都在 369~394 之间，说明不是四方向姿势），所以四个方向都用这套循环。
    walkSheet: 'huang_nurse',
    walkFps: 8.5,
    dirs: {
      down: [0, 1, 2, 3, 4, 5],
      up: [0, 1, 2, 3, 4, 5],
      left: [0, 1, 2, 3, 4, 5],
      right: [0, 1, 2, 3, 4, 5],
    },
    idle: { down: 0, up: 0, left: 0, right: 0 },
    body: { w: 52, h: 30 },
    speed: 190,
    hp: 85,
    acts: {
      // 贴脸时用针头戳一下，近战但不掉血太多
      stab: {
        sheet: 'huang_needle',
        fps: 12,
        hitFrame: 2,
        damage: 7,
        knock: 230,
        cd: 1300,
        melee: { reach: 86, h: 96 },
      },
      needle: {
        sheet: 'huang_needle',
        fps: 12,
        hitFrame: 2,
        damage: 7,
        cd: 2200,
        projectile: 'needle',
      },
      durian: {
        sheet: 'huang_durian',
        fps: 9,
        hitFrame: 3,
        damage: 13,
        cd: 3200,
        projectile: 'durian',
      },
    },
  },
};

/** 飞行道具。low=true 的贴着地面飞，可以跳过去 */
export const PROJECTILES = {
  noodle: { tex: 'prop-noodle', kind: 'arc', speed: 620, gravity: 300, z: 96, damage: 13, r: 28, spin: 340, life: 2800 },
  pan: { tex: 'prop-pan', kind: 'straight', speed: 780, gravity: 0, z: 104, damage: 12, r: 32, spin: 900, life: 2200 },
  crab: { tex: 'prop-crab', kind: 'arc', speed: 520, gravity: 480, z: 54, damage: 10, r: 28, spin: 200, life: 2800, low: true },
  durian: { tex: 'prop-durian', kind: 'arc', speed: 460, gravity: 620, z: 150, damage: 16, r: 32, spin: 240, life: 3200 },
  needle: { tex: 'prop-needle', kind: 'straight', speed: 880, gravity: 0, z: 46, damage: 7, r: 22, spin: 0, life: 1800, low: true },
};

/** 战斗手感：这些数字决定"打起来爽不爽" */
export const COMBAT = {
  hitstun: 280,        // 受击硬直（毫秒）
  invuln: 640,         // 受击后的无敌时间，1v2 不被连到死靠它
  knockDecay: 5.2,     // 击退速度衰减（每秒）
  hitstop: 85,         // 命中顿帧
  yBand: 54,           // 判定允许的脚底高度差（俯视格斗：离太远就打不到）
  comboWindow: 1100,   // 连击统计窗口
  dashIFrames: 0,
  jump: { v: 660, g: 1950 },
};

/**
 * 舞台：银行外面的街道（水星街道）。
 *
 * 背景是 src/art/street.js 用 Canvas 画出来的整张 1280x720（代码画的，不占加载体积），
 * 分层照搬《潘尔赛的日常》里那条街，只是**去掉了树 / 路灯 / 长椅 / 消防栓 / 车**这些道具，
 * 变成一块干净的打斗场地。
 */
export const STAGE = {
  artKey: 'street-bg',
  /**
   * 世界比画面宽多了：整条街 1280*2 宽，镜头跟着杨凡横向滚。
   * 街景是代码画的，想画多宽改这一个数就行。
   */
  world: { width: 2560, height: GAME_HEIGHT },
  /** 街道的竖向分层（和《潘尔赛的日常》一致） */
  street: {
    skyH: 130,
    buildTop: 130,
    buildBottom: 300,
    walkBottom: 430,
    roadTop: 444,
    roadBottom: 620,
    bank: { x0: 432, x1: 848, doorX0: 600, doorX1: 680 },
  },
  /**
   * 能走的地方：人行道 + 马路 + 对面人行道，整条街畅通无阻——
   * 中间没有栏杆也没有花坛，随便跑。
   */
  walk: { left: 130, right: 2430, top: 330, bottom: 700 },
  /** 没有需要挡住的斜边（湖岸那种），留个空数组方便以后加 */
  shore: [],
  spawn: {
    yang: { x: 330, y: 396 },
    pan: { x: 902, y: 508 },
    huang: { x: 1082, y: 648 },
  },
};

/**
 * 两个敌人的性格。数值差得越开，打起来越像"一个贴身一个放风筝"。
 *   keep：想保持的距离区间，超出就往里靠、太近就往后撤
 *   cool：两次出手之间至少隔多久（毫秒），和动作自带的 cd 取大的那个
 *   token：同一时刻最多几个敌人能发动攻击（1 = 轮流上，1v2 才不憋屈）
 */
export const AI = {
  thinkEvery: 180,       // 每隔多久重新想一次
  reaction: 260,         // 看到玩家出手后要愣多久才反应
  maxAttackers: 1,
  separation: 96,        // 两个敌人之间至少留出的距离，免得叠在一起
  pan: {
    keep: { min: 130, max: 300 },
    speed: 208,
    strafeFlip: 1800,
    cool: { strike: 1150, pan: 2400, crab: 3100 },
    ranged: ['pan', 'crab'],
    melee: 'strike',
    rangedChance: 0.62,
  },
  huang: {
    keep: { min: 380, max: 540 },
    speed: 186,
    strafeFlip: 2400,
    cool: { stab: 1600, needle: 1900, durian: 3000 },
    ranged: ['durian', 'needle'],
    melee: 'stab',
    rangedChance: 0.85,
  },
};

/** 手机虚拟按键：左下摇杆 + 右下三个键 */
export const TOUCH = {
  stick: { x: 172, y: 528, base: 112, knob: 46, max: 74, hit: 160, dead: 14 },
  buttons: [
    { id: 'attack', label: '攻', x: 1046, y: 600, r: 60, color: 0xe0c377 },
    { id: 'throw', label: '掷', x: 1156, y: 496, r: 56, color: 0xd98b5a },
    { id: 'jump', label: '跳', x: 964, y: 508, r: 56, color: 0x8fc0c8 },
  ],
};

/**
 * 剧情对话。who 是 CHARACTERS 的键，说话时用它的外号（nick）和头像。
 * 开打前念 intro，赢了念 outro，念完出结算。
 */
export const DIALOGUE = {
  intro: [
    { who: 'yang', text: '这种气势，难道就是人称神雕侠侣的杨过、小龙女？久仰大名。' },
    { who: 'pan', text: '你就是传说中的泡面杨？看来今天可以好好切磋一场了' },
    { who: 'yang', text: '不要误会，我只是想打死两位，或者被两位打死。' },
    { who: 'huang', text: '自古正邪不两立，我不入地狱，谁入地狱。既然是这样，来吧！' },
  ],
  outro: [
    { who: 'yang', text: '一个能打的都没有！' },
    { who: 'pan', text: '不要得意，我知道一个绝世高手在佛山' },
    { who: 'yang', text: '佛山谁最能打？' },
    { who: 'pan', text: '当然是宋老师，难道是我？' },
    { who: 'yang', text: '宋老师？！走！去找宋老师！' },
  ],
};

/** 键盘 */
export const KEYS = {
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  attack: ['J'],
  throw: ['K'],
  jump: ['SPACE', 'L'],
  restart: ['R'],
};
