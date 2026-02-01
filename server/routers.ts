import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createDiscussion,
  getAllDiscussions,
  getDiscussionById,
  updateDiscussion,
  deleteDiscussion,
  createMessage,
  getMessagesByDiscussionId,
  upsertModelConfig,
  getAllModelConfigs,
  deleteModelConfig,
  getDefaultSettings,
  updateDefaultSettings,
} from "./db";
import { SUPPORTED_MODELS, ModelProvider, testApiKey } from "./aiModels";
import {
  startDiscussion,
  executeDiscussionRound,
  requestFinalVerdict,
  DiscussionContext,
  invokeJudge,
  invokeGuest,
  getDiscussionLogs,
  clearDiscussionLogs,
} from "./discussionOrchestrator";
import type { ModelConfig } from "./aiModels";

// 辅助函数：获取模型配置 Map
function getModelConfigsMap(): Map<string, ModelConfig> {
  const configs = getAllModelConfigs();
  const modelConfigs = new Map<string, ModelConfig>();
  
  for (const config of configs) {
    if (config.isEnabled) {
      modelConfigs.set(config.modelProvider, {
        provider: config.modelProvider as ModelProvider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || undefined,
        model: config.modelName || undefined, // 包含用户选择的具体模型
      });
    }
  }
  
  // 添加内置模型
  modelConfigs.set('builtin', { provider: 'builtin' });
  
  return modelConfigs;
}

export const appRouter = router({
  // 讨论组管理
  discussion: router({
    // 获取所有讨论
    list: publicProcedure.query(() => {
      return getAllDiscussions();
    }),

    // 获取单个讨论详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => {
        const discussion = getDiscussionById(input.id);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        return discussion;
      }),

    // 创建新讨论
    create: publicProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        question: z.string().min(1),
        guestModels: z.array(z.string()).min(1).max(4),
        judgeModel: z.string(),
        confidenceThreshold: z.number().min(0).max(1).default(0.8),
        enableDynamicAgent: z.boolean().default(false),
        dataReadLimit: z.number().min(1).max(1000).default(100),
      }))
      .mutation(({ input }) => {
        const discussion = createDiscussion(input);
        return discussion;
      }),

    // 更新讨论
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
      }))
      .mutation(({ input }) => {
        const discussion = getDiscussionById(input.id);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        updateDiscussion(input.id, {
          title: input.title,
          status: input.status,
        });
        return { success: true };
      }),

    // 删除讨论
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => {
        const discussion = getDiscussionById(input.id);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        deleteDiscussion(input.id);
        return { success: true };
      }),
  }),

  // 消息管理
  message: router({
    // 获取讨论的所有消息
    list: publicProcedure
      .input(z.object({ discussionId: z.number() }))
      .query(({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        return getMessagesByDiscussionId(input.discussionId);
      }),

    // 发送用户消息（主持人提问）
    sendHost: publicProcedure
      .input(z.object({
        discussionId: z.number(),
        content: z.string().min(1),
      }))
      .mutation(({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        
        const message = createMessage({
          discussionId: input.discussionId,
          role: "host",
          content: input.content,
        });
        
        return message;
      }),
  }),

  // AI 编排
  orchestrator: router({
    // 开始讨论
    start: publicProcedure
      .input(z.object({ discussionId: z.number() }))
      .mutation(async ({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        
        const modelConfigs = getModelConfigsMap();
        
        const context: DiscussionContext = {
          discussion,
          messages: [],
          modelConfigs,
        };
        
        const hostMessage = await startDiscussion(context);
        return { message: hostMessage };
      }),

    // 执行一轮讨论
    executeRound: publicProcedure
      .input(z.object({
        discussionId: z.number(),
        roundNumber: z.number().min(1),
      }))
      .mutation(async ({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        
        const messages = getMessagesByDiscussionId(input.discussionId);
        const modelConfigs = getModelConfigsMap();
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await executeDiscussionRound(context, input.roundNumber);
        return result;
      }),

    // 让裁判发言
    invokeJudge: publicProcedure
      .input(z.object({
        discussionId: z.number(),
        instruction: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        
        const messages = getMessagesByDiscussionId(input.discussionId);
        const modelConfigs = getModelConfigsMap();
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await invokeJudge(context, input.instruction);
        return result;
      }),

    // 获取讨论日志
    getLogs: publicProcedure
      .input(z.object({ discussionId: z.number() }))
      .query(({ input }) => {
        return getDiscussionLogs(input.discussionId);
      }),

    // 清除讨论日志
    clearLogs: publicProcedure
      .input(z.object({ discussionId: z.number() }))
      .mutation(({ input }) => {
        clearDiscussionLogs(input.discussionId);
        return { success: true };
      }),

    // 让嘉宾发言
    invokeGuest: publicProcedure
      .input(z.object({
        discussionId: z.number(),
        guestModel: z.string(),
      }))
      .mutation(async ({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        
        const messages = getMessagesByDiscussionId(input.discussionId);
        const modelConfigs = getModelConfigsMap();
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await invokeGuest(context, input.guestModel);
        return result;
      }),

    // 请求最终裁决
    requestVerdict: publicProcedure
      .input(z.object({ discussionId: z.number() }))
      .mutation(async ({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        
        const messages = getMessagesByDiscussionId(input.discussionId);
        const modelConfigs = getModelConfigsMap();
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await requestFinalVerdict(context);
        return result;
      }),
  }),

  // 模型配置管理
  modelConfig: router({
    // 获取支持的模型列表
    supportedModels: publicProcedure.query(() => SUPPORTED_MODELS),

    // 获取模型配置
    list: publicProcedure.query(() => {
      const configs = getAllModelConfigs();
      // 隐藏 API Key 的完整内容
      return configs.map(c => ({
        ...c,
        apiKey: c.apiKey ? `${c.apiKey.slice(0, 8)}...${c.apiKey.slice(-4)}` : '',
      }));
    }),

    // 保存模型配置
    save: publicProcedure
      .input(z.object({
        modelProvider: z.string(),
        modelName: z.string().optional(),
        apiKey: z.string(),
        baseUrl: z.string().optional(),
        isEnabled: z.boolean().default(true),
      }))
      .mutation(({ input }) => {
        const config = upsertModelConfig(input);
        return {
          ...config,
          apiKey: `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`,
        };
      }),

    // 删除模型配置
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => {
        deleteModelConfig(input.id);
        return { success: true };
      }),

    // 测试 API Key
    test: publicProcedure
      .input(z.object({
        provider: z.string(),
        apiKey: z.string(),
        baseUrl: z.string().optional(),
        modelName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await testApiKey({
          provider: input.provider as ModelProvider,
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          model: input.modelName,
        });
        return result;
      }),
  }),

  // 系统设置
  settings: router({
    // 获取默认设置
    get: publicProcedure.query(() => {
      const settings = getDefaultSettings();
      return {
        ...settings,
        enterpriseApiKey: settings.enterpriseApiKey 
          ? `${settings.enterpriseApiKey.slice(0, 8)}...` 
          : undefined,
      };
    }),

    // 保存默认设置
    save: publicProcedure
      .input(z.object({
        defaultJudgeModel: z.string().optional(),
        defaultConfidenceThreshold: z.number().min(0).max(1).optional(),
        defaultEnableDynamicAgent: z.boolean().optional(),
        defaultDataReadLimit: z.number().min(1).max(1000).optional(),
        enterpriseApiUrl: z.string().optional(),
        enterpriseApiKey: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const settings = updateDefaultSettings(input);
        return {
          ...settings,
          enterpriseApiKey: settings.enterpriseApiKey 
            ? `${settings.enterpriseApiKey.slice(0, 8)}...` 
            : undefined,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
