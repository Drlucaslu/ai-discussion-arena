import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, float } from "drizzle-orm/mysql-core";

/**
 * 用户表 - 核心认证表
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 讨论组表 - 存储每个讨论话题
 */
export const discussions = mysqlTable("discussions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  question: text("question").notNull(),
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
  // 讨论配置
  guestModels: json("guestModels").$type<string[]>().notNull(), // 嘉宾模型列表
  judgeModel: varchar("judgeModel", { length: 64 }).notNull(), // 裁判模型
  confidenceThreshold: float("confidenceThreshold").default(0.8).notNull(),
  enableDynamicAgent: boolean("enableDynamicAgent").default(false).notNull(),
  dataReadLimit: int("dataReadLimit").default(100).notNull(),
  // 最终结论
  finalVerdict: text("finalVerdict"),
  confidenceScores: json("confidenceScores").$type<Record<string, number>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Discussion = typeof discussions.$inferSelect;
export type InsertDiscussion = typeof discussions.$inferInsert;

/**
 * 消息表 - 存储讨论中的所有消息
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  discussionId: int("discussionId").notNull(),
  role: mysqlEnum("role", ["host", "guest", "judge", "system"]).notNull(),
  modelName: varchar("modelName", { length: 64 }), // 发言的模型名称
  content: text("content").notNull(),
  // 元数据
  metadata: json("metadata").$type<{
    confidence?: number;
    evidence?: string[];
    searchResults?: string[];
    dataQuery?: string;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * 模型配置表 - 存储用户的 API Key 配置
 */
export const modelConfigs = mysqlTable("modelConfigs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  modelProvider: varchar("modelProvider", { length: 64 }).notNull(), // openai, gemini, claude, deepseek
  apiKey: text("apiKey").notNull(), // 加密存储
  baseUrl: varchar("baseUrl", { length: 255 }), // 可选的自定义 API 端点
  isEnabled: boolean("isEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type InsertModelConfig = typeof modelConfigs.$inferInsert;

/**
 * 用户设置表 - 存储用户的默认配置
 */
export const userSettings = mysqlTable("userSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  defaultJudgeModel: varchar("defaultJudgeModel", { length: 64 }).default("deepseek"),
  defaultConfidenceThreshold: float("defaultConfidenceThreshold").default(0.8),
  defaultEnableDynamicAgent: boolean("defaultEnableDynamicAgent").default(false),
  defaultDataReadLimit: int("defaultDataReadLimit").default(100),
  enterpriseApiUrl: varchar("enterpriseApiUrl", { length: 255 }),
  enterpriseApiKey: text("enterpriseApiKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;
