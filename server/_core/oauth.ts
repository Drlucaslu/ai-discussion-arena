import type { Express, Request, Response } from "express";

// 单机版本：不需要 OAuth 认证
export function registerOAuthRoutes(app: Express) {
  // 保留路由但返回提示信息
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    res.json({ 
      message: "单机版本不需要登录认证",
      info: "AI 讨论竞技场 - 本地版本"
    });
  });
}
