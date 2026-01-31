# AI 讨论竞技场 (AI Discussion Arena)

一个基于多 AI 模型的结构化讨论平台，支持多角色辩论、裁判协调和置信度评分。

## 功能特点

- **多角色讨论**：支持主持人（用户）、嘉宾（AI 模型）、裁判（AI 模型）三种角色
- **多模型支持**：集成 OpenAI、Gemini、Claude、DeepSeek 等主流大语言模型
- **置信度评分**：裁判为每个观点和假设评定 0-1 的置信度分数
- **本地存储**：使用 SQLite 数据库，所有数据存储在本地
- **无需登录**：单机版本，开箱即用

## 系统要求

- Node.js 18.0.0 或更高版本
- npm 或 pnpm 包管理器
- Git（用于克隆仓库）

## 快速安装

### 方式一：一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/Drlucaslu/ai-discussion-arena/main/install.sh | bash
```

### 方式二：手动安装

```bash
# 1. 克隆仓库
git clone https://github.com/Drlucaslu/ai-discussion-arena.git
cd ai-discussion-arena

# 2. 安装依赖
pnpm install
# 或使用 npm
npm install

# 3. 构建项目
pnpm run build
# 或使用 npm
npm run build
```

## 使用方法

### 启动服务

```bash
./start.sh
```

服务启动后，在浏览器中访问：`http://localhost:7788`

### 停止服务

```bash
./stop.sh
```

### 开发模式

```bash
pnpm run dev
# 或
npm run dev
```

## 配置 API Key

1. 启动服务后，访问 `http://localhost:7788`
2. 点击右上角的"设置"按钮
3. 在"模型配置"选项卡中添加您的 API Key
4. 支持的模型提供商：
   - OpenAI (GPT-4, GPT-4o, GPT-3.5-turbo)
   - Google Gemini (gemini-pro, gemini-1.5-pro)
   - Anthropic Claude (claude-3-opus, claude-3-sonnet)
   - DeepSeek (deepseek-chat, deepseek-coder)

## 目录结构

```
ai-discussion-arena/
├── client/                 # 前端代码
├── server/                 # 后端代码
├── drizzle/                # 数据库 schema
├── data/                   # 本地数据目录
│   ├── arena.db           # SQLite 数据库
│   └── server.log         # 服务日志
├── install.sh             # 安装脚本
├── start.sh               # 启动脚本
├── stop.sh                # 停止脚本
└── README.md              # 本文件
```

## 讨论流程

1. **创建讨论**：点击"新建讨论"，输入讨论标题和问题
2. **选择嘉宾**：选择参与讨论的 AI 模型（最多 4 个）
3. **选择裁判**：选择负责协调和裁决的 AI 模型
4. **开始讨论**：点击"开始讨论"，AI 嘉宾将依次发表观点
5. **裁判协调**：裁判会引导讨论、请求证据、评估共识
6. **最终裁决**：当达成共识或讨论充分后，裁判给出最终结论和置信度评分

## 高级配置

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 7788 | 服务端口 |
| NODE_ENV | production | 运行环境 |

### 自定义端口

```bash
PORT=8080 ./start.sh
```

## 常见问题

### Q: 如何备份数据？

A: 所有数据存储在 `data/arena.db` 文件中，直接复制该文件即可备份。

### Q: 如何重置所有数据？

A: 删除 `data/arena.db` 文件，重启服务后会自动创建新的数据库。

### Q: API Key 存储安全吗？

A: API Key 存储在本地 SQLite 数据库中，不会上传到任何服务器。请确保您的计算机安全。

## 技术栈

- **前端**：React 19 + TypeScript + Tailwind CSS
- **后端**：Express + tRPC
- **数据库**：SQLite (better-sqlite3)
- **构建工具**：Vite + esbuild

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题，请提交 GitHub Issue。
