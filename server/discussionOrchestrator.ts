/**
 * 讨论编排服务 - 管理 AI 角色之间的交互流程
 */

import { callAIModel, streamAIModel, ModelConfig, ChatMessage, getModelDisplayName } from './aiModels';
import { createMessage, updateDiscussion, getMessagesByDiscussionId } from './db';
import type { Discussion, Message } from '../drizzle/schema';
import { streamManager } from './streamManager';

// 角色系统提示词（讨论模式）
const DISCUSSION_PROMPTS = {
  judge: `你是一位专业的讨论裁判。你的职责是：
1. 引导讨论围绕主题进行，确保讨论不偏离核心问题
2. 在适当的时候要求嘉宾提供证据支持其观点
3. 评估讨论进程，判断是否达成共识
4. 在讨论结束时，做出最终裁决并为关键假设评定置信度分数（0-1之间）

你需要保持中立、客观，确保每位嘉宾都有机会表达观点。当你认为讨论已经充分时，请总结各方观点并给出最终结论。

在最终裁决时，请使用以下格式输出置信度评分：
【置信度评分】
- 假设1: X.XX
- 假设2: X.XX
...
【最终结论】
你的结论内容`,

  guest: (modelName: string) => `你是讨论嘉宾 ${modelName}。你的职责是：
1. 针对讨论问题提出你的观点、假设和论证
2. 与其他嘉宾进行辩论，质疑或支持他们的观点
3. 在需要时提供证据支持你的论点
4. 保持理性、专业的讨论态度

请积极参与讨论，提出有建设性的观点。当你引用事实或数据时，请说明来源。`,
};

// 角色系统提示词（文档协作模式）
const DOCUMENT_PROMPTS = {
  judge: `你是一位专业的文档协作主编。你的职责是：
1. 分析用户的需求，理解需要产出的文档类型和内容
2. 将文档任务分解为多个部分，分配给各位协作者
3. 审阅协作者提交的内容，提出修改建议
4. 整合所有内容，产出最终的完整文档

你需要确保文档结构清晰、逻辑严密、内容完整。最终输出应该是一份可以直接使用的完整文档。

在最终产出文档时，请使用以下格式：
【置信度评分】
- 文档完整性: X.XX
- 内容质量: X.XX
【最终结论】
（在此输出完整的文档内容，使用 Markdown 格式）`,

  guest: (modelName: string) => `你是文档协作者 ${modelName}。你的职责是：
1. 根据主编的分工，撰写分配给你的文档章节
2. 审阅其他协作者的内容，提供建设性意见
3. 基于主编的反馈修改和完善你的内容
4. 确保你的内容与整体文档风格一致

请积极配合主编的安排，产出高质量的文档内容。使用 Markdown 格式书写。`,
};

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
 * 检测裁判是否已经给出结论（宽松匹配）
 * 当裁判的回复中包含"最终裁决"或"最终结论"相关内容时，视为讨论可以结束
 */
function detectVerdict(content: string): boolean {
  const verdictPatterns = [
    /【最终结论】/,
    /【最终裁决】/,
    /#{1,4}\s*\**最终裁决/,
    /#{1,4}\s*\**最终结论/,
    /最终裁决[:：\s]*\n/,
  ];
  return verdictPatterns.some(p => p.test(content));
}

/**
 * 构建对话历史
 */
function buildChatHistory(messages: Message[], role: 'judge' | 'guest', modelName?: string, discussion?: Discussion): ChatMessage[] {
  const isDocMode = discussion?.mode === 'document';
  const prompts = isDocMode ? DOCUMENT_PROMPTS : DISCUSSION_PROMPTS;

  let systemPrompt = role === 'judge'
    ? prompts.judge
    : prompts.guest(modelName || 'AI');

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
  
  for (const msg of messages) {
    if (msg.role === 'host') {
      history.push({ role: 'user', content: `【主持人提问】${msg.content}` });
    } else if (msg.role === 'judge') {
      if (role === 'judge') {
        history.push({ role: 'assistant', content: msg.content });
      } else {
        history.push({ role: 'user', content: `【裁判 ${msg.modelName}】${msg.content}` });
      }
    } else if (msg.role === 'guest') {
      if (role === 'guest' && msg.modelName === modelName) {
        history.push({ role: 'assistant', content: msg.content });
      } else {
        history.push({ role: 'user', content: `【嘉宾 ${msg.modelName}】${msg.content}` });
      }
    } else if (msg.role === 'system') {
      history.push({ role: 'user', content: `【系统消息】${msg.content}` });
    }
  }
  
  return history;
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
  let result;

  // 如果有 SSE 客户端，使用流式调用
  if (streamManager.hasClients(discussion.id)) {
    streamManager.emit({
      type: 'message_start',
      discussionId: discussion.id,
      data: { role: 'judge', modelName },
    });
    result = await streamAIModel(judgeConfig, {
      messages: chatHistory,
      temperature: 0.7,
    }, (chunk) => {
      streamManager.emit({
        type: 'chunk',
        discussionId: discussion.id,
        data: { role: 'judge', modelName, chunk },
      });
    });
    streamManager.emit({
      type: 'message_end',
      discussionId: discussion.id,
      data: { role: 'judge', modelName, content: result.content },
    });
  } else {
    result = await callAIModel(judgeConfig, {
      messages: chatHistory,
      temperature: 0.7,
    });
  }

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
  
  // 检查是否包含最终裁决
  const confidenceScores = parseConfidenceScores(result.content);
  const finalConclusion = parseFinalConclusion(result.content);
  const hasVerdict = detectVerdict(result.content);

  if (hasVerdict || (confidenceScores && finalConclusion)) {
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
  let result;

  // 如果有 SSE 客户端，使用流式调用
  if (streamManager.hasClients(discussion.id)) {
    streamManager.emit({
      type: 'message_start',
      discussionId: discussion.id,
      data: { role: 'guest', modelName: modelDisplayName },
    });
    result = await streamAIModel(guestConfig, {
      messages: chatHistory,
      temperature: 0.8,
    }, (chunk) => {
      streamManager.emit({
        type: 'chunk',
        discussionId: discussion.id,
        data: { role: 'guest', modelName: modelDisplayName, chunk },
      });
    });
    streamManager.emit({
      type: 'message_end',
      discussionId: discussion.id,
      data: { role: 'guest', modelName: modelDisplayName, content: result.content },
    });
  } else {
    result = await callAIModel(guestConfig, {
      messages: chatHistory,
      temperature: 0.8,
    });
  }

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
    if (isDocMode) {
      if (roundNumber === 1) {
        judgeInstruction = '请分析用户的需求，制定文档大纲和结构。将各章节分配给各位协作者，并说明每个部分的要求和期望内容。';
      } else if (roundNumber === 2) {
        judgeInstruction = '请审阅各位协作者提交的内容，提出修改建议和改进方向。如果你认为各部分内容已经足够完善，可以直接整合产出最终文档。';
      } else {
        judgeInstruction = '请评估文档是否已经完善。如果各部分内容质量达标，请整合所有内容，输出完整的最终文档（使用 Markdown 格式），并给出置信度评分。';
      }
    } else {
      if (roundNumber === 1) {
        judgeInstruction = '请开始主持这场讨论。首先介绍讨论主题，然后邀请各位嘉宾发表初始观点。';
      } else if (roundNumber === 2) {
        judgeInstruction = '请根据之前的讨论，继续引导嘉宾深入探讨，或要求他们提供更多证据。如果你认为各方观点已经充分且达成共识，可以直接给出最终裁决和置信度评分。';
      } else {
        judgeInstruction = '请评估讨论是否已经充分。如果各方观点已经明确且达成共识，请给出最终裁决和置信度评分；如果还有分歧需要探讨，请继续引导讨论。';
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
1. 整合各协作者提交的内容
2. 确保文档结构完整、逻辑清晰
3. 评估文档质量的置信度（0-1之间）

请使用以下格式：
【置信度评分】
- 文档完整性: X.XX
- 内容质量: X.XX
【最终结论】
（在此输出完整的文档内容，使用 Markdown 格式）`
    : `讨论已经进行了充分的时间。请现在做出最终裁决：
1. 总结各方的主要观点和论据
2. 评估每个关键假设的置信度（0-1之间）
3. 给出你的最终结论

请使用以下格式：
【置信度评分】
- 假设1: X.XX
- 假设2: X.XX
【最终结论】
你的结论内容`;

  return invokeJudge(context, instruction);
}
