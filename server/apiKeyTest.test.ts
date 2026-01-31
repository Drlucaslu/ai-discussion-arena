import { describe, expect, it, vi } from "vitest";
import { testApiKey, ApiKeyTestResult } from "./aiModels";

describe("API Key Test", () => {
  it("should return success for builtin model without API key", async () => {
    const result = await testApiKey({
      provider: 'builtin',
    });
    
    expect(result.success).toBe(true);
    expect(result.provider).toBe('builtin');
    expect(result.message).toContain('内置模型');
    expect(result.logs.length).toBeGreaterThan(0);
  });

  it("should return error when API key is empty", async () => {
    const result = await testApiKey({
      provider: 'openai',
      apiKey: '',
    });
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('API Key 不能为空');
    expect(result.error).toBeDefined();
  });

  it("should return error when API key is undefined", async () => {
    const result = await testApiKey({
      provider: 'claude',
    });
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('API Key 不能为空');
  });

  it("should include logs in the result", async () => {
    const result = await testApiKey({
      provider: 'openai',
      apiKey: 'test-key',
    });
    
    // 无论成功或失败，都应该有日志
    expect(result.logs).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.length).toBeGreaterThan(0);
  });

  it("should include response time in the result", async () => {
    const result = await testApiKey({
      provider: 'builtin',
    });
    
    expect(result.responseTime).toBeDefined();
    expect(typeof result.responseTime).toBe('number');
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });

  it("should return correct provider and model in result", async () => {
    const result = await testApiKey({
      provider: 'deepseek',
      apiKey: 'test-key',
    });
    
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBeDefined();
  });

  it("should handle invalid API key gracefully", async () => {
    // 这个测试验证当 API key 无效时，系统不会崩溃
    const result = await testApiKey({
      provider: 'openai',
      apiKey: 'invalid-key-12345',
    });
    
    // 应该返回失败结果而不是抛出异常
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.logs).toBeDefined();
  });
});
