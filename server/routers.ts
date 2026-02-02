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
import { saveUploadedFile, parsePDF, parseExcel, parseMarkdown, parseImage, IMAGE_EXTENSIONS } from "./fileParsing";
import {
  startDiscussion,
  executeDiscussionRound,
  requestFinalVerdict,
  DiscussionContext,
  invokeJudge,
  invokeGuest,
  getDiscussionLogs,
  clearDiscussionLogs,
  addDiscussionLog,
  getExecutionState,
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
        mode: z.enum(['discussion', 'document']).optional().default('discussion'),
        attachments: z.array(z.object({
          fileName: z.string(),
          fileType: z.enum(['pdf', 'xlsx', 'xls', 'md']),
          base64Data: z.string(),
        })).optional().default([]),
      }))
      .mutation(async ({ input }) => {
        const { attachments: rawAttachments, ...rest } = input;

        // 先创建讨论
        const discussion = createDiscussion(rest);

        // 处理附件
        if (rawAttachments && rawAttachments.length > 0) {
          const attachments = [];
          for (const att of rawAttachments) {
            const { filePath, buffer } = saveUploadedFile(att.fileName, att.base64Data, discussion.id);
            let extractedText = '';
            if (att.fileType === 'pdf') {
              extractedText = await parsePDF(buffer);
            } else if (att.fileType === 'md') {
              extractedText = parseMarkdown(buffer);
            } else {
              extractedText = await parseExcel(buffer);
            }
            attachments.push({
              id: `${discussion.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              fileName: att.fileName,
              fileType: att.fileType,
              fileSize: buffer.length,
              filePath,
              extractedText,
              uploadedAt: new Date().toISOString(),
            });
          }
          updateDiscussion(discussion.id, { attachments } as any);
          return getDiscussionById(discussion.id)!;
        }

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

    // 执行一轮讨论（fire-and-forget，通过 getRoundStatus 轮询进度）
    executeRound: publicProcedure
      .input(z.object({
        discussionId: z.number(),
        roundNumber: z.number().min(1),
      }))
      .mutation(({ input }) => {
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

        // Fire and forget - 不等待完成，前端通过轮询获取进度
        executeDiscussionRound(context, input.roundNumber).catch((err) => {
          addDiscussionLog(discussion.id, 'error', '系统', `轮次执行失败: ${err.message}`);
        });

        return { started: true };
      }),

    // 获取轮次执行状态
    getRoundStatus: publicProcedure
      .input(z.object({ discussionId: z.number() }))
      .query(({ input }) => {
        return getExecutionState(input.discussionId);
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

    // 继续已完成的讨论（添加新信息后重新开启）
    continueDiscussion: publicProcedure
      .input(z.object({
        discussionId: z.number(),
        content: z.string().min(1),
        attachments: z.array(z.object({
          fileName: z.string(),
          fileType: z.enum(['pdf', 'xlsx', 'xls', 'md', 'png', 'jpg', 'jpeg', 'gif', 'webp']),
          base64Data: z.string(),
        })).optional().default([]),
      }))
      .mutation(async ({ input }) => {
        const discussion = getDiscussionById(input.discussionId);
        if (!discussion) {
          throw new Error("讨论不存在");
        }
        if (discussion.status !== 'completed') {
          throw new Error("只能继续已完成的讨论");
        }

        // 处理新附件
        const newAttachments = [];
        for (const att of input.attachments) {
          const { filePath, buffer } = saveUploadedFile(att.fileName, att.base64Data, discussion.id);
          let extractedText = '';
          if (att.fileType === 'pdf') {
            extractedText = await parsePDF(buffer);
          } else if (att.fileType === 'md') {
            extractedText = parseMarkdown(buffer);
          } else if (IMAGE_EXTENSIONS.includes(att.fileType)) {
            extractedText = parseImage(att.fileName, buffer.length);
          } else {
            extractedText = await parseExcel(buffer);
          }
          newAttachments.push({
            id: `${discussion.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: buffer.length,
            filePath,
            extractedText,
            uploadedAt: new Date().toISOString(),
          });
        }

        // 合并附件
        const allAttachments = [...(discussion.attachments || []), ...newAttachments];

        // 构建主持人消息内容
        let hostContent = input.content;
        if (newAttachments.length > 0) {
          const fileSummaries = newAttachments
            .map(a => `- ${a.fileName} (${a.fileType})`)
            .join('\n');
          hostContent += `\n\n[附加文件]\n${fileSummaries}`;
        }

        // 创建新的主持人消息
        createMessage({
          discussionId: input.discussionId,
          role: 'host',
          content: hostContent,
        });

        // 重新开启讨论
        updateDiscussion(input.discussionId, {
          status: 'active',
          attachments: allAttachments,
          finalVerdict: null,
          confidenceScores: null,
        } as any);

        addDiscussionLog(input.discussionId, 'info', '系统', '讨论已重新开启，发起人补充了新信息');

        return getDiscussionById(input.discussionId)!;
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

  // 统计分析
  stats: router({
    overview: publicProcedure.query(() => {
      const allDiscussions = getAllDiscussions();
      const total = allDiscussions.length;
      const completed = allDiscussions.filter(d => d.status === 'completed').length;
      const active = allDiscussions.filter(d => d.status === 'active').length;

      // 模型使用统计
      const modelUsage: Record<string, number> = {};
      for (const d of allDiscussions) {
        for (const m of d.guestModels) {
          modelUsage[m] = (modelUsage[m] || 0) + 1;
        }
        modelUsage[d.judgeModel] = (modelUsage[d.judgeModel] || 0) + 1;
      }

      // 置信度分布
      const confidenceData: { discussion: string; scores: Record<string, number> }[] = [];
      for (const d of allDiscussions) {
        if (d.confidenceScores && Object.keys(d.confidenceScores).length > 0) {
          confidenceData.push({
            discussion: d.title,
            scores: d.confidenceScores,
          });
        }
      }

      // 每月讨论数量
      const monthlyData: Record<string, { total: number; completed: number }> = {};
      for (const d of allDiscussions) {
        const month = new Date(d.createdAt).toISOString().slice(0, 7);
        if (!monthlyData[month]) monthlyData[month] = { total: 0, completed: 0 };
        monthlyData[month].total++;
        if (d.status === 'completed') monthlyData[month].completed++;
      }

      // 讨论模式统计
      const modeStats = {
        discussion: allDiscussions.filter(d => d.mode === 'discussion').length,
        document: allDiscussions.filter(d => d.mode === 'document').length,
      };

      // 平均置信度（所有已完成讨论）
      let totalConfidence = 0;
      let confidenceCount = 0;
      for (const d of allDiscussions) {
        if (d.confidenceScores) {
          const scores = Object.values(d.confidenceScores);
          for (const s of scores) {
            totalConfidence += s;
            confidenceCount++;
          }
        }
      }
      const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

      // 每个讨论的消息数
      const discussionDetails = allDiscussions.slice(0, 20).map(d => {
        const msgs = getMessagesByDiscussionId(d.id);
        const rounds = msgs.filter(m => m.role === 'judge').length;
        return {
          id: d.id,
          title: d.title,
          status: d.status,
          mode: d.mode,
          messageCount: msgs.length,
          rounds,
          guestCount: d.guestModels.length,
          createdAt: d.createdAt,
          hasVerdict: !!d.finalVerdict,
        };
      });

      return {
        total,
        completed,
        active,
        completionRate: total > 0 ? completed / total : 0,
        avgConfidence,
        modelUsage,
        confidenceData,
        monthlyData,
        modeStats,
        discussionDetails,
      };
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
