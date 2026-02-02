import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { 
  discussions, InsertDiscussion, Discussion,
  messages, InsertMessage, Message,
  modelConfigs, InsertModelConfig, ModelConfig,
  settings, InsertSetting, Setting
} from "../drizzle/schema";
import * as path from "path";
import * as fs from "fs";

// 数据目录
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "arena.db");

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 获取数据库连接
 */
export function getDb() {
  if (!_db) {
    ensureDataDir();
    _sqlite = new Database(DB_PATH);
    _db = drizzle(_sqlite);
    
    // 初始化表结构
    initializeDatabase();
  }
  return _db;
}

/**
 * 初始化数据库表
 */
function initializeDatabase() {
  if (!_sqlite) return;
  
  // 创建讨论组表
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      question TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      guestModels TEXT NOT NULL,
      judgeModel TEXT NOT NULL,
      confidenceThreshold REAL DEFAULT 0.8 NOT NULL,
      enableDynamicAgent INTEGER DEFAULT 0 NOT NULL,
      dataReadLimit INTEGER DEFAULT 100 NOT NULL,
      finalVerdict TEXT,
      confidenceScores TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  
  // 创建消息表
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discussionId INTEGER NOT NULL,
      role TEXT NOT NULL,
      modelName TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      createdAt INTEGER NOT NULL
    )
  `);
  
  // 创建模型配置表
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS modelConfigs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelProvider TEXT NOT NULL UNIQUE,
      modelName TEXT,
      apiKey TEXT NOT NULL,
      baseUrl TEXT,
      isEnabled INTEGER DEFAULT 1 NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  
  // 迁移：添加 modelName 字段（如果不存在）
  try {
    _sqlite.exec(`ALTER TABLE modelConfigs ADD COLUMN modelName TEXT`);
  } catch (e) {
    // 字段已存在，忽略错误
  }

  // 迁移：添加讨论模式和附件字段
  try {
    _sqlite.exec(`ALTER TABLE discussions ADD COLUMN mode TEXT DEFAULT 'discussion' NOT NULL`);
  } catch (e) {}
  try {
    _sqlite.exec(`ALTER TABLE discussions ADD COLUMN attachments TEXT`);
  } catch (e) {}
  
  // 创建设置表
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  
  console.log("[Database] SQLite database initialized at:", DB_PATH);
}

/**
 * 关闭数据库连接
 */
export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

// ==================== 讨论组相关 ====================

export function createDiscussion(data: InsertDiscussion): Discussion {
  const db = getDb();
  const now = new Date();
  
  const result = db.insert(discussions).values({
    ...data,
    createdAt: now,
    updatedAt: now,
  }).returning().get();
  
  return result;
}

export function getAllDiscussions(): Discussion[] {
  const db = getDb();
  return db.select().from(discussions).orderBy(desc(discussions.updatedAt)).all();
}

export function getDiscussionById(id: number): Discussion | undefined {
  const db = getDb();
  return db.select().from(discussions).where(eq(discussions.id, id)).get();
}

export function updateDiscussion(id: number, data: Partial<InsertDiscussion>): void {
  const db = getDb();
  db.update(discussions).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(discussions.id, id)).run();
}

export function deleteDiscussion(id: number): void {
  const db = getDb();
  // 删除关联的上传文件
  const discussion = getDiscussionById(id);
  if (discussion?.attachments) {
    for (const att of discussion.attachments) {
      const fullPath = path.join(process.cwd(), "data", att.filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
  }
  // 先删除相关消息
  db.delete(messages).where(eq(messages.discussionId, id)).run();
  // 再删除讨论
  db.delete(discussions).where(eq(discussions.id, id)).run();
}

// ==================== 消息相关 ====================

export function createMessage(data: InsertMessage): Message {
  const db = getDb();
  const result = db.insert(messages).values({
    ...data,
    createdAt: new Date(),
  }).returning().get();
  
  return result;
}

export function getMessagesByDiscussionId(discussionId: number): Message[] {
  const db = getDb();
  return db.select().from(messages)
    .where(eq(messages.discussionId, discussionId))
    .orderBy(messages.createdAt)
    .all();
}

// ==================== 模型配置相关 ====================

export function upsertModelConfig(data: Omit<InsertModelConfig, 'id' | 'createdAt' | 'updatedAt'>): ModelConfig {
  const db = getDb();
  const now = new Date();
  
  // 检查是否已存在
  const existing = db.select().from(modelConfigs)
    .where(eq(modelConfigs.modelProvider, data.modelProvider))
    .get();
  
  if (existing) {
    db.update(modelConfigs)
      .set({ 
        apiKey: data.apiKey, 
        baseUrl: data.baseUrl,
        modelName: data.modelName,
        isEnabled: data.isEnabled,
        updatedAt: now,
      })
      .where(eq(modelConfigs.id, existing.id))
      .run();
    return db.select().from(modelConfigs).where(eq(modelConfigs.id, existing.id)).get()!;
  } else {
    return db.insert(modelConfigs).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }
}

export function getAllModelConfigs(): ModelConfig[] {
  const db = getDb();
  return db.select().from(modelConfigs).all();
}

export function deleteModelConfig(id: number): void {
  const db = getDb();
  db.delete(modelConfigs).where(eq(modelConfigs.id, id)).run();
}

export function getModelConfigByProvider(provider: string): ModelConfig | undefined {
  const db = getDb();
  return db.select().from(modelConfigs)
    .where(eq(modelConfigs.modelProvider, provider))
    .get();
}

// ==================== 设置相关 ====================

export function getSetting<T>(key: string): T | undefined {
  const db = getDb();
  const result = db.select().from(settings).where(eq(settings.key, key)).get();
  if (result) {
    return result.value as T;
  }
  return undefined;
}

export function setSetting<T>(key: string, value: T): void {
  const db = getDb();
  const now = new Date();
  
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  
  if (existing) {
    db.update(settings)
      .set({ value: value as unknown, updatedAt: now })
      .where(eq(settings.id, existing.id))
      .run();
  } else {
    db.insert(settings).values({
      key,
      value: value as unknown,
      updatedAt: now,
    }).run();
  }
}

export function getAllSettings(): Setting[] {
  const db = getDb();
  return db.select().from(settings).all();
}

// ==================== 默认设置 ====================

export interface DefaultSettings {
  defaultJudgeModel: string;
  defaultConfidenceThreshold: number;
  defaultEnableDynamicAgent: boolean;
  defaultDataReadLimit: number;
  enterpriseApiUrl?: string;
  enterpriseApiKey?: string;
}

const DEFAULT_SETTINGS: DefaultSettings = {
  defaultJudgeModel: "builtin",
  defaultConfidenceThreshold: 0.8,
  defaultEnableDynamicAgent: false,
  defaultDataReadLimit: 100,
};

export function getDefaultSettings(): DefaultSettings {
  const saved = getSetting<DefaultSettings>("defaultSettings");
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function updateDefaultSettings(data: Partial<DefaultSettings>): DefaultSettings {
  const current = getDefaultSettings();
  const updated = { ...current, ...data };
  setSetting("defaultSettings", updated);
  return updated;
}
