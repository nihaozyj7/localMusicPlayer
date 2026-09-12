# 音乐播放器

本地音乐播放器 · **Go + Wails3** · 原生 HTML/CSS/JS（无前端框架、无构建步骤）

当前阶段：**界面与样式设计已完成**，可在浏览器里直接预览与评审；后端（扫描 / 监听 / 元数据 / 播放）按 `docs/03-技术方案.md` 实现。

---

## 快速预览界面

```powershell
node tools/dev-server.js 5173
# 浏览器打开 http://127.0.0.1:5173/
```

预览用假数据渲染，不需要 Go 环境。改 CSS / JS 后刷新页面即可，无需编译。

### 用 URL 参数定格任意界面状态

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `theme` | 指定主题 | `?theme=light-minimal` |
| `tab` | 主界面选项卡 | `?tab=queue` / `?tab=playlist` / `?tab=settings` |
| `view` + `pv` | 直接打开播放界面并指定样式 | `?view=player&pv=immersive` |
| `playing` / `pos` | 定格在播放中的某一秒 | `?playing=1&pos=62000` |
| `query` | 预置搜索词 | `?query=陈默` |
| `probe` | 输出界面自检报告（见下） | `?probe=1` |

---

## 界面自检（无头浏览器）

两套工具，都不需要额外依赖（用系统自带 Edge）：

```powershell
# 1) 逐场景检查：console 报错 + 布局体检（固定区域尺寸、横向溢出、对比度、毛玻璃是否生效）
node tools/cdp-check.js

# 2) 批量截图到 docs/screenshots（用于设计评审）
& .\tools\screenshots.ps1
```

`cdp-check.js` 当前覆盖 12 个场景（深/浅主题、队列、歌单、设置、播放界面三种样式、封面取色主题、搜索、扫描遮罩），全部通过为退出码 0。

---

## 目录结构

```
docs/                        需求原文、界面设计方案、技术方案、截图
frontend/src/
  index.html                 唯一页面（无内联样式，图标用 SVG sprite）
  styles/
    index.css                唯一样式入口（@import 顺序固定）
    base.css                 复位 / 字体 / 滚动条 / 关键帧
    tokens.css               设计令牌默认值
    utilities.css            极少量原子类
    themes/                  ★ 一个主题一个文件，只声明令牌
      dark-minimal.css  light-minimal.css  cover-dark.css  _template.css
    components/              组件样式（只用 var(--…)，无硬编码颜色）
  js/
    main.js                  入口与装配、快捷键、预览参数
    bridge.js                前端 ↔ Go 桥（浏览器下自动降级假数据）
    store.js                 状态 + 过滤引擎 + 持久化
    shell.js                 侧边栏 / 头部工具条 / 内容区路由
    tracks.js                曲目表格（爱心、右键菜单、拖拽排序）
    playerbar.js             底部常驻播放控件
    playerview.js            播放界面 经典 / 沉浸 / 简约
    settings.js              设置界面
    theme.js / runtime-tokens.js  主题解析与运行时令牌覆盖
    slider.js dom.js playlists.js utils.js mock.js probe.js
tools/
  dev-server.js              零依赖静态预览服务器
  cdp-check.js               场景化自检（CDP）
  screenshots.ps1            批量截图
  ui-probe.ps1               探针的 PowerShell 版（备用）
```

---

## 需求实现状态

图例：✅ 界面已完成 ｜ ⏳ 需后端（Go）承接

### 设置界面
| 需求 | 状态 |
| --- | --- |
| 添加多个本地音乐路径 | ✅ 界面 ✅ 假数据 ⏳ 系统目录选择器 |
| 监听文件夹自动更新歌曲 | ⏳ fsnotify（界面开关已就绪，扫描按钮已可用） |
| 按文件大小过滤 | ✅ 规则编辑 + 实时预览统计（前端引擎已实现，后端需同语义） |
| 按正则表达式过滤 | ✅ 同上，非法正则会标红提示 |
| 深色 / 浅色主题 | ✅ 三套内置主题 + 跟随系统 |
| 毛玻璃拟态风格 | ✅ 令牌化（模糊半径、透明度、边框高光、阴影） |
| 布局固定、样式全在 CSS | ✅ HTML 零内联样式，组件 CSS 只用令牌 |
| 用户自行添加主题 CSS | ✅ 复制 `themes/_template.css` 改名即用（后端可自动扫描注入） |

### 主界面
| 需求 | 状态 |
| --- | --- |
| [所有歌曲] 列表 | ✅ |
| [所有歌曲] 重新扫描按钮 | ✅ 界面与流程（含扫描遮罩、结果 Toast） |
| [播放列表] 显示当前播放队列 | ✅ |
| [播放列表] 拖拽排序 | ✅ |
| [播放列表] 移除歌曲 | ✅ |
| [歌单] 默认「我喜欢」不可删除 | ✅ 无删除入口 |
| [所有歌曲] 每首歌爱心按钮 | ✅ 状态回显 + 可取消 |
| [歌单] 用户创建自定义歌单 | ✅ 新建 / 重命名 / 删除 / 侧边栏拖拽排序 |
| 底部常驻播放控件 | ✅ 封面、进度条（可拖+时间气泡）、音量、上一曲/下一曲、播放暂停、循环方式、歌词开关、全屏 |

### 播放界面
| 需求 | 状态 |
| --- | --- |
| 三种样式可切换 | ✅ 经典 / 沉浸 / 简约 |
| [经典] 圆形旋转唱片 + 右侧歌词 | ✅ 暂停时停止旋转 |
| [沉浸] 封面铺满 + 毛玻璃 + 中间歌词 | ✅ |
| [简约] 无封面 + 中间歌词 | ✅ |
| 下方常驻播放控件 | ✅ 与主界面共用同一个控件 |

### 尚未实现（等后端）
音频解码与播放、元数据（封面/时长）、文件夹监听、歌词文件读取、主题目录自动扫描、配置落盘。

---

## 设计约束（改代码时请遵守）

1. **HTML 里不写样式**：不加 `style="…"`、不加 `<style>` 内容；类名走 `styles/components/`。
2. **组件 CSS 不写颜色字面量**：一律 `var(--token)`，颜色只在 `tokens.css` 与 `themes/*.css` 出现。
3. **主题文件只声明令牌**：写选择器/组件样式会破坏「布局固定」这一需求。
4. **布局关键尺寸全部令牌化**：`--h-titlebar` / `--w-sidebar` / `--h-playerbar` / `--h-header` / `--row-h`。
5. **动态样式用 CSSOM**：运行时改主题相关变量请用 `runtime-tokens.js` 的 `setRuntimeToken()`，不要直接写 `element.style.setProperty("--x", …)`（会被 CSP 判为内联样式）。

---

## 下一步

1. 你确认界面与样式（见 `docs/screenshots/`）。
2. 按 `docs/03-技术方案.md` 生成 Wails3 脚手架并实现 `backend/`。
3. 打通 `bridge.js` 里的方法签名，删除 `mock.js`。
