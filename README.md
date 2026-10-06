# 鸽子视线实验

把 `book.pdf` 里的 41 个跨页做成一个网页。摄像头读你的头抬得多高，网页就翻到书里对应高度的那一组。

## 打开

摄像头和读取本地 JSON 都需要本地服务器。在这个文件夹里运行：

```bash
python3 -m http.server 8000
```

然后用 Chrome 打开 <http://localhost:8000>。允许使用摄像头。

- `http://localhost:8000/frame.html`：**取景框页面**（单独试手势）：一张鸽子很多的照片，两只手比 L 形框住放大看，30 秒换下一张
- `http://localhost:8000/sound.html`：**声音页面**：照片里的每只鸽子都能点，点一只给它留一段叫声
- `http://localhost:8000/?debug`：一打开就展开详细调试信息
- `http://localhost:8000/stage1_preview.html`：41 组全部排出来的核对页

第一次打开会从网上下载 MediaPipe、人脸模型和手部模型，大约 21MB，需要联网。

## 按键

| 键 | 作用 |
|---|---|
| `D` | 显示 / 隐藏左上角的摄像头小窗。**点小窗**展开详细信息（英文：角度、高度、当前组、校准、每组在轴上的位置），再点收起 |
| `F` | 全屏 |
| `C` | 校准。第一步「平视前方」，记下 0°；第二步「尽量抬头」，记下最大值（`Esc` 跳过）。如果抬头读出来是负数，会自动翻转方向。校准结果存在浏览器里，刷新后还在。 |
| `G` | 切换角度 → 高度的算法：对照表 / 几何（60 + 240 × tan） |
| `↑` `↓` | 手动模拟抬头、低头，每次 2°。没有摄像头时也能看效果 |
| `M` | 退出手动模拟，回到摄像头 |

取景框页面 `frame.html`：

| 键 | 作用 |
|---|---|
| 两只手比 L 形 | 取景框：框外变淡，框里放大看；框越小放得越大 |
| 两只手大致框住 + 眯一只眼 | 也能打开取景框（手不用比得很标准）；框出现后眼睛可以睁开 |
| `Shift` + 鼠标拖动 | 手动画一个取景框（没有摄像头或调参数时用），`Shift` + 单击或 `Esc` 去掉 |
| `→` / `←` | 换下一张 / 上一张照片 |
| `D` / `F` | 摄像头小窗（点开看手的判定）/ 全屏 |

声音页面 `sound.html`：

| 键 | 作用 |
|---|---|
| 鼠标移到鸽子上 | 这只鸽子高亮（照片其余部分变淡） |
| 点一只鸽子 | 选中它，并播放它已有的声音；点右边的 label 只播那一段 |
| 按住 `空格` | 给选中的鸽子录音，松开就自动保存，最长 5 秒。第一次录之前会先出现同意说明，按 `Enter` 同意 |
| 保存后 | 右边出现这一段的 label：这只鸽子的第几段 + 时长，例如 `01   2.4″`，用细线连到鸽子 |
| `←` / `→` | 换照片（翻过来时会随机、轻声地放一两段这张照片里已有的声音） |
| `E` / `I` | 导出全部声音（一个 JSON，音频是 base64）/ 导入。每天备份一次 |
| `X` | 清空全部声音（会再问一次，按 `Y` 才删） |
| `D` / `F` | 显示所有鸽子的剪影和编号（检查抠得对不对）/ 全屏 |

声音存在这台电脑的浏览器里（IndexedDB），换浏览器或清除网站数据就没了，所以要经常按 `E` 导出。

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
- `elevation`：背景里的街道立面（试验，现在隐藏着），`show: true` 打开；颜色也在这里调
- `layout.baselineFullWidth`：基线是否贯穿整个屏幕
- `framePage`：取景框页面。`intervalSec` 多久换下一张（0 = 不自动换），`holdAfterFrameSec` 用完取景框后多久才换，`fadeMs` 换图的淡入淡出
- `sound.askForWords`：`true` 时录完先写「什么动物 / 叫声怎么写」再保存，label 变成 `pigeon — 咕咕`（现在关着）
- `sound`：声音页面。录音最长秒数、同意说明和提示的文字、翻页时自动播放几段和音量、高亮时其余部分变淡多少、label 字号和位置
- `frame.trigger`：怎样打开取景框。`'either'`（默认）= 手比得标准，或者手大致框住 + 眯一只眼；`'wink'` = 必须眯一只眼；`'hands'` = 只看手。`frame.eye` 是眯眼的阈值
- `frame`：取景框手势（两个页面共用）。`onMainPage: true` 可以在主页面上也开取景框。`lShape` 里是 L 形的判定阈值（拇指 / 食指伸直程度、其余手指弯曲、夹角 60°–120°）；`onMs` / `offMs` 出现和消失的延迟；`outsideFade` 框外变淡多少；`zoomMin` / `zoomMax` 放大倍数范围；`everyNFrames` 手部每几帧算一次（卡就调大）

## 文件

```
index.html            页面
sketch.js             p5.js 画面 + MediaPipe 头部追踪
config.js             可调参数
elevation.js          背景街道立面（长椅、门、雨棚、窗台、消防梯、路灯、树、信号灯、檐口）
frame.html            取景框页面
frame-sketch.js       取景框页面的画面 + 手部识别
frame.js              取景框手势：L 形判定、取景框位置、放大倍数、框线（两个页面共用）
data/frame/           取景框页面用的照片 + photos.json（换照片改这里）
sound.html            声音页面
sound-sketch.js       声音页面：高亮、选中、录音、写下来、label、播放
sound-store.js        声音存储（IndexedDB）、导出、导入
data/sound/           声音页面用的照片 + photos.json（每只鸽子的剪影）
fonts/                TWK Everett Regular / Mono Regular / Mono Light（换字体就替换这里的文件）
data/groups.json      从书里拆出的 41 组：每张图的位置、大小、图注、基线、高度
data/cover.json       封面勒口上的刻度（从 bookcover.pdf 取出）
data/img/             网页用的图：找得到原图的用原图重切，找不到的用书里的版本
data/img_pdf/         书里原样切出来的低清版本（对照用）
data/stage1_report.md 阶段 1 核对清单
tools/extract_book.py 从 book.pdf 重新生成 data/（pip install pymupdf pillow numpy opencv-python-headless）
tools/originals.py    书里的图去原图文件夹里找对应的照片（图像比对）
tools/extract_cover.py 从 bookcover.pdf 取刻度
tools/make_frame_photos.py 按记录表 bird_count 挑鸽子最多的 8 张照片给取景框页面
tools/segment_pigeons.py  给声音页面的照片抠鸽子剪影（YOLO 分割，离线跑一次；pip install ultralytics）
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

## 取景框（阶段 4）怎么试

打开 `http://localhost:8000/frame.html`。

1. 站在电脑前，两只手各比一个 L，一只正一只反，合成一个长方形。手比得够标准（拇指食指大致成角、其余手指弯）就行；比得不标准时，**再眯起一只眼**也可以，像从取景器里看一样。
2. 保持约 0.3 秒，屏幕上出现取景框：细黑线 + 四角 L 形裁切线。框外变淡，框里放大。
3. 手往前伸（框变小）放得更大，最多 4×；手往回收（框变大）放得小一点，最少 1.5×。
4. 手放下约 0.3 秒后取景框消失。
5. 照片每 30 秒换一张；正在用取景框时不换，用完再等 5 秒。
6. 识别不准时按 `D`，点开摄像头小窗：手的骨架实线 = 判定为 L，虚线 = 不是；面板里 `Hands` 一行是每只手的判定和拇指 / 食指夹角，`Eyes` 一行是两只眼的闭合程度（0 睁 – 1 闭，眯一只眼时显示 `wink`），`Frame` 一行是取景框是否生效和当前倍数。阈值在 `config.js` 的 `frame.lShape` 里调。

## 还没做 / 待确认

- **声音页面和视线、取景框还没连起来**：brief 里写的「声音挂在当前那一组」「取景框框住 label 就播放」，现在改成了挂在照片里的某只鸽子上，在单独的页面。

- **组 81（飞行）的高度**：那张图几乎全是天空，找不到原图，暂用 960″，在 `config.js` 的 `heightOverrides` 里改。（组 79 旗杆已经通过图像比对确认是 540″。）
- **图片清晰度**：118 张里 64 张已换成原图重切。你拍的照片里有 10 张没找到原图（列在 `data/extract_issues.txt`），历史照片没有原图，这些用的都是书里的低清版本。
- **背景立面里的门（6′-8″）**：记录表里没有 6′-8″ 的构件，按标准门高画的，是推测。
- 其他待确认项见 `data/stage1_report.md`。
