import { useCallback, useMemo } from "react";

// 单机版本的本地用户
const LOCAL_USER = {
  id: 1,
  openId: 'local-user',
  name: '本地用户',
  email: 'local@localhost',
  role: 'admin' as const,
};

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  // 单机版本：始终返回已认证的本地用户
  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(LOCAL_USER)
    );
    return {
      user: LOCAL_USER,
      loading: false,
      error: null,
      isAuthenticated: true,
    };
  }, []);

  const logout = useCallback(async () => {
    // 单机版本不需要登出
    console.log("单机版本无需登出");
  }, []);

  return {
    ...state,
    refresh: () => Promise.resolve(),
    logout,
  };
}
