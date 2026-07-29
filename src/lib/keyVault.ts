/**
 * Local key vault.
 *
 * On GitHub Pages there is no server, so provider keys live only in this
 * browser. Keys are written to localStorage on this device and are never
 * transmitted anywhere except directly to the provider you configured.
 */
export interface VaultConfig {
  siliconflowKey: string;
  siliconflowModel: string;
  openrouterKey: string;
  openrouterModel: string;
  geminiKey: string;
  geminiModel: string;
  corsProxy: string;
}

const STORAGE_KEY = "agentosirus.keyvault.v1";

export const DEFAULTS: VaultConfig = {
  siliconflowKey: "",
  siliconflowModel: "Qwen/Qwen2.5-72B-Instruct",
  openrouterKey: "",
  openrouterModel: "deepseek/deepseek-chat:free",
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  corsProxy: "https://r.jina.ai/"
};

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export function loadConfig(): VaultConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<VaultConfig>;
    return {
      siliconflowKey: clean(parsed.siliconflowKey),
      siliconflowModel: clean(parsed.siliconflowModel) || DEFAULTS.siliconflowModel,
      openrouterKey: clean(parsed.openrouterKey),
      openrouterModel: clean(parsed.openrouterModel) || DEFAULTS.openrouterModel,
      geminiKey: clean(parsed.geminiKey),
      geminiModel: clean(parsed.geminiModel) || DEFAULTS.geminiModel,
      corsProxy: typeof parsed.corsProxy === "string" ? parsed.corsProxy.trim() : DEFAULTS.corsProxy
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: VaultConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent("agentosirus:config-changed"));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("agentosirus:config-changed"));
}

export function hasAnyProvider(config: VaultConfig = loadConfig()): boolean {
  return Boolean(config.siliconflowKey || config.openrouterKey || config.geminiKey);
}

export function activeProviders(config: VaultConfig = loadConfig()): string[] {
  const out: string[] = [];
  if (config.siliconflowKey) out.push("SiliconFlow");
  if (config.openrouterKey) out.push("OpenRouter");
  if (config.geminiKey) out.push("Gemini");
  return out;
}
