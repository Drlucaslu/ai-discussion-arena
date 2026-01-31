/**
 * 讨论编排服务 - 管理 AI 角色之间的交互流程
 */

import { callAIModel, ModelConfig, ChatMessage, getModelDisplayName } from './aiModels';
import { createMessage, updateDiscussion, getMessagesByDiscussionId } from './db';
import type { Discussion, Message } from '../drizzle/schema';

// 角色系统提示词
const SYSTEM_PROMPTS = {
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
  
  // 匹配置信度评分部分
  const scoreMatch = content.match(/【置信度评分】([\s\S]*?)(?:【|$)/);
  if (!scoreMatch) return null;
  
  const scoreSection = scoreMatch[1];
  const lines = scoreSection.split('\n');
  
  for (const line of lines) {
    const match = line.match(/[-•]\s*(.+?)[:：]\s*([\d.]+)/);
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
  const conclusionMatch = content.match(/【最终结论】([\s\S]*?)$/);
  if (conclusionMatch) {
    return conclusionMatch[1].trim();
  }
  return null;
}

/**
 * 构建对话历史
 */
function buildChatHistory(messages: Message[], role: 'judge' | 'guest', modelName?: string): ChatMessage[] {
  const systemPrompt = role === 'judge' 
    ? SYSTEM_PROMPTS.judge 
    : SYSTEM_PROMPTS.guest(modelName || 'AI');
  
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
  
  const chatHistory = buildChatHistory(messages, 'judge');
  
  // 添加特殊指令
  if (instruction) {
    chatHistory.push({ role: 'user', content: instruction });
    addDiscussionLog(discussion.id, 'debug', '裁判', `添加指令: ${instruction.slice(0, 50)}...`);
  }
  
  addDiscussionLog(discussion.id, 'info', '裁判', `发送 API 请求...`, {
    messageCount: chatHistory.length,
  });
  
  const startTime = Date.now();
  const result = await callAIModel(judgeConfig, {
    messages: chatHistory,
    temperature: 0.7,
  });
  const responseTime = Date.now() - startTime;
  
  addDiscussionLog(discussion.id, 'info', '裁判', `收到响应，耗时 ${responseTime}ms`, {
    responseTime,
    contentLength: result.content.length,
    fallbackUsed: result.fallbackUsed,
  });
  
  // 确定实际使用的模型名称
  let modelName = getModelDisplayName(judgeConfig.provider);
  if (result.fallbackUsed) {
    modelName = `内置模型 (Manus)`;
    addDiscussionLog(discussion.id, 'warn', '裁判', `回退到内置模型`, {
      originalError: result.originalError,
    });
  } else {
    addDiscussionLog(discussion.id, 'info', '裁判', `成功使用模型: ${modelName}`);
  }
  
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
  
  if (confidenceScores && finalConclusion) {
    // 更新讨论状态
    await updateDiscussion(discussion.id, {
      status: 'completed',
      finalVerdict: finalConclusion,
      confidenceScores,
    });
    
    return {
      message,
      isComplete: true,
      verdict: {
        conclusion: finalConclusion,
        confidenceScores,
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
  
  let modelDisplayName = getModelDisplayName(guestConfig.provider);
  
  addDiscussionLog(discussion.id, 'info', '嘉宾', `准备调用嘉宾模型: ${modelDisplayName}`, {
    provider: guestConfig.provider,
    hasApiKey: !!guestConfig.apiKey,
  });
  
  const chatHistory = buildChatHistory(messages, 'guest', modelDisplayName);
  
  addDiscussionLog(discussion.id, 'info', '嘉宾', `发送 API 请求...`, {
    messageCount: chatHistory.length,
  });
  
  const startTime = Date.now();
  const result = await callAIModel(guestConfig, {
    messages: chatHistory,
    temperature: 0.8,
  });
  const responseTime = Date.now() - startTime;
  
  addDiscussionLog(discussion.id, 'info', '嘉宾', `收到响应，耗时 ${responseTime}ms`, {
    responseTime,
    contentLength: result.content.length,
    fallbackUsed: result.fallbackUsed,
  });
  
  // 如果回退到内置模型，更新显示名称
  if (result.fallbackUsed) {
    modelDisplayName = `内置模型 (Manus)`;
    addDiscussionLog(discussion.id, 'warn', '嘉宾', `回退到内置模型`, {
      originalError: result.originalError,
    });
  } else {
    addDiscussionLog(discussion.id, 'info', '嘉宾', `成功使用模型: ${modelDisplayName}`);
  }
  
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
  const roundMessages: Message[] = [];
  
  // 获取最新消息列表
  const currentMessages = await getMessagesByDiscussionId(discussion.id);
  context.messages = currentMessages;
  
  // 1. 裁判引导
  let judgeInstruction: string;
  if (roundNumber === 1) {
    judgeInstruction = '请开始主持这场讨论。首先介绍讨论主题，然后邀请各位嘉宾发表初始观点。';
  } else if (roundNumber >= 5) {
    judgeInstruction = '讨论已进行多轮，请评估是否已达成共识。如果是，请给出最终裁决和置信度评分；如果否，请继续引导讨论。';
  } else {
    judgeInstruction = '请根据之前的讨论，继续引导嘉宾深入探讨，或要求他们提供更多证据。';
  }
  
  const judgeResult = await invokeJudge(
    { ...context, messages: currentMessages },
    judgeInstruction
  );
  roundMessages.push(judgeResult.message);
  
  if (judgeResult.isComplete) {
    return {
      messages: roundMessages,
      isComplete: true,
      verdict: judgeResult.verdict,
    };
  }
  
  // 2. 各嘉宾依次发言
  for (const guestModel of discussion.guestModels) {
    // 更新消息列表
    const updatedMessages = await getMessagesByDiscussionId(discussion.id);
    context.messages = updatedMessages;
    
    const guestResult = await invokeGuest(context, guestModel);
    roundMessages.push(guestResult.message);
  }
  
  return {
    messages: roundMessages,
    isComplete: false,
  };
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
  const instruction = `讨论已经进行了充分的时间。请现在做出最终裁决：
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
