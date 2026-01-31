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
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [showLogs, setShowLogs] = useState(true);

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
      refetchInterval: isRunning ? 1000 : false, // 运行时每秒刷新
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
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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
  };

  const handleStopDiscussion = () => {
    setIsRunning(false);
  };

  const handleRequestVerdict = () => {
    setIsRunning(true);
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
      <header className="border-b bg-card px-4 py-3">
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

      <div className="flex-1 flex">
        {/* 聊天区域 */}
        <div className="flex-1 flex flex-col">
          {/* 讨论问题 */}
          <div className="p-4 bg-muted/30 border-b">
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
            <div className="p-4 border-t bg-muted/30">
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

        {/* 右侧信息面板 */}
        <aside className="w-80 border-l bg-card hidden lg:flex lg:flex-col">
          {/* 讨论配置 */}
          <div className="p-4 border-b">
            <h3 className="font-semibold mb-4">讨论配置</h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">嘉宾模型</p>
                <div className="flex flex-wrap gap-1">
                  {discussion.guestModels.map((model, index) => (
                    <Badge key={index} variant="secondary">{model}</Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2">裁判模型</p>
                <Badge>{discussion.judgeModel}</Badge>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2">置信度阈值</p>
                <p className="font-medium">{discussion.confidenceThreshold}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">动态 Agent</p>
                <p className="font-medium">{discussion.enableDynamicAgent ? '已启用' : '已禁用'}</p>
              </div>

              {discussion.enableDynamicAgent && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">数据读取上限</p>
                  <p className="font-medium">{discussion.dataReadLimit} 条</p>
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
                            <span className="truncate flex-1 mr-2">{hypothesis}</span>
                            <Badge variant={score >= discussion.confidenceThreshold ? 'default' : 'secondary'}>
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
          </div>

          {/* 调试日志面板 */}
          <div className="flex-1 flex flex-col min-h-0">
            <div 
              className="p-3 border-b flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowLogs(!showLogs)}
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">调试日志</span>
                {logs && logs.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {logs.length}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {showLogs && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        refetchLogs();
                      }}
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearLogs();
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
                {showLogs ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {showLogs && (
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1 font-mono text-xs">
                  {!logs || logs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>暂无日志</p>
                      <p className="text-xs mt-1">开始讨论后将显示 API 调用日志</p>
                    </div>
                  ) : (
                    logs.map((log, index) => (
                      <div 
                        key={index} 
                        className={`p-2 rounded bg-muted/30 border-l-2 ${
                          log.level === 'error' ? 'border-red-500 bg-red-500/10' :
                          log.level === 'warn' ? 'border-yellow-500 bg-yellow-500/10' :
                          log.level === 'info' ? 'border-blue-500 bg-blue-500/10' :
                          'border-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-muted-foreground">
                            {formatTimestamp(log.timestamp)}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] px-1 py-0 ${LOG_LEVEL_COLORS[log.level]}`}
                          >
                            {LOG_LEVEL_LABELS[log.level]}
                          </Badge>
                          <span className="text-muted-foreground truncate">
                            [{log.source}]
                          </span>
                        </div>
                        <p className={`${LOG_LEVEL_COLORS[log.level]} break-words`}>
                          {log.message}
                        </p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                              详细信息
                            </summary>
                            <pre className="mt-1 p-1 bg-background rounded text-[10px] overflow-x-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </ScrollArea>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
