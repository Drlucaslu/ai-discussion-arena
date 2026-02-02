/**
 * AI 模型服务层 - 封装多种 LLM API 调用
 * 支持 OpenAI, Gemini, Claude, DeepSeek 等模型
 */

export type ModelProvider = 'openai' | 'gemini' | 'claude' | 'deepseek';

export interface ModelConfig {
  provider: ModelProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string; // 具体的模型名称，如 gemini-2.5-flash
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type StreamCallback = (chunk: string) => void;

// 模型提供商配置
const MODEL_CONFIGS: Record<ModelProvider, { defaultModel: string; baseUrl: string }> = {
  openai: {
    defaultModel: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
  },
  gemini: {
    defaultModel: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  claude: {
    defaultModel: 'claude-sonnet-4-5',
    baseUrl: 'https://api.anthropic.com/v1',
  },
  deepseek: {
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },
};

// 支持的模型列表（用于前端展示）
export const SUPPORTED_MODELS = [
  { provider: 'openai' as const, name: 'OpenAI GPT-4o', model: 'gpt-4o' },
  { provider: 'openai' as const, name: 'OpenAI GPT-4o-mini', model: 'gpt-4o-mini' },
  { provider: 'gemini' as const, name: 'Google Gemini 2.5 Flash', model: 'gemini-2.5-flash' },
  { provider: 'gemini' as const, name: 'Google Gemini 2.5 Pro', model: 'gemini-2.5-pro' },
  { provider: 'claude' as const, name: 'Anthropic Claude Sonnet 4.5', model: 'claude-sonnet-4-5' },
  { provider: 'claude' as const, name: 'Anthropic Claude Haiku 4.5', model: 'claude-haiku-4-5' },
  { provider: 'claude' as const, name: 'Anthropic Claude Opus 4.5', model: 'claude-opus-4-5' },
  { provider: 'claude' as const, name: 'Anthropic Claude Sonnet 3.7', model: 'claude-3-7-sonnet-latest' },
  { provider: 'deepseek' as const, name: 'DeepSeek Chat', model: 'deepseek-chat' },
  { provider: 'deepseek' as const, name: 'DeepSeek Reasoner', model: 'deepseek-reasoner' },
];

/**
 * 调用 OpenAI 兼容 API
 */
async function callOpenAICompatible(
  config: ModelConfig,
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const baseUrl = config.baseUrl || MODEL_CONFIGS[config.provider].baseUrl;
  // 优先使用 config.model，其次是 options.model，最后是默认模型
  const model = config.model || options.model || MODEL_CONFIGS[config.provider].defaultModel;
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    model: data.model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
  };
}

/**
 * 调用 Gemini API
 */
async function callGemini(
  config: ModelConfig,
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  // 优先使用 config.model，其次是 options.model，最后是默认模型
  const model = config.model || options.model || MODEL_CONFIGS.gemini.defaultModel;
  const baseUrl = config.baseUrl || MODEL_CONFIGS.gemini.baseUrl;
  
  // 转换消息格式为 Gemini 格式
  const contents = options.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  // 系统消息作为 systemInstruction
  const systemMessage = options.messages.find(m => m.role === 'system');

  const response = await fetch(
    `${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API 调用失败: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    model,
    usage: data.usageMetadata ? {
      promptTokens: data.usageMetadata.promptTokenCount,
      completionTokens: data.usageMetadata.candidatesTokenCount,
      totalTokens: data.usageMetadata.totalTokenCount,
    } : undefined,
  };
}

/**
 * 调用 Claude API
 */
async function callClaude(
  config: ModelConfig,
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  // 优先使用 config.model，其次是 options.model，最后是默认模型
  const model = config.model || options.model || MODEL_CONFIGS.claude.defaultModel;
  const baseUrl = config.baseUrl || MODEL_CONFIGS.claude.baseUrl;
  
  // 提取系统消息
  const systemMessage = options.messages.find(m => m.role === 'system');
  const otherMessages = options.messages.filter(m => m.role !== 'system');

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: otherMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API 调用失败: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text || '',
    model: data.model,
    usage: data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    } : undefined,
  };
}

/**
 * 流式调用 OpenAI 兼容 API
 */
async function streamOpenAICompatible(
  config: ModelConfig,
  options: ChatCompletionOptions,
  onChunk: StreamCallback
): Promise<ChatCompletionResult> {
  const baseUrl = config.baseUrl || MODEL_CONFIGS[config.provider].baseUrl;
  const model = config.model || options.model || MODEL_CONFIGS[config.provider].defaultModel;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${error}`);
  }

  let fullContent = '';
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {}
    }
  }

  return { content: fullContent, model };
}

/**
 * 流式调用 Gemini API
 */
async function streamGemini(
  config: ModelConfig,
  options: ChatCompletionOptions,
  onChunk: StreamCallback
): Promise<ChatCompletionResult> {
  const model = config.model || options.model || MODEL_CONFIGS.gemini.defaultModel;
  const baseUrl = config.baseUrl || MODEL_CONFIGS.gemini.baseUrl;

  const contents = options.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemMessage = options.messages.find(m => m.role === 'system');

  const response = await fetch(
    `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API 调用失败: ${response.status} - ${error}`);
  }

  let fullContent = '';
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullContent += text;
          onChunk(text);
        }
      } catch {}
    }
  }

  return { content: fullContent, model };
}

/**
 * 流式调用 Claude API
 */
async function streamClaude(
  config: ModelConfig,
  options: ChatCompletionOptions,
  onChunk: StreamCallback
): Promise<ChatCompletionResult> {
  const model = config.model || options.model || MODEL_CONFIGS.claude.defaultModel;
  const baseUrl = config.baseUrl || MODEL_CONFIGS.claude.baseUrl;

  const systemMessage = options.messages.find(m => m.role === 'system');
  const otherMessages = options.messages.filter(m => m.role !== 'system');

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      system: systemMessage?.content,
      messages: otherMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API 调用失败: ${response.status} - ${error}`);
  }

  let fullContent = '';
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          onChunk(parsed.delta.text);
        }
      } catch {}
    }
  }

  return { content: fullContent, model };
}

/**
 * 统一的流式 AI 模型调用接口
 */
export async function streamAIModel(
  config: ModelConfig,
  options: ChatCompletionOptions,
  onChunk: StreamCallback
): Promise<ChatCompletionResult> {
  try {
    switch (config.provider) {
      case 'openai':
      case 'deepseek':
        return await streamOpenAICompatible(config, options, onChunk);
      case 'gemini':
        return await streamGemini(config, options, onChunk);
      case 'claude':
        return await streamClaude(config, options, onChunk);
      default:
        throw new Error(`不支持的模型提供商: ${config.provider}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AI Model Stream] ${config.provider} 调用失败:`, errorMessage);
    throw new Error(
      `${config.provider} API 流式调用失败: ${errorMessage}\n\n` +
      `请检查您的 API Key 是否正确配置。`
    );
  }
}

/**
 * 统一的 AI 模型调用接口
 */
export async function callAIModel(
  config: ModelConfig,
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  try {
    switch (config.provider) {
      case 'openai':
      case 'deepseek':
        return await callOpenAICompatible(config, options);
      case 'gemini':
        return await callGemini(config, options);
      case 'claude':
        return await callClaude(config, options);
      default:
        throw new Error(`不支持的模型提供商: ${config.provider}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AI Model] ${config.provider} 调用失败:`, errorMessage);
    throw new Error(
      `${config.provider} API 调用失败: ${errorMessage}\n\n` +
      `请检查您的 API Key 是否正确配置。\n` +
      `如果问题持续，请在设置页面重新测试 API Key。`
    );
  }
}

/**
 * 获取模型的显示名称
 */
export function getModelDisplayName(provider: ModelProvider, model?: string): string {
  const found = SUPPORTED_MODELS.find(
    m => m.provider === provider && (model ? m.model === model : true)
  );
  return found?.name || `${provider}/${model || 'default'}`;
}


/**
 * API Key 测试结果
 */
export interface ApiKeyTestResult {
  success: boolean;
  provider: ModelProvider;
  model: string;
  responseTime: number;
  message: string;
  logs: string[];
  error?: string;
}

/**
 * 测试 API Key 是否有效
 * 通过发送一个简单的问答请求来验证
 */
export async function testApiKey(
  config: ModelConfig
): Promise<ApiKeyTestResult> {
  const logs: string[] = [];
  const startTime = Date.now();
  
  const provider = config.provider;
  // 优先使用用户指定的模型，否则使用默认模型
  const model = config.model || MODEL_CONFIGS[provider]?.defaultModel || 'unknown';
  
  logs.push(`[${new Date().toISOString()}] 开始测试 ${provider} API...`);
  logs.push(`[${new Date().toISOString()}] 目标模型: ${model}`);
  logs.push(`[${new Date().toISOString()}] API Key: ${config.apiKey?.slice(0, 8)}...${config.apiKey?.slice(-4)}`);

  // 检查 API Key 是否存在
  if (!config.apiKey) {
    logs.push(`[${new Date().toISOString()}] 错误: API Key 为空`);
    return {
      success: false,
      provider,
      model,
      responseTime: Date.now() - startTime,
      message: 'API Key 不能为空',
      logs,
      error: 'API Key 不能为空',
    };
  }
  
  logs.push(`[${new Date().toISOString()}] 发送测试请求...`);
  
  try {
    // 发送简单的测试请求
    const testMessages: ChatMessage[] = [
      { role: 'user', content: '请回复"测试成功"四个字。' }
    ];
    
    const result = await callAIModel(config, {
      messages: testMessages,
      maxTokens: 50,
      temperature: 0,
    });
    
    const responseTime = Date.now() - startTime;
    logs.push(`[${new Date().toISOString()}] 收到响应，耗时: ${responseTime}ms`);
    logs.push(`[${new Date().toISOString()}] 响应内容: ${result.content.slice(0, 100)}...`);
    logs.push(`[${new Date().toISOString()}] ✅ 测试成功！`);
    
    return {
      success: true,
      provider,
      model: result.model || model,
      responseTime,
      message: `API Key 验证成功，响应耗时 ${responseTime}ms`,
      logs,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logs.push(`[${new Date().toISOString()}] ❌ 测试失败`);
    logs.push(`[${new Date().toISOString()}] 错误信息: ${errorMessage}`);
    
    // 解析常见错误类型
    let friendlyMessage = errorMessage;
    if (errorMessage.includes('401') || errorMessage.includes('Incorrect API key')) {
      friendlyMessage = 'API Key 无效或已过期，请检查后重新输入';
    } else if (errorMessage.includes('403')) {
      friendlyMessage = 'API Key 权限不足，请确认账户状态';
    } else if (errorMessage.includes('429')) {
      friendlyMessage = 'API 调用频率超限，请稍后再试';
    } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      friendlyMessage = 'API 服务暂时不可用，请稍后再试';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      friendlyMessage = '请求超时，请检查网络连接';
    }
    
    return {
      success: false,
      provider,
      model,
      responseTime,
      message: friendlyMessage,
      logs,
      error: errorMessage,
    };
  }
}
