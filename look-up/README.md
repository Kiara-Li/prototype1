# Look Up（抬头）

Prototype I 的新版本，建立在鸽子视线网站上。旧页面（Sightline / Viewfinder / Sound）不动。
说明见 [`抬头_brief.md`](抬头_brief.md)。旧版本存档在 git 标签 `prototype1-v1`。

## 打开

在项目根目录（`鸽子视线实验/`）运行：

```bash
python3 -m http.server 8000
```

- <http://localhost:8000/look-up/>：入口
- <http://localhost:8000/look-up/tools/mark.html>：标注工具

## 阶段 A：标注工具 `tools/mark.html`

一张一张给照片里的鸽子描轮廓、点脖子。

| 操作 | 作用 |
|---|---|
| 点虚线轮廓 | 采用这条建议轮廓（YOLO 先找的），然后点脖子 |
| 在照片上点 | 一个点一个点描轮廓；`Enter` 或点回第一个点闭合；然后点脖子 |
| `⌫` | 撤销上一个点 |
| `Esc` | 取消正在描的轮廓 / 跳过点脖子 |
| 点已有的鸽子 | 选中；`Delete` 删除，`K` 重新点脖子 |
| `D` | 这张照片标完了（没有鸽子也按 `D`，表示「这张没有」） |
| `←` `→` / `N` | 上一张、下一张 / 下一张还没标完的 |
| `S` | 显示 / 隐藏建议轮廓 |
| 滚轮 / 按住 `Alt` 拖动 / `0` | 放大 / 平移 / 回到全图 |

**保存**：每次改动都自动存在这个浏览器里，关掉再开还在。
要变成项目里的文件：点右上角 **Save file**，第一次选 `look-up/data/pigeons.json`，之后每次点都直接覆盖那个文件（Chrome）。
**Download** 下载一份，**Import** 读回来，**Load data/** 用 `look-up/data/pigeons.json` 覆盖浏览器里的。

## 文件

```
look-up/
  index.html              入口（阶段 B 开始换成真正的网站）
  content.js              所有文字和作品名字（改名只改这里）
  assets/                 开场动画的两只手（已修掉指尖毛边）
  data/photos.json        只留 Kiara 自己拍的照片（73 张），按高度排；图片直接引用 ../data/img/
  data/photos_report.md   过滤结果清单
  data/suggestions.json   每张照片的建议轮廓（YOLO）
  data/pigeons.json       标注结果（标注工具 Save file 写到这里）
  tools/build_photos.py   从 data/groups.json 过滤照片
  tools/suggest_pigeons.py  生成建议轮廓（pip install ultralytics）
  tools/mark.html, mark.js  标注工具
```

参考图 `refs/` 不放进仓库（是别人的作品），在 `Desktop/Thesis_网站整理/抬头_look-up/refs/`。
