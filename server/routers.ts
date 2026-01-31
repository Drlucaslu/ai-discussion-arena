import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createDiscussion,
  getDiscussionsByUserId,
  getDiscussionById,
  updateDiscussion,
  deleteDiscussion,
  createMessage,
  getMessagesByDiscussionId,
  upsertModelConfig,
  getModelConfigsByUserId,
  deleteModelConfig,
  upsertUserSettings,
  getUserSettings,
} from "./db";
import { SUPPORTED_MODELS, ModelProvider, testApiKey } from "./aiModels";
import {
  startDiscussion,
  executeDiscussionRound,
  requestFinalVerdict,
  DiscussionContext,
  invokeJudge,
  invokeGuest,
} from "./discussionOrchestrator";
import type { ModelConfig } from "./aiModels";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // 讨论组管理
  discussion: router({
    // 获取用户的所有讨论
    list: protectedProcedure.query(async ({ ctx }) => {
      return getDiscussionsByUserId(ctx.user.id);
    }),

    // 获取单个讨论详情
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.id);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        return discussion;
      }),

    // 创建新讨论
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        question: z.string().min(1),
        guestModels: z.array(z.string()).min(1).max(4),
        judgeModel: z.string(),
        confidenceThreshold: z.number().min(0).max(1).default(0.8),
        enableDynamicAgent: z.boolean().default(false),
        dataReadLimit: z.number().min(1).max(1000).default(100),
      }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await createDiscussion({
          userId: ctx.user.id,
          ...input,
        });
        return discussion;
      }),

    // 更新讨论
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.id);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        await updateDiscussion(input.id, {
          title: input.title,
          status: input.status,
        });
        return { success: true };
      }),

    // 删除讨论
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.id);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        await deleteDiscussion(input.id);
        return { success: true };
      }),
  }),

  // 消息管理
  message: router({
    // 获取讨论的所有消息
    list: protectedProcedure
      .input(z.object({ discussionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        return getMessagesByDiscussionId(input.discussionId);
      }),

    // 发送用户消息（主持人提问）
    sendHost: protectedProcedure
      .input(z.object({
        discussionId: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        
        const message = await createMessage({
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
    start: protectedProcedure
      .input(z.object({ discussionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        
        // 获取用户的模型配置
        const userConfigs = await getModelConfigsByUserId(ctx.user.id);
        const modelConfigs = new Map<string, ModelConfig>();
        
        for (const config of userConfigs) {
          if (config.isEnabled) {
            modelConfigs.set(config.modelProvider, {
              provider: config.modelProvider as ModelProvider,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl || undefined,
            });
          }
        }
        
        // 添加内置模型
        modelConfigs.set('builtin', { provider: 'builtin' });
        
        const context: DiscussionContext = {
          discussion,
          messages: [],
          modelConfigs,
        };
        
        const hostMessage = await startDiscussion(context);
        return { message: hostMessage };
      }),

    // 执行一轮讨论
    executeRound: protectedProcedure
      .input(z.object({
        discussionId: z.number(),
        roundNumber: z.number().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        
        const messages = await getMessagesByDiscussionId(input.discussionId);
        const userConfigs = await getModelConfigsByUserId(ctx.user.id);
        const modelConfigs = new Map<string, ModelConfig>();
        
        for (const config of userConfigs) {
          if (config.isEnabled) {
            modelConfigs.set(config.modelProvider, {
              provider: config.modelProvider as ModelProvider,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl || undefined,
            });
          }
        }
        
        modelConfigs.set('builtin', { provider: 'builtin' });
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await executeDiscussionRound(context, input.roundNumber);
        return result;
      }),

    // 让裁判发言
    invokeJudge: protectedProcedure
      .input(z.object({
        discussionId: z.number(),
        instruction: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        
        const messages = await getMessagesByDiscussionId(input.discussionId);
        const userConfigs = await getModelConfigsByUserId(ctx.user.id);
        const modelConfigs = new Map<string, ModelConfig>();
        
        for (const config of userConfigs) {
          if (config.isEnabled) {
            modelConfigs.set(config.modelProvider, {
              provider: config.modelProvider as ModelProvider,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl || undefined,
            });
          }
        }
        
        modelConfigs.set('builtin', { provider: 'builtin' });
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await invokeJudge(context, input.instruction);
        return result;
      }),

    // 让嘉宾发言
    invokeGuest: protectedProcedure
      .input(z.object({
        discussionId: z.number(),
        guestModel: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        
        const messages = await getMessagesByDiscussionId(input.discussionId);
        const userConfigs = await getModelConfigsByUserId(ctx.user.id);
        const modelConfigs = new Map<string, ModelConfig>();
        
        for (const config of userConfigs) {
          if (config.isEnabled) {
            modelConfigs.set(config.modelProvider, {
              provider: config.modelProvider as ModelProvider,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl || undefined,
            });
          }
        }
        
        modelConfigs.set('builtin', { provider: 'builtin' });
        
        const context: DiscussionContext = {
          discussion,
          messages,
          modelConfigs,
        };
        
        const result = await invokeGuest(context, input.guestModel);
        return result;
      }),

    // 请求最终裁决
    requestVerdict: protectedProcedure
      .input(z.object({ discussionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const discussion = await getDiscussionById(input.discussionId);
        if (!discussion || discussion.userId !== ctx.user.id) {
          throw new Error("讨论不存在或无权访问");
        }
        
        const messages = await getMessagesByDiscussionId(input.discussionId);
        const userConfigs = await getModelConfigsByUserId(ctx.user.id);
        const modelConfigs = new Map<string, ModelConfig>();
        
        for (const config of userConfigs) {
          if (config.isEnabled) {
            modelConfigs.set(config.modelProvider, {
              provider: config.modelProvider as ModelProvider,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl || undefined,
            });
          }
        }
        
        modelConfigs.set('builtin', { provider: 'builtin' });
        
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

    // 获取用户的模型配置
    list: protectedProcedure.query(async ({ ctx }) => {
      const configs = await getModelConfigsByUserId(ctx.user.id);
      // 隐藏 API Key 的完整内容
      return configs.map(c => ({
        ...c,
        apiKey: c.apiKey ? `${c.apiKey.slice(0, 8)}...${c.apiKey.slice(-4)}` : '',
      }));
    }),

    // 保存模型配置
    save: protectedProcedure
      .input(z.object({
        modelProvider: z.string(),
        apiKey: z.string(),
        baseUrl: z.string().optional(),
        isEnabled: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const config = await upsertModelConfig({
          userId: ctx.user.id,
          ...input,
        });
        return {
          ...config,
          apiKey: `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`,
        };
      }),

    // 删除模型配置
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteModelConfig(input.id);
        return { success: true };
      }),

    // 测试 API Key
    test: protectedProcedure
      .input(z.object({
        provider: z.string(),
        apiKey: z.string(),
        baseUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await testApiKey({
          provider: input.provider as ModelProvider,
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
        });
        return result;
      }),
  }),

  // 用户设置
  settings: router({
    // 获取用户设置
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserSettings(ctx.user.id);
      if (settings) {
        return {
          ...settings,
          enterpriseApiKey: settings.enterpriseApiKey 
            ? `${settings.enterpriseApiKey.slice(0, 8)}...` 
            : null,
        };
      }
      return null;
    }),

    // 保存用户设置
    save: protectedProcedure
      .input(z.object({
        defaultJudgeModel: z.string().optional(),
        defaultConfidenceThreshold: z.number().min(0).max(1).optional(),
        defaultEnableDynamicAgent: z.boolean().optional(),
        defaultDataReadLimit: z.number().min(1).max(1000).optional(),
        enterpriseApiUrl: z.string().optional(),
        enterpriseApiKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const settings = await upsertUserSettings({
          userId: ctx.user.id,
          ...input,
        });
        return {
          ...settings,
          enterpriseApiKey: settings.enterpriseApiKey 
            ? `${settings.enterpriseApiKey.slice(0, 8)}...` 
            : null,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
