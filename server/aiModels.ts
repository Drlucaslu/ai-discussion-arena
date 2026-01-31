/**
 * AI 模型服务层 - 封装多种 LLM API 调用
 * 支持 OpenAI, Gemini, Claude, DeepSeek 等模型
 */

export type ModelProvider = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'builtin';

export interface ModelConfig {
  provider: ModelProvider;
  apiKey?: string;
  baseUrl?: string;
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
    defaultModel: 'gemini-1.5-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  claude: {
    defaultModel: 'claude-3-5-sonnet-20241022',
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
  { provider: 'gemini' as const, name: 'Google Gemini 1.5 Pro', model: 'gemini-1.5-pro' },
  { provider: 'gemini' as const, name: 'Google Gemini 1.5 Flash', model: 'gemini-1.5-flash' },
  { provider: 'claude' as const, name: 'Anthropic Claude 3.5 Sonnet', model: 'claude-3-5-sonnet-20241022' },
  { provider: 'claude' as const, name: 'Anthropic Claude 3.5 Haiku', model: 'claude-3-5-haiku-20241022' },
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
  const model = options.model || MODEL_CONFIGS[config.provider].defaultModel;
  
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
  const model = options.model || MODEL_CONFIGS.gemini.defaultModel;
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
  const model = options.model || MODEL_CONFIGS.claude.defaultModel;
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
 */
async function callBuiltinLLM(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
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
        throw new Error(`执行失败: ${errorMessage}（回退也失败）`);
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
