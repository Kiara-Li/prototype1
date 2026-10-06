# 鸽子视线实验

把 `book.pdf` 里的 41 个跨页做成一个网页。摄像头读你的头抬得多高，网页就翻到书里对应高度的那一组。

## 打开

摄像头和读取本地 JSON 都需要本地服务器。在这个文件夹里运行：

```bash
python3 -m http.server 8000
```

然后用 Chrome 打开 <http://localhost:8000>。允许使用摄像头。

- `http://localhost:8000/?debug`：一打开就展开详细调试信息
- `http://localhost:8000/stage1_preview.html`：41 组全部排出来的核对页

第一次打开会从网上下载 MediaPipe 和人脸模型，大约 13MB，需要联网。

## 按键

| 键 | 作用 |
|---|---|
| `D` | 显示 / 隐藏左上角的摄像头小窗。**点小窗**展开详细信息（英文：角度、高度、当前组、校准、每组在轴上的位置），再点收起 |
| `F` | 全屏 |
| `C` | 校准。第一步「平视前方」，记下 0°；第二步「尽量抬头」，记下最大值（`Esc` 跳过）。如果抬头读出来是负数，会自动翻转方向。校准结果存在浏览器里，刷新后还在。 |
| `G` | 切换角度 → 高度的算法：对照表 / 几何（60 + 240 × tan） |
| `↑` `↓` | 手动模拟抬头、低头，每次 2°。没有摄像头时也能看效果 |
| `M` | 退出手动模拟，回到摄像头 |

## 调参数

所有参数都在 [`config.js`](config.js) 里，改完刷新即可：

- `pitchTable`：角度 → 高度对照表
- `heightMode`：`table` 或 `geometry`
- `tracking.smoothingMs`：平滑程度
- `selection.orderWeight`：0 = 只按高度选组，1 = 只按书的顺序
- `selection.hysteresis` / `minDwellMs`：回滞，防止在两组之间来回闪
- `animation`：基线移动速度、淡入淡出时长
- `heightOverrides`：手动指定某一组的高度
- `text.showCaptions` / `showNumbers` / `showHint` / `showRulerLabels`：图注、页码、提示语现在隐藏；刻度上的数据（`showRulerLabels`）显示
- `rulers`：两边刻度的长短、粗细、标记大小。左边是英尺尺，右边是每组基线的高度（标组号）；两边的黑色标记是你现在看的位置，跟着头部实时移动
- `elevation`：背景里的街道立面（试验），`show: false` 关掉；颜色也在这里调
- `layout.baselineFullWidth`：基线是否贯穿整个屏幕

## 文件

```
index.html            页面
sketch.js             p5.js 画面 + MediaPipe 头部追踪
config.js             可调参数
elevation.js          背景街道立面（长椅、门、雨棚、窗台、消防梯、路灯、树、信号灯、檐口）
fonts/                TWK Everett Regular / Mono Regular（换字体就替换这里的文件）
data/groups.json      从书里拆出的 41 组：每张图的位置、大小、图注、基线、高度
data/cover.json       封面勒口上的刻度（从 bookcover.pdf 取出）
data/img/             网页用的图：找得到原图的用原图重切，找不到的用书里的版本
data/img_pdf/         书里原样切出来的低清版本（对照用）
data/stage1_report.md 阶段 1 核对清单
tools/extract_book.py 从 book.pdf 重新生成 data/（pip install pymupdf pillow numpy opencv-python-headless）
tools/originals.py    书里的图去原图文件夹里找对应的照片（图像比对）
tools/extract_cover.py 从 bookcover.pdf 取刻度
stage1_preview.html   核对页
```

重新生成数据：

```bash
python3 tools/extract_book.py
python3 tools/extract_cover.py
```

`extract_book.py` 第一次运行要几分钟（要给 214 张原图算特征）。

脚本会读取 `/Users/kiara/Desktop/鸽子的照片/离地高度_整理/记录表.csv` 来对高度，只读，不改。

## 选组怎么算

1. 摄像头 → 头部俯仰角（从 FaceLandmarker 的变换矩阵算）→ 减去校准零点 → 指数平滑。
2. 角度 → 高度（英寸），用对照表或几何公式。
3. 高度 → 「轴」上的位置（0–1），用对照表反推角度后归一化。
4. 每组在轴上的位置 = 按高度算的位置 × 0.5 + 按书里顺序均分的位置 × 0.5。这样同样高度的几组（比如 0″ 有 7 组）也能按书的先后分开。
5. 选离当前位置最近的组；新组要比当前组明显更近才会切换（回滞）。

## 还没做 / 待确认

- **组 81（飞行）的高度**：那张图几乎全是天空，找不到原图，暂用 960″，在 `config.js` 的 `heightOverrides` 里改。（组 79 旗杆已经通过图像比对确认是 540″。）
- **图片清晰度**：118 张里 64 张已换成原图重切。你拍的照片里有 10 张没找到原图（列在 `data/extract_issues.txt`），历史照片没有原图，这些用的都是书里的低清版本。
- **背景立面里的门（6′-8″）**：记录表里没有 6′-8″ 的构件，按标准门高画的，是推测。
- 其他待确认项见 `data/stage1_report.md`。
