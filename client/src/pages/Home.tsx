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
  Trash2,
  Paperclip,
  X,
  FileText,
  BarChart3,
} from "lucide-react";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// 支持的模型列表
const MODELS = [
  { provider: 'openai', name: 'OpenAI GPT-4o', model: 'gpt-4o' },
  { provider: 'openai', name: 'OpenAI GPT-4o-mini', model: 'gpt-4o-mini' },
  { provider: 'gemini', name: 'Google Gemini 2.5 Flash', model: 'gemini-2.5-flash' },
  { provider: 'claude', name: 'Anthropic Claude Sonnet 4.5', model: 'claude-sonnet-4-5' },
  { provider: 'deepseek', name: 'DeepSeek Chat', model: 'deepseek-chat' },
];

// 讨论模板
interface DiscussionTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  title: string;
  question: string;
  mode: 'discussion' | 'document';
  guestModels: string[];
  judgeModel: string;
  confidenceThreshold: number;
}

const TEMPLATES: DiscussionTemplate[] = [
  {
    id: 'tech-review',
    name: '技术方案评审',
    icon: '🔧',
    description: '多个 AI 评审技术方案的可行性、风险和改进建议',
    title: '技术方案评审',
    question: '请评审以下技术方案，从可行性、性能、安全性、可维护性等维度分析其优缺点，并给出改进建议。\n\n[请在此描述您的技术方案]',
    mode: 'discussion',
    guestModels: ['openai', 'claude', 'gemini'],
    judgeModel: 'claude',
    confidenceThreshold: 0.8,
  },
  {
    id: 'investment',
    name: '投资决策分析',
    icon: '📈',
    description: '分析投资标的的风险收益比，辅助投资决策',
    title: '投资决策分析',
    question: '请从基本面、技术面、宏观环境等角度分析以下投资标的，评估其风险收益比，并给出投资建议。\n\n[请在此描述投资标的和背景]',
    mode: 'discussion',
    guestModels: ['openai', 'claude', 'deepseek'],
    judgeModel: 'openai',
    confidenceThreshold: 0.75,
  },
  {
    id: 'product',
    name: '产品需求讨论',
    icon: '💡',
    description: '讨论产品需求的优先级、可行性和实现方案',
    title: '产品需求讨论',
    question: '请讨论以下产品需求，从用户价值、技术可行性、商业价值、实现成本等维度进行分析，确定需求优先级。\n\n[请在此描述产品需求]',
    mode: 'discussion',
    guestModels: ['openai', 'gemini'],
    judgeModel: 'claude',
    confidenceThreshold: 0.8,
  },
  {
    id: 'prd',
    name: '协作撰写 PRD',
    icon: '📄',
    description: '多个 AI 协作撰写产品需求文档',
    title: '产品需求文档（PRD）',
    question: '请协作撰写一份完整的产品需求文档（PRD），包含：背景、目标用户、核心功能、用户故事、非功能需求、里程碑计划。\n\n[请在此描述产品概述]',
    mode: 'document',
    guestModels: ['openai', 'claude', 'gemini'],
    judgeModel: 'claude',
    confidenceThreshold: 0.85,
  },
  {
    id: 'brainstorm',
    name: '头脑风暴',
    icon: '🧠',
    description: '围绕一个话题进行多角度创意发散',
    title: '头脑风暴',
    question: '请围绕以下话题进行头脑风暴，每位嘉宾从不同角度提出创意和方案，裁判负责整理和评选最佳创意。\n\n[请在此描述话题]',
    mode: 'discussion',
    guestModels: ['openai', 'claude', 'gemini', 'deepseek'],
    judgeModel: 'openai',
    confidenceThreshold: 0.7,
  },
  {
    id: 'debate',
    name: '正反方辩论',
    icon: '⚖️',
    description: '围绕争议话题进行正反方辩论',
    title: '正反方辩论',
    question: '请围绕以下话题展开正反方辩论，各嘉宾分别持不同立场进行论证，裁判在充分辩论后做出裁决。\n\n[请在此描述辩论话题]',
    mode: 'discussion',
    guestModels: ['openai', 'claude'],
    judgeModel: 'gemini',
    confidenceThreshold: 0.8,
  },
];

export default function Home() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // 新建讨论表单状态
  const [newDiscussion, setNewDiscussion] = useState({
    title: '',
    question: '',
    guestModels: [] as string[],
    judgeModel: '',
    confidenceThreshold: 0.8,
    enableDynamicAgent: false,
    dataReadLimit: 100,
    mode: 'discussion' as 'discussion' | 'document',
  });

  // 文件上传状态
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    fileName: string;
    fileType: 'pdf' | 'xlsx' | 'xls' | 'md';
    base64Data: string;
    fileSize: number;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 获取讨论列表
  const { data: discussions, isLoading: discussionsLoading, refetch } = trpc.discussion.list.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchOnWindowFocus: true }
  );

  // 创建讨论
  const createMutation = trpc.discussion.create.useMutation({
    onSuccess: (data) => {
      toast.success('讨论创建成功');
      setIsCreateDialogOpen(false);
      setUploadedFiles([]);
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
    createMutation.mutate({
      ...newDiscussion,
      attachments: uploadedFiles,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`文件 ${file.name} 超过 20MB 限制`);
        continue;
      }
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'xlsx', 'xls', 'md'].includes(ext || '')) {
        toast.error(`不支持的文件格式: ${file.name}`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setUploadedFiles(prev => [...prev, {
          fileName: file.name,
          fileType: ext as 'pdf' | 'xlsx' | 'xls' | 'md',
          base64Data: base64,
          fileSize: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    }
    // 重置 input 以允许重复选择同一文件
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      <aside className="w-96 border-r bg-card flex flex-col">
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
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="历史分析">
                <BarChart3 className="w-4 h-4" />
              </Button>
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
                {/* 模板选择 */}
                <div className="space-y-3">
                  <Label>快速模板（可选）</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="text-left p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors"
                        onClick={() => {
                          setNewDiscussion({
                            title: tpl.title,
                            question: tpl.question,
                            guestModels: tpl.guestModels,
                            judgeModel: tpl.judgeModel,
                            confidenceThreshold: tpl.confidenceThreshold,
                            enableDynamicAgent: false,
                            dataReadLimit: 100,
                            mode: tpl.mode,
                          });
                        }}
                      >
                        <span className="text-lg">{tpl.icon}</span>
                        <p className="font-medium text-sm mt-1">{tpl.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

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

                {/* 讨论模式 */}
                <div className="space-y-3">
                  <Label>讨论模式</Label>
                  <Select
                    value={newDiscussion.mode}
                    onValueChange={(value: 'discussion' | 'document') => setNewDiscussion(prev => ({ ...prev, mode: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discussion">问题讨论 — AI 辩论并给出结论</SelectItem>
                      <SelectItem value="document">协作产出文档 — AI 协作撰写文档（如 PRD）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 文件上传 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    <Label>参考文件（可选）</Label>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.xlsx,.xls,.md"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-4 h-4 mr-2" />
                    上传 PDF / Excel / Markdown 文件
                  </Button>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate flex-1">{file.fileName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(file.fileSize)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => removeFile(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    支持 PDF、Excel、Markdown 格式，单个文件最大 20MB。文件内容将作为 AI 讨论的参考资料。
                  </p>
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
                      <Label>启用网络搜索</Label>
                      <p className="text-xs text-muted-foreground">
                        AI 可自主搜索网络获取最新信息
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
                        <h4 className="font-medium text-sm line-clamp-2">{discussion.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
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
