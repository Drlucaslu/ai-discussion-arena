import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  Loader2, 
  Send, 
  Gavel, 
  User, 
  Bot,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Terminal,
  Trash2,
  RefreshCw,
  Settings,
  ScrollText,
  Bug
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

// 角色颜色映射
const ROLE_COLORS: Record<string, string> = {
  host: 'bg-blue-500',
  judge: 'bg-purple-500',
  guest: 'bg-green-500',
  system: 'bg-gray-500',
};

const ROLE_LABELS: Record<string, string> = {
  host: '主持人',
  judge: '裁判',
  guest: '嘉宾',
  system: '系统',
};

// 日志级别颜色
const LOG_LEVEL_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-400',
};

// 日志级别中文标签
const LOG_LEVEL_LABELS: Record<string, string> = {
  info: '信息',
  warn: '警告',
  error: '错误',
  debug: '调试',
};

export default function Discussion() {
  const { id } = useParams<{ id: string }>();
  const discussionId = parseInt(id || '0');
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);

  // 获取讨论详情
  const { data: discussion, isLoading: discussionLoading, refetch: refetchDiscussion } = trpc.discussion.get.useQuery(
    { id: discussionId },
    { enabled: isAuthenticated && discussionId > 0 }
  );

  // 获取消息列表
  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = trpc.message.list.useQuery(
    { discussionId },
    { enabled: isAuthenticated && discussionId > 0 }
  );

  // 获取讨论日志
  const { data: logs, refetch: refetchLogs } = trpc.orchestrator.getLogs.useQuery(
    { discussionId },
    { 
      enabled: isAuthenticated && discussionId > 0,
      refetchInterval: isRunning ? 500 : false, // 运行时每 500ms 刷新
    }
  );

  // 清除日志
  const clearLogsMutation = trpc.orchestrator.clearLogs.useMutation({
    onSuccess: () => {
      refetchLogs();
      toast.success('日志已清除');
    },
  });

  // 开始讨论
  const startMutation = trpc.orchestrator.start.useMutation({
    onSuccess: () => {
      refetchMessages();
      refetchLogs();
    },
    onError: (error) => {
      toast.error(`启动失败: ${error.message}`);
      setIsRunning(false);
      refetchLogs();
    },
  });

  // 执行一轮讨论
  const executeRoundMutation = trpc.orchestrator.executeRound.useMutation({
    onSuccess: (result) => {
      refetchMessages();
      refetchLogs();
      if (result.isComplete) {
        setIsRunning(false);
        refetchDiscussion();
        toast.success('讨论已完成，裁判已做出最终裁决');
      } else {
        setCurrentRound(prev => prev + 1);
      }
    },
    onError: (error) => {
      toast.error(`执行失败: ${error.message}`);
      setIsRunning(false);
      refetchLogs();
    },
  });

  // 请求最终裁决
  const requestVerdictMutation = trpc.orchestrator.requestVerdict.useMutation({
    onSuccess: (result) => {
      refetchMessages();
      refetchLogs();
      if (result.isComplete) {
        refetchDiscussion();
        toast.success('裁判已做出最终裁决');
      }
      setIsRunning(false);
    },
    onError: (error) => {
      toast.error(`裁决请求失败: ${error.message}`);
      setIsRunning(false);
      refetchLogs();
    },
  });

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 日志自动滚动到底部
  const scrollLogsToBottom = useCallback(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollLogsToBottom();
  }, [logs, scrollLogsToBottom]);

  // 检测用户是否手动滚动
  const handleLogsScroll = useCallback(() => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  }, []);

  // 自动执行讨论轮次
  useEffect(() => {
    if (isRunning && currentRound <= 10 && discussion?.status === 'active') {
      const timer = setTimeout(() => {
        executeRoundMutation.mutate({ discussionId, roundNumber: currentRound });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isRunning, currentRound, discussion?.status]);

  const handleStartDiscussion = async () => {
    if (!messages || messages.length === 0) {
      // 首次开始，先创建主持人消息
      await startMutation.mutateAsync({ discussionId });
    }
    setIsRunning(true);
    setCurrentRound(1);
    setAutoScroll(true); // 开始时启用自动滚动
  };

  const handleStopDiscussion = () => {
    setIsRunning(false);
  };

  const handleRequestVerdict = () => {
    setIsRunning(true);
    setAutoScroll(true);
    requestVerdictMutation.mutate({ discussionId });
  };

  const handleClearLogs = () => {
    clearLogsMutation.mutate({ discussionId });
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false 
    });
  };

  // 加载状态
  if (authLoading || discussionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 未找到讨论
  if (!discussion) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">讨论不存在</h2>
            <p className="text-muted-foreground mb-4">该讨论可能已被删除或您无权访问</p>
            <Button onClick={() => navigate('/')}>返回首页</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 顶部导航 */}
      <header className="border-b bg-card px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold">{discussion.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={discussion.status === 'completed' ? 'default' : 'secondary'}>
                  {discussion.status === 'active' ? '进行中' : discussion.status === 'completed' ? '已完成' : '已归档'}
                </Badge>
                <span>·</span>
                <span>{discussion.guestModels.length} 位嘉宾</span>
                <span>·</span>
                <span>裁判: {discussion.judgeModel}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {discussion.status === 'active' && (
              <>
                {isRunning ? (
                  <Button variant="destructive" onClick={handleStopDiscussion}>
                    <Square className="w-4 h-4 mr-2" />
                    暂停讨论
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleStartDiscussion}>
                      <Play className="w-4 h-4 mr-2" />
                      {messages && messages.length > 0 ? '继续讨论' : '开始讨论'}
                    </Button>
                    {messages && messages.length > 0 && (
                      <Button variant="outline" onClick={handleRequestVerdict}>
                        <Gavel className="w-4 h-4 mr-2" />
                        请求裁决
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* 三栏布局主体 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：聊天区域 */}
        <div className="flex-1 flex flex-col min-w-0 border-r">
          {/* 讨论问题 */}
          <div className="p-4 bg-muted/30 border-b shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">讨论问题</p>
                <p className="text-foreground">{discussion.question}</p>
              </div>
            </div>
          </div>

          {/* 消息列表 */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 max-w-4xl mx-auto">
              {messagesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages?.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">点击"开始讨论"启动 AI 辩论</p>
                </div>
              ) : (
                messages?.map((message) => (
                  <div key={message.id} className="flex gap-3">
                    <div className={`w-10 h-10 rounded-full ${ROLE_COLORS[message.role]} flex items-center justify-center shrink-0`}>
                      {message.role === 'host' ? (
                        <User className="w-5 h-5 text-white" />
                      ) : message.role === 'judge' ? (
                        <Gavel className="w-5 h-5 text-white" />
                      ) : (
                        <Bot className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {ROLE_LABELS[message.role]}
                          {message.modelName && ` (${message.modelName})`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <Card>
                        <CardContent className="p-3 prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{message.content}</Streamdown>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ))
              )}
              
              {/* 加载指示器 */}
              {(startMutation.isPending || executeRoundMutation.isPending || requestVerdictMutation.isPending) && (
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="flex-1">
                    <Card>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>AI 正在思考中...</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* 运行状态 */}
          {isRunning && (
            <div className="p-4 border-t bg-muted/30 shrink-0">
              <div className="flex items-center gap-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">讨论进行中 - 第 {currentRound} 轮</p>
                  <Progress value={currentRound * 10} className="mt-2" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 中间：Debug 日志栏 */}
        <div className="w-80 xl:w-96 border-r bg-zinc-900/50 hidden md:flex md:flex-col">
          {/* 日志标题栏 */}
          <div className="px-3 py-2 border-b bg-zinc-900/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-cyan-400" />
              <span className="font-medium text-sm text-cyan-400">Debug 日志</span>
              {logs && logs.length > 0 && (
                <Badge variant="secondary" className="text-xs bg-cyan-500/20 text-cyan-400">
                  {logs.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isRunning && (
                <span className="flex items-center gap-1 text-xs text-green-400 mr-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  实时
                </span>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 hover:bg-zinc-800"
                onClick={() => refetchLogs()}
                title="刷新日志"
              >
                <RefreshCw className="w-3 h-3 text-muted-foreground" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 hover:bg-zinc-800"
                onClick={handleClearLogs}
                title="清除日志"
              >
                <Trash2 className="w-3 h-3 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* 日志内容 */}
          <div 
            ref={logsContainerRef}
            className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs bg-zinc-950/50"
            onScroll={handleLogsScroll}
          >
            {!logs || logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Terminal className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="font-sans text-sm">暂无日志</p>
                <p className="text-xs mt-1 font-sans text-zinc-500">开始讨论后将显示 API 调用日志</p>
              </div>
            ) : (
              logs.map((log, index) => (
                <div 
                  key={index} 
                  className={`p-2 rounded border-l-2 ${
                    log.level === 'error' ? 'border-red-500 bg-red-500/10' :
                    log.level === 'warn' ? 'border-yellow-500 bg-yellow-500/10' :
                    log.level === 'info' ? 'border-cyan-500 bg-cyan-500/5' :
                    'border-zinc-600 bg-zinc-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-zinc-500 text-[10px]">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1 py-0 h-4 border-0 ${
                        log.level === 'error' ? 'bg-red-500/20 text-red-400' :
                        log.level === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                        log.level === 'info' ? 'bg-cyan-500/20 text-cyan-400' :
                        'bg-zinc-700/50 text-zinc-400'
                      }`}
                    >
                      {LOG_LEVEL_LABELS[log.level]}
                    </Badge>
                    <span className="text-zinc-500 text-[10px]">
                      [{log.source}]
                    </span>
                  </div>
                  <p className={`break-words leading-relaxed ${
                    log.level === 'error' ? 'text-red-300' :
                    log.level === 'warn' ? 'text-yellow-300' :
                    log.level === 'info' ? 'text-cyan-300' :
                    'text-zinc-400'
                  }`}>
                    {log.message}
                  </p>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <details className="mt-1.5">
                      <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300 text-[10px]">
                        查看详情
                      </summary>
                      <pre className="mt-1 p-1.5 bg-zinc-900 rounded text-[10px] overflow-x-auto whitespace-pre-wrap text-zinc-400">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 滚动到底部按钮 */}
          {!autoScroll && logs && logs.length > 0 && (
            <div className="p-2 border-t bg-zinc-900/80 shrink-0">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full h-7 text-xs bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                onClick={() => {
                  setAutoScroll(true);
                  scrollLogsToBottom();
                }}
              >
                <ScrollText className="w-3 h-3 mr-1" />
                滚动到底部
              </Button>
            </div>
          )}
        </div>

        {/* 右侧：配置面板 */}
        <aside className="w-64 bg-card hidden lg:flex lg:flex-col">
          {/* 配置标题 */}
          <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">讨论配置</span>
          </div>

          {/* 配置内容 */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">嘉宾模型</p>
                <div className="flex flex-wrap gap-1">
                  {discussion.guestModels.map((model, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">{model}</Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2">裁判模型</p>
                <Badge className="text-xs">{discussion.judgeModel}</Badge>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2">置信度阈值</p>
                <p className="font-medium text-sm">{discussion.confidenceThreshold}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">动态 Agent</p>
                <Badge variant={discussion.enableDynamicAgent ? 'default' : 'secondary'} className="text-xs">
                  {discussion.enableDynamicAgent ? '已启用' : '已禁用'}
                </Badge>
              </div>

              {discussion.enableDynamicAgent && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">数据读取上限</p>
                  <p className="font-medium text-sm">{discussion.dataReadLimit} 条</p>
                </div>
              )}

              {/* 最终裁决 */}
              {discussion.status === 'completed' && discussion.finalVerdict && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <p className="text-sm font-medium">最终裁决</p>
                    </div>
                    <Card>
                      <CardContent className="p-3 text-sm">
                        <Streamdown>{discussion.finalVerdict}</Streamdown>
                      </CardContent>
                    </Card>
                  </div>

                  {discussion.confidenceScores && Object.keys(discussion.confidenceScores).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">置信度评分</p>
                      <div className="space-y-2">
                        {Object.entries(discussion.confidenceScores).map(([hypothesis, score]) => (
                          <div key={hypothesis} className="flex items-center justify-between text-sm">
                            <span className="truncate flex-1 mr-2 text-xs">{hypothesis}</span>
                            <Badge variant={score >= discussion.confidenceThreshold ? 'default' : 'secondary'} className="text-xs">
                              {(score as number).toFixed(2)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
