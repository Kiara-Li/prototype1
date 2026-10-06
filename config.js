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
    show: true,
    fill: '#f0f0f0',      // 实心浅灰
    accent: '#e4e4e4',    // 雨棚、窗台、信号灯头等稍深一点
    line: '#d4d4d4',      // 消防梯、树枝这类细线
    ground: '#f6f6f6',    // 0′ 以下的地面
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
