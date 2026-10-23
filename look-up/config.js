// Look Up · 可调参数。改完保存、刷新即可。
// 取景框手势的判定（L 形阈值、眯眼等）沿用旧页面的 ../config.js 里的 frame，这里只覆盖需要不同的几项。

window.LOOKUP = {

  // ---------------------------------------------------------------- dashboard（阶段 F）
  dashboard: {
    palette: 1,                 // 1 / 2 / 3，选一个
    palettes: {
      1: { frame: '#c9d2d8', ink: '#1d2328', mute: '#5d6870' },   // 很浅的灰蓝，接近阴天
      2: { frame: '#e9e2d3', ink: '#24211b', mute: '#77705f' },   // 暖的纸色
      3: { frame: '#f2c500', ink: '#1a1a12', mute: '#4c4720' },   // 很平的强烈颜色（像参考图 08 的黄）
    },
    window: { w: 0.56, h: 0.62, y: 0.47 },   // 中间窗口：占屏幕宽高的比例、中心纵向位置
    circleSizePx: 22,           // 每一层高度一个圆圈编号（参考 03），找到鸽子的填色
  },

  // 开场：放大的画面 + 两只手比取景框 → 手往两边移开，窗口打开
  intro: {
    zoomStart: 1.15,            // 开始时画面放大多少
    handsHoldMs: 900,           // 两只手先停一会儿
    openMs: 3200,               // 手移开、窗口打开的时长
    handScale: 0.42,            // 手的大小（相对屏幕高度）
  },

  // ---------------------------------------------------------------- 书（按 book.pdf 的跨页）：7 次抬头 = 7 个 section
  // 每个 section 先出现一句指引（content.js 的 guides）；抬一下头就到这个 section（判定很宽松），
  // 然后它的跨页自己一页页翻，这时不用一直抬头，低头也没关系。7 个之后是天空：飞行照片全屏。
  // groups 是书里的组号（跨页右页的页码，和 Sightline 页面右边那列数字一样）。
  book: {
    enabled: true,              // false = 回到原来的竖向照片
    background: '#e4e4e4',      // 和 dashboard 一样（切下来的洞也是这个颜色）
    ink: '#000000',
    historicalPhotos: true,     // 书里的历史照片（人的照片）：true = 放原图，false = 用下面的浅灰色块代替
    historical: '#d9d9d9',
    captions: false,            // 竖排小图注（太小看不清，先不显示）
    numbers: false,             // 组号
    rulerInchesPerScreen: 84,   // 高度尺：一屏高 = 多少英寸（7 英尺）
    rulerLine: '#7b7b7b',       //         线和刻度的颜色（和 dashboard 的线一样）
    heightPx: 11,               // 左边高度尺的字号
    heightTickPx: 28,           // 刻度线长度
    visitedInk: '#a3a3a3',      // 去过的高度：浅灰
    holeColor: '#ffffff',       // 照片上切掉鸽子的洞（试过蓝天，太突兀）
    minHeight: 60,              // 低于人的视线（60″）的照片不放
    // 白名单：每个 section 只用这些构件；照书里的跨页整页放（混着别的构件的 47、53、55 也整页放）
    // 每个 section 里按高度从低到高（一样高按页码）。In flight 书里没有成形的跨页 → 用记录表里的飞行照片，一张一页
    sections: [
      // 每个 section 只留最清楚、最有话说的一两页（Kiara 2026-10-23：页数太多太累）
      // 顺序按高度一路往上（尺子上的数字只升不降）：120 → 144 → 180 → 192 → 216 → 300 → 348 → 天空
      { key: 'awning',  groups: ['35', '43'] },     // 1900 年 Mulberry 街的帆布雨棚 → 今天 Zero Irving 的玻璃雨棚（有视频）
      { key: 'ledge',   groups: ['53'] },           // Kertész 窗台上的玻璃胸像（对上「从我的窗台望出去」）
      { key: 'sign',    groups: ['55'] },           // Berenice Abbott，家禽店，1937
      { key: 'signal',  groups: ['63'] },           // 信号灯横杆（IMG_7643 那段视频拍的就是信号灯横杆上的鸽子）
      { key: 'fire',    groups: ['67'] },           // Weegee，热天夜里睡在消防梯上
      { key: 'light',   groups: ['77'] },           // Hine 的 Icarus，接到天空
    ],
    // 去天空之前的那段声音（js/skysound.js）：在 startSection 开始时从头播放、慢慢变大；
    // 抬头进入天空的那一刻接到 jumpTo，一秒后是翅膀拍动（录音里 30.5–33.5 秒）
    skySound: {
      src: 'sound/sky_wings.m4a',
      startSection: 'light',    // 从哪个 section 开始放（路灯 = 天空前最后一个）
      volFrom: 0.2,             // 先淡入到 20%……
      volTo: 0.3,               // ……再慢慢升到 30%
      fadeInSec: 6,
      riseSec: 40,
      loopStart: 1,             // 还没去天空时，在这一段环境声里循环（秒）
      loopEnd: 29,
      jumpTo: 29.5,             // 进入天空时接到这里
      wingsAt: 30.5,            // 录音里翅膀拍动开始的地方（鸽子在这一刻飞起来）
      crossfadeSec: 0.8,
    },
    // 历史照片换成视频：组号 → 视频。这一页落定、照片信息浮现之后再过 delayMs，灰色方块把照片换成视频
    // （71 = 路灯里最大的那张历史照片 PECO Lamp Trimmer；视频都是 Kiara 拍的原片转成的 H.264）
    // 天空这个 section 的背景：和天空视频一样的蓝（照浏览器里播出来的视频从上到下取的颜色，对齐视频那一栏）；进入天空时 fadeMs 慢慢变过去
    // 天空（js/main.js 的 startSky）：抬头以后的一场，不切鸽子
    skyScene: {
      height: 960,              // 尺子冲到这里（英寸）
      videoFirst: 'assets/video/sky_birds.mp4',   // 先放一遍：IMG_7642，蓝天里一群鸽子飞过（没有声音）
      video: 'assets/video/sky.mp4',   // 接着一直循环：IMG_7637，天空和鸽子（没有声音）。两段都铺满屏幕，只把鸽子印到云上
      sinkMs: 3200,             // 最后那页书往下沉、淡掉
      videoAt: 3400,            // 背景差不多全蓝了视频才开始浮现（不然半灰的背景上会看出一条）
      birdsAt: 1000,            // 鸽子开始飞（有声音时：对到翅膀声开始的那一刻）
      birdStaggerMs: 240,       //   一只接一只
      birdFlyMs: 5600,          //   从下飞到上要多久
      birdU: 6.5,               //   多大（u）
      askMinMs: 8000,           // 最早多久以后问天空那一句
    },
    skyBg: {
      stops: ['#3a78cb', '#3674c5', '#316fbf', '#2d6bba', '#2b68b7', '#2a68b7', '#2a69b9', '#2c6dbe', '#3072c5', '#3478ce'],
      fadeMs: 4000,             // 从灰渐变成蓝要多久
      cloudAlpha: 1,            // 云（assets/sky/clouds.jpg）铺在蓝色上，多不透明
      featherX: 0.06,           // 视频四边羽化多少（铺满屏幕，只留一点）
      featherY: 0.04,           //     上下
      videoFadeMs: 2500,        // 视频慢慢浮现
    },
    // 每个 section 自己的一点声音（js/sectionsound.js）：很小声，垫在下面。文件放在 sound/sections/，没有就不响
    //   loop 一直循环 · spread 每翻到一页响一次 · every 隔一会儿响一次（everyMs 之间随机）
    sectionSounds: {
      // 底音：Kiara 在联合广场公园录的（主要的声音）；下面每一章那一点是别人录的，只是辅助（master 压低）
      bed: { src: 'sound/union_square.m4a', vol: 0.3, fadeInSec: 4, lowVol: 0.14, lowSec: 6 },
      master: 0.6,
      fadeInSec: 2.5,
      fadeOutSec: 1.5,
      sections: {
        // awning：雨声去掉了（Kiara：太莫名其妙）；文件还在 sound/sections/rain_awning.m4a
        sign:   { src: 'sound/sections/shop_bell.m4a', mode: 'spread', vol: 0.12, firstMs: 900 }, // 开门的铃声
        signal: { src: 'sound/sections/aps_tick.m4a', mode: 'loop', vol: 0.10 },                 // 路口给盲人的提示音（暂时用英国的，之后换纽约录的）
        fire:   { src: 'sound/sections/fire_escape_steps.m4a', mode: 'every', vol: 0.14, everyMs: [7000, 14000], firstMs: 1800 }, // 踩在铁梯上
        light:  { src: 'sound/sections/night_city.m4a', mode: 'loop', vol: 0.2 },                // 夜晚城市：远处的警笛（录音本身比较轻）
      },
    },

    // 建筑那几页：这一页落定以后，视频在自己拍的鸽子照片上快速放一遍，放完淡回原来的照片
    // （43 = 屋檐 Zero Irving 那页，IMG_7641 截 3–7 秒、向左转；63 = 信号灯那页，IMG_7643 拍的就是信号灯横杆）
    photoVideos: {
      '43': { src: 'assets/video/awning.mp4', rate: 2, delayMs: 1200 },
      '63': { src: 'assets/video/streetlight.mp4', rate: 2, delayMs: 1200 },
      '77': { src: 'assets/video/high.mp4', rate: 1, delayMs: 1200 },   // 路灯那页（去天空之前最高的一页）：IMG_7643 的 10–13 秒，楼角、路灯、电线上的鸽子飞起来
    },
    videos: {
      last: { src: 'assets/video/sky.mp4', rate: 1, delayMs: 1500, loop: true, blend: true },   // blend：四边羽化，融进背景             // 最后：天空最后一页右边那一栏；IMG_7637 天空和鸽子，去掉了声音
    },
    // 没放进来的组：01–33（低于视线，或者不在白名单）、37、41、57、61、65、79、81
    lookAbove: 0.2,             // 抬头判定：lookValue 超过这个（约 8°）……
    lookHoldMs: 250,            //          ……保持这么久就算
    poemHoldMs: 1600,           // 诗拼好以后停多久，就收起来存好（缩进屏幕上方的目录）
    questionIdleMs: 45000,      // 问题这么久没人动（输入框是空的、光标也不在里面）：自己跳过
    skipLook: 0.75,             // 用力抬头（约 17° 以上 / 按住 ↑）……
    skipHoldMs: 1500,           // ……保持这么久：不找鸽子也往上走
    cutHintMs: 5000,            // 一页上这么久还没切到鸽子：两只手再示范一次
    lookHintMs: 4000,           // 该抬头了、这么久还没抬：旁边出现一句提示
    enterMs: 1400,              // 进入一个 section / 同一个 section 里高度变了：跨页从上面落下来（上升）
    noIntroMs: 1600,            // 介绍卡等你点 Next 才翻；没有介绍的页：切到之后多久翻成「再抬头 ↑」/「Ready?」            // 没有介绍的页（每个 section 第一页以外）：切到之后多久翻
    flipMs: 1100,               // 卡片翻一次（和 dashboard 一样）
    zoom: false,                // 电脑上框里的画面要不要放大（手机的捏合放大一直有）
    cutCover: 0.3,              // 切鸽子：鸽子有这么多在框里就算框住了（或者鸽子中心在框附近）
    cutDwellMs: 400,            //         框住这么久 → 框自己缩成鸽子的大小
    snapMs: 420,                //         框缩小要多久，缩完就切
    cutPad: 1.15,               //         切下来的正方形比鸽子大多少
    cutTint: null,              // 切下来的方块加一层色调，例如 'rgba(122, 86, 214, 0.72)'（紫）；null = 不加
    tutorialHandScale: 0.55,    // 教学的手：dashboard 上手的大小 × 这个
    pieceU: 9,                  // 右上角每一块的大小（网格单位）
    pieceFlyMs: 2200,           // 切下来的方块：先在原地放大、停一下，再飞到右上角，一共多久
    pieceZoom: 2.6,             //               原地放大到几倍
    poemFlyMs: 900,             // 填完之后，方块飞进句子要多久
    panelMs: 900,               // 卡片放大成填空面板
    revealColor: '#d9d9d9',     // 同一个高度换页：灰色方块拉出来 / 收回去
    revealMs: 320,              //                各要多久
    revealStaggerMs: 120,       //       一张接一张，隔这么久（从左到右）
    sidePx: 120,                // 跨页左右至少留这么多（左边是高度尺）
    marginY: 40,
  },

  // ---------------------------------------------------------------- 竖向空间（阶段 B）
  world: {
    topInches: 39370,           // 最高处：1000 m
    skyFromInches: 2400,        // 这以上没有照片，只有天空
    // 高度 → 距离的曲线：Y = log(1 + h / h0)。h0 越小，地面附近拉得越开、高处压得越紧
    curveH0: 24,
    journeyScreens: 16,         // 整个旅程大约多少个屏幕高（曲线部分；照片太挤时会再撑开一点）
    anchor: 0.64,               // 「眼睛」在屏幕上的位置（0 顶，1 底）：当前高度的那一行在这里
  },

  rows: {
    photoVh: 0.6,               // 照片高度（屏幕高度的比例）：每次屏幕上大概只有一张
    slotVh: 1.05,               // 相邻两张至少隔多少个屏幕高
    // 同一高度有好几张时：
    //   'cycle' = 只放一张，隔 cycleSec 秒淡入淡出换成同一高度的另一张（取景框在用时不换）
    //   'stack' = 上下排开，一张一行（高度尺读数不变）
    sameHeight: 'cycle',
    preferMorePigeons: true,    // 同一高度：鸽子多的照片先放（按 YOLO 数的个数从多到少轮流）
    cycleSec: 9,
    cycleFadeMs: 1800,
    marginPx: 120,              // 左右留白（左边是高度尺）
    captionPx: 9,               // 竖排图注字号
    showCaptions: true,
  },

  // 往上走之后，眼睛下面（已经走过）的照片逐渐模糊、变淡
  depth: {
    enabled: true,
    startPx: 40,                // 离开眼睛的位置多少 px 之后开始
    rangeVh: 0.5,               // 再往下多少个屏幕高达到最大
    blurPx: 9,
    fade: 0.6,                  // 最多淡到多少（0 = 不淡，1 = 完全消失）
  },

  // ---------------------------------------------------------------- 控制：头的角度 → 上升速度
  control: {
    deadzoneDeg: 3,             // ±3° 内算平视，停下
    maxDeg: 20,                 // 抬到这个角度是最快
    maxScreensPerSec: 0.5,      // 最快每秒走多少个屏幕高
    downFactor: 0.8,            // 低头往回走的速度比例
    responseMs: 650,            // 速度的惯性（越大越「滑」）
    pitchSmoothingMs: 160,      // 角度本身的平滑
    calibrationMs: 1600,        // 开始时记录平视角度的时长
    invertPitch: false,
    invertYaw: false,
    keyScreensPerSec: 0.42,     // 备用控制：按住 ↑↓ 的速度
    wheelFactor: 1.0,           // 备用控制：滚轮
  },

  // ---------------------------------------------------------------- 手机模式（input/mobile.js）
  // 把手机往上举、往天上指 = 抬头；双指捏合 = 放大（范围用上面 frame 的 zoomMax）
  mobile: {
    deadzoneDeg: 3,             // 相对开始姿态 ±3° 内不动
    maxDeg: 25,                 // 往上举这么多度是最快（手机能转的角度比头大）
    smoothingMs: 140,           // 陀螺仪的低通滤波（越大越稳、越慢）
    invert: false,              // 举起来反而往下走就改成 true
    calibrationMs: 900,         // 开始时记录姿态的时长
    gyroTimeoutMs: 1500,        // 这么久没收到陀螺仪数据 → 改用单指拖动
    dragDeadzonePx: 8,          // 单指拖动（兜底）：离起点这么近不动
    dragMaxVh: 0.25,            // 拖出屏幕高度的这么多是最快
    zoomActiveAbove: 1.05,      // 捏合放大超过这个倍数，算「在取景」（上升暂停、开始找鸽子）
    doubleTapMs: 300,           // 双击回到不放大
  },

  // 摄像头小窗（按 D）
  debug: { show: false, cameraWidth: 200 },

  // ---------------------------------------------------------------- 观察：取景框 + 找到鸽子（阶段 C）
  frame: {
    trigger: 'either',          // 'either' / 'wink' / 'hands'，见 ../config.js
    everyNFrames: 2,            // 手部每几帧算一次
    outsideFade: 0.35,
    zoomMin: 1.6,
    zoomMax: 3.6,
  },
  observe: {
    findDwellMs: 900,           // 框的中心停在鸽子身上这么久 = 找到（这段时间颜色从脖子慢慢渗出来）
    neckSampleRadius: 0.018,    // 脖子取色的范围（照片宽度的比例）
    saturationBoost: 2.4,       // 取到的颜色加多少饱和（只有找到的鸽子是鲜艳的）
    minSaturation: 0.5,
    lightness: [0.42, 0.62],    // 颜色亮度夹在这个范围
    useSuggestionsUntilMarked: true,   // 还没手动标注的照片，先用 YOLO 的建议轮廓（脖子位置是估的）
    silhouetteSpreadMs: 3500,   // 被找到的鸽子：从脖子开始变成剪影要多久
    holdMs: 5000,               // 找到之后，保持鸽子的样子多久
    dissolveMs: 3000,           // 然后剪影慢慢淡去，同时颜色在屏幕上晕开
    // 被找到的鸽子的样子（参考图 07，riso 印的鸽子）
    silhouette: {
      alpha: 0.88,              // 整体透明度（1 = 完全实心）
      body: '#d4d4d2',          // 浅灰身体
      shade: 'rgba(84,86,92,0.78)',    // 背上那团柔和的深灰
      feet: 'rgba(240,150,200,0.95)',  // 粉脚
      blur: 0.035,              // 整体模糊（相对鸽子大小）：0 = 清楚的图形，越大越糊
      grain: 0.08,              // 颗粒
    },
  },
  spots: {
    show: true,                 // 屏幕上的色斑：鸽子保持一会儿之后才晕开，贴在屏幕上
    radiusPx: 120,              // 屏幕上色斑的大小
    spreadMs: 7000,             // 色斑慢慢晕开要多久
    ringRatio: 0.42,            // 细线圆圈的半径（相对色斑）
    labelPx: 10,
    // 结构色：头左右转动时，色斑在绿和紫之间偏移
    yawMaxDeg: 25,
    hueShiftDeg: 26,
  },

  // ---------------------------------------------------------------- 区段：颜色、模糊、雾随高度变（阶段 D）
  // 每一行是一个关键高度（英寸），中间按对数高度插值
  zones: [
    { h: 0,     blur: 0,   fog: 0.10, gray: 0.55, bg: '#e4e4e4' },   // 地面：灰、安静，接近书
    { h: 60,    blur: 0.4, fog: 0.14, gray: 0.62, bg: '#e3e4e3' },   // 人的视线：第一个转折
    { h: 300,   blur: 1.4, fog: 0.22, gray: 0.7,  bg: '#dfe2e5' },   // 城市构件：变软
    { h: 600,   blur: 2.4, fog: 0.30, gray: 0.76, bg: '#d9dfe5' },   // 屋顶以上
    { h: 1800,  blur: 3.6, fog: 0.42, gray: 0.82, bg: '#d3dce6' },   // 飞行
    { h: 4000,  blur: 5,   fog: 0.5,  gray: 0.9,  bg: 'sky' },       // 天空（颜色看纽约此刻的时间）
  ],

  // 声音：每一层在哪些高度有多响（0–1），中间按对数高度插值。地面最吵，最高处几乎无声
  audio: {
    enabled: false,             // 先关着，录好声音后改成 true
    master: 0.9,
    layers: {
      street:  [[0, 0.9], [60, 0.7], [300, 0.3], [600, 0.08], [1800, 0]],
      traffic: [[0, 0.7], [60, 0.6], [300, 0.35], [600, 0.1], [1200, 0]],
      steps:   [[0, 0.6], [18, 0.4], [60, 0.1], [150, 0]],
      wind:    [[0, 0], [300, 0.1], [600, 0.35], [1800, 0.45], [6000, 0.2], [39370, 0.03]],
    },
    featherVolume: 0.25,
    fadeMs: 400,
  },

  // 停顿：到这些高度时自动停下，问一个问题（问题文字在 content.js，按顺序对应）
  pauses: [150, 360, 1320],
  // 和高度有关的事实（文字在 content.js）：在这个高度旁边出现
  facts: [60, 180, 39370],

  // ---------------------------------------------------------------- 天空和结尾（阶段 E）
  sky: {
    latitude: 40.73,
    longitude: -73.99,
    fetchTimeoutMs: 5000,
    // 拿不到数据时的默认值
    fallback: { windDirection: 270, windSpeed: 12, sunrise: '07:10', sunset: '18:20' },
    colors: {
      day:   ['#5f95cf', '#bcd3e6'],   // 上 → 下
      dusk:  ['#6c79a8', '#e2b9a2'],
      night: ['#16233d', '#34425f'],
    },
    twilightMin: 40,            // 日出日落前后多少分钟算黄昏
  },
  // 最高处：找到的鸽子变成飞鸽，飞进天空
  flight: {
    enabled: false,             // 先关着：Kiara 会录一段动画放进来
    flyMs: 6500,                // 每只飞完要多久
    staggerMs: 380,             // 一只接一只起飞的间隔
    sizePx: 120,                // 飞鸽大小（离得越远越小）
    flapHz: 3,                  // 扇翅膀的频率
  },

  ending: {
    featherFallMs: 5000,        // 羽毛从最高处落到地面（镜头跟着下来），要快
    lastLineMs: 6000,           // 「Now look up from your screen.」停留
    featherWidthPx: 70,
    featherLengthPx: 340,       // 落下来的纸羽毛多大（最长的一边）
    featherTurnMs: 1700,        // 翻一面要多久
  },

  // ---------------------------------------------------------------- 全局质感（阶段 F）
  grain: {
    opacity: 0.22,              // 颗粒强度
    sizePx: 180,                // 颗粒贴图大小
    fps: 12,                    // 颗粒跳动的频率（0 = 不动）
    windDrift: 6,               // 颗粒跟着真实风向漂移的速度
  },

  // 电脑版 dashboard（dashboard.js）。长度都是网格单位 u：u = min(屏幕宽 / 96, 屏幕高 / 62)，1728 宽时 u = 18px
  dash: {
    flipMs: 1100,               // 卡片翻一次
    idleFrontMs: 4200,          // 没人碰的时候：正面停多久翻到背面
    idleBackMs: 3200,           //               背面停多久翻回来
    riseMs: 2600,               // LOOK UP 从卡片底边升到顶上
    lookUpAbove: 0.35,          // 抬头：lookValue 超过这个（约 11°）……
    lookUpHoldMs: 350,          //       ……并保持这么久，算抬头了
    noCameraHintMs: 5000,       // 摄像头这么久还没好：提示用 ↑ / 点击
    closeMs: 6000,              // 没人动的时候：两只手自己慢慢合拢、卡片缩小要这么久
    handsNear: 0.2,             // 用户两只手（食指根）在画面里的距离：这么近 = 合拢……
    handsFar: 0.6,              //                                    ……这么远 = 张开
    smallCard: 11,              // 缩小后的卡片边长（u）
    handsHoldMs: 0,             // 检测到手势之后，四角标记出现、再停这么久进入（0 = 马上）
    leaveSteps: [450, 340, 340, 700],    // 进入网站：线贴住卡片 → 合成十字 → 分开成灰方块 → 散开（毫秒）
    chapters: [0, 12, 60, 180, 600, 2400, 12000, 60000],   // TODO 占位：chapter 的刻度（英寸），之后按真正的 chapter 改
  },

  storage: {
    unlocked: 'lookup-unlocked-v1',
    answers: 'lookup-answers-v1',
    feathersDb: 'lookup',
  },
};
