# 杨凡大战潘尔赛

2D 打斗游戏第一关：**桂圆银行门口 · 杨凡 1v2 打潘尔赛和黄姐**。Phaser 3.90 + 原生 ES 模块，
没有任何构建步骤，`git push` 到 GitHub Pages 就能给朋友玩。

## 跑起来

```bash
npm start          # 零依赖静态服务器
# 打开 http://localhost:5173
```

必须走 http（浏览器不允许在 `file://` 下加载 ES 模块和图片）。`python3 -m http.server 5173` 也行。

## 操作

| 操作 | 键盘 | 手机 |
| --- | --- | --- |
| 移动 | `WASD` / 方向键 | 左下摇杆（推多深走多快，能斜着走） |
| 普通攻击 | `J` | 右下「攻」 |
| 投掷攻击 | `K` | 右下「掷」 |
| 跳跃 | 空格 / `L` | 右下「跳」 |
| 重来 | `R` | 结束后点屏幕 |
| 音乐开关 | `M` | 点顶部中间的「♪ 音乐」 |

打开先选**电脑模式 / 手机模式**（手机模式会尽量切横屏，转不过来就把画布自己转 90°）。

## 音乐和音效

**没有任何音频文件**，全部是 Web Audio 现场合成（零加载、零版权问题），代码在
`src/systems/audio.js`。

背景音乐是一段 **16 小节的循环**：D 小调、108 BPM、带摇摆（swing）的十六分音符，
走的是"滑稽潜行 / 偷鸡摸狗"那路卡通配乐：

```
前 8 小节：Dm - Dm - Bb - A7 | Dm - Dm - Gm - A7     主旋律稀疏，留白多
后 8 小节：Gm - A7 - Dm - Bb | Gm - A7 - Dm - A7     改成八分音符的走动，热闹一点
```

- **配器**：拨弦感的主旋律（三角波 + 高八度方波 + 一点回声）、走路一样的贝斯、
  只在 2/4 拍响的边鼓、反拍上极轻的沙锤。鼓组整体几乎只是垫底。
- **笑点**：每 4 小节收尾时主旋律往下溜一个小二度（"脚下一滑"），第 8 小节末尾一个滑哨似的
  上滑音，第 16 小节末尾一声 boing 再接回开头。
- **克制**：峰值约 0.19、均方根约 0.022，音乐总线上挂了 4.4kHz 低通，标题界面还会再压低一点
  （`VOLUME.title`），打起来不会盖住音效。
- **音效**同样是合成的：命中（重击更闷更响）、投掷的"嗖"、起跳的 boing、倒地的一路下滑、
  胜利的四音小号角、失败的两音下行。

浏览器要求先有用户手势才能出声，所以**第一次点屏幕 / 按键盘时音乐才会响**；
`M` 或者顶部中间的按钮可以静音，设置记在 localStorage 里，切到后台会自动暂停。

调音乐：`src/systems/audio.js` 顶上的 `BPM` / `SWING` / `VOLUME` / `CUTOFF`，
以及 `BARS` 那张谱子表（每小节 16 个十六分音符，`mel` 是主旋律、`bass` 是四个贝斯音，
`.` 休止、`~` 延长）。

自检（不用耳朵也能确认音乐真的在响、音量是不是克制）：

```js
// 浏览器控制台里
await window.audio.renderPreview(8)
// { peak: 0.191, rms: 0.022, beats: 15, steps: [...每个十六分音符的包络...] }
```

`renderPreview` 用 `OfflineAudioContext` 把同一套排程离线渲染出来，返回峰值 / 均方根 /
每拍与每个十六分音符的包络——可以拿来确认"音符落在谱子写的那一步上、鼓点位置对不对、音量有没有失控"。

## 剧情对话

关卡前后各有一段对话，内容在 `src/config.js` 的 `DIALOGUE.intro` / `DIALOGUE.outro`，
一行一个人，`who` 是角色键、`text` 是台词：

```js
{ who: 'yang', text: '不要误会，我只是想打死两位，或者被两位打死。' },
```

- **开打前**：泡面杨 → 潘尔赛 → 泡面杨 → 黄姐，念完才开打（这段时间敌人不动、也不吃操作）。
- **获胜后**：泡面杨 → 潘尔赛 → 泡面杨 → 潘尔赛 → 泡面杨，念完出「第一关 · 完」结算，
  按 `R` 或点屏幕重来。
- 对话里的名字用 `CHARACTERS.*.nick`（杨凡是「泡面杨」），头像用同一套圆形头像。
- 正文有打字机效果（每字 26ms，每三个字"嘀"一声）。按 `J` / `空格` / 回车 / 点屏幕继续：
  **没打完就先补完这一句，打完了才翻页**。
- 对话期间音乐自动收一档（`setIntensity('title')`），开打时放开（`'fight'`）。

`src/ui/DialogueBox.js` 是通用的：`new DialogueBox(scene, lines, onDone)`，
念完最后一句回调 `onDone`，拿去做别的过场也行。

## 这一关怎么打

**场地**：银行外面的水星街道，**宽 2560（画面的一倍）**，镜头跟着杨凡横向滚。
人行道 + 马路 + 对面人行道**整条都能走**，路上没有任何障碍物（树、路灯、长椅、消防栓、车都没放），
可以随便绕。敌人跑到画面外时，屏幕左右边缘会出现小箭头标出他在哪边。
背景是 `src/art/street.js` 用 Canvas 画出来的，和《潘尔赛的日常》里那条街同一套分层，不占加载体积。

**攻击方向**：出手判定**严格按当前朝向**（走路时人物朝哪边，打出去的就是哪边）。
判定框是「自己的站桩范围朝朝向伸出 reach」，上和下是身前的地面、左和右是身体侧面，
四个方向距离一致。攻击/投掷素材只画了一个朝向，所以朝左出手时水平镜像。
朝向跟着输入走：**朝哪个方向走就朝哪边，停下来也保持那个朝向**，攻击和投掷都朝这个方向出去。

**出手没有前摇**：玩家按下 `J` / `K` 的那一刻判定就出去了（动画只是表现），
所以不会再有"明明按了、人却先摆个姿势再打"的迟钝感。敌人则保留起手动作当预警——
你还能看见潘尔赛举锅、黄姐抬手，来得及躲。

- 杨凡 130 血，潘尔赛 95 血，黄姐 85 血。
- **潘尔赛贴身硬刚**：保持 130~300 像素，近距离用空手挥击，中距离扔平底锅（快、直线）和螃蟹（慢、抛物线、贴地飞）。
- **黄姐远程拉扯**：保持 380~540 像素，扔榴莲（高抛、16 点伤害、慢）和针头（快、贴地、只有 7 点）；你贴到她脸上，她会用针头戳你。
- **贴地飞的螃蟹和针头可以跳过去**（跳跃最高约 107 像素）。平底锅从 104 像素高飞过，起跳的时机对了也能躲。
- **同一时刻只有一个敌人会发动攻击**（攻击令牌），另一个只能走位绕圈——1v2 不被连到死就靠这个。
- 挨打后有 0.56 秒无敌时间，所以不会被两套动作接死。

## 目录

```
index.html                 入口（含手机横屏兜底、报错显示）
vendor/phaser.min.js       Phaser 3.90.0，本地依赖，不走 CDN
src/config.js              ★ 所有可调参数：手感、伤害、AI 性格、舞台、按键
src/main.js                游戏配置 + 场景注册
src/scenes/
  BootScene.js             加载素材 + 进度条 + 生成代码画的贴图（街道背景、道具、特效）
  TitleScene.js            标题 / 选模式 / 开始
  FightScene.js            关卡本体：输入、命中结算、道具、攻击令牌、胜负
src/objects/
  Fighter.js               ★ 角色基类：状态机 + 移动 + 跳跃 + 受击 + 无敌 + 击退
  Player.js                玩家：把输入翻译成动作
  Enemy.js                 敌人 AI：走位 / 拉开距离 / 轮流出手
  Projectile.js            飞行道具：直线与抛物线，带 z 高度判定
src/ui/
  Hud.js                   血条 / 头像 / 关卡标题 / 结算横幅
  TouchControls.js         手机虚拟摇杆 + 三个按钮
  MusicButton.js           顶部中间的音乐开关（点一下静音，键盘 M 同效）
  DialogueBox.js           剧情对话条（头像 + 名字 + 打字机正文）
src/systems/
  effects.js               命中星星、飘字、尘土、顿帧、屏幕震动
  audio.js                 ★ 全部音乐和音效：Web Audio 现场合成，没有音频文件
  orientation.js           手机横屏处理（从《潘尔赛的日常》沿用，已验证）
src/art/
  street.js                银行外面那条街的背景（纯 Canvas 画，无道具）
  props.js                 代码画的飞行道具（平底锅 / 螃蟹 / 榴莲 / 针头 / 泡面）
  canvasKit.js             画贴图的小工具
assets/                    处理过的素材（大图存档 + json 参数，含暂时没用的松鸭湖背景）
assets/small/              ★ 网页真正加载的小图（webp，共 2.4MB，其中 lake_bg 当前没被加载）
pic/                       你放的原图（43MB，只是素材档案，游戏不加载）
tools/
  build_assets.py          素材管线（见下）
  dev-server.js            本地静态服务器
  screenshot.mjs           无头 Chrome 自检：跑一遍 + 抓控制台报错 + 截图
```

## 素材管线

```bash
npm run assets          # = python3 tools/build_assets.py
python3 tools/build_assets.py sheets       # 只处理精灵表
python3 tools/build_assets.py small        # 只生成网页小图
python3 tools/build_assets.py all --coef 0.7   # 换人物显示高度系数
```

管线做的事：

1. **抠图**：原图都没有 alpha 通道、背景是一片白噪点，从四边泛洪去背景 + 柔和边缘去白边。
2. **止血**：投掷图的相邻帧会互相串味（某一帧甩出去的手臂/锅子画进了隔壁格子），
   逐格做连通块分析，把「没碰到本格中间带」的孤立碎块丢掉。
3. **共用一个包围盒**：所有帧按同一个格内包围盒裁切，动画不会上下抖。
4. **量锚点**：每张表输出 `feet`（脚底中心在帧内的位置）和 `unit`（参考帧人物高度）。
   行走表和投掷表里的人物本来画得**不一样大**（格子 832 比 672 大，人跟着大 16%~29%），
   游戏里用 `scale = 目标高度 / unit` 和统一的 `origin = feet / 帧尺寸` 对齐——
   所以换动作时人物不会变大变小、脚也不会飘。
5. 跑完会打印一段可以直接粘进 `src/config.js` 的 `SHEETS`（帧尺寸 / scale / origin）。

### 页面体积

首屏共约 3.5MB（Phaser 1.2MB + 人物贴图 2.2MB + 头像 57KB；**街道背景是代码画的，完全不占下载**）。
嫌大的话把 `SMALL_JOBS` 里的 `scale` 从 `0.7` 调到 `0.55`，重新跑 `npm run assets small`，
人物贴图能再小四成（代价是手机上略糊一点）。

## 调参入口

全在 `src/config.js`：

| 想改什么 | 改哪里 |
| --- | --- |
| 走路速度 / 血量 / 判定盒 | `CHARACTERS.yang/pan/huang` |
| 动作快慢、第几帧出判定、伤害、击退、冷却 | `CHARACTERS.*.acts` |
| 挨打硬直 / 无敌时间 / 顿帧 / 跳跃高度 | `COMBAT` |
| 舞台范围、街道分层（天空/建筑/人行道/马路）、出生点 | `STAGE`（背景画法在 `src/art/street.js`） |
| 地图多宽（镜头滚动范围） | `STAGE.world.width` |
| 近战能打多远 / 判定多高 | `CHARACTERS.*.acts.*.melee` 的 `reach` / `h` |
| 敌人的性格：想保持的距离、走位速度、冷却、爱不爱远程 | `AI.pan` / `AI.huang` |
| 同时最多几个敌人出手 | `AI.maxAttackers`（默认 1，改成 2 会非常难） |
| 手机摇杆和按钮位置 | `TOUCH` |

## 自检（不用手点也能验证）

```bash
node tools/screenshot.mjs http://localhost:5173/ /tmp/title.png 4000
# 进去点开始、走两步、打一拳：
node tools/screenshot.mjs http://localhost:5173/ /tmp/fight.png 2500 \
  'click:640:672,wait:2600,d:900,j:150,wait:200'
```

`screenshot.mjs` 会打印页面状态探针（`fight` 字段里有每个人的位置 / 血量 / 状态机 / 场上的道具）、
控制台日志和**所有报错**，最后存一张截图。按键脚本支持 `w/a/s/d/j/k/l/r/space/方向键`、
`wait:毫秒`、`click:x:y`、`tap:x:y`、`eval:表达式`。

### 平衡自测：让机器人替你打一遍

`FightScene.botIntent` 可以顶掉某一帧的键盘输入，于是能在命令行里跑一场完整对局：

```bash
BOT='eval:const s=game.scene.getScene("FightScene");s.events.on("preupdate",()=>{if(s.over)return;const p=s.player;const e=s.enemies.filter((x)=>x.alive)[0];if(!e)return;const dx=e.gx-p.gx,dy=e.gy-p.gy,d=Math.hypot(dx,dy)||1;const inc=s.projectiles.some((q)=>q.owner!==p&&q.cfg.low&&Math.hypot(q.gx-p.gx,q.gy-p.gy)<230);s.botIntent={x:d>100?dx/d:0,y:d>100?dy/d:0,attack:d<140,throw:d>240&&d<560,jump:inc}})'
node tools/screenshot.mjs http://localhost:5173/ /tmp/selfplay.png 2500 \
  "click:640:672,wait:400,$BOT,wait:45000"
```

当前数值下，这个「贴上去打、中距离扔、低弹道就跳」的机器人**三局全赢**，
结束时剩 31 / 55 / 86 血（满血 130），一局约 25 秒——它会挨打但不会躲近战，
所以真人打得比它好就能赢、比它差就会输。想要更难/更简单，先动
`CHARACTERS.*.hp`、`COMBAT.invuln` 和 `AI.*.cool`（敌人两次出手之间的间隔）。

## 已知的取舍 / 下一步

- **没有受击、倒地、跳跃的素材**：受击是白闪 + 抖动 + 击退，倒地是转 90° 加淡出，跳跃是整个人抬起来、
  影子留在地上缩小。补了动画素材后改 `Fighter.takeHit / knockOut / update` 那几处即可。
- **潘尔赛和黄姐的普通攻击还在借用投掷动作表**（杨凡已经换成「杨攻击动作雪碧图」）：
  潘尔赛用「空手投掷」、黄姐用「针头」当近战。判定是身前一个矩形，手感是对的，
  以后补了各自的近战素材，把 `acts.strike.sheet` / `acts.stab.sheet` 改掉就行。
- **护士黄姐那张走路图只有 6 帧、而且是同一个朝向**（每帧轮廓宽度都在 369~394 之间，
  不像四方向姿势），所以四个方向都用这套走路循环（朝左水平镜像）。
  朝上走时看到的是正面，这是素材本身没有背面造成的；以后有四方向素材改 `dirs` 即可。
- **飞行道具是代码画的**（`src/art/props.js`）：投掷图里的锅子/螃蟹和人物连在一起，单独抠不干净。
  以后可以单独生成道具图，换成 `SHEETS` 里的一张表 + `PROJECTILES.*.tex`。
- **没有音效 / BGM**：《潘尔赛的日常》里那套 WebAudio 做法可以直接搬过来。
- 手机端只能靠真机验证，命令行里可以看布局但点不出真实手感。

## 部署到 GitHub Pages（等你调试完再做）

1. 静态站点直接放仓库根目录，入口是 `index.html`，没有构建步骤。
2. **所有资源路径都必须是相对路径**（现在是 `assets/small/...`），不能以 `/` 开头：
   本地是 `http://localhost:5173/`，Pages 上是 `https://<用户名>.github.io/<仓库名>/`。
3. 根目录放一个空的 `.nojekyll`（否则 Jekyll 会忽略下划线开头的文件）。
4. Settings → Pages → Deploy from a branch → `main` / `(root)`。
5. `pic/` 那 43MB 原图可以留在仓库当素材档案（网页只加载 `assets/small/` 那 2.4MB），
   在意 clone 速度的话可以之后用 git-lfs，或者把原图挪到单独分支。
