import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database functions
vi.mock("./db", () => ({
  createDiscussion: vi.fn(),
  getDiscussionsByUserId: vi.fn(),
  getDiscussionById: vi.fn(),
  updateDiscussion: vi.fn(),
  deleteDiscussion: vi.fn(),
  createMessage: vi.fn(),
  getMessagesByDiscussionId: vi.fn(),
  upsertModelConfig: vi.fn(),
  getModelConfigsByUserId: vi.fn(),
  deleteModelConfig: vi.fn(),
  upsertUserSettings: vi.fn(),
  getUserSettings: vi.fn(),
}));

import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("discussion router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("discussion.list", () => {
    it("returns discussions for authenticated user", async () => {
      const mockDiscussions = [
        {
          id: 1,
          userId: 1,
          title: "Test Discussion",
          question: "What is the best approach?",
          status: "active" as const,
          guestModels: ["builtin"],
          judgeModel: "builtin",
          confidenceThreshold: 0.8,
          enableDynamicAgent: false,
          dataReadLimit: 100,
          finalVerdict: null,
          confidenceScores: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.getDiscussionsByUserId).mockResolvedValue(mockDiscussions);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.discussion.list();

      expect(result).toEqual(mockDiscussions);
      expect(db.getDiscussionsByUserId).toHaveBeenCalledWith(1);
    });

    it("throws error for unauthenticated user", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.discussion.list()).rejects.toThrow();
    });
  });

  describe("discussion.create", () => {
    it("creates a new discussion", async () => {
      const mockDiscussion = {
        id: 1,
        userId: 1,
        title: "New Discussion",
        question: "Test question",
        status: "active" as const,
        guestModels: ["builtin", "openai"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
        finalVerdict: null,
        confidenceScores: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.createDiscussion).mockResolvedValue(mockDiscussion);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.discussion.create({
        title: "New Discussion",
        question: "Test question",
        guestModels: ["builtin", "openai"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
      });

      expect(result).toEqual(mockDiscussion);
      expect(db.createDiscussion).toHaveBeenCalledWith({
        userId: 1,
        title: "New Discussion",
        question: "Test question",
        guestModels: ["builtin", "openai"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
      });
    });

    it("validates guest models count (max 4)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.discussion.create({
          title: "Test",
          question: "Test",
          guestModels: ["m1", "m2", "m3", "m4", "m5"], // 5 models - should fail
          judgeModel: "builtin",
        })
      ).rejects.toThrow();
    });

    it("requires at least one guest model", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.discussion.create({
          title: "Test",
          question: "Test",
          guestModels: [], // empty - should fail
          judgeModel: "builtin",
        })
      ).rejects.toThrow();
    });
  });

  describe("discussion.get", () => {
    it("returns discussion for owner", async () => {
      const mockDiscussion = {
        id: 1,
        userId: 1,
        title: "Test Discussion",
        question: "Test question",
        status: "active" as const,
        guestModels: ["builtin"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
        finalVerdict: null,
        confidenceScores: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getDiscussionById).mockResolvedValue(mockDiscussion);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.discussion.get({ id: 1 });

      expect(result).toEqual(mockDiscussion);
    });

    it("throws error for non-owner", async () => {
      const mockDiscussion = {
        id: 1,
        userId: 999, // Different user
        title: "Test Discussion",
        question: "Test question",
        status: "active" as const,
        guestModels: ["builtin"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
        finalVerdict: null,
        confidenceScores: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getDiscussionById).mockResolvedValue(mockDiscussion);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.discussion.get({ id: 1 })).rejects.toThrow("讨论不存在或无权访问");
    });

    it("throws error for non-existent discussion", async () => {
      vi.mocked(db.getDiscussionById).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.discussion.get({ id: 999 })).rejects.toThrow("讨论不存在或无权访问");
    });
  });

  describe("discussion.delete", () => {
    it("deletes discussion for owner", async () => {
      const mockDiscussion = {
        id: 1,
        userId: 1,
        title: "Test Discussion",
        question: "Test question",
        status: "active" as const,
        guestModels: ["builtin"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
        finalVerdict: null,
        confidenceScores: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getDiscussionById).mockResolvedValue(mockDiscussion);
      vi.mocked(db.deleteDiscussion).mockResolvedValue();

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.discussion.delete({ id: 1 });

      expect(result).toEqual({ success: true });
      expect(db.deleteDiscussion).toHaveBeenCalledWith(1);
    });
  });
});

describe("message router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("message.list", () => {
    it("returns messages for discussion owner", async () => {
      const mockDiscussion = {
        id: 1,
        userId: 1,
        title: "Test Discussion",
        question: "Test question",
        status: "active" as const,
        guestModels: ["builtin"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
        finalVerdict: null,
        confidenceScores: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMessages = [
        {
          id: 1,
          discussionId: 1,
          role: "host" as const,
          modelName: null,
          content: "Test question",
          metadata: null,
          createdAt: new Date(),
        },
        {
          id: 2,
          discussionId: 1,
          role: "judge" as const,
          modelName: "Manus",
          content: "Let's discuss this",
          metadata: null,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.getDiscussionById).mockResolvedValue(mockDiscussion);
      vi.mocked(db.getMessagesByDiscussionId).mockResolvedValue(mockMessages);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.message.list({ discussionId: 1 });

      expect(result).toEqual(mockMessages);
      expect(db.getMessagesByDiscussionId).toHaveBeenCalledWith(1);
    });
  });

  describe("message.sendHost", () => {
    it("creates a host message", async () => {
      const mockDiscussion = {
        id: 1,
        userId: 1,
        title: "Test Discussion",
        question: "Test question",
        status: "active" as const,
        guestModels: ["builtin"],
        judgeModel: "builtin",
        confidenceThreshold: 0.8,
        enableDynamicAgent: false,
        dataReadLimit: 100,
        finalVerdict: null,
        confidenceScores: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMessage = {
        id: 1,
        discussionId: 1,
        role: "host" as const,
        modelName: null,
        content: "New question",
        metadata: null,
        createdAt: new Date(),
      };

      vi.mocked(db.getDiscussionById).mockResolvedValue(mockDiscussion);
      vi.mocked(db.createMessage).mockResolvedValue(mockMessage);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.message.sendHost({
        discussionId: 1,
        content: "New question",
      });

      expect(result).toEqual(mockMessage);
      expect(db.createMessage).toHaveBeenCalledWith({
        discussionId: 1,
        role: "host",
        content: "New question",
      });
    });
  });
});

describe("modelConfig router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("modelConfig.supportedModels", () => {
    it("returns list of supported models", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.modelConfig.supportedModels();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("provider");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("model");
    });
  });

  describe("modelConfig.save", () => {
    it("saves model configuration with masked API key", async () => {
      const mockConfig = {
        id: 1,
        userId: 1,
        modelProvider: "openai",
        apiKey: "sk-1234567890abcdefghijklmnop",
        baseUrl: null,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.upsertModelConfig).mockResolvedValue(mockConfig);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.modelConfig.save({
        modelProvider: "openai",
        apiKey: "sk-1234567890abcdefghijklmnop",
        isEnabled: true,
      });

      expect(result.apiKey).toBe("sk-12345...mnop");
      expect(db.upsertModelConfig).toHaveBeenCalledWith({
        userId: 1,
        modelProvider: "openai",
        apiKey: "sk-1234567890abcdefghijklmnop",
        baseUrl: undefined,
        isEnabled: true,
      });
    });
  });

  describe("modelConfig.list", () => {
    it("returns configs with masked API keys", async () => {
      const mockConfigs = [
        {
          id: 1,
          userId: 1,
          modelProvider: "openai",
          apiKey: "sk-1234567890abcdefghijklmnop",
          baseUrl: null,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.getModelConfigsByUserId).mockResolvedValue(mockConfigs);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.modelConfig.list();

      expect(result[0].apiKey).toBe("sk-12345...mnop");
    });
  });
});
