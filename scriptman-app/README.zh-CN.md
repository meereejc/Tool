# ScriptMan 中文说明

ScriptMan 是一个轻量、本地优先的脚本管理桌面应用，基于 Tauri 2、
React 和 TypeScript 构建。项目当前刻意收敛在一条核心工作流上：
配置本地脚本目录、扫描可执行脚本、快速理解脚本信息，并以尽可能低的
操作成本执行脚本。

## 项目定位

- 保持应用轻量、响应快、易于本地运行
- 优先支持本地扫描、元数据读取和直接执行
- 不扩展为“大而全”的一体化平台
- 环境辅助保持轻量，只做检查和建议命令，不做自动安装

当前主线明确不包含以下方向：

- AI 自动生成脚本元数据
- AI 自动生成安装命令
- 打包、导出或分享流程
- 大而复杂的设置面板
- 复杂主题系统或多步交互框架

## 当前功能

- 首次启动时，如果保存的配置里没有 `watchPaths`，应用会进入引导页
  `OnboardingPage`
- 引导页支持添加和删除多个监听目录，并把结果保存到本地配置
- 至少保存一个监听目录后，应用会进入工作台仪表盘，并在下次启动时复用
  已保存的配置
- 仪表盘目前保留手动扫描模式，包含：
  - `Start scan` / `Scan again`
  - 已配置脚本数量
  - 待补元数据脚本数量
  - 监听路径管理
- 当前脚本工作区支持：
  - 按名称、路径、语言进行轻量筛选和排序
  - 右侧详情面板查看脚本信息
  - 参数输入
  - 运行环境检查
  - 安装建议命令
  - 运行 / 停止
  - 实时日志流
- 对于 `PendingMeta` 脚本，可以在详情面板内直接补全一个最小化的本地表单；
  保存后会把最小 `@sm` 元数据块回写到脚本头部，并刷新扫描结果

## 目录结构

```text
scriptman-app/
├── src/                # React 前端
│   ├── pages/          # 页面级视图
│   ├── components/     # 复用组件
│   ├── stores/         # 前端状态存储
│   ├── lib/            # Tauri 调用封装
│   ├── types/          # 前后端共享的数据类型
│   └── test/           # 测试初始化
├── src-tauri/          # Tauri 2 Rust 后端
│   ├── src/commands/   # 对外暴露的 Tauri 命令
│   ├── src/core/       # 扫描、执行、配置等核心逻辑
│   └── capabilities/   # Tauri 能力配置
└── README.md           # 英文说明
```

## 技术栈

- 桌面壳：Tauri 2
- 前端：React 19 + TypeScript + Vite
- 测试：Vitest + Testing Library
- 后端：Rust

## 开发命令

先进入项目目录：

```bash
cd scriptman-app
```

安装依赖：

```bash
npm install
```

只运行前端开发环境：

```bash
npm run dev
```

构建前端：

```bash
npm run build
```

运行前端测试：

```bash
npm test
```

检查 Rust 后端：

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
cargo check --manifest-path src-tauri/Cargo.toml
```

运行 Rust 测试：

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml
```

启动 Tauri 开发流程：

```bash
npm run tauri -- dev
```

## 配置与扫描规则

配置文件存放在 Tauri 应用配置目录下的 `config.json`。在当前 bundle
identifier 为 `com.scriptman.app` 的前提下，macOS 路径为：

```text
~/Library/Application Support/com.scriptman.app/config.json
```

当前配置文件应只保存与轻量化产品方向有关的非敏感设置，例如：

- `watchPaths`
- `defaultCwd`
- `scanLooseMode`

扫描行为说明：

- Rust 后端通过 `scan_directories` 提供扫描能力
- 请求显式传入 `paths` 时优先使用显式路径
- 未传入 `paths` 时，回退到已保存的 `watchPaths`
- 严格模式按照项目内定义的 Python / Shell / Node 规则筛选候选脚本
- 宽松模式会进一步按支持的扩展名兜底纳入扫描
- 返回结果包含：
  - `configuredScripts`
  - `pendingScripts`
  - `ignoredCount`
  - `errors`

## 元数据解析约束

- `@sm` 解析只读取脚本前 50 行
- 只解析第一个合法的 `@sm` 块
- 非法的单行 `@sm` 记录会被忽略，不会中断整份脚本处理

## 近期方向

- 保持启动和交互速度
- 维持当前“薄 Tauri 命令层 + Rust 核心 + 轻量 React 前端”的边界
- 后续工作以打磨和维护为主，而不是扩展成平台级模块

## 环境说明

- 在当前环境中，Rust 通过 Homebrew 的 `rustup` 安装，因此 `cargo`
  和 `rustc` 可能需要先补充：

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
```

- 在受限或沙箱环境里，`npm run tauri -- dev` 可能会因为 Vite 本地端口
  绑定失败而无法启动
