import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installApiShim } from "./lib/apiShim";
import { SettingsPanel } from "./components/SettingsPanel";
import { hasAnyProvider, activeProviders } from "./lib/keyVault";
import { KeyRound } from "lucide-react";

// Answer /api/* inside the browser so the app runs on static hosting.
installApiShim();

function Shell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providers, setProviders] = useState<string[]>(activeProviders());

  useEffect(() => {
    const sync = () => setProviders(activeProviders());
    window.addEventListener("agentosirus:config-changed", sync);
    return () => window.removeEventListener("agentosirus:config-changed", sync);
  }, []);

  // Open the vault automatically on a first visit with no keys configured.
  useEffect(() => {
    if (!hasAnyProvider()) setSettingsOpen(true);
  }, []);

  const configured = providers.length > 0;

  return (
    <>
      <App />

      <button
        onClick={() => setSettingsOpen(true)}
        title={configured ? "Providers active: " + providers.join(", ") : "No API key configured"}
        className={
          "fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full px-4 py-3 font-mono text-xs uppercase shadow-xl backdrop-blur transition " +
          (configured
            ? "border border-cyan-500/40 bg-slate-900/90 text-cyan-300 hover:bg-slate-800"
            : "border border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25")
        }
      >
        <KeyRound size={15} />
        <span className="hidden sm:inline">{configured ? providers.join(" / ") : "Add API key"}</span>
        <span
          className={
            "h-2 w-2 rounded-full " + (configured ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400")
          }
        />
      </button>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>
);
