import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  MessageSquare, 
  Plus, 
  Settings, 
  LogOut, 
  Loader2, 
  Users, 
  Gavel, 
  CheckCircle2,
  Clock,
  Archive,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// 支持的模型列表
const MODELS = [
  { provider: 'builtin', name: '内置模型 (Manus)', model: 'builtin' },
  { provider: 'openai', name: 'OpenAI GPT-4o', model: 'gpt-4o' },
  { provider: 'openai', name: 'OpenAI GPT-4o-mini', model: 'gpt-4o-mini' },
  { provider: 'gemini', name: 'Google Gemini 1.5 Pro', model: 'gemini-1.5-pro' },
  { provider: 'claude', name: 'Anthropic Claude 3.5 Sonnet', model: 'claude-3-5-sonnet' },
  { provider: 'deepseek', name: 'DeepSeek Chat', model: 'deepseek-chat' },
];

export default function Home() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // 新建讨论表单状态
  const [newDiscussion, setNewDiscussion] = useState({
    title: '',
    question: '',
    guestModels: ['builtin'] as string[],
    judgeModel: 'builtin',
    confidenceThreshold: 0.8,
    enableDynamicAgent: false,
    dataReadLimit: 100,
  });

  // 获取讨论列表
  const { data: discussions, isLoading: discussionsLoading, refetch } = trpc.discussion.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // 创建讨论
  const createMutation = trpc.discussion.create.useMutation({
    onSuccess: (data) => {
      toast.success('讨论创建成功');
      setIsCreateDialogOpen(false);
      refetch();
      navigate(`/discussion/${data.id}`);
    },
    onError: (error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });

  // 删除讨论
  const deleteMutation = trpc.discussion.delete.useMutation({
    onSuccess: () => {
      toast.success('讨论已删除');
      refetch();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  const handleCreateDiscussion = () => {
    if (!newDiscussion.title.trim() || !newDiscussion.question.trim()) {
      toast.error('请填写讨论标题和问题');
      return;
    }
    if (newDiscussion.guestModels.length === 0) {
      toast.error('请至少选择一个嘉宾模型');
      return;
    }
    createMutation.mutate(newDiscussion);
  };

  const handleGuestModelToggle = (model: string) => {
    setNewDiscussion(prev => {
      const models = prev.guestModels.includes(model)
        ? prev.guestModels.filter(m => m !== model)
        : prev.guestModels.length < 4
          ? [...prev.guestModels, model]
          : prev.guestModels;
      return { ...prev, guestModels: models };
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-blue-500"><Clock className="w-3 h-3 mr-1" />进行中</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />已完成</Badge>;
      case 'archived':
        return <Badge variant="secondary"><Archive className="w-3 h-3 mr-1" />已归档</Badge>;
      default:
        return null;
    }
  };

  // 未登录状态
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">AI 讨论竞技场</CardTitle>
            <CardDescription>
              多角色 AI 辩论与决策支持平台
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground text-sm">
              让多个 AI 模型围绕您的问题展开辩论，由 AI 裁判协调讨论并做出最终裁决。
            </p>
            <Button className="w-full" asChild>
              <a href={getLoginUrl()}>登录开始使用</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 加载状态
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* 侧边栏 */}
      <aside className="w-80 border-r bg-card flex flex-col">
        {/* 用户信息 */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-medium">
                  {user?.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div>
                <p className="font-medium text-sm">{user?.name || '用户'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => logout()}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 新建讨论按钮 */}
        <div className="p-4">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" size="lg">
                <Plus className="w-4 h-4 mr-2" />
                新建讨论
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>创建新讨论</DialogTitle>
                <DialogDescription>
                  配置讨论参数，选择参与的 AI 嘉宾和裁判模型
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* 基本信息 */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">讨论标题</Label>
                    <Input
                      id="title"
                      placeholder="例如：产品定价策略讨论"
                      value={newDiscussion.title}
                      onChange={(e) => setNewDiscussion(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="question">讨论问题</Label>
                    <Textarea
                      id="question"
                      placeholder="详细描述您想要讨论的问题..."
                      rows={4}
                      value={newDiscussion.question}
                      onChange={(e) => setNewDiscussion(prev => ({ ...prev, question: e.target.value }))}
                    />
                  </div>
                </div>

                <Separator />

                {/* 嘉宾模型选择 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <Label>嘉宾模型 (最多4个)</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MODELS.map((model) => (
                      <Button
                        key={model.model}
                        variant={newDiscussion.guestModels.includes(model.provider) ? "default" : "outline"}
                        className="justify-start h-auto py-2"
                        onClick={() => handleGuestModelToggle(model.provider)}
                        disabled={!newDiscussion.guestModels.includes(model.provider) && newDiscussion.guestModels.length >= 4}
                      >
                        <span className="truncate">{model.name}</span>
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    已选择 {newDiscussion.guestModels.length}/4 个嘉宾
                  </p>
                </div>

                <Separator />

                {/* 裁判模型选择 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Gavel className="w-4 h-4" />
                    <Label>裁判模型</Label>
                  </div>
                  <Select
                    value={newDiscussion.judgeModel}
                    onValueChange={(value) => setNewDiscussion(prev => ({ ...prev, judgeModel: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择裁判模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODELS.map((model) => (
                        <SelectItem key={model.model} value={model.provider}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* 高级配置 */}
                <div className="space-y-4">
                  <Label className="text-base">高级配置</Label>
                  
                  <div className="space-y-2">
                    <Label htmlFor="threshold">置信度阈值: {newDiscussion.confidenceThreshold}</Label>
                    <Input
                      id="threshold"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={newDiscussion.confidenceThreshold}
                      onChange={(e) => setNewDiscussion(prev => ({ 
                        ...prev, 
                        confidenceThreshold: parseFloat(e.target.value) 
                      }))}
                      className="cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>启用动态 Agent</Label>
                      <p className="text-xs text-muted-foreground">
                        允许 AI 生成代码查询数据库
                      </p>
                    </div>
                    <Switch
                      checked={newDiscussion.enableDynamicAgent}
                      onCheckedChange={(checked) => setNewDiscussion(prev => ({ 
                        ...prev, 
                        enableDynamicAgent: checked 
                      }))}
                    />
                  </div>

                  {newDiscussion.enableDynamicAgent && (
                    <div className="space-y-2">
                      <Label htmlFor="dataLimit">数据读取上限</Label>
                      <Input
                        id="dataLimit"
                        type="number"
                        min="1"
                        max="1000"
                        value={newDiscussion.dataReadLimit}
                        onChange={(e) => setNewDiscussion(prev => ({ 
                          ...prev, 
                          dataReadLimit: parseInt(e.target.value) || 100 
                        }))}
                      />
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreateDiscussion} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  创建讨论
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* 讨论列表 */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">历史讨论</h3>
            {discussionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : discussions?.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                暂无讨论记录
              </p>
            ) : (
              discussions?.map((discussion) => (
                <Card
                  key={discussion.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/discussion/${discussion.id}`)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{discussion.title}</h4>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {discussion.question}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {getStatusBadge(discussion.status)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(discussion.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('确定要删除这个讨论吗？')) {
                            deleteMutation.mutate({ id: discussion.id });
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-6 w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
            <MessageSquare className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">欢迎使用 AI 讨论竞技场</h1>
          <p className="text-muted-foreground mb-6">
            选择一个历史讨论继续，或创建新的讨论话题开始 AI 辩论。
          </p>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            创建新讨论
          </Button>
        </div>
      </main>
    </div>
  );
}
