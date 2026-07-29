import { useEffect, useState } from "react";
import { Key, X, Check, Loader2, Trash2, ShieldCheck, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { VaultConfig, loadConfig, saveConfig, clearConfig, DEFAULTS } from "../lib/keyVault";
import { testProvider } from "../lib/llm";

type ProviderId = "siliconflow" | "openrouter" | "gemini";
type TestState = { status: "idle" | "testing" | "ok" | "fail"; detail?: string };

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  tier: string;
  keyField: keyof VaultConfig;
  modelField: keyof VaultConfig;
  hint: string;
  signup: string;
}> = [
  {
    id: "siliconflow",
    label: "SiliconFlow",
    tier: "Tier 1 - Primary",
    keyField: "siliconflowKey",
    modelField: "siliconflowModel",
    hint: "Fast Qwen and DeepSeek hosting. Tried first on every request.",
    signup: "https://cloud.siliconflow.cn/account/ak"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    tier: "Tier 2 - Secondary",
    keyField: "openrouterKey",
    modelField: "openrouterModel",
    hint: "Broad model catalog with free tiers. Used if Tier 1 fails.",
    signup: "https://openrouter.ai/keys"
  },
  {
    id: "gemini",
    label: "Google Gemini",
    tier: "Tier 3 - Fallback",
    keyField: "geminiKey",
    modelField: "geminiModel",
    hint: "Google AI Studio key. Final fallback in the chain.",
    signup: "https://aistudio.google.com/apikey"
  }
];

export function SettingsPanel({ open, onClose }: Props) {
  const [config, setConfig] = useState<VaultConfig>(loadConfig());
  const [tests, setTests] = useState<Record<ProviderId, TestState>>({
    siliconflow: { status: "idle" },
    openrouter: { status: "idle" },
    gemini: { status: "idle" }
  });
  const [reveal, setReveal] = useState<Record<ProviderId, boolean>>({
    siliconflow: false,
    openrouter: false,
    gemini: false
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setConfig(loadConfig());
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const update = (field: keyof VaultConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const persist = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const runTest = async (provider: ProviderId) => {
    saveConfig(config);
    setTests((prev) => ({ ...prev, [provider]: { status: "testing" } }));
    try {
      const result = await testProvider(provider, config);
      setTests((prev) => ({
        ...prev,
        [provider]: { status: "ok", detail: "Live on " + result.model }
      }));
    } catch (err) {
      setTests((prev) => ({
        ...prev,
        [provider]: { status: "fail", detail: (err as Error).message.slice(0, 160) }
      }));
    }
  };

  const wipe = () => {
    clearConfig();
    setConfig({ ...DEFAULTS });
    setTests({ siliconflow: { status: "idle" }, openrouter: { status: "idle" }, gemini: { status: "idle" } });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm sm:items-center">
      <div className="glow-border-cyan relative w-full max-w-2xl rounded-xl bg-slate-900/95 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
          aria-label="Close settings"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300">
            <Key size={20} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-cyan-300 glow-text-cyan">
              Local Key Vault
            </h2>
            <p className="text-xs text-slate-400">Keys stay in this browser only. Nothing is uploaded or committed.</p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-300" />
          <span>
            Stored in this device&apos;s local storage and sent only to the provider you enable. Add at least one key,
            then press Test. The app uses them in order: SiliconFlow, then OpenRouter, then Gemini.
          </span>
        </div>

        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const test = tests[provider.id];
            const keyValue = String(config[provider.keyField] || "");
            return (
              <div key={provider.id} className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-tech text-sm font-semibold text-slate-100">{provider.label}</span>
                    <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-300">
                      {provider.tier}
                    </span>
                  </div>
                  <a
                    href={provider.signup}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-cyan-400 underline decoration-dotted hover:text-cyan-300"
                  >
                    get key
                  </a>
                </div>

                <p className="mb-3 text-[11px] text-slate-400">{provider.hint}</p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={reveal[provider.id] ? "text" : "password"}
                      value={keyValue}
                      onChange={(e) => update(provider.keyField, e.target.value)}
                      placeholder="Paste API key"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-10 font-mono text-xs text-slate-100 outline-none transition focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-300"
                      aria-label="Toggle key visibility"
                    >
                      {reveal[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    onClick={() => runTest(provider.id)}
                    disabled={!keyValue || test.status === "testing"}
                    className="flex w-24 items-center justify-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 font-mono text-xs uppercase text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {test.status === "testing" ? <Loader2 size={14} className="animate-spin" /> : "Test"}
                  </button>
                </div>

                <input
                  type="text"
                  value={String(config[provider.modelField] || "")}
                  onChange={(e) => update(provider.modelField, e.target.value)}
                  placeholder="Model id"
                  spellCheck={false}
                  className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 font-mono text-[11px] text-slate-300 outline-none transition focus:border-cyan-600"
                />

                {test.status === "ok" && (
                  <p className="mt-2 flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                    <Check size={12} /> {test.detail}
                  </p>
                )}
                {test.status === "fail" && (
                  <p className="mt-2 flex items-start gap-1 font-mono text-[11px] text-rose-400">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {test.detail}
                  </p>
                )}
              </div>
            );
          })}

          <div className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-4">
            <label className="font-tech text-sm font-semibold text-slate-100">Web read proxy</label>
            <p className="mb-2 mt-1 text-[11px] text-slate-400">
              Browsers block most cross-origin page reads. This prefix is used when the app reads a URL you paste.
              Leave the default unless you run your own proxy.
            </p>
            <input
              type="text"
              value={config.corsProxy}
              onChange={(e) => update("corsProxy", e.target.value)}
              placeholder="https://r.jina.ai/"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 font-mono text-[11px] text-slate-300 outline-none transition focus:border-cyan-600"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={wipe}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 font-mono text-xs uppercase text-rose-400 transition hover:bg-rose-500/10"
          >
            <Trash2 size={14} /> Wipe keys
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="font-mono text-xs text-emerald-400">Saved</span>}
            <button
              onClick={persist}
              className="glow-bg-cyan rounded-lg bg-cyan-500 px-5 py-2 font-display text-xs font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-400"
            >
              Save keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
