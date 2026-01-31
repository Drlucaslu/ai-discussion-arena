import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  discussions, InsertDiscussion, Discussion,
  messages, InsertMessage, Message,
  modelConfigs, InsertModelConfig, ModelConfig,
  userSettings, InsertUserSettings, UserSettings
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== 用户相关 ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== 讨论组相关 ====================

export async function createDiscussion(data: InsertDiscussion): Promise<Discussion> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(discussions).values(data);
  const insertId = result[0].insertId;
  
  const [discussion] = await db.select().from(discussions).where(eq(discussions.id, insertId));
  return discussion;
}

export async function getDiscussionsByUserId(userId: number): Promise<Discussion[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(discussions)
    .where(eq(discussions.userId, userId))
    .orderBy(desc(discussions.updatedAt));
}

export async function getDiscussionById(id: number): Promise<Discussion | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const [discussion] = await db.select().from(discussions).where(eq(discussions.id, id));
  return discussion;
}

export async function updateDiscussion(id: number, data: Partial<InsertDiscussion>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(discussions).set(data).where(eq(discussions.id, id));
}

export async function deleteDiscussion(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 先删除相关消息
  await db.delete(messages).where(eq(messages.discussionId, id));
  // 再删除讨论
  await db.delete(discussions).where(eq(discussions.id, id));
}

// ==================== 消息相关 ====================

export async function createMessage(data: InsertMessage): Promise<Message> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(messages).values(data);
  const insertId = result[0].insertId;
  
  const [message] = await db.select().from(messages).where(eq(messages.id, insertId));
  return message;
}

export async function getMessagesByDiscussionId(discussionId: number): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(messages)
    .where(eq(messages.discussionId, discussionId))
    .orderBy(messages.createdAt);
}

// ==================== 模型配置相关 ====================

export async function upsertModelConfig(data: InsertModelConfig): Promise<ModelConfig> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 检查是否已存在
  const [existing] = await db.select().from(modelConfigs)
    .where(and(
      eq(modelConfigs.userId, data.userId),
      eq(modelConfigs.modelProvider, data.modelProvider)
    ));
  
  if (existing) {
    await db.update(modelConfigs)
      .set({ apiKey: data.apiKey, baseUrl: data.baseUrl, isEnabled: data.isEnabled })
      .where(eq(modelConfigs.id, existing.id));
    const [updated] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, existing.id));
    return updated;
  } else {
    const result = await db.insert(modelConfigs).values(data);
    const insertId = result[0].insertId;
    const [config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, insertId));
    return config;
  }
}

export async function getModelConfigsByUserId(userId: number): Promise<ModelConfig[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(modelConfigs).where(eq(modelConfigs.userId, userId));
}

export async function deleteModelConfig(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(modelConfigs).where(eq(modelConfigs.id, id));
}

// ==================== 用户设置相关 ====================

export async function upsertUserSettings(data: InsertUserSettings): Promise<UserSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [existing] = await db.select().from(userSettings)
    .where(eq(userSettings.userId, data.userId));
  
  if (existing) {
    await db.update(userSettings).set(data).where(eq(userSettings.id, existing.id));
    const [updated] = await db.select().from(userSettings).where(eq(userSettings.id, existing.id));
    return updated;
  } else {
    const result = await db.insert(userSettings).values(data);
    const insertId = result[0].insertId;
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.id, insertId));
    return settings;
  }
}

export async function getUserSettings(userId: number): Promise<UserSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return settings;
}
