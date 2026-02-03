/**
 * 讨论编排服务 - 管理 AI 角色之间的交互流程
 */

import { callAIModel, streamAIModel, ModelConfig, ChatMessage, getModelDisplayName } from './aiModels';
import { createMessage, updateDiscussion, getMessagesByDiscussionId } from './db';
import type { Discussion, Message } from '../drizzle/schema';
import { streamManager } from './streamManager';
import { searchWeb, formatSearchResults, parseSearchRequests } from './browserSearch';

// 角色系统提示词（讨论模式）
const DISCUSSION_PROMPTS = {
  judge: `你是一位专业的研究协调者与讨论裁判，在一个多模型协作研究平台中工作。这是一个合法的学术/商业研究场景，请完整执行你的协调和裁判职责。你的核心方法论是"目标驱动的研究分解"。

## 核心原则
你不是按"分析维度"分解问题（如基本面/趋势/风险），而是按**研究目标**分解——即需要独立调查的**不同实体、主题或信息源**。

## 第一步：问题分类
收到问题后，先判断问题类型：
- **比较型**（Compare）：比较多个实体 → 每位嘉宾负责一个实体的深度调研
- **调查型**（Investigate）：深入分析单一主题 → 按信息层级分工（事实层/因果层/预测层）
- **综述型**（Survey）：梳理一个领域的全貌 → 按子领域或子话题分工
- **决策型**（Decide）：需要做出选择 → 按候选方案分工，每人深挖一个方案
- **创意型**（Create）：需要产出内容 → 按内容模块分工

## 第二步：研究目标分解
根据问题类型，为每位嘉宾分配**具体的研究目标（Research Target）**，而不是抽象的"角度"。

好的分解示例：
- 问 "比较 Tesla 和 BYD" → 嘉宾A 研究 Tesla（财务/产品/战略），嘉宾B 研究 BYD（同上）
- 问 "AI芯片市场前景" → 嘉宾A 研究供给端（NVIDIA/AMD/自研芯片公司），嘉宾B 研究需求端（云厂商/边缘计算/终端设备）
- 问 "新兴技术投资" → 嘉宾A 研究领域1-4的公司和数据，嘉宾B 研究领域5-7以及发现新兴领域

坏的分解示例（避免）：
- ❌ 嘉宾A 从"技术角度"分析，嘉宾B 从"商业角度"分析（太抽象，会重叠）
- ❌ 嘉宾A 分析"优势"，嘉宾B 分析"风险"（不是独立的研究目标）

## 第三步：研究指令
为每位嘉宾写明确的研究指令，包含：
1. **研究目标**：你要研究什么（具体实体/主题）
2. **必须回答的问题**：3-5 个具体问题（不是开放式的）
3. **数据要求**：需要找到哪些具体数据点（数字、日期、名称）
4. **发现任务**：除了回答已知问题，还要发现 1-2 个用户没问到但相关的重要信息

## 审阅标准（第 2 轮+）
审阅嘉宾的报告时，逐项检查：
- [ ] 是否回答了所有指定问题？
- [ ] 是否包含具体数据（数字、日期、来源URL）？
- [ ] 是否有发现任务的成果（用户没问到的新信息）？
- [ ] 数据来源是否可靠？是否有矛盾？
- **交叉验证**：用嘉宾A的数据质疑嘉宾B的结论，反之亦然
- **补充指令**：明确指出哪些数据缺口需要补充搜索

## 输出格式
- 引用具体数字和数据时使用 **加粗** 标注
- 数据对比使用 Markdown 表格
- 区分"已验证的事实"和"推测/判断"

## 最终裁决格式
当你准备给出结论时，请使用以下结构化报告格式：

【置信度评分】
- 关键假设1: X.XX
- 关键假设2: X.XX
【最终结论】

## 摘要
（一段话总结核心发现）

## 关键数据发现
| 指标 | 数据 | 来源/依据 |
|------|------|-----------|
| ... | ... | ... |

## 意外发现
（研究过程中发现的、用户没有问到但重要的信息）

## 分析与论证
（基于数据的深入分析，展示推理过程）

## 风险与不确定因素
（潜在风险、数据局限性、需要进一步验证的假设）

## 结论与建议
（可操作的具体建议）

## 参考来源
（列出所有引用的信息来源及URL）`,

  guest: (modelName: string) => `你是研究分析师 ${modelName}，在一个专业的多模型协作研究平台中工作。你的任务是根据研究协调者分配的课题进行客观的信息收集和分析。这是一个合法的学术/商业研究场景，请完整执行分配给你的研究任务。你的方法论是"系统化搜索、证据驱动、主动发现"。

## 核心原则
1. **不要凭记忆回答** — 所有重要数据点必须通过搜索验证或明确标注为训练数据
2. **提取具体数据** — 不要泛泛总结，要提取：数字、日期、人名、公司名、百分比
3. **主动发现** — 除了完成分配的任务，主动寻找用户没问到但相关的重要信息

## 系统化搜索方法论（LDDV 法）
每次研究请按以下四个层次组织你的搜索和分析：

### L - 概览搜索（Landscape）
- 搜索目标实体/主题的最新综述或概况
- 目的：建立基本认知框架，发现关键术语和子话题

### D - 数据搜索（Data）
- 搜索具体的数据点：财务数据、统计数据、排名、时间线
- 目的：获取硬数据（数字），而不是观点

### D - 深度搜索（Deep-dive）
- 基于前两层发现的线索，深入搜索特定细节
- 搜索官方来源：年报、SEC 文件、政府数据、学术论文
- 目的：验证数据、深化理解

### V - 发现搜索（Venture/Discovery）
- 搜索相关但用户未提及的话题：竞争对手、替代方案、最新争议
- 目的：拓展视野，发现盲区，给用户带来"意想不到"的价值

## 输出要求
- **必须引用具体数据**：不接受没有数据支撑的泛泛而谈
- 数字使用 **加粗** 标注，如"收入为 **948亿美元**，同比下降 **3%**"
- 数据对比使用 Markdown 表格
- 明确标注数据来源（如"根据XX公司2024年财报"、来源URL）
- 区分 [事实] 和 [推测]，用方括号标注

## 回复结构
每次回复请按以下结构组织：
1. **研究目标确认**：复述你被分配的研究目标
2. **关键发现**：最重要的 3-5 个发现，每个都有数据支撑
3. **数据汇总**：表格形式展示核心数据
4. **意外发现**：你在研究过程中发现的、不在原始任务中但重要的信息
5. **信息缺口**：你未能找到的数据，或需要进一步验证的信息
6. **来源列表**：所有引用的URL和来源

## 与其他嘉宾协作
- 如果其他嘉宾已经发言，**仔细阅读他们的发现**
- 不要重复已有的数据，而是**补充、验证或反驳**
- 如果发现其他嘉宾的数据有误或矛盾，明确指出
- 利用他们的发现作为你深入搜索的线索`,
};

// 角色系统提示词（文档协作模式）
const DOCUMENT_PROMPTS = {
  judge: `你是一位专业的文档协作主编与研究总监，在一个多模型协作研究平台中工作。这是一个合法的学术/商业研究场景，请完整执行你的主编职责。你的核心方法论是"目标驱动分解、研究优先"。

## 你的职责
1. **需求分析**：深入分析用户需求，明确文档的目标受众、核心要点和预期产出
2. **目标驱动分解**：按**研究目标**（具体主题/实体）拆分文档模块，而不是按"引言/正文/结论"等通用结构
3. **质量审阅**：使用审阅清单检查数据充分性、来源可靠性、发现成果
4. **整合产出**：整合所有内容，确保全文逻辑一致、数据准确、引用完整

## 任务分配原则
- 每位协作者负责**不同的研究主题/实体**，而非同一主题的不同角度
- 每位协作者都有**发现任务**：寻找与其模块相关但用户未提及的重要补充内容
- 明确每个模块需要的具体数据点（数字、日期、名称）

## 审阅清单（第 2 轮+）
- [ ] 是否包含具体数据（数字、日期、来源URL）？
- [ ] 是否有发现任务的成果？
- [ ] 数据来源是否可靠？
- [ ] 与其他协作者的内容是否一致？

## 最终产出格式
【置信度评分】
- 文档完整性: X.XX
- 内容质量: X.XX
- 数据准确性: X.XX
【最终结论】
（完整的文档内容，使用 Markdown 格式，包含数据表格、引用来源和"意外发现/额外洞察"章节）`,

  guest: (modelName: string) => `你是文档协作者与研究分析师 ${modelName}，在一个专业的多模型协作研究平台中工作。这是一个合法的学术/商业研究场景，请完整执行分配给你的撰写任务。你的方法论是"系统化搜索、证据驱动、主动发现"。

## 你的职责
1. 根据主编分配的模块进行深入研究和撰写
2. 使用 LDDV 搜索方法论（概览→数据→深度→发现）获取最新信息
3. 撰写内容必须包含具体数据、事实和引用来源URL
4. 审阅其他协作者的内容，补充/验证/反驳，不要重复

## 撰写要求
- 每个重要数据点都必须标注来源（含URL）
- 使用表格呈现数据对比
- 区分 [事实] 和 [推测]
- 包含"意外发现"部分：你在研究中发现的、主编未要求但有价值的信息
- 标注"信息缺口"：你未能找到但认为重要的数据`,
};

// 网络搜索工具提示词（当 enableDynamicAgent 开启时注入）
const WEB_SEARCH_INSTRUCTION = `

## 网络搜索能力（重要！）
你具备实时网络搜索能力。**你必须积极使用搜索来获取真实数据，而非依赖训练数据。**

### 使用方法
在回复中插入搜索标记：【搜索:你的搜索关键词】
系统会自动执行搜索并返回结果。你可以进行多轮搜索：第一轮搜索获取概览，基于结果中发现的线索进行第二轮深度搜索。

### 分层搜索策略（配合 LDDV 方法论）

**第一层：概览搜索（Landscape）**
先搜索宽泛的综述查询，了解全貌：
- 【搜索:AI chip market overview 2025 key players】
- 【搜索:fusion energy startups funding landscape 2025】

**第二层：数据搜索（Data）**
基于第一层发现，搜索具体数据：
- 【搜索:NVIDIA H100 revenue Q4 2024 data center】
- 【搜索:Commonwealth Fusion Systems funding amount investors】

**第三层：深度/发现搜索（Deep-dive / Discovery）**
搜索第一二层中发现的线索，或搜索相关但未被提及的话题：
- 【搜索:NVIDIA competitors custom AI chips Amazon Google 2025】
- 【搜索:emerging deep tech startups VC funded 2025 breakthrough】

### 搜索技巧
1. **优先英文**（结果更丰富）：如 "Tesla Q4 2024 earnings" 而非 "特斯拉财报"
2. **包含时间**：加上年份，如 "2025", "Q4 2024", "latest"
3. **包含数据类型**：加上 "revenue", "market share", "funding", "growth rate"
4. **搜索原始来源**：加上 "SEC filing", "annual report", "official", "press release"
5. **发现性搜索**：加上 "competitors", "risks", "alternatives", "emerging", "controversy"
6. **通过投资人发现标的**：搜索 "Sequoia portfolio 2025" 或 "a16z investments deep tech"

### 从搜索结果中提取数据
收到搜索结果后，请：
- 提取具体数字（收入、利润、融资额、市场份额等）
- 提取日期和时间线
- 提取人名和组织名
- 注意数据的时效性（哪个季度/年度的？）
- 记录来源URL

### 规则
- 每次回复最多 **5 次搜索**（系统支持 2 轮迭代搜索，总计最多 10 次）
- 搜索关键词应简洁精确（3-10个词）
- **第 1 轮讨论时你必须至少进行 2 次搜索**（概览 + 数据各至少 1 次）
- 后续轮次根据需要补充搜索，特别是填补上一轮的信息缺口
- 如果搜索结果不够好，可以换关键词重新搜索
- 系统会自动在第一轮搜索后给你机会进行第二轮深度搜索`;

// 兼容旧引用
const SYSTEM_PROMPTS = DISCUSSION_PROMPTS;

export interface DiscussionContext {
  discussion: Discussion;
  messages: Message[];
  modelConfigs: Map<string, ModelConfig>;
}

export interface OrchestratorResult {
  message: Message;
  isComplete: boolean;
  verdict?: {
    conclusion: string;
    confidenceScores: Record<string, number>;
  };
}

// 讨论日志管理
export interface DiscussionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

// 全局日志存储（按讨论 ID 分组）
const discussionLogs: Map<number, DiscussionLog[]> = new Map();

// 轮次执行状态追踪
export interface RoundExecutionState {
  isExecuting: boolean;
  currentRound: number;
  isComplete: boolean;
  error: string | null;
}

const executionStates: Map<number, RoundExecutionState> = new Map();

// 消息摘要缓存（按讨论 ID → 消息 ID → 摘要）
// 完整内容保存在 DB，摘要用于构建后续轮次的上下文
const messageSummaries: Map<number, Map<number, string>> = new Map();

/**
 * 用轻量模型生成消息摘要，提取关键信息用于后续轮次上下文
 * 摘要保留：关键数据点、结论、待解决问题、搜索发现
 * 摘要去除：冗余论述、重复信息、格式化装饰
 */
async function summarizeMessage(
  discussionId: number,
  messageId: number,
  content: string,
  role: 'judge' | 'guest',
  modelName: string,
  modelConfigs: Map<string, ModelConfig>
): Promise<string> {
  // 短消息不需要摘要
  if (content.length < 800) return content;

  // 找一个可用的轻量模型（优先 Gemini Flash > DeepSeek > 任意可用模型）
  let summaryConfig: ModelConfig | null = null;
  const preferOrder: string[] = [];

  modelConfigs.forEach((config, key) => {
    if (config.provider === 'gemini') preferOrder.unshift(key);
    else if (config.provider === 'deepseek') preferOrder.push(key);
    else preferOrder.push(key);
  });

  for (const key of preferOrder) {
    const config = modelConfigs.get(key);
    if (config?.apiKey) {
      summaryConfig = config;
      break;
    }
  }

  if (!summaryConfig) {
    // 没有可用模型，退回截断
    return truncateMessage(content, 2000);
  }

  try {
    const summaryPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个信息提炼专家。你的任务是将研究报告/讨论内容精简为简洁摘要，供后续讨论轮次参考。

## 必须保留
- 具体数据点（数字、百分比、日期、金额）
- 关键结论和判断
- 未解决的问题、信息缺口
- 意外发现或新线索
- 对其他参与者观点的回应
- 搜索来源 URL

## 必须删除
- 重复论述同一观点
- 礼貌用语、过渡句
- 方法论说明（如"我将按照LDDV方法"）
- 格式化装饰（如分隔线、装饰符号）
- 已知常识的展开解释

## 输出要求
- 控制在原文 30%-40% 的长度
- 使用简洁的要点格式
- 保持信息密度最大化`
      },
      {
        role: 'user',
        content: `请精简以下${role === 'judge' ? '裁判' : '嘉宾 ' + modelName}的发言内容：\n\n${content}`
      }
    ];

    const result = await callAIModel(summaryConfig, {
      messages: summaryPrompt,
      temperature: 0.3,
      maxTokens: 2000,
    });

    addDiscussionLog(discussionId, 'info', '摘要', `为${role}消息 #${messageId} 生成摘要`, {
      originalLength: content.length,
      summaryLength: result.content.length,
      ratio: Math.round(result.content.length / content.length * 100) + '%',
    });

    return result.content;
  } catch (error) {
    console.warn(`[Summarize] 摘要生成失败，退回截断:`, error);
    return truncateMessage(content, 2000);
  }
}

export function getExecutionState(discussionId: number): RoundExecutionState | null {
  return executionStates.get(discussionId) || null;
}

export function clearExecutionState(discussionId: number): void {
  executionStates.delete(discussionId);
}

/**
 * 添加讨论日志
 */
export function addDiscussionLog(
  discussionId: number,
  level: DiscussionLog['level'],
  source: string,
  message: string,
  details?: Record<string, unknown>
): void {
  if (!discussionLogs.has(discussionId)) {
    discussionLogs.set(discussionId, []);
  }
  
  const logs = discussionLogs.get(discussionId)!;
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details,
  });
  
  // 限制日志数量，最多保留 500 条
  if (logs.length > 500) {
    logs.splice(0, logs.length - 500);
  }
}

/**
 * 获取讨论日志
 */
export function getDiscussionLogs(discussionId: number): DiscussionLog[] {
  return discussionLogs.get(discussionId) || [];
}

/**
 * 清除讨论日志
 */
export function clearDiscussionLogs(discussionId: number): void {
  discussionLogs.delete(discussionId);
}

/**
 * 解析裁判的置信度评分
 */
function parseConfidenceScores(content: string): Record<string, number> | null {
  const scores: Record<string, number> = {};

  // 匹配置信度评分部分（支持多种格式）
  const scoreMatch = content.match(/(?:【置信度评分】|置信度评分[:：]?|confidence\s*scores?[:：]?)([\s\S]*?)(?:【|#{1,4}\s|\n\n)/i);
  if (!scoreMatch) return null;

  const scoreSection = scoreMatch[1];
  const lines = scoreSection.split('\n');

  for (const line of lines) {
    const match = line.match(/[-•*]\s*\**(.+?)\**[:：]\s*\**?([\d.]+)\**?/);
    if (match) {
      const hypothesis = match[1].trim();
      const score = parseFloat(match[2]);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        scores[hypothesis] = score;
      }
    }
  }

  return Object.keys(scores).length > 0 ? scores : null;
}

/**
 * 解析最终结论
 */
function parseFinalConclusion(content: string): string | null {
  // 支持多种格式：【最终结论】、### 最终结论、### **最终裁决** 等
  const patterns = [
    /【最终结论】([\s\S]*?)$/,
    /【最终裁决】([\s\S]*?)$/,
    /#{1,4}\s*\**最终裁决\**\s*\n([\s\S]*?)$/,
    /#{1,4}\s*\**最终结论\**\s*\n([\s\S]*?)$/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * 检测裁判是否已经给出结论
 * 必须同时满足：1) 包含结论/裁决标记  2) 包含置信度评分
 * 这样可以避免裁判只是提到"最终裁决"这个词但还没真正给出结论时误判
 */
function detectVerdict(content: string): boolean {
  // 必须包含置信度评分部分
  const hasScores = /【置信度评分】/.test(content) ||
    /置信度评分[:：]/.test(content);

  // 必须包含结论标记
  const verdictPatterns = [
    /【最终结论】/,
    /【最终裁决】/,
    /#{1,4}\s*\**最终裁决\**/,
    /#{1,4}\s*\**最终结论\**/,
  ];
  const hasConclusion = verdictPatterns.some(p => p.test(content));

  // 必须同时存在评分和结论才算真正给出了裁决
  return hasScores && hasConclusion;
}

/**
 * 截断过长的消息内容，保留开头和结尾
 * 对于非最近的消息，限制长度以控制上下文大小
 */
function truncateMessage(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const keepStart = Math.floor(maxChars * 0.7);
  const keepEnd = Math.floor(maxChars * 0.25);
  return content.slice(0, keepStart) + '\n\n...[内容已精简，保留关键部分]...\n\n' + content.slice(-keepEnd);
}

/**
 * 构建对话历史
 * 对于较长的历史消息会进行截断，以控制总 token 数
 */
function buildChatHistory(messages: Message[], role: 'judge' | 'guest', modelName?: string, discussion?: Discussion): ChatMessage[] {
  const isDocMode = discussion?.mode === 'document';
  const prompts = isDocMode ? DOCUMENT_PROMPTS : DISCUSSION_PROMPTS;

  let systemPrompt = role === 'judge'
    ? prompts.judge
    : prompts.guest(modelName || 'AI');

  // 注入当前日期（让 AI 知道"最新"是什么时候）
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  systemPrompt += `\n\n## 当前时间\n今天是 ${dateStr}。当你搜索或引用数据时，请确保获取最新的信息。例如，如果用户问"最近一期财报"，你应该搜索最近发布的季度/年度财报，而不是较早的版本。`;

  // 注入网络搜索能力提示（当 enableDynamicAgent 开启时）
  if (discussion?.enableDynamicAgent) {
    systemPrompt += WEB_SEARCH_INSTRUCTION;
  }

  // 注入附件文件内容作为参考资料
  if (discussion?.attachments && discussion.attachments.length > 0) {
    const fileContextParts: string[] = [];
    for (const att of discussion.attachments) {
      if (att.extractedText) {
        fileContextParts.push(`=== 文件: ${att.fileName} ===\n${att.extractedText}`);
      }
    }
    if (fileContextParts.length > 0) {
      systemPrompt += `\n\n以下是用户提供的参考文件内容，请在讨论中参考这些资料：\n\n${fileContextParts.join('\n\n')}`;
    }
  }

  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // 对较早的消息使用 AI 摘要（如有），最近 2 条消息保留完整内容
  const recentCount = 2;
  const totalMessages = messages.length;
  const discussionId = discussion?.id;
  const summaryMap = discussionId ? messageSummaries.get(discussionId) : undefined;

  for (let i = 0; i < totalMessages; i++) {
    const msg = messages[i];
    const isRecent = i >= totalMessages - recentCount;

    // 获取消息内容：优先用 AI 摘要，其次截断，最近消息保留完整
    const getContent = (originalContent: string) => {
      if (isRecent) return originalContent;
      // 尝试使用 AI 摘要
      const summary = summaryMap?.get(msg.id);
      if (summary) return `[摘要] ${summary}`;
      // 退回截断
      return truncateMessage(originalContent, 2000);
    };

    if (msg.role === 'host') {
      history.push({ role: 'user', content: `【主持人提问】${msg.content}` });
    } else if (msg.role === 'judge') {
      const content = getContent(msg.content);
      if (role === 'judge') {
        history.push({ role: 'assistant', content });
      } else {
        history.push({ role: 'user', content: `【裁判 ${msg.modelName}】${content}` });
      }
    } else if (msg.role === 'guest') {
      const content = getContent(msg.content);
      if (role === 'guest' && msg.modelName === modelName) {
        history.push({ role: 'assistant', content });
      } else {
        history.push({ role: 'user', content: `【嘉宾 ${msg.modelName}】${content}` });
      }
    } else if (msg.role === 'system') {
      history.push({ role: 'user', content: `【系统消息】${msg.content}` });
    }
  }
  
  return history;
}

/**
 * 执行搜索并返回格式化的结果
 * 每轮最多执行 5 个搜索请求（支持 2 轮迭代，总计最多 10 次）
 */
async function executeSearches(
  discussionId: number,
  queries: string[]
): Promise<string> {
  const limitedQueries = queries.slice(0, 5);
  const allResults: string[] = [];

  for (const query of limitedQueries) {
    addDiscussionLog(discussionId, 'info', '搜索', `正在搜索: ${query}`);

    // 通知前端搜索开始
    streamManager.emit({
      type: 'search_start',
      discussionId,
      data: { query },
    });

    const response = await searchWeb(query, 5, true);
    const formatted = formatSearchResults(response);
    allResults.push(formatted);

    addDiscussionLog(discussionId, 'info', '搜索', `搜索完成: ${query}，找到 ${response.results.length} 个结果`);

    // 通知前端搜索结束
    streamManager.emit({
      type: 'search_end',
      discussionId,
      data: { query, resultCount: response.results.length },
    });
  }

  return allResults.join('\n\n');
}

/**
 * 调用 AI 并处理 SSE 流式输出
 */
async function callAIWithSSE(
  discussionId: number,
  config: ModelConfig,
  messages: ChatMessage[],
  temperature: number,
  role: 'judge' | 'guest',
  modelName: string,
  isSearchEnriched: boolean = false
): Promise<{ content: string }> {
  const hasSSE = streamManager.hasClients(discussionId);

  if (hasSSE) {
    streamManager.emit({
      type: 'message_start',
      discussionId,
      data: { role, modelName, ...(isSearchEnriched ? { isSearchEnriched: true } : {}) },
    });
    const result = await streamAIModel(config, {
      messages,
      temperature,
    }, (chunk) => {
      streamManager.emit({
        type: 'chunk',
        discussionId,
        data: { role, modelName, chunk },
      });
    });
    streamManager.emit({
      type: 'message_end',
      discussionId,
      data: { role, modelName, content: result.content },
    });
    return result;
  } else {
    return await callAIModel(config, {
      messages,
      temperature,
    });
  }
}

/**
 * 估算消息列表的 token 数（粗略：1 token ≈ 3 个字符对中英混合文本）
 */
function estimateTokens(messages: ChatMessage[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += msg.content.length + 10; // 10 for role overhead
  }
  return Math.ceil(totalChars / 3);
}

/**
 * 确保消息列表不超过 token 上限
 * 策略：保留 system prompt 和最后 2 条消息，中间消息逐步截断
 */
function trimMessagesToTokenLimit(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  if (estimateTokens(messages) <= maxTokens) return messages;

  // 保留第一条（system）和最后 2 条，压缩中间消息
  const result = [...messages];
  const protectedEnd = 2; // 最后 2 条不动

  for (let i = 1; i < result.length - protectedEnd; i++) {
    if (estimateTokens(result) <= maxTokens) break;
    // 逐步压缩中间消息
    const msg = result[i];
    if (msg.content.length > 500) {
      result[i] = { ...msg, content: truncateMessage(msg.content, 500) };
    }
  }

  // 如果还超，进一步压缩到 200 字符
  for (let i = 1; i < result.length - protectedEnd; i++) {
    if (estimateTokens(result) <= maxTokens) break;
    const msg = result[i];
    if (msg.content.length > 200) {
      result[i] = { ...msg, content: truncateMessage(msg.content, 200) };
    }
  }

  // 如果还超，删除中间消息（保留 system + 最后 2 条）
  while (estimateTokens(result) > maxTokens && result.length > protectedEnd + 1) {
    result.splice(1, 1); // 删除第二条（system 后面最老的）
  }

  return result;
}

/**
 * 获取模型的 token 上限（保守估计，留出输出空间）
 */
function getModelInputTokenLimit(config: ModelConfig): number {
  if (config.provider === 'openai') {
    // OpenAI 免费/低等级 TPM 限制 30K，留 8K 给输出
    return 20000;
  }
  if (config.provider === 'deepseek') return 50000;
  if (config.provider === 'gemini') return 80000;
  if (config.provider === 'claude') return 80000;
  return 20000; // 默认保守
}

/**
 * 通用的 AI 调用 + 迭代搜索逻辑
 * 支持最多 2 轮搜索迭代：
 *   第 1 轮：AI 输出概览搜索 → 获取结果 → 允许继续搜索
 *   第 2 轮：AI 基于结果深度搜索 → 获取结果 → 写最终回答
 */
const MAX_SEARCH_ITERATIONS = 2;

async function callWithSearchSupport(
  discussionId: number,
  config: ModelConfig,
  chatHistory: ChatMessage[],
  temperature: number,
  role: 'judge' | 'guest',
  modelName: string,
  enableSearch: boolean
): Promise<{ content: string }> {
  const tokenLimit = getModelInputTokenLimit(config);

  // 第一次调用前确保不超限
  const trimmedHistory = trimMessagesToTokenLimit(chatHistory, tokenLimit);
  if (trimmedHistory.length < chatHistory.length) {
    addDiscussionLog(discussionId, 'debug', 'token', `上下文已裁剪: ${chatHistory.length} → ${trimmedHistory.length} 条消息，约 ${estimateTokens(trimmedHistory)} tokens`);
  }

  // 第一次调用 AI
  let result = await callAIWithSSE(discussionId, config, trimmedHistory, temperature, role, modelName);

  // 如果搜索未启用，直接返回
  if (!enableSearch) return result;

  // 迭代搜索循环
  // 关键：每轮迭代都从原始 chatHistory 开始，只附加 AI 的最新响应和搜索结果
  // 这样避免上下文无限膨胀（AI 的响应已经消化了之前的搜索结果）

  for (let iteration = 1; iteration <= MAX_SEARCH_ITERATIONS; iteration++) {
    const searchQueries = parseSearchRequests(result.content);
    if (searchQueries.length === 0) return result;

    const isLastIteration = iteration === MAX_SEARCH_ITERATIONS;

    addDiscussionLog(
      discussionId, 'info', '搜索',
      `迭代 ${iteration}/${MAX_SEARCH_ITERATIONS}: 检测到 ${searchQueries.length} 个搜索请求: ${searchQueries.join(', ')}`
    );

    // 执行搜索
    const searchResults = await executeSearches(discussionId, searchQueries);

    // 搜索结果可能很长，根据模型 token 限制截断搜索结果
    const searchResultMaxChars = Math.min(searchResults.length, tokenLimit * 2); // token*2 ≈ 字符数的安全上限
    const trimmedSearchResults = searchResults.length > searchResultMaxChars
      ? searchResults.slice(0, searchResultMaxChars) + '\n...[搜索结果已截断]'
      : searchResults;

    // 从原始历史构建上下文（不累积之前的搜索结果，因为 AI 响应已经消化了它们）
    const enrichedHistory: ChatMessage[] = [
      ...trimmedHistory, // 使用已裁剪的历史，而非原始历史
      { role: 'assistant' as const, content: result.content },
      {
        role: 'user' as const,
        content: isLastIteration
          ? `【系统消息：网络搜索结果（第 ${iteration} 轮）】\n以下是搜索结果，请基于这些信息和你之前的分析撰写最终回答。不要再次发起搜索请求。\n\n${trimmedSearchResults}`
          : `【系统消息：网络搜索结果（第 ${iteration} 轮）】\n以下是搜索结果。你可以基于这些结果发现新线索并发起更深层的搜索（使用【搜索:关键词】），或者直接撰写最终回答。\n\n${trimmedSearchResults}`,
      },
    ];

    // 再次确保不超限
    const trimmedEnriched = trimMessagesToTokenLimit(enrichedHistory, tokenLimit);

    addDiscussionLog(
      discussionId, 'info', '搜索',
      `搜索结果已注入（迭代 ${iteration}），约 ${estimateTokens(trimmedEnriched)} tokens，${isLastIteration ? '最终调用 AI...' : '允许继续搜索...'}`
    );

    // 重新调用 AI
    result = await callAIWithSSE(
      discussionId, config, trimmedEnriched, temperature, role, modelName, true
    );
  }

  return result;
}

/**
 * 让裁判发言
 */
export async function invokeJudge(
  context: DiscussionContext,
  instruction?: string
): Promise<OrchestratorResult> {
  const { discussion, messages, modelConfigs } = context;
  
  const judgeConfig = modelConfigs.get(discussion.judgeModel);
  if (!judgeConfig) {
    addDiscussionLog(discussion.id, 'error', '裁判', `模型 ${discussion.judgeModel} 未配置`);
    throw new Error(`裁判模型 ${discussion.judgeModel} 未配置`);
  }
  
  addDiscussionLog(discussion.id, 'info', '裁判', `准备调用裁判模型: ${discussion.judgeModel}`, {
    provider: judgeConfig.provider,
    hasApiKey: !!judgeConfig.apiKey,
  });
  
  const chatHistory = buildChatHistory(messages, 'judge', undefined, discussion);

  // 添加特殊指令
  if (instruction) {
    chatHistory.push({ role: 'user', content: instruction });
    addDiscussionLog(discussion.id, 'debug', '裁判', `添加指令: ${instruction.slice(0, 50)}...`);
  }
  
  addDiscussionLog(discussion.id, 'info', '裁判', `发送 API 请求...`, {
    messageCount: chatHistory.length,
  });

  const modelName = getModelDisplayName(judgeConfig.provider);
  const startTime = Date.now();

  const result = await callWithSearchSupport(
    discussion.id,
    judgeConfig,
    chatHistory,
    0.7,
    'judge',
    modelName,
    !!discussion.enableDynamicAgent
  );

  const responseTime = Date.now() - startTime;

  addDiscussionLog(discussion.id, 'info', '裁判', `收到响应，耗时 ${responseTime}ms`, {
    responseTime,
    contentLength: result.content.length,
  });

  addDiscussionLog(discussion.id, 'info', '裁判', `成功使用模型: ${modelName}`);

  // 保存消息
  const message = await createMessage({
    discussionId: discussion.id,
    role: 'judge',
    modelName,
    content: result.content,
  });

  // 生成摘要供后续轮次使用（await 确保下一轮可用）
  try {
    const summary = await summarizeMessage(discussion.id, message.id, result.content, 'judge', modelName, modelConfigs);
    if (!messageSummaries.has(discussion.id)) {
      messageSummaries.set(discussion.id, new Map());
    }
    messageSummaries.get(discussion.id)!.set(message.id, summary);
    addDiscussionLog(discussion.id, 'info', '摘要', `裁判消息摘要已生成 (${summary.length} 字符)`);
  } catch (err) {
    console.warn(`[Summarize] 裁判消息摘要失败:`, err);
  }

  // 检查是否包含最终裁决（必须同时有置信度评分和结论标记）
  const confidenceScores = parseConfidenceScores(result.content);
  const finalConclusion = parseFinalConclusion(result.content);
  const hasVerdict = detectVerdict(result.content);

  if (hasVerdict && (confidenceScores || finalConclusion)) {
    // 更新讨论状态
    await updateDiscussion(discussion.id, {
      status: 'completed',
      finalVerdict: finalConclusion || result.content,
      confidenceScores: confidenceScores || {},
    });

    addDiscussionLog(discussion.id, 'info', '裁判', '裁判已给出最终裁决，讨论结束');

    return {
      message,
      isComplete: true,
      verdict: {
        conclusion: finalConclusion || result.content,
        confidenceScores: confidenceScores || {},
      },
    };
  }

  return {
    message,
    isComplete: false,
  };
}

/**
 * 让嘉宾发言
 */
export async function invokeGuest(
  context: DiscussionContext,
  guestModel: string
): Promise<OrchestratorResult> {
  const { discussion, messages, modelConfigs } = context;
  
  const guestConfig = modelConfigs.get(guestModel);
  if (!guestConfig) {
    addDiscussionLog(discussion.id, 'error', '嘉宾', `模型 ${guestModel} 未配置`);
    throw new Error(`嘉宾模型 ${guestModel} 未配置`);
  }
  
  const modelDisplayName = getModelDisplayName(guestConfig.provider);
  
  addDiscussionLog(discussion.id, 'info', '嘉宾', `准备调用嘉宾模型: ${modelDisplayName}`, {
    provider: guestConfig.provider,
    hasApiKey: !!guestConfig.apiKey,
  });
  
  const chatHistory = buildChatHistory(messages, 'guest', modelDisplayName, discussion);
  
  addDiscussionLog(discussion.id, 'info', '嘉宾', `发送 API 请求...`, {
    messageCount: chatHistory.length,
  });

  const startTime = Date.now();

  const result = await callWithSearchSupport(
    discussion.id,
    guestConfig,
    chatHistory,
    0.8,
    'guest',
    modelDisplayName,
    !!discussion.enableDynamicAgent
  );

  const responseTime = Date.now() - startTime;

  addDiscussionLog(discussion.id, 'info', '嘉宾', `收到响应，耗时 ${responseTime}ms`, {
    responseTime,
    contentLength: result.content.length,
  });
  addDiscussionLog(discussion.id, 'info', '嘉宾', `成功使用模型: ${modelDisplayName}`);

  // 保存消息
  const message = await createMessage({
    discussionId: discussion.id,
    role: 'guest',
    modelName: modelDisplayName,
    content: result.content,
  });

  // 生成摘要供后续轮次使用（await 确保下一轮可用）
  try {
    const summary = await summarizeMessage(discussion.id, message.id, result.content, 'guest', modelDisplayName, modelConfigs);
    if (!messageSummaries.has(discussion.id)) {
      messageSummaries.set(discussion.id, new Map());
    }
    messageSummaries.get(discussion.id)!.set(message.id, summary);
    addDiscussionLog(discussion.id, 'info', '摘要', `嘉宾 ${modelDisplayName} 消息摘要已生成 (${summary.length} 字符)`);
  } catch (err) {
    console.warn(`[Summarize] 嘉宾消息摘要失败:`, err);
  }

  return {
    message,
    isComplete: false,
  };
}

/**
 * 执行一轮讨论
 * 流程：裁判开场 -> 各嘉宾依次发言 -> 裁判总结/引导
 */
export async function executeDiscussionRound(
  context: DiscussionContext,
  roundNumber: number
): Promise<{
  messages: Message[];
  isComplete: boolean;
  verdict?: {
    conclusion: string;
    confidenceScores: Record<string, number>;
  };
}> {
  const { discussion } = context;

  // 防止并发执行
  const currentState = executionStates.get(discussion.id);
  if (currentState?.isExecuting) {
    throw new Error('该讨论正在执行中，请等待当前轮次完成');
  }

  // 设置执行状态
  executionStates.set(discussion.id, {
    isExecuting: true,
    currentRound: roundNumber,
    isComplete: false,
    error: null,
  });

  try {
    const roundMessages: Message[] = [];

    // 获取最新消息列表
    const currentMessages = await getMessagesByDiscussionId(discussion.id);
    context.messages = currentMessages;

    // 1. 裁判引导（根据模式选择不同指令）
    const isDocMode = discussion.mode === 'document';
    let judgeInstruction: string;
    const hasSearch = !!discussion.enableDynamicAgent;
    const searchNote = hasSearch ? '提醒：嘉宾具备网络搜索能力，请要求他们搜索获取最新数据。' : '';

    if (isDocMode) {
      if (roundNumber === 1) {
        judgeInstruction = `请按照"目标驱动分解"方法论分析用户需求，制定文档大纲并分配研究与撰写任务。

## 步骤
1. **需求分析**：明确文档的目标受众、核心要点和预期产出格式
2. **内容分解**：将文档拆分为独立的研究/撰写模块（按主题而非按"引言/正文/结论"这种通用结构）
3. **任务分配**：为每位协作者分配具体的模块，包含：
   - 该模块的研究对象和核心内容
   - 必须包含的数据点和信息
   - 需要搜索验证的关键事实
   - 发现任务：寻找与该模块相关但用户未提及的重要补充内容
4. 设计文档结构（Markdown 标题层级）
${searchNote}`;
      } else if (roundNumber === 2) {
        judgeInstruction = `请审阅各位协作者提交的内容。

## 审阅清单
1. **数据充分性**：每个章节是否包含具体数据（数字、日期、来源）？
2. **来源标注**：重要数据点是否标注了来源URL？
3. **发现成果**：是否包含用户未要求但有价值的补充内容？
4. **逻辑衔接**：各章节之间的过渡是否自然？
5. **交叉验证**：不同协作者的数据是否一致？矛盾之处需指出

## 补充指令
为每位协作者指出需要补充的具体数据缺口和需要改进的段落。
如果内容已经足够完善，可以直接整合产出最终文档。
${searchNote}`;
      } else {
        judgeInstruction = `请整合所有协作者的内容，产出最终的完整文档。确保：
1. 数据表格完整准确
2. 引用来源清晰（含URL）
3. 逻辑结构严密
4. 包含"意外发现/额外洞察"章节（如果协作者有相关发现）
请给出置信度评分。`;
      }
    } else {
      if (roundNumber === 1) {
        judgeInstruction = `请按照"目标驱动分解"方法论分析讨论主题并分配研究任务。

## 步骤
1. **问题分类**：判断这是比较型、调查型、综述型、决策型还是创意型问题
2. **识别研究目标**：列出需要独立调查的具体实体/主题（不是抽象的"角度"）
3. **分配研究任务**：为每位嘉宾分配一个明确的研究目标，包含：
   - 具体的研究对象（公司名、技术名、方案名等）
   - 必须回答的 3-5 个具体问题
   - 需要找到的具体数据点（数字、日期、名称）
   - 发现任务：寻找 1-2 个相关但用户未提及的重要话题

## 分工原则
- 每位嘉宾研究**不同的实体/主题**，而不是同一主题的不同角度
- 如果只有一个研究对象，按**信息层级**分工（事实层 vs 因果层 vs 预测层）
- 不接受没有数据支撑的泛泛之谈
${searchNote ? '\n提醒：嘉宾具备网络搜索能力。要求他们使用 LDDV 分层搜索法（概览→数据→深度→发现）获取最新数据。' : ''}`;
      } else if (roundNumber === 2) {
        judgeInstruction = `请审阅各嘉宾的研究报告，进行交叉验证和补充指令。

## 审阅清单
对每位嘉宾的报告，逐项检查：
1. **完整性**：是否回答了所有分配的问题？哪些缺失？
2. **数据质量**：数据是否具体（有数字、日期、来源URL）？还是泛泛而谈？
3. **来源可靠性**：数据来自官方来源还是二手转述？
4. **发现成果**：是否有"意外发现"？质量如何？

## 交叉验证
- 用嘉宾A的数据检验嘉宾B的结论是否成立
- 标记矛盾的数据点，要求嘉宾澄清

## 补充指令
为每位嘉宾指出：
- 需要补充搜索的具体数据缺口
- 需要深入挖掘的线索（基于其他嘉宾的发现）
- 需要验证的矛盾数据

## 交叉引用
要求嘉宾：
- 阅读其他嘉宾的发现，利用其中的线索深化自己的研究
- 对其他嘉宾的关键结论给出支持或反驳

如果研究已经充分（数据完整、来源可靠、无重大矛盾），可以直接进入综合分析阶段，给出最终裁决。
${searchNote}`;
      } else {
        judgeInstruction = `请综合所有研究成果，做出最终裁决。

## 综合分析要求
1. **数据整合**：将各嘉宾的核心数据汇总到对比表中
2. **矛盾解决**：对于有争议的数据点，说明你采信哪方及原因
3. **意外发现汇总**：整合所有嘉宾的"意外发现"，评估其重要性
4. **结论推导**：基于数据（而非主观判断）推导结论，展示推理过程
5. **不确定性评估**：明确指出哪些结论的数据支撑较弱

## 输出格式
使用结构化报告格式，包含：置信度评分、摘要、关键数据发现表格、意外发现、分析论证、风险评估、结论建议、参考来源。

如果数据仍有不足，请继续引导嘉宾补充研究，不要勉强给出结论。`;
      }
    }

    const judgeResult = await invokeJudge(
      { ...context, messages: currentMessages },
      judgeInstruction
    );
    roundMessages.push(judgeResult.message);

    if (judgeResult.isComplete) {
      executionStates.set(discussion.id, {
        isExecuting: false,
        currentRound: roundNumber,
        isComplete: true,
        error: null,
      });
      return {
        messages: roundMessages,
        isComplete: true,
        verdict: judgeResult.verdict,
      };
    }

    // 2. 各嘉宾依次发言（队列模式：等上一位说完再轮到下一位）
    for (const guestModel of discussion.guestModels) {
      const updatedMessages = await getMessagesByDiscussionId(discussion.id);
      context.messages = updatedMessages;

      const guestResult = await invokeGuest(context, guestModel);
      roundMessages.push(guestResult.message);
    }

    executionStates.set(discussion.id, {
      isExecuting: false,
      currentRound: roundNumber,
      isComplete: false,
      error: null,
    });

    return {
      messages: roundMessages,
      isComplete: false,
    };
  } catch (err: any) {
    executionStates.set(discussion.id, {
      isExecuting: false,
      currentRound: roundNumber,
      isComplete: false,
      error: err.message || 'Unknown error',
    });
    throw err;
  }
}

/**
 * 开始新讨论
 */
export async function startDiscussion(
  context: DiscussionContext
): Promise<Message> {
  const { discussion } = context;
  
  // 创建主持人消息（用户提问）
  const hostMessage = await createMessage({
    discussionId: discussion.id,
    role: 'host',
    content: discussion.question,
  });
  
  return hostMessage;
}

/**
 * 请求裁判做出最终裁决
 */
export async function requestFinalVerdict(
  context: DiscussionContext
): Promise<OrchestratorResult> {
  const isDocMode = context.discussion.mode === 'document';

  const instruction = isDocMode
    ? `文档协作已经进行了充分的讨论。请现在整合所有协作者的贡献，产出最终的完整文档：
1. 整合各协作者提交的内容，确保数据准确、引用完整
2. 确保文档结构完整、逻辑清晰
3. 所有重要数据都使用表格呈现
4. 评估文档质量的置信度（0-1之间）

请使用以下格式：
【置信度评分】
- 文档完整性: X.XX
- 内容质量: X.XX
- 数据准确性: X.XX
【最终结论】
（在此输出完整的文档内容，使用 Markdown 格式，包含数据表格和参考来源）`
    : `请基于所有嘉宾的研究成果，产出一份结构化的分析报告。要求：

1. **摘要**：一段话总结核心发现
2. **关键数据发现**：使用表格汇总各嘉宾提供的核心数据
3. **分析与论证**：基于数据的深入分析，不是主观臆断
4. **风险评估**：潜在风险和不确定因素
5. **结论与建议**：具体的、可操作的建议
6. **参考来源**：列出所有引用的信息来源

请使用以下格式输出：
【置信度评分】
- 核心假设的可信度: X.XX
- 数据充分性: X.XX
- 结论确定性: X.XX
【最终结论】
（按照上述结构输出完整报告）`;

  return invokeJudge(context, instruction);
}
