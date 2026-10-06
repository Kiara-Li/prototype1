// 鸽子视线实验 · 可调参数
// 改完保存，浏览器刷新即可。

window.CONFIG = {

  // ---------------------------------------------------------------- 角度 → 高度
  // 'table'：用下面的对照表线性插值（默认）
  // 'geometry'：高度 = eyeHeight + distance × tan(pitch)（单位英寸）
  // 调试窗口里按 G 可以临时切换。
  heightMode: 'table',

  // [头部 pitch（度，抬头为正）, 高度（英寸）]，必须按角度从小到大排。
  // 低于第一行按第一行算，高于最后一行按最后一行算。
  pitchTable: [
    [-25, 0],     // 低头：地面
    [-10, 18],    // 长椅
    [0, 60],      // 平视
    [10, 150],
    [20, 216],    // 信号灯
    [30, 360],
    [38, 960],    // 仰头：飞行
  ],

  geometry: {
    eyeHeight: 60,   // 站立时眼睛高度（英寸）
    distance: 240,   // 鸽子离人的水平距离（英寸，20 英尺）
  },

  // ---------------------------------------------------------------- 头部追踪
  tracking: {
    smoothingMs: 180,     // 指数平滑的时间常数，越大越稳、越慢
    invertPitch: false,   // 抬头时数值是负的就改成 true（校准第二步会自动判断）
    mirrorVideo: true,    // 调试小窗里的画面左右镜像
  },

  // 按 C 校准：第一步平视（记 0°），第二步尽量抬头（记最大值，Esc 跳过）
  calibration: {
    settleMs: 900,        // 每一步开始后先等这么久再记录
    zeroSampleMs: 1200,   // 平视记录时长
    upSampleMs: 2500,     // 抬头记录时长
    // 记下最大抬头角度后，是否把它拉伸到对照表的最高角度（38°）。
    // 适合笔记本摄像头抬不了那么高的情况。
    stretchMaxUp: true,
  },

  // ---------------------------------------------------------------- 选组
  // 手动指定某组的高度（英寸）。
  //   79 旗杆：图像比对已确认是 0540_flagpole…（540″），不用再指定
  //   81 飞行：那张图几乎全是天空，找不到原图，暂用对照表里「飞行」的 960″（待确认）
  heightOverrides: {
    '81': 960,
  },

  selection: {
    // 很多组高度相同（例如 0″ 有 7 组），只按高度分不开。
    // 每组在「轴」上的位置 = 按高度算的位置 × (1 − orderWeight) + 按书里顺序均分的位置 × orderWeight
    // 0 = 只看高度（同高度的组会重叠），1 = 只看书的顺序（41 组等距）
    orderWeight: 0.5,
    // 记录表高度和书的顺序不一致时（组 51、71），按书的顺序取前面各组的最大值，保证越往后越高
    monotonic: true,
    // 回滞：新组要比当前组「近」这么多才切换（轴的总长是 1）
    hysteresis: 0.008,
    // 切组后至少停留多久（毫秒）
    minDwellMs: 250,
  },

  // ---------------------------------------------------------------- 动画
  animation: {
    baselineMs: 450,      // 基线移动到新位置的时间常数（越大越慢）
    fadeOutMs: 140,       // 旧组淡出
    fadeInMs: 220,        // 新组淡入
    fadeInDelayMs: 60,    // 新组在旧组开始淡出后多久开始淡入
  },

  // ---------------------------------------------------------------- 版面
  layout: {
    marginY: 24,          // 书页上下留白（px）
    baselineFullWidth: true, // 基线从屏幕最左贯穿到最右，把两边刻度连起来
    background: '#ffffff',
    ink: '#000000',
  },

  // 封面左右勒口上的刻度（data/cover.json，从 bookcover.pdf 取出）
  // 纵坐标和书页相同：0′ 对着地面那组的基线，50′ 对着最高那组的基线
  // 刻度从屏幕左右边缘伸进来，长度按书的 pt 计（会跟着版面缩放）
  rulers: {
    show: true,
    sideMinPt: 90,        // 跨页两边至少留这么宽给刻度
    gapPt: 10,            // 右边长线离跨页的空隙
    leftMajorPt: 28,      // 左尺：每 5 英尺的长刻度
    leftMinorPt: 9,       // 左尺：每英尺的短刻度
    rightShortPt: 34,     // 右边：各组基线高度的短线
    lineWidthPt: 0.5,
    markerPt: 46,         // 「你现在看的位置」标记的长度
    markerWidthPt: 1.2,   // 标记的粗细
    labelPt: 6,           // 刻度上的数字（英尺、组号）
    labelMinPx: 9,        // 数字最小不小于这么多 px
  },

  // 背景里的街道立面（试验）：和刻度同一比例，长椅、门、雨棚、窗台、消防梯、路灯、树、信号灯、檐口
  elevation: {
    show: false,          // 先隐藏；改成 true 就显示
    fill: '#f0f0f0',      // 实心浅灰
    accent: '#e4e4e4',    // 雨棚、窗台、信号灯头等稍深一点
    line: '#d4d4d4',      // 消防梯、树枝这类细线
    ground: '#f6f6f6',    // 0′ 以下的地面
  },

  // ---------------------------------------------------------------- 阶段 4：取景框手势
  // 两只手各比一个 L（拇指、食指伸直约 90°，其余三指弯），合起来是取景框；框里放大看
  // 取景框现在在单独的页面 frame.html 上试；下面的判定、放大、框线设置两个页面共用
  frame: {
    onMainPage: false,      // true = 主页面（视线）上也开取景框
    everyNFrames: 2,        // 主页面上手部每几帧算一次（和人脸一起跑，太卡就调大）
    lShape: {
      // 开始出现取景框：两只手都要满足
      thumbStraightMin: 0.75,  // 拇指伸直程度（1 = 完全直）
      indexStraightMin: 0.80,  // 食指伸直程度
      curledStraightMax: 0.80, // 中指 / 无名指 / 小指低于这个算弯曲
      minCurled: 1,            // 三根里至少几根弯曲（0 = 不管其余手指）
      angleMin: 35,            // 拇指和食指的夹角范围（度），不用是直角
      angleMax: 145,
      // 取景框出现之后，维持它只要这么宽松：食指大致伸着、夹角在这个范围
      keep: {
        indexStraightMin: 0.65,
        angleMin: 15,
        angleMax: 170,
      },
    },
    // 怎样算「要开取景框」：
    //   'either' = 两只手比得够标准的 L，或者两只手大致框住 + 眯一只眼（默认）
    //   'wink'   = 必须眯一只眼（手的形状按 keep 那样宽松判断）
    //   'hands'  = 只看手（原来的方式）
    trigger: 'either',
    eye: {
      closedMin: 0.5,       // 闭着的那只眼：eyeBlink ≥ 这个
      openMax: 0.3,         // 睁着的那只眼：eyeBlink ≤ 这个
    },
    onMs: 300,              // 条件持续这么久，取景框才出现
    offMs: 500,             // 手放下这么久后取景框消失（识别偶尔丢一两帧也不会闪）
    fadeMs: 120,            // 出现 / 消失的淡入淡出
    smoothingMs: 120,       // 框的位置平滑
    minSizePx: 40,          // 太小的框不算
    includeVertex: false,   // true = 长方形也算上两只手 L 的拐角，不只是拇指尖和食指尖
    outsideFade: 0.45,      // 框外变淡多少（0 = 不变，1 = 全白）
    zoomMin: 1.5,           // 框大时的放大倍数
    zoomMax: 4,             // 框小时的放大倍数
    sizeSmall: 0.15,        // 框的边长占屏幕比例 ≤ 这个时用 zoomMax
    sizeLarge: 0.6,         // ≥ 这个时用 zoomMin
    lineWidthPx: 1,         // 框线粗细
    cornerLenPx: 18,        // 四角 L 形裁切线的长度
    cornerGapPx: 6,         // 裁切线离框角的空隙
  },

  // 取景框页面 frame.html：一张鸽子很多的照片，过一阵子换下一张
  // 照片列表在 data/frame/photos.json（tools/make_frame_photos.py 生成，按记录表 bird_count 挑的）
  framePage: {
    intervalSec: 30,        // 多久换下一张（0 = 不自动换，只用 ← → 换）
    holdAfterFrameSec: 5,   // 取景框用完后再等这么久才自动换
    fadeMs: 900,            // 换照片时的交叉淡入淡出
    marginPx: 48,           // 照片四周留白
    baselineWidthPx: 1,     // 照片底下那条贯穿屏幕的细线
    everyNFrames: 1,        // 这一页只跑手，每帧都算
  },

  // ---------------------------------------------------------------- 阶段 5：声音（sound.html）
  // 照片里每只鸽子的剪影在 data/sound/photos.json（tools/segment_pigeons.py 生成）
  sound: {
    maxSeconds: 5,          // 一段录音最长几秒
    askForWords: false,     // false = 录完直接保存；true = 录完先写「什么动物 / 怎么叫」再保存
    consentText: 'Your voice will stay here. Others will hear it.',
    recordHint: 'Hold space to leave a sound for this pigeon.',
    animalPlaceholder: 'what animal?  pigeon / squirrel / sparrow',
    textPlaceholder: 'how does it sound?  coo coo / chirp',
    ambientCount: 2,        // 翻到一张照片时随机放几段已有的声音
    ambientVolume: 0.25,    // 那几段的音量（0–1）
    ambientDelayMs: 600,    // 翻过来后多久开始放
    dimOthers: 0.5,         // 高亮一只鸽子时，照片其余部分变淡多少
    outlinePx: 1,           // 高亮的鸽子描一圈细黑线（0 = 不描）
    hitPaddingPx: 10,       // 小鸽子不好点：方框往外扩这么多也算点中
    marginPx: 48,           // 照片四周留白
    labelColumnPx: 260,     // 照片右边留给 label 的宽度
    labelGapPx: 28,         // label 离照片右边的距离
    labelPx: 11,            // label 字号（等宽）
    promptPx: 12,           // 底部提示字号
    bottomPx: 30,           // 录音时那条起伏的线离屏幕底边的距离
    levelGain: 6,           // 音量放大多少（线起伏太小就调大）
    levelHeightPx: 24,      // 线起伏的最大高度
    inputWidthPx: 200,
    fadeMs: 500,            // 换照片时淡入
  },

  // 调试：D 显示 / 隐藏；显示时只有左上角摄像头小窗，点一下展开详细信息（英文）
  debug: {
    show: true,
    cameraWidth: 240,     // 摄像头小窗宽度（px）
  },

  text: {
    // 文字先全部隐藏（校准提示除外），之后想好怎么显示再打开
    showCaptions: false,
    showNumbers: false,
    showHint: false,
    showRulerLabels: true,  // 两边刻度上的数据（英尺、组号、当前高度）
    hint: 'Pretend you’re looking at a pigeon.',
    hintSizePt: 7,        // 按书的 pt 计，会跟着版面缩放
    useRawCaptions: false, // true = 图注带书里残留的 “lorimer_2026-03_01.jpg”
  },

  fonts: {
    regular: '"TWK Everett", "Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: '"TWK Everett Mono", "SF Mono", Menlo, Consolas, monospace',
    monoLight: '"TWK Everett Mono Light", "TWK Everett Mono", "SF Mono", Menlo, Consolas, monospace', // 刻度用
  },
};
