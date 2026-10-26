# Markdown Live Preview (better)

在 VS Code 编辑区里直接渲染 Markdown 的实时预览扩展。不用切换到侧边预览，正在编辑的 `.md` 文件本身就是渲染后的样子，同时保留代码补全、多光标、搜索等原生编辑能力。

GitHub 仓库地址：<https://github.com/EasyD0/MDPreview.git>

## 它能做什么?

- 编辑时实时预览 markdown 文件效果
- 在编辑区生效，无需切换为其他模式
- 和代码补全同时工作
- 通过 `settings.json` 自行配置外观

### 已支持的能力

| 类别 | 效果 |
|---|---|
| 标题 h1–h6 | 分级配色、背景色、粗体/斜体/下划线、字体；行首层级徽章（默认 `H1`…`H6`） |
| 正文 | 颜色、粗体、斜体、下划线、边框、字体 |
| 行内格式 | `**粗体**`、`*斜体*`、`***粗斜体***`、`` `行内代码` `` 就地渲染；标记符只在光标所在行显示 |
| 代码块 | 整块背景、整圈边框、隐藏围栏行（保留行号）、语言角标；起始围栏行上方有「复制代码块」CodeLens |
| 引用块 | 背景色、左侧竖条；`>` 标记自动隐藏 |
| 列表 | `-` / `*` / `+` 替换为圆点；任务列表渲染为 ☐ / ☑ |
| 分隔线 | `---` / `***` / `___` 渲染为整行横线（自动避开 setext 标题） |
| 表格 | 鼠标停留在表格任意行上时，悬停浮窗中以对齐的表格渲染，不改动源文件 |

光标（或选区）覆盖的行始终显示源码，方便直接编辑标记符；离开该行后恢复渲染效果。

## 安装

### 从扩展市场安装

在 VS Code 扩展面板搜索 **Markdown Live Preview (better)**（发布者 `ace-MS-is-shit`），或执行：

```bash
code --install-extension ace-MS-is-shit.better-md-live-preview
```

### 从本地 VSIX 安装

仓库根目录带有打包好的扩展文件：

```bash
code --install-extension better-md-live-preview-0.0.1.vsix
```

也可以在 VS Code 中执行 **Extensions: Install from VSIX...** 并选择该文件。

## 环境要求

- VS Code `^1.80.0`
- 代码块复制功能依赖 `editor.codeLens` 处于开启状态（默认开启）

## 使用

1. 打开任意 `.md` 文件，扩展在 `onLanguage:markdown` 时自动激活。
2. 正常编辑即可看到渲染效果；把光标移到某行，该行会显示原始标记符。
3. 将鼠标悬停在表格行上，浮窗中会显示对齐后的表格。
4. 点击代码块起始围栏行上方的「复制代码块」，即可把块内代码（不含围栏行）写入剪贴板。

## 如何配置 settings.json

所有外观配置都在 `settings.json` 中以 `mdLivePreview.` 开头。通用约定：

- **空字符串表示不设置**，沿用当前编辑器主题的默认值。
- 只写部分字段也可以，未写的字段回退到默认值。
- 颜色支持任意 CSS 颜色值，例如 `#569CD6`、`rgb(60, 60, 60)`、`rgba(128, 128, 128, 0.18)`。
- 字体字段（`fontFamily`）填写 CSS `font-family` 值；含空格的字体名需要加引号。

### 配置项一览

| 配置项 | 作用 |
|---|---|
| `mdLivePreview.heading` | 六级标题样式。键为 `h1`..`h6`，字段：`color`、`backgroundColor`、`bold`、`italic`、`underline`、`border`、`borderColor`、`borderWidth`、`borderStyle`、`fontFamily` |
| `mdLivePreview.headingPrefix` | 标题行首层级徽章：`enabled`、`format`（`{level}` 替换为 1–6）、`color`、`backgroundColor` |
| `mdLivePreview.body` | 正文样式，字段同标题 |
| `mdLivePreview.bold` | 粗体文本颜色（`color`）；留空则沿用主题对粗体 token 的配色 |
| `mdLivePreview.codeInline` | 行内代码样式：颜色、背景色、粗体/斜体/下划线、边框、字体 |
| `mdLivePreview.codeBlock` | 围栏代码块样式：`backgroundColor`、`border` 及其配色/线宽/线型，`underline`、`fontFamily` |
| `mdLivePreview.languageLabel` | 代码块语言角标：`enabled`、`color`（留空跟随主题） |
| `mdLivePreview.quote` | 引用块样式：颜色、背景色、下划线、边框。默认 `borderWidth` 为 `0 0 0 4px`，即左侧竖条；改成 `1px` 则为整框 |
| `mdLivePreview.list` | 列表样式：`bullet`、`bulletColor`、`todoUnchecked`、`todoChecked`、`uncheckedColor`、`checkedColor`、`todoScale` |
| `mdLivePreview.thematicBreak` | 分隔线：`color`、`width`、`style`；`color` 留空表示保留原始文本 |

### 配置示例

```json
{
  "mdLivePreview.heading": {
    "h1": {
      "color": "#ff7b72",
      "backgroundColor": "rgba(255, 123, 114, 0.10)",
      "bold": true,
      "underline": false
    },
    "h2": { "color": "#79c0ff", "backgroundColor": "" }
  },
  "mdLivePreview.headingPrefix": {
    "enabled": true,
    "format": "H{level}",
    "backgroundColor": "rgba(128, 128, 128, 0.20)"
  },
  "mdLivePreview.codeInline": {
    "color": "#DCDCAA",
    "backgroundColor": "rgb(60, 60, 60)",
    "fontFamily": "\"Cascadia Code\", monospace"
  },
  "mdLivePreview.list": {
    "bullet": "●",
    "todoChecked": "☑",
    "todoScale": "1.3"
  },
  "mdLivePreview.quote": {
    "backgroundColor": "rgba(128, 128, 128, 0.12)",
    "borderColor": "rgba(128, 128, 128, 0.55)",
    "borderWidth": "0 0 0 4px"
  }
}
```

## 已知限制

- 隐藏标记符、下划线以及颜色/背景/字体的部分覆盖，依赖 VS Code 的 `textDecoration` CSS 注入通道，属于非官方用法。未来的 VS Code 版本可能让隐藏失效（标记符重新显示），但基本样式不受影响。
- 字体选择不是官方 decoration 能力，且等宽编辑器按等宽字体估算光标位置；使用非等宽字体会出现光标错位，建议只配置等宽字体族。
- 代码块复制是 CodeLens，会占用起始围栏行上方的一行；关闭 `editor.codeLens` 后没有复制入口。
- 缩进的 4 空格代码块暂未按代码块处理。

## 后续开发计划

- 修复“复制代码块”的偏移问题
- 增加 tex 公式预览
- 增加 mermaid 图像悬浮预览

## 开发

```bash
# 安装依赖
npm install

# 单次编译（tsc strict）
npm run compile

# 监听文件变化自动编译
npm run watch
```

调试：在 VS Code 中打开本项目，按 `F5` 启动 **扩展开发主机**，在新窗口里打开任意 `.md` 文件即可。编译产物输出到 `out/`，入口为 `out/extension.js`。

### 项目结构

```
├── src/
│   ├── extension.ts    # 激活入口：事件监听、命令、CodeLens、表格 Hover
│   ├── config.ts       # 读取 mdLivePreview.* 配置并逐字段回退默认值
│   ├── render.ts       # decoration 类型工厂、逐行扫描与行内标记解析
│   ├── copy.ts         # 围栏代码块定位与内容提取
│   └── tablePreview.ts # 表格定位与悬停用的 GFM 重建
├── out/                # 编译产物（自动生成）
├── doc/                # 开发记录与规划
├── package.json        # 扩展清单与配置声明
└── tsconfig.json       # TypeScript 编译配置
```

## License

[MIT](LICENSE) © 2026 EasyD0
