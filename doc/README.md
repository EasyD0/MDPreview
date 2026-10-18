# Markdown Live Preview (min)

一个极简的 VS Code Markdown 实时预览扩展。在编辑 Markdown 文件时提供即时预览功能。并同时保留IDE原生的代码补全能力

## 环境要求

- VS Code `^1.80.0`
- Node.js（建议 `>= 18.0.0`）
- npm

## 安装依赖

```bash
npm install
```

## 调试步骤

1. 在 VS Code 中打开本项目文件夹
2. 按 `F5` 启动调试，VS Code 会编译 TypeScript 并打开一个新的 **扩展开发主机** 窗口
3. 在扩展开发主机中打开任意 `.md` 文件，扩展会自动激活（`activationEvents: onLanguage:markdown`）
4. 在主窗口的 **调试控制台** 中可以查看扩展的日志输出

> 调试时 VS Code 会自动运行 `npm run compile` 编译源码，无需手动执行。

## 构建步骤

```bash
# 单次编译
npm run compile

# 监听文件变化自动重新编译（开发时推荐）
npm run watch
```

编译产物输出到 `out/` 目录（由 `tsconfig.json` 的 `outDir` 指定），入口文件为 `out/extension.js`。

## 发布步骤

### 方式一：本地打包（生成 VSIX 文件）

```bash
# 安装 vsce 打包工具（全局）
npm install -g @vscode/vsce

# 打包生成 .vsix 文件
vsce package
```

生成的 `.vsix` 文件可以通过 VS Code 的 "Extensions: Install from VSIX..." 命令安装，或者用命令行安装：

```bash
code --install-extension md-live-preview-min-0.0.1.vsix
```

### 方式二：发布到 Visual Studio Marketplace

```bash
# 登录 Azure DevOps（需要有发布者账号）
vsce create-publisher <your-publisher-name>
vsce login <your-publisher-name>

# 发布
vsce publish
```

也可以通过 `vsce publish patch` / `vsce publish minor` / `vsce publish major` 自动升级版本号并发布。

## 项目结构

```
├── src/
│   └── extension.ts      # 扩展源码（待创建）
├── out/                   # 编译产物（自动生成）
├── package.json           # 扩展清单与依赖
├── tsconfig.json          # TypeScript 编译配置
└── README.md
```
