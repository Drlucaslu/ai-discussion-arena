import { integer, text, sqliteTable, real } from "drizzle-orm/sqlite-core";

/**
 * 讨论组表 - 存储每个讨论话题
 */
export const discussions = sqliteTable("discussions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  question: text("question").notNull(),
  status: text("status", { enum: ["active", "completed", "archived"] }).default("active").notNull(),
  // 讨论配置
  guestModels: text("guestModels", { mode: "json" }).$type<string[]>().notNull(),
  judgeModel: text("judgeModel").notNull(),
  confidenceThreshold: real("confidenceThreshold").default(0.8).notNull(),
  enableDynamicAgent: integer("enableDynamicAgent", { mode: "boolean" }).default(false).notNull(),
  dataReadLimit: integer("dataReadLimit").default(100).notNull(),
  // 讨论模式与附件
  mode: text("mode", { enum: ["discussion", "document"] }).default("discussion").notNull(),
  attachments: text("attachments", { mode: "json" }).$type<Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    filePath: string;
    extractedText: string;
    uploadedAt: string;
  }>>(),
  // 最终结论
  finalVerdict: text("finalVerdict"),
  confidenceScores: text("confidenceScores", { mode: "json" }).$type<Record<string, number>>(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Discussion = typeof discussions.$inferSelect;
export type InsertDiscussion = typeof discussions.$inferInsert;

/**
 * 消息表 - 存储讨论中的所有消息
 */
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  discussionId: integer("discussionId").notNull(),
  role: text("role", { enum: ["host", "guest", "judge", "system"] }).notNull(),
  modelName: text("modelName"),
  content: text("content").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<{
    confidence?: number;
    evidence?: string[];
    searchResults?: string[];
    dataQuery?: string;
  }>(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * 模型配置表 - 存储 API Key 配置
 */
export const modelConfigs = sqliteTable("modelConfigs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelProvider: text("modelProvider").notNull(),
  modelName: text("modelName"), // 具体的模型名称，如 gemini-2.5-flash
  apiKey: text("apiKey").notNull(),
  baseUrl: text("baseUrl"),
  isEnabled: integer("isEnabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type InsertModelConfig = typeof modelConfigs.$inferInsert;

/**
 * 系统设置表 - 存储默认配置
 */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;
