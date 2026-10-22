// Look Up · 统一的输入状态。画面（main.js）只读这里；电脑端由 desktop.js 写入，手机端由 mobile.js 写入。

export const input = {
  mode: 'desktop',        // 'desktop' | 'mobile'

  // 上升 / 下降的「油门」：-1…1。画面里：目标速度 = lookValue × maxScreensPerSec × 屏幕高
  // （往下时的 downFactor 已经在各自的输入里乘过）
  lookValue: 0,

  // 放大倍数：1 = 不放大；放大时 1 … zoomMax（范围和电脑端手势一致）
  zoomValue: 1,
  // 放大的中心（屏幕坐标）
  zoomCenter: { x: 0, y: 0 },

  // 取景框：{ active, rect, alpha, … }。电脑端就是 frame.js 的状态；手机端是整个屏幕
  frame: null,
  frameMarks: true,
  wantFrame: false,       // dashboard 最后一步要检测两只手比取景框（不在上升中也要算）       // 是否画取景框的四角线（手机端不画）

  // 找鸽子看的那一点（没放大时的屏幕坐标），没在框 / 放大就是 null
  probe: null,

  // 结构色：头 / 手机左右转动多少度
  yaw: 0,

  // 滚轮之类的一次性位移（px），画面用完清零
  scrollDelta: 0,
};
