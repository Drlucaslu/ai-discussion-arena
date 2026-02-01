# AI 讨论竞技场 - 项目 TODO

## 单机开源版本改造
- [x] 移除云端数据库依赖，改用 SQLite
- [x] 移除 Manus OAuth 认证，实现单用户模式
- [x] 实现本地配置文件管理 (./data/arena.db)
- [x] 创建 install.sh 安装脚本
- [x] 创建 start.sh 启动脚本
- [x] 创建 stop.sh 停止脚本
- [x] 修改默认端口为 7788
- [x] 编写 README.md 使用说明
- [x] 测试本地安装和运行流程

## 数据库设计
- [x] 创建讨论组表 (discussions)
- [x] 创建消息表 (messages)
- [x] 创建模型配置表 (model_configs)
- [x] 创建系统设置表 (settings)

## 后端 API
- [x] 讨论组 CRUD 接口
- [x] 消息存储与查询接口
- [x] 模型配置管理接口
- [x] AI 模型调用统一接口
- [x] 讨论编排逻辑（主持人、嘉宾、裁判协调）

## 前端界面
- [x] 侧边栏 - 历史讨论列表
- [x] 控制面板 - 模型选择与配置
- [x] 控制面板 - 置信度阈值设置
- [x] 控制面板 - 动态 Agent 开关
- [x] 控制面板 - 数据读取上限配置
- [x] 聊天室 - 多角色对话界面
- [x] 聊天室 - 实时流式消息显示
- [x] 聊天室 - 置信度评分展示
- [x] 新建讨论对话框

## AI 集成
- [x] OpenAI API 集成
- [x] Gemini API 集成
- [x] Claude API 集成
- [x] DeepSeek API 集成
- [x] 统一 Agent 接口封装
- [x] 裁判角色逻辑实现
- [x] 嘉宾辩论逻辑实现

## 外部能力
- [ ] 联网搜索功能
- [ ] 企业数据 API 对接模块
- [ ] 动态 Agent SQL 查询功能

## 测试与优化
- [x] 后端单元测试
- [ ] 前端功能测试
- [ ] 性能优化

## Bug 修复
- [x] 修复外部 API Key 无效时的错误处理，添加优雅回退到内置模型
- [x] 修复前端错误显示，将原始 API 错误转换为友好提示
- [x] 实现 API Key 配置后的即时验证测试功能
- [x] 添加实时日志显示界面
- [x] 提供友好的错误提示和调试信息

## 安装脚本修复
- [x] 更新 install.sh 中的 GitHub 仓库地址为用户实际地址 (Drlucaslu/ai-discussion-arena)
- [x] 更新 README.md 中的 GitHub 仓库地址

## 依赖问题修复
- [x] 修复 @builder.io/vite-plugin-jsx-loc 与 Vite 7.x 的版本冲突（已移除该插件）
- [x] 移除 vite-plugin-manus-runtime 平台特有插件

## Claude API 修复
- [x] 修复 Claude 模型名称 claude-3-5-sonnet-20241022 返回 404 错误
- [x] 更新为最新的 Claude 4.5 模型名称 (claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-5)

## 实时日志模块
- [x] 在讨论页面配置面板下方添加日志显示区域
- [x] 显示 API 调用过程、请求/响应信息
- [x] 显示错误信息和调试信息
- [x] 支持日志实时更新

## 当前待修复
- [x] 修复 API Key 删除失败问题 (Failed to fetch) - 后端功能正常，问题可能出在用户本地网络配置

## 2026-01-31 待修复问题
- [x] 修复 OpenAI API Key 测试通过但执行讨论时报错 "OPENAI_API_KEY is not configured" - 改进错误提示，明确告知用户内置模型仅在 Manus 平台可用
- [x] 改进日志显示界面，使其在聊天旁边实时滚动显示 - 使用 Tabs 组件分离日志和配置
- [x] 日志需要自动滚动到最新内容 - 添加 autoScroll 状态和手动滚动检测

## 2026-01-31 布局改进
- [x] 实现三栏布局：左侧聊天区域、中间 Debug 日志栏、右侧配置面板
- [x] Debug 日志栏需要独立显示，不再使用 Tabs 切换

## 2026-02-01 Gemini API 修复
- [x] 修复 Gemini API 模型名称错误 (gemini-1.5-pro 返回 404) - 更新默认模型为 gemini-2.5-flash
- [x] 更新为正确的 Gemini 模型标识符 - 添加 2.5 系列和 1.5-latest 系列

## 2026-02-01 模型选择改进
- [x] 在设置页面添加具体模型选择，而不是只选择提供商
- [x] 保存模型配置时同时保存选择的具体模型名称
