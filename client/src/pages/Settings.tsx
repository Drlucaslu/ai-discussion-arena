import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  Loader2, 
  Save, 
  Key, 
  Settings as SettingsIcon,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// 支持的模型提供商
const MODEL_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza...' },
  { id: 'claude', name: 'Anthropic Claude', placeholder: 'sk-ant-...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
];

export default function Settings() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  
  // 新配置表单
  const [newConfig, setNewConfig] = useState({
    modelProvider: '',
    apiKey: '',
    baseUrl: '',
  });

  // 用户设置表单
  const [userSettingsForm, setUserSettingsForm] = useState({
    defaultJudgeModel: 'builtin',
    defaultConfidenceThreshold: 0.8,
    defaultEnableDynamicAgent: false,
    defaultDataReadLimit: 100,
    enterpriseApiUrl: '',
    enterpriseApiKey: '',
  });

  // 获取模型配置列表
  const { data: modelConfigs, isLoading: configsLoading, refetch: refetchConfigs } = trpc.modelConfig.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // 获取用户设置
  const { data: userSettings, isLoading: settingsLoading } = trpc.settings.get.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // 保存模型配置
  const saveConfigMutation = trpc.modelConfig.save.useMutation({
    onSuccess: () => {
      toast.success('API Key 保存成功');
      setNewConfig({ modelProvider: '', apiKey: '', baseUrl: '' });
      refetchConfigs();
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`);
    },
  });

  // 删除模型配置
  const deleteConfigMutation = trpc.modelConfig.delete.useMutation({
    onSuccess: () => {
      toast.success('配置已删除');
      refetchConfigs();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  // 保存用户设置
  const saveSettingsMutation = trpc.settings.save.useMutation({
    onSuccess: () => {
      toast.success('设置保存成功');
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`);
    },
  });

  // 初始化用户设置表单
  useEffect(() => {
    if (userSettings) {
      setUserSettingsForm({
        defaultJudgeModel: userSettings.defaultJudgeModel || 'builtin',
        defaultConfidenceThreshold: userSettings.defaultConfidenceThreshold || 0.8,
        defaultEnableDynamicAgent: userSettings.defaultEnableDynamicAgent || false,
        defaultDataReadLimit: userSettings.defaultDataReadLimit || 100,
        enterpriseApiUrl: userSettings.enterpriseApiUrl || '',
        enterpriseApiKey: '',
      });
    }
  }, [userSettings]);

  const handleSaveConfig = () => {
    if (!newConfig.modelProvider || !newConfig.apiKey) {
      toast.error('请选择模型提供商并输入 API Key');
      return;
    }
    saveConfigMutation.mutate({
      modelProvider: newConfig.modelProvider,
      apiKey: newConfig.apiKey,
      baseUrl: newConfig.baseUrl || undefined,
      isEnabled: true,
    });
  };

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(userSettingsForm);
  };

  const getProviderStatus = (providerId: string) => {
    const config = modelConfigs?.find(c => c.modelProvider === providerId);
    return config?.isEnabled ? 'configured' : 'not-configured';
  };

  // 加载状态
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-semibold">设置</h1>
            <p className="text-sm text-muted-foreground">管理 API Key 和默认配置</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList>
            <TabsTrigger value="api-keys">
              <Key className="w-4 h-4 mr-2" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="defaults">
              <SettingsIcon className="w-4 h-4 mr-2" />
              默认设置
            </TabsTrigger>
          </TabsList>

          {/* API Keys 配置 */}
          <TabsContent value="api-keys" className="space-y-6">
            {/* 添加新配置 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">添加 API Key</CardTitle>
                <CardDescription>
                  配置各 AI 模型提供商的 API Key，以便在讨论中使用
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>模型提供商</Label>
                    <Select
                      value={newConfig.modelProvider}
                      onValueChange={(value) => setNewConfig(prev => ({ ...prev, modelProvider: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择提供商" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_PROVIDERS.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            <div className="flex items-center gap-2">
                              {provider.name}
                              {getProviderStatus(provider.id) === 'configured' && (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      placeholder={MODEL_PROVIDERS.find(p => p.id === newConfig.modelProvider)?.placeholder || '输入 API Key'}
                      value={newConfig.apiKey}
                      onChange={(e) => setNewConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>自定义 API 端点 (可选)</Label>
                  <Input
                    placeholder="https://api.example.com/v1"
                    value={newConfig.baseUrl}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    如果使用代理或自托管服务，可以设置自定义端点
                  </p>
                </div>

                <Button onClick={handleSaveConfig} disabled={saveConfigMutation.isPending}>
                  {saveConfigMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  添加配置
                </Button>
              </CardContent>
            </Card>

            {/* 已配置的 API Keys */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">已配置的 API Keys</CardTitle>
                <CardDescription>
                  管理已保存的 API Key 配置
                </CardDescription>
              </CardHeader>
              <CardContent>
                {configsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : modelConfigs?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    暂未配置任何 API Key
                  </p>
                ) : (
                  <div className="space-y-3">
                    {modelConfigs?.map((config) => (
                      <div
                        key={config.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.isEnabled ? 'bg-green-500/10' : 'bg-muted'}`}>
                            {config.isEnabled ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">
                              {MODEL_PROVIDERS.find(p => p.id === config.modelProvider)?.name || config.modelProvider}
                            </p>
                            <p className="text-sm text-muted-foreground font-mono">
                              {config.apiKey}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('确定要删除这个配置吗？')) {
                              deleteConfigMutation.mutate({ id: config.id });
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 内置模型提示 */}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">内置模型</Badge>
                    <span className="text-sm text-muted-foreground">
                      无需配置，可直接使用
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 默认设置 */}
          <TabsContent value="defaults" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">讨论默认配置</CardTitle>
                <CardDescription>
                  设置新建讨论时的默认参数
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>默认裁判模型</Label>
                  <Select
                    value={userSettingsForm.defaultJudgeModel}
                    onValueChange={(value) => setUserSettingsForm(prev => ({ ...prev, defaultJudgeModel: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="builtin">内置模型 (Manus)</SelectItem>
                      {MODEL_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>默认置信度阈值: {userSettingsForm.defaultConfidenceThreshold}</Label>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={userSettingsForm.defaultConfidenceThreshold}
                    onChange={(e) => setUserSettingsForm(prev => ({ 
                      ...prev, 
                      defaultConfidenceThreshold: parseFloat(e.target.value) 
                    }))}
                    className="cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>默认启用动态 Agent</Label>
                    <p className="text-xs text-muted-foreground">
                      允许 AI 生成代码查询数据库
                    </p>
                  </div>
                  <Switch
                    checked={userSettingsForm.defaultEnableDynamicAgent}
                    onCheckedChange={(checked) => setUserSettingsForm(prev => ({ 
                      ...prev, 
                      defaultEnableDynamicAgent: checked 
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>默认数据读取上限</Label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={userSettingsForm.defaultDataReadLimit}
                    onChange={(e) => setUserSettingsForm(prev => ({ 
                      ...prev, 
                      defaultDataReadLimit: parseInt(e.target.value) || 100 
                    }))}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">企业数据对接</h4>
                  
                  <div className="space-y-2">
                    <Label>企业 API 地址</Label>
                    <Input
                      placeholder="https://api.yourcompany.com/data"
                      value={userSettingsForm.enterpriseApiUrl}
                      onChange={(e) => setUserSettingsForm(prev => ({ 
                        ...prev, 
                        enterpriseApiUrl: e.target.value 
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>企业 API Key</Label>
                    <Input
                      type="password"
                      placeholder="输入企业 API Key"
                      value={userSettingsForm.enterpriseApiKey}
                      onChange={(e) => setUserSettingsForm(prev => ({ 
                        ...prev, 
                        enterpriseApiKey: e.target.value 
                      }))}
                    />
                    {userSettings?.enterpriseApiKey && (
                      <p className="text-xs text-muted-foreground">
                        当前已配置: {userSettings.enterpriseApiKey}
                      </p>
                    )}
                  </div>
                </div>

                <Button onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending}>
                  {saveSettingsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存设置
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
