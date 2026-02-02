import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Loader2,
  BarChart3,
  CheckCircle2,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  FileText,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = trpc.stats.overview.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">无法加载统计数据</p>
      </div>
    );
  }

  const modelEntries = Object.entries(stats.modelUsage).sort((a, b) => b[1] - a[1]);
  const maxModelUsage = modelEntries.length > 0 ? modelEntries[0][1] : 1;

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">历史分析</h1>
          </div>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-73px)]">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          {/* 概览卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">总讨论数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.completed}</p>
                    <p className="text-xs text-muted-foreground">已完成</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{(stats.completionRate * 100).toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">完成率</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.avgConfidence.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">平均置信度</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 模型使用频率 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  模型使用频率
                </CardTitle>
                <CardDescription>各模型在讨论中的使用次数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {modelEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无数据</p>
                ) : (
                  modelEntries.map(([model, count]) => (
                    <div key={model} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{model}</span>
                        <span className="text-muted-foreground">{count} 次</span>
                      </div>
                      <Progress value={(count / maxModelUsage) * 100} className="h-2" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* 讨论模式分布 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  讨论模式分布
                </CardTitle>
                <CardDescription>不同模式的使用情况</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>问题讨论</span>
                    <span className="text-muted-foreground">{stats.modeStats.discussion} 次</span>
                  </div>
                  <Progress
                    value={stats.total > 0 ? (stats.modeStats.discussion / stats.total) * 100 : 0}
                    className="h-2"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>协作文档</span>
                    <span className="text-muted-foreground">{stats.modeStats.document} 次</span>
                  </div>
                  <Progress
                    value={stats.total > 0 ? (stats.modeStats.document / stats.total) * 100 : 0}
                    className="h-2"
                  />
                </div>

                {/* 月度趋势 */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-3">月度趋势</p>
                  {Object.entries(stats.monthlyData).length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无数据</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(stats.monthlyData)
                        .sort(([a], [b]) => b.localeCompare(a))
                        .slice(0, 6)
                        .map(([month, data]) => (
                          <div key={month} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{month}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{data.total} 总</Badge>
                              <Badge variant="default" className="text-xs bg-green-500">{data.completed} 完成</Badge>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 置信度评分分布 */}
          {stats.confidenceData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  置信度评分分布
                </CardTitle>
                <CardDescription>已完成讨论的各假设置信度</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.confidenceData.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <p className="text-sm font-medium truncate">{item.discussion}</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(item.scores).map(([hypo, score]) => (
                          <div key={hypo} className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">{hypo}</span>
                            <Badge
                              variant={score >= 0.8 ? 'default' : score >= 0.6 ? 'secondary' : 'destructive'}
                              className="text-xs"
                            >
                              {score.toFixed(2)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 讨论详情列表 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                最近讨论
              </CardTitle>
              <CardDescription>最近 20 条讨论的详细指标</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium">标题</th>
                      <th className="text-center py-2 px-2 font-medium">状态</th>
                      <th className="text-center py-2 px-2 font-medium">模式</th>
                      <th className="text-center py-2 px-2 font-medium">嘉宾</th>
                      <th className="text-center py-2 px-2 font-medium">轮次</th>
                      <th className="text-center py-2 px-2 font-medium">消息数</th>
                      <th className="text-right py-2 pl-4 font-medium">日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.discussionDetails.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/discussion/${d.id}`)}
                      >
                        <td className="py-2 pr-4 max-w-[200px] truncate">{d.title}</td>
                        <td className="py-2 px-2 text-center">
                          {d.status === 'completed' ? (
                            <Badge variant="default" className="text-xs bg-green-500">完成</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Clock className="w-3 h-3 mr-0.5" />进行中
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-xs text-muted-foreground">
                            {d.mode === 'document' ? '文档' : '讨论'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">{d.guestCount}</td>
                        <td className="py-2 px-2 text-center">{d.rounds}</td>
                        <td className="py-2 px-2 text-center">{d.messageCount}</td>
                        <td className="py-2 pl-4 text-right text-muted-foreground">
                          {new Date(d.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
