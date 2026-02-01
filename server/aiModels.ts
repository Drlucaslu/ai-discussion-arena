/**
 * AI 模型服务层 - 封装多种 LLM API 调用
 * 支持 OpenAI, Gemini, Claude, DeepSeek 等模型
 */

export type ModelProvider = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'builtin';

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
  builtin: {
    defaultModel: 'default',
    baseUrl: '',
  },
};

// 支持的模型列表（用于前端展示）
export const SUPPORTED_MODELS = [
  { provider: 'openai' as const, name: 'OpenAI GPT-4o', model: 'gpt-4o' },
  { provider: 'openai' as const, name: 'OpenAI GPT-4o-mini', model: 'gpt-4o-mini' },
  { provider: 'gemini' as const, name: 'Google Gemini 2.5 Flash', model: 'gemini-2.5-flash' },
  { provider: 'gemini' as const, name: 'Google Gemini 2.5 Pro', model: 'gemini-2.5-pro' },
  { provider: 'gemini' as const, name: 'Google Gemini 1.5 Pro', model: 'gemini-1.5-pro-latest' },
  { provider: 'gemini' as const, name: 'Google Gemini 1.5 Flash', model: 'gemini-1.5-flash-latest' },
  { provider: 'claude' as const, name: 'Anthropic Claude Sonnet 4.5', model: 'claude-sonnet-4-5' },
  { provider: 'claude' as const, name: 'Anthropic Claude Haiku 4.5', model: 'claude-haiku-4-5' },
  { provider: 'claude' as const, name: 'Anthropic Claude Opus 4.5', model: 'claude-opus-4-5' },
  { provider: 'claude' as const, name: 'Anthropic Claude Sonnet 3.7', model: 'claude-3-7-sonnet-latest' },
  { provider: 'deepseek' as const, name: 'DeepSeek Chat', model: 'deepseek-chat' },
  { provider: 'deepseek' as const, name: 'DeepSeek Reasoner', model: 'deepseek-reasoner' },
  { provider: 'builtin' as const, name: '内置模型 (Manus)', model: 'builtin' },
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
 * 调用内置 LLM（使用 Manus 提供的 API）
 * 注意：内置模型仅在 Manus 平台上可用，本地部署时需要配置外部 API Key
 */
async function callBuiltinLLM(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  // 检查内置 API 是否可用
  const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;
  if (!forgeApiKey || forgeApiKey.trim() === '') {
    throw new Error(
      '内置模型仅在 Manus 平台上可用。\n' +
      '本地部署时，请在设置页面配置外部 API Key（如 OpenAI、DeepSeek 等），\n' +
      '然后在创建讨论时选择对应的模型。'
    );
  }
  
  // 动态导入内置 LLM
  const { invokeLLM } = await import('./_core/llm');
  
  const response = await invokeLLM({
    messages: options.messages,
  });

  const messageContent = response.choices[0]?.message?.content;
  const content = typeof messageContent === 'string' ? messageContent : '';

  return {
    content,
    model: 'builtin',
  };
}

/**
 * 统一的 AI 模型调用接口
 * 支持自动回退到内置模型
 */
export async function callAIModel(
  config: ModelConfig,
  options: ChatCompletionOptions,
  enableFallback: boolean = true
): Promise<ChatCompletionResult & { fallbackUsed?: boolean; originalError?: string }> {
  // 如果是内置模型，直接调用
  if (config.provider === 'builtin') {
    return callBuiltinLLM(options);
  }

  // 外部模型调用，包装错误处理和回退逻辑
  try {
    let result: ChatCompletionResult;
    
    switch (config.provider) {
      case 'openai':
      case 'deepseek':
        result = await callOpenAICompatible(config, options);
        break;
      case 'gemini':
        result = await callGemini(config, options);
        break;
      case 'claude':
        result = await callClaude(config, options);
        break;
      default:
        throw new Error(`不支持的模型提供商: ${config.provider}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AI Model] ${config.provider} 调用失败:`, errorMessage);
    
    // 如果启用了回退机制，尝试使用内置模型
    if (enableFallback) {
      // 检查内置模型是否可用
      const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;
      if (!forgeApiKey || forgeApiKey.trim() === '') {
        // 内置模型不可用，直接抛出原始错误并给出提示
        throw new Error(
          `${config.provider} API 调用失败: ${errorMessage}\n\n` +
          `请检查您的 API Key 是否正确配置。\n` +
          `如果问题持续，请在设置页面重新测试 API Key。`
        );
      }
      
      console.log(`[AI Model] 回退到内置模型...`);
      try {
        const fallbackResult = await callBuiltinLLM(options);
        return {
          ...fallbackResult,
          fallbackUsed: true,
          originalError: errorMessage,
        };
      } catch (fallbackError) {
        // 内置模型也失败了，抛出原始错误
        const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`执行失败: ${errorMessage}\n回退也失败: ${fallbackErrorMsg}`);
      }
    }
    
    // 不启用回退，直接抛出错误
    throw new Error(`执行失败: ${errorMessage}`);
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
  
  // 内置模型不需要测试
  if (provider === 'builtin') {
    logs.push(`[${new Date().toISOString()}] 内置模型无需测试 API Key`);
    return {
      success: true,
      provider,
      model,
      responseTime: Date.now() - startTime,
      message: '内置模型可直接使用',
      logs,
    };
  }
  
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
    }, false); // 禁用回退，直接测试目标 API
    
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
