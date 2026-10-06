// 背景里的街道立面（试验，config.js 里 elevation.show 可以关掉）
//
// 按右边刻度的同一比例画：1 英尺 = 12.35pt，0′ 对着地面那组的基线。
// 每样东西对应右边一个标注高度，依据是记录表里的规范 / 估算：
//   1′-6″  公园长椅座面 18″（NYC Zoning Resolution §37-741）
//   6′-8″  门洞（标准门高 80″ —— 记录表里没有，是推测，待确认）
//   12′-0″ 首层玻璃雨棚 / 店招（记录表 144–150″）；Type B 路灯 12′6″（NYC Parks 标准材料表）
//   15′-0″ 二楼窗台、消防梯第一层平台（记录表 180″）
//   20′-0″ 行道树枝（记录表 240″）、信号灯悬臂
//   50′-0″ 楼的檐口（记录表 600″，4 Irving Pl 下部檐口）
// x 也用英尺，0 = 屏幕中线，正数向右。

export function drawElevation(ctx, L, W, H, cover, E) {
  const ppf = cover.feet_scale.pt_per_foot;
  const zeroY = cover.feet_scale.zero_y;
  const s = L.s;
  const cx = W / 2;
  const X = (ft) => cx + ft * ppf * s;
  const Y = (ft) => L.oy + (zeroY - ft * ppf) * s;
  const lw = Math.max(0.5, 0.5 * s);

  const rect = (x0, y0, x1, y1, color = E.fill) => {
    ctx.fillStyle = color;
    ctx.fillRect(X(Math.min(x0, x1)), Y(Math.max(y0, y1)), Math.abs(X(x1) - X(x0)), Math.abs(Y(y1) - Y(y0)));
  };
  const line = (pts, color = E.line) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
  };
  const hole = (x0, y0, x1, y1) => rect(x0, y0, x1, y1, E.background);

  ctx.save();

  // ---- 地面（0′ 以下）
  rect(-200, 0, 200, -20, E.ground);

  // ---- 楼：28′ 宽，檐口顶 50′
  const bx0 = -14;
  const bx1 = 14;
  rect(bx0, 0, bx1, 48);
  rect(bx0 - 1, 48, bx1 + 1, 50);                       // 檐口
  // 首层店面 0–11′：两扇橱窗 + 门（6′-8″）
  hole(-12, 1.5, -3.5, 10);
  hole(3.5, 1.5, 12, 10);
  hole(-1.5, 0, 1.5, 6 + 8 / 12);                        // 6′-8″
  // 玻璃雨棚 12′：一条薄板挑出立面
  rect(-13, 12, 13, 12.35, E.accent);
  // 楼上：窗台 15′、24′、33′、42′，窗 3′ × 5′6″
  for (const sill of [15, 24, 33, 42]) {
    for (const wx of [-11.5, -6.5, 1.5, 6.5]) hole(wx, sill, wx + 3, sill + 5.5);
    rect(-12, sill - 0.25, -2.5, sill, E.accent);        // 窗台石
  }
  // 消防梯（右半边）：平台在 15′、24′、33′、42′，栏杆 3′ 高，平台间斜梯
  const fx0 = 0.5;
  const fx1 = 11;
  const levels = [15, 24, 33, 42];
  levels.forEach((y, i) => {
    line([[fx0, y], [fx1, y]]);
    line([[fx0, y + 3], [fx1, y + 3]]);
    for (let x = fx0; x <= fx1 + 0.01; x += 1.75) line([[x, y], [x, y + 3]]);
    if (i < levels.length - 1) line([[fx0 + 1, y], [fx1 - 1, levels[i + 1]]]);
  });
  line([[fx1 - 1, 15], [fx1 - 1, 8]]);                   // 落地吊梯

  // ---- 左边：长椅（座面 1′-6″）+ 行道树（枝 20′）
  const bench = -42;
  rect(bench, 1.5, bench + 6, 1.75);                     // 座面
  rect(bench + 0.1, 2.3, bench + 5.9, 2.85);             // 靠背
  rect(bench + 0.3, 0, bench + 0.55, 2.85);
  rect(bench + 5.45, 0, bench + 5.7, 2.85);
  const tree = -32;
  rect(tree - 0.5, 0, tree + 0.5, 12);                   // 树干
  line([[tree, 12], [tree - 6, 20], [tree - 9, 20.5]]);  // 20′ 的枝
  line([[tree, 14], [tree + 5, 21]]);
  ctx.fillStyle = E.fill;
  ctx.beginPath();
  ctx.ellipse(X(tree), Y(22), 8 * ppf * s, 9 * ppf * s, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(tree - 2.5, 0, tree + 2.5, 0.25, E.accent);       // 树池

  // ---- 右边：Type B 路灯（12′6″）+ 信号灯悬臂（20′）
  const lamp = 30;
  rect(lamp - 0.5, 0, lamp + 0.5, 1.5);                  // 灯座
  rect(lamp - 0.2, 1.5, lamp + 0.2, 10.5);               // 灯杆
  rect(lamp - 0.8, 10.5, lamp + 0.8, 12 + 0.5);          // 灯笼，顶 12′6″
  const sig = 44;
  rect(sig - 0.35, 0, sig + 0.35, 22);                   // 立杆
  rect(sig - 16, 19.8, sig, 20.1);                       // 悬臂 20′
  for (const hx of [sig - 15, sig - 8]) rect(hx - 0.6, 16.5, hx + 0.6, 19.8, E.accent); // 信号灯头

  ctx.restore();
}
