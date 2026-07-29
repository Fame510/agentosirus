/**
 * Browser-side port of the three-tier provider chain from server.ts.
 *
 * Tier 1: SiliconFlow  ->  Tier 2: OpenRouter  ->  Tier 3: Gemini
 *
 * Keys are read from the local key vault at call time, so a key entered in
 * the UI takes effect on the very next request with no rebuild or reload.
 */
import { loadConfig, VaultConfig } from "./keyVault";

export interface LlmMessage {
  role: "user" | "model" | "assistant" | "system";
  text: string;
}

export interface GenerateParams {
  systemInstruction?: string;
  history?: LlmMessage[];
  message: string;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
}

export interface GenerateResult {
  text: string;
  provider: string;
  model: string;
}

const TIMEOUT_MS = 45000;

function toChatMessages(params: GenerateParams): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (params.systemInstruction) {
    messages.push({ role: "system", content: params.systemInstruction });
  }
  for (const entry of params.history || []) {
    if (!entry || !entry.text) continue;
    messages.push({
      role: entry.role === "model" || entry.role === "assistant" ? "assistant" : "user",
      content: entry.text
    });
  }
  messages.push({ role: "user", content: params.message });
  return messages;
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function uniqueModels(preferred: string, fallbacks: string[]): string[] {
  const list = [preferred, ...fallbacks].filter(Boolean);
  return Array.from(new Set(list));
}

async function callOpenAiCompatible(
  label: string,
  endpoint: string,
  apiKey: string,
  models: string[],
  params: GenerateParams,
  extraHeaders: Record<string, string> = {}
): Promise<GenerateResult> {
  const messages = toChatMessages(params);
  let lastError: Error | null = null;

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxOutputTokens || 2048
    };
    if (params.json) body.response_format = { type: "json_object" };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          ...extraHeaders
        },
        body: JSON.stringify(body),
        signal: timeoutSignal(TIMEOUT_MS)
      });

      if (!response.ok) {
        const detail = await response.text();
        if (response.status === 401 || response.status === 403) {
          throw new Error(label + " rejected the key (HTTP " + response.status + "). Check it in Settings.");
        }
        lastError = new Error(label + " error " + response.status + ": " + detail.slice(0, 300));
        continue;
      }

      const data = await response.json();
      const text: string = data?.choices?.[0]?.message?.content || "";
      if (!text) {
        lastError = new Error(label + " returned an empty response from " + model + ".");
        continue;
      }
      return { text, provider: label, model };
    } catch (err) {
      const error = err as Error;
      if (/rejected the key/.test(error.message)) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error(label + " request failed.");
}

async function callGemini(apiKey: string, preferredModel: string, params: GenerateParams): Promise<GenerateResult> {
  const models = uniqueModels(preferredModel, [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-flash-latest"
  ]);

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const entry of params.history || []) {
    if (!entry || !entry.text) continue;
    contents.push({
      role: entry.role === "model" || entry.role === "assistant" ? "model" : "user",
      parts: [{ text: entry.text }]
    });
  }
  contents.push({ role: "user", parts: [{ text: params.message }] });

  let lastError: Error | null = null;

  for (const model of models) {
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxOutputTokens || 2048,
        ...(params.json ? { responseMimeType: "application/json" } : {})
      }
    };
    if (params.systemInstruction) {
      body.systemInstruction = { parts: [{ text: params.systemInstruction }] };
    }

    try {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent?key=" +
        encodeURIComponent(apiKey);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: timeoutSignal(TIMEOUT_MS)
      });

      if (!response.ok) {
        const detail = await response.text();
        if (response.status === 400 && /API key not valid/i.test(detail)) {
          throw new Error("Gemini rejected the key. Check it in Settings.");
        }
        lastError = new Error("Gemini error " + response.status + ": " + detail.slice(0, 300));
        continue;
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: { text?: string }) => p.text || "").join("").trim();
      if (!text) {
        lastError = new Error("Gemini returned an empty response from " + model + ".");
        continue;
      }
      return { text, provider: "Gemini", model };
    } catch (err) {
      const error = err as Error;
      if (/rejected the key/.test(error.message)) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("Gemini request failed.");
}

export class MissingKeyError extends Error {
  constructor() {
    super("No AI provider key configured. Open Settings and add a SiliconFlow, OpenRouter, or Gemini key.");
    this.name = "MissingKeyError";
  }
}

export async function generate(params: GenerateParams, override?: VaultConfig): Promise<GenerateResult> {
  const config = override || loadConfig();
  const failures: string[] = [];

  if (!config.siliconflowKey && !config.openrouterKey && !config.geminiKey) {
    throw new MissingKeyError();
  }

  if (config.siliconflowKey) {
    try {
      return await callOpenAiCompatible(
        "SiliconFlow",
        "https://api.siliconflow.cn/v1/chat/completions",
        config.siliconflowKey,
        uniqueModels(config.siliconflowModel, [
          "deepseek-ai/DeepSeek-V3",
          "Qwen/Qwen2.5-Coder-32B-Instruct",
          "THUDM/glm-4-9b-chat"
        ]),
        params
      );
    } catch (err) {
      failures.push((err as Error).message);
    }
  }

  if (config.openrouterKey) {
    try {
      return await callOpenAiCompatible(
        "OpenRouter",
        "https://openrouter.ai/api/v1/chat/completions",
        config.openrouterKey,
        uniqueModels(config.openrouterModel, [
          "deepseek/deepseek-chat:free",
          "deepseek/deepseek-r1:free",
          "qwen/qwen-2.5-72b-instruct:free"
        ]),
        params,
        { "HTTP-Referer": window.location.origin, "X-Title": "AgentOsirus" }
      );
    } catch (err) {
      failures.push((err as Error).message);
    }
  }

  if (config.geminiKey) {
    try {
      return await callGemini(config.geminiKey, config.geminiModel, params);
    } catch (err) {
      failures.push((err as Error).message);
    }
  }

  throw new Error("All configured providers failed. " + failures.join(" | "));
}

/** Verifies one provider key with a minimal round trip, for the Settings panel. */
export async function testProvider(
  provider: "siliconflow" | "openrouter" | "gemini",
  config: VaultConfig
): Promise<GenerateResult> {
  const probe: GenerateParams = { message: "Reply with the single word: READY", maxOutputTokens: 16, temperature: 0 };

  if (provider === "siliconflow") {
    return callOpenAiCompatible(
      "SiliconFlow",
      "https://api.siliconflow.cn/v1/chat/completions",
      config.siliconflowKey,
      [config.siliconflowModel],
      probe
    );
  }
  if (provider === "openrouter") {
    return callOpenAiCompatible(
      "OpenRouter",
      "https://openrouter.ai/api/v1/chat/completions",
      config.openrouterKey,
      [config.openrouterModel],
      probe,
      { "HTTP-Referer": window.location.origin, "X-Title": "AgentOsirus" }
    );
  }
  return callGemini(config.geminiKey, config.geminiModel, probe);
}
