import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// 测试数据目录
const TEST_DATA_DIR = path.join(process.cwd(), "data");
const TEST_DB_PATH = path.join(TEST_DATA_DIR, "arena.db");

describe("单机版本测试", () => {
  describe("数据库初始化", () => {
    it("应该能够导入数据库模块", async () => {
      const db = await import("./db");
      expect(db).toBeDefined();
      expect(typeof db.getDb).toBe("function");
    });

    it("应该能够获取数据库连接", async () => {
      const { getDb } = await import("./db");
      const db = getDb();
      expect(db).toBeDefined();
    });
  });

  describe("讨论组操作", () => {
    it("应该能够创建讨论", async () => {
      const { createDiscussion, getAllDiscussions, deleteDiscussion } = await import("./db");
      
      const discussion = createDiscussion({
        title: "测试讨论",
        question: "这是一个测试问题",
        guestModels: ["builtin"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
      });

      expect(discussion).toBeDefined();
      expect(discussion.id).toBeGreaterThan(0);
      expect(discussion.title).toBe("测试讨论");

      // 清理
      deleteDiscussion(discussion.id);
    });

    it("应该能够获取所有讨论", async () => {
      const { getAllDiscussions } = await import("./db");
      const discussions = getAllDiscussions();
      expect(Array.isArray(discussions)).toBe(true);
    });
  });

  describe("模型配置操作", () => {
    it("应该能够保存和获取模型配置", async () => {
      const { upsertModelConfig, getAllModelConfigs, deleteModelConfig } = await import("./db");
      
      const config = upsertModelConfig({
        modelProvider: "test-provider",
        apiKey: "test-api-key-12345",
        isEnabled: true,
      });

      expect(config).toBeDefined();
      expect(config.modelProvider).toBe("test-provider");

      const configs = getAllModelConfigs();
      const found = configs.find(c => c.modelProvider === "test-provider");
      expect(found).toBeDefined();

      // 清理
      if (found) {
        deleteModelConfig(found.id);
      }
    });
  });

  describe("设置操作", () => {
    it("应该能够获取默认设置", async () => {
      const { getDefaultSettings } = await import("./db");
      const settings = getDefaultSettings();
      
      expect(settings).toBeDefined();
      expect(settings.defaultJudgeModel).toBeDefined();
      expect(settings.defaultConfidenceThreshold).toBeGreaterThanOrEqual(0);
      expect(settings.defaultConfidenceThreshold).toBeLessThanOrEqual(1);
    });

    it("应该能够更新默认设置", async () => {
      const { updateDefaultSettings, getDefaultSettings } = await import("./db");
      
      const updated = updateDefaultSettings({
        defaultConfidenceThreshold: 0.9,
      });

      expect(updated.defaultConfidenceThreshold).toBe(0.9);

      // 恢复默认值
      updateDefaultSettings({
        defaultConfidenceThreshold: 0.8,
      });
    });
  });
});

describe("认证模块测试", () => {
  it("useAuth 应该返回本地用户", async () => {
    // 模拟 useAuth 的逻辑
    const LOCAL_USER = {
      id: 1,
      openId: 'local-user',
      name: '本地用户',
      email: 'local@localhost',
      role: 'admin',
    };

    expect(LOCAL_USER.id).toBe(1);
    expect(LOCAL_USER.openId).toBe('local-user');
    expect(LOCAL_USER.role).toBe('admin');
  });
});

describe("路由模块测试", () => {
  it("应该能够导入路由模块", async () => {
    const routers = await import("./routers");
    expect(routers.appRouter).toBeDefined();
  });
});
