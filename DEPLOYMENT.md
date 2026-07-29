# AgentOsirus — Live App Deployment

AgentOsirus now runs as a **fully client-side app on GitHub Pages**. There is no
server to host, no environment variables to configure on a host, and no secrets
stored in this repository. You paste your API keys into the running app and they
stay in your own browser.

---

## 1. Live URL

Once the deploy workflow finishes, the app is live at:

```
https://fame510.github.io/agentosirus/
```

## 2. One-time repository setup

GitHub Pages must be told to publish from Actions:

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Save.

That's it. Every push to `main` rebuilds and redeploys automatically.
You can also trigger it manually from **Actions → Deploy to GitHub Pages → Run workflow**.

## 3. Entering your keys

Open the live URL. On a first visit the **Local Key Vault** opens automatically.
You can reopen it any time with the key button in the bottom-right corner.

Add one or more keys. The app tries them in this order on every request:

| Tier | Provider | Where to get a key |
|------|----------|--------------------|
| 1 (primary)   | SiliconFlow | https://cloud.siliconflow.cn/account/ak |
| 2 (secondary) | OpenRouter  | https://openrouter.ai/keys |
| 3 (fallback)  | Gemini      | https://aistudio.google.com/apikey |

Press **Test** next to a key to verify it with a live round trip, then **Save keys**.
A saved key takes effect on the very next request — no rebuild, no reload.

### Where the keys live

- Stored in your browser's `localStorage` under `agentosirus.keyvault.v1`.
- Sent **only** to the provider endpoint you enabled, directly from your browser.
- Never committed to the repo, never sent to GitHub, never sent to any third party.
- **Wipe keys** in the vault clears them from this device instantly.

Because requests go straight from your browser to the provider, your key is
visible in your own browser's network tab. That is expected for a static app.
Use a key with billing limits, and avoid entering keys on a shared computer.

## 4. What changed from the server version

The original app used `server.ts` (Express) to scan agent markdown at request
time and proxy AI calls with server-side keys. Static hosting can't run that, so
the same behavior was moved into the browser:

| Original server route | Replacement |
|---|---|
| `GET /api/divisions` | Prebuilt `public/agents-index.json` |
| `GET /api/agents` | Prebuilt `public/agents-index.json` |
| `GET /api/agents/:category/:id` | Prebuilt `public/agents-content/<slug>.md` |
| `POST /api/chat` | `src/lib/llm.ts` calls the provider directly |
| `POST /api/chain` | `src/lib/apiShim.ts` runs the multi-agent chain in-browser |
| `POST /api/scrape` | Browser fetch through a configurable read proxy |

`src/lib/apiShim.ts` patches `window.fetch` and answers `/api/*` locally, so
**every existing React component works unchanged.**

New files:

- `scripts/build-agent-index.mjs` — scans all agent markdown at build time and emits static JSON + markdown.
- `src/lib/keyVault.ts` — local key storage.
- `src/lib/llm.ts` — three-tier provider chain with model fallback.
- `src/lib/apiShim.ts` — in-browser `/api/*` router.
- `src/components/SettingsPanel.tsx` — the key vault UI.
- `.github/workflows/deploy-pages.yml` — build and deploy to Pages.

`server.ts` is retained for local full-stack use but is no longer required.

## 5. Running locally

```bash
npm install
npm run dev      # builds the agent index, then starts Vite on :3000
```

Enter your keys in the same vault UI. Local storage is per-origin, so your
`localhost` keys and your Pages keys are stored separately.

Build a production bundle locally:

```bash
npm run build
npm run preview
```

## 6. Web page reading

Browsers enforce CORS, so the app cannot read arbitrary pages directly. Pasting
a URL into a prompt routes the read through the proxy prefix configured in the
vault (default `https://r.jina.ai/`), then falls back to a direct request for
sites that permit it. Replace the prefix with your own proxy if you prefer.

## 7. Troubleshooting

**Blank page after deploy** — Confirm Settings → Pages source is **GitHub Actions**,
and check that the deploy workflow succeeded under the Actions tab.

**"No AI provider key configured"** — Open the vault and save at least one key.

**A key fails the Test** — The exact provider error is shown under the field.
`401`/`403` means the key is wrong or lacks access; try another tier.

**Agents list is empty** — The index build step did not run. Re-run the deploy
workflow; `npm run build` runs `build:index` automatically.
