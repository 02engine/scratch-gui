export const PROVIDER_DEFAULT_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  anthropic: "https://api.anthropic.com/v1",
  deepseek: "https://api.deepseek.com",
  google: "https://generativelanguage.googleapis.com/v1beta",
  azure: "",
  custom: "",
  custom_anthropic: "",
};

export const PROVIDER_DEFAULT_CONTEXT_WINDOWS: Record<string, number> = {
  openai: 128000,
  zhipu: 128000,
  anthropic: 200000,
  deepseek: 128000,
};
