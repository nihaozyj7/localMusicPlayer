# plugins/ — 自开发的第三方主题与播放器样式

这个目录放**自己写的第三方主题与播放界面样式包**。它与播放器项目源码**解耦**：
这里的代码不参与项目的 lint / typecheck / 单测门禁（见根目录 `eslint.config.js`
与 `.prettierignore` 里的 `plugins/`），自检脚本也放在各自的目录里。

```
plugins/
├── build-index.mjs            生成器：扫描下面两个目录，写出各自的 index.json
├── theme/                     主题（只声明设计令牌的 CSS）
│   ├── README.md              主题开发说明 + 令牌契约
│   ├── index.json             生成物：客户端「从仓库获取」读它
│   ├── glass-dark.css         玻璃拟态 · 深色
│   ├── glass-light.css        玻璃拟态 · 浅色
│   ├── vibrant-dark.css       活力满满 · 深色
│   └── vibrant-light.css      活力满满 · 浅色
└── style/                     播放界面样式包（皮肤，契约 v3）
    ├── README.md              样式包开发说明
    ├── pending-designs.md     待设计清单 + 签收台账（六款第三方样式）
    ├── index.json             生成物：客户端「从仓库获取」读它
    └── magic-circle/          魔法阵歌词舞台
        ├── skin.json          清单（id / 版本 / 能力 / 配色声明）
        ├── skin.js            入口（零裸包名 import）
        ├── skin.css           样式（由宿主包进 @layer skin + @scope）
        ├── assets/  lib/      资源与子模块
        └── tests/             这份样式包自己的自检（纯逻辑 + 画布像素）
```

## 主题与样式包的区别

| | 主题（theme） | 样式包（style） |
| :--- | :--- | :--- |
| 改什么 | 整套界面的**观感**（颜色 / 材质 / 圆角） | **播放详情页**这一块舞台的全部渲染 |
| 形态 | 一个只声明 `--token` 的 `.css` | `skin.json` + `skin.js` + `skin.css` + `assets/` |
| 安装到 | `%APPDATA%\LocalMusicPlayer\themes\` | `%APPDATA%\LocalMusicPlayer\player-skins\<id>\` |
| 入口 | 设置 → 外观 → 主题 | 设置 → 播放界面样式 |
| 契约 | `frontend/src/styles/tokens.css` 的令牌清单 | `frontend/packages/player-skins/`（v3） |

一句话：**主题改「长什么样」，样式包改「播放页怎么画」**。两者可以同时生效
（样式包自己画的那块舞台之外，宿主壳的颜色仍然由主题决定）。

## 安装

### 主题

把 `theme/*.css` 拷进主题目录，然后在设置里点「重新扫描」：

```powershell
Copy-Item plugins\theme\*.css "$env:APPDATA\LocalMusicPlayer\themes\" -Force
```

也可以在设置 → 外观里点「导入主题」，直接选中 `plugins/theme` 目录（同名文件会被拒绝覆盖，
想更新就先把旧的删掉或直接拷贝）。

### 样式包

把整个样式包目录拷进样式目录，然后在设置里点「重新扫描样式」：

```powershell
Copy-Item plugins\style\magic-circle "$env:APPDATA\LocalMusicPlayer\player-skins\" -Recurse -Force
```

也可以在设置里点「导入样式」，直接选中 `plugins/style/magic-circle` 这个目录。

> 播放器**不会**读取 `plugins/` 这个目录本身，它只认上面两个数据目录。
> `plugins/` 是**源码管理位置**：改这里 → 拷过去 → 重新扫描。

### 在播放器里直接获取（推荐）

设置里点「添加自定义主题」/「添加播放界面样式」会打开一个两页的弹层：

| 页 | 做什么 |
| :--- | :--- |
| **从仓库获取** | 从 `plugins/` 的在线地址拉清单，列出全部主题 / 样式包，点一下就装好（已装的会标「已安装」，远端版本更高时按钮变成「更新」）。这一页左上角能看当前仓库地址，点「修改」可以改成自己的 fork、镜像或本地 HTTP 服务。 |
| **从本地导入** | 原来的用法：复制 AI 提示词去生成，或者选一个本地目录导入。 |

仓库地址默认是本项目的 `plugins/` 目录（`<repo>/main/plugins`），可以在设置里改；
改完会落盘，重启仍然生效。清单和文件都走 https，装了哪些、装到哪由后端决定
（主题 → `themes/`，样式包 → `player-skins/<id>/`）；覆盖已有文件前会先备份成 `.bak`。

## `index.json` 与生成器

客户端只读 `plugins/theme/index.json` 与 `plugins/style/index.json`，**不列举目录**
（raw 静态托管没有目录列表接口）。所以每加 / 删 / 改一个插件，都要重新生成一次清单：

```powershell
node plugins/build-index.mjs           # 重新生成两份 index.json
node plugins/build-index.mjs --check   # 只校验：和磁盘不一致就退出码 1（等价 npm run check:plugins）
```

生成器的行为：

- **确定性**：按 id 排序、不写时间戳，同样的磁盘内容永远产出同样的字节（diff 才干净）；
- **跳过**：`tests/ node_modules/ .git/ __pycache__/` 等目录，`index.json .DS_Store Thumbs.db desktop.ini`
  等文件，以及 `.bak .log .tmp .orig .rej` 后缀 —— 别把临时文件传上去；
- **条目字段**：`id` / `name` / `version` / `author` / `description`（主题另有 `mode` 与 `swatch`，
  样式包另有 `dir` 与 `apiVersion`），`files[]` 里每个文件带 `path` + `size` + `sha256`；
- `files[].path` 相对**该目录**写（`glass-dark.css`、`magic-circle/skin.js`），
  所以下载地址只有一条规则：`<仓库地址>/<theme|style>/<path>`。

> `sha256` **不是**安全边界（清单和文件来自同一个仓库）—— 它是防呆：清单过期了、
> 或者传输被截断了，客户端会直接报错，而不是把半个文件装进去。真正的落盘是
> 「全部校验通过 → 才写」，下载中途失败不会留下任何一个字节。

版本号来自 `skin.json` 的 `version`（主题写在 `@theme-version` 头里）。
`version` 变了，客户端才会把按钮显示成「更新」。

## 自检

主题与样式包各自带自己的自检，**不需要**项目的测试框架：

```powershell
# 魔法阵样式包的纯逻辑单测（零依赖）
node --test "plugins/style/magic-circle/tests/*.test.js"

# 魔法阵样式包的画布像素自检（自己起静态服务 + 无头 Edge，不用先跑 npm run dev）
node plugins/style/magic-circle/tests/canvas-word-check.mjs
```

## 新增一个插件

1. 主题：复制 `frontend/src/styles/themes/_template.css`（那是令牌的完整清单）
   到 `plugins/theme/<新名字>.css`，把 `data-theme` 与 `@theme-name` 改成新名字即可。
2. 样式包：复制 `internal/skins/template/`（示例包 + 《皮肤说明.md》）到
   `plugins/style/<新名字>/`。契约的唯一定义在 `frontend/packages/player-skins/contract.js`。
3. **最后一定要跑一次 `node plugins/build-index.mjs`**，否则客户端「从仓库获取」里
   看不到这个新插件（`--check` 会告诉你清单已经过期）。
