import Fighter from './Fighter.js';

/** 玩家（泡面杨）：把输入翻译成移动 / 普攻 / 投掷 / 跳跃 */
export default class Player extends Fighter {
  constructor(scene, x, y) {
    super(scene, 'yang', x, y);
  }

  /**
   * @param {object} intent { x, y, attack, throw, jump }
   *   方向是 -1..1，三个按钮是"这一帧刚按下"的布尔值
   */
  control(intent, dt, now) {
    if (this.state === 'down') return;
    // 出手期间定住（动作做完才恢复），受击期间只挨打不能操作
    if (this.act || this.state === 'hurt') return;

    // 先按输入定朝向：走哪个方向就朝哪边，停下也保持这个朝向，
    // 攻击 / 投掷都朝着这个方向出去（所以"边走边打"也不会打反）
    this.aimFromInput(intent.x, intent.y);

    if (intent.jump) this.jump();
    // instant = true：按下立刻出判定 / 出道具，不等动画
    if (intent.attack && this.startAct('strike', now, true)) return;
    if (intent.throw && this.startAct('throw', now, true)) return;

    this.moveIntent(intent.x, intent.y, dt, this.cfg.speed);
  }
}
