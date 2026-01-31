import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

// 单机版本的用户类型
export type LocalUser = {
  id: number;
  openId: string;
  name: string;
  email: string;
  role: string;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: LocalUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // 单机版本：始终返回本地用户，无需认证
  const user: LocalUser = {
    id: 1,
    openId: 'local-user',
    name: '本地用户',
    email: 'local@localhost',
    role: 'admin',
  };

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
