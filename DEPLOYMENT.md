# AgentOsirus — Live App Guide

AgentOsirus runs as a **fully client-side app on GitHub Pages**. There is no server to host,
no environment variables to configure on a host, and **no secrets stored in this repository**.
You paste your keys into the running app and they stay in your own browser's local storage.

Live URL:

```
https://fame510.github.io/agentosirus/
```

---

## 1. One-time repository setup

GitHub Pages must publish from Actions:

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Save.

Every push to `main` rebuilds and redeploys. You can also run it manually from
**Actions → Deploy to GitHub Pages → Run workflow**.

---

## 2. How it works without a server

| Original server behaviour | Static replacement |
|---|---|
| Express scanned agent markdown at request time | `scripts/build-agent-index.mjs` pre-indexes every agent into `public/agents-index.json` + `public/agents-content/*.md` at build time |
| `/api/*` endpoints | `src/lib/apiShim.ts` patches `window.fetch` and answers `/api/*` in-browser |
| Server-held API keys | `src/lib/keyVault.ts` — browser-local vault, never transmitted anywhere except the provider you chose |
| Server-side URL scraping | Firecrawl → local Playwright companion → public CORS proxy → direct fetch, in that order |

The original UI components (`App.tsx`, `MasterAgentHub.tsx`, `AgentChat.tsx`, `TeamBuilder.tsx`,
`LiveSandbox.tsx`, `AgentDetail.tsx`, `AgentCard.tsx`) were **not modified** — they still call
`/api/...` and the shim answers them.

---

## 3. Settings console

Open the live URL. On a first visit the settings console opens automatically.
Reopen it any time from the floating dock in the bottom-right corner.

It has two tabs.

### Tab 1 — AI Models

Every provider below has its own key field, a model dropdown, an editable endpoint, and a
**Test** button that makes one real call so you can confirm the key works before relying on it.

| Provider | Free models included | Get a key |
|---|---|---|
| Ollama (local, keyless) | all local models | https://ollama.com/download |
| OpenRouter | `:free` variants (DeepSeek R1, Llama 3.3 70B, Qwen 2.5, Gemma 2, Mistral 7B, Phi-3) | https://openrouter.ai/keys |
| SiliconFlow | Qwen2.5-7B, GLM-4-9B, Yi-1.5-9B (free tier) | https://cloud.siliconflow.cn/account/ak |
| Google Gemini | Gemini 2.0 Flash / 1.5 Flash free tier | https://aistudio.google.com/apikey |
| Groq | Llama 3.3 70B, Llama 3.1 8B, Mixtral (free tier) | https://console.groq.com/keys |
| DeepSeek | — (very low cost) | https://platform.deepseek.com/api_keys |
| Qwen / DashScope | Qwen-Turbo free quota | https://dashscope.console.aliyun.com/apiKey |
| Moonshot / Kimi | — | https://platform.moonshot.cn/console/api-keys |
| Z.ai / GLM | GLM-4-Flash (free) | https://open.bigmodel.cn/usercenter/apikeys |
| MiniMax | — | https://platform.minimaxi.com/user-center/basic-information/interface-key |
| StepFun | Step-1-Flash (free) | https://platform.stepfun.com/interface-key |
| OpenAI | — | https://platform.openai.com/api-keys |
| Anthropic | — | https://console.anthropic.com/settings/keys |
| Mistral | Mistral Small / Open models free tier | https://console.mistral.ai/api-keys |

**Prefer free models** toggle (top of the tab): when on, routing always picks a provider's
free-tier model first and only falls back to a paid model if no free model is available.

**Routing order.** The app tries every provider you configured, in the order shown in the panel,
and moves to the next one on any failure. Drag-free: just fill in whichever ones you have.
If a key is rejected for auth reasons the provider is skipped immediately rather than retried.

**Keyless path.** Install Ollama, run `ollama serve`, pull a model (`ollama pull llama3.2`),
then in the panel click **Detect Ollama models**. No key needed at all.

### Tab 2 — Integrations

**GitHub personal access token (full access).**
This is the field for your PAT. Paste it, click **Verify**, and the panel shows your login,
name, and the scopes the token actually carries.

Create the token at https://github.com/settings/tokens with these scopes:

```
repo        (full control of private + public repositories)
workflow    (read/write GitHub Actions workflows)
read:org    (read organisation membership)
```

Add `admin:repo_hook`, `gist`, `delete_repo`, or `packages` if you want agents to manage
those too. Once verified, agents can:

- list your repos
- read and write files (auto-handles create-vs-update blob SHAs)
- create repositories
- open issues
- list workflow runs
- call any other GitHub REST endpoint through the raw escape hatch

**Firecrawl.** Paste a key from https://firecrawl.dev/app/api-keys. When present it becomes the
first choice for reading any URL, and unlocks site mapping and web search for agents.

**Local browser (Playwright).** Point at your companion service (default `http://127.0.0.1:8787`)
and press **Connect**. See section 4.

**KlingAI.** Paste your Access Key and Secret Key from https://app.klingai.com/global/dev/
for image and video generation. Kling requires JWT request signing, which the companion service
performs locally — the secret never leaves your machine over the network.

---

## 4. Local browser companion (Playwright + KlingAI signing)

The companion is a small local service that gives agents a real Chromium browser they can
open on demand, and signs KlingAI requests.

```bash
cd companion
npm install
npx playwright install chromium
npm start
```

It listens on `127.0.0.1:8787` and only accepts requests from `https://fame510.github.io`
and localhost dev origins.

Agent-callable actions: `open`, `read`, `click`, `type`, `screenshot`, `close`.
Set `HEADLESS=false` before `npm start` if you want to watch the browser work.

**Browser security caveat.** Some browsers block requests from an HTTPS page to
`http://localhost`. If **Connect** fails from the live URL, either:

- run the app locally (`npm install && npm run dev`, then open `http://localhost:5173`), or
- expose the companion over HTTPS with a tunnel (e.g. `cloudflared tunnel --url http://127.0.0.1:8787`)
  and paste the HTTPS URL into the Playwright field.

Chrome also lets you allowlist it via
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

---

## 5. Live mind map

When a swarm, chain, or multi-agent run starts, the mind-map drawer opens automatically.
It draws a radial graph where each node is an agent or step, animated by state:

- **queued** — dim, waiting
- **running** — pulsing ring, animated connector
- **done** — solid, filled
- **error** — red outline
- **skipped** — faded

A step rail beside the graph lists each node with its provider, model, and duration so you can
see exactly which agent produced which output. Toggle the drawer from the floating dock.

---

## 6. Local development

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` runs the agent indexer first, so new markdown personas appear immediately.
Adding an agent is still just: drop a `.md` file in the right division folder and rebuild.

```bash
npm run build        # index + production build into dist/
```

---

## 7. Security notes

- Nothing is committed to this repository. All keys live in your browser's local storage
  under `agentosirus.vault.v2`, on the device where you typed them.
- Because this is a static app, keys are visible in your own browser devtools. That's expected.
  Set spend limits on each provider dashboard and rotate keys you've shared.
- Your GitHub PAT has real write power. Prefer a fine-grained token scoped to the specific
  repositories you want agents to touch, rather than a classic all-repo token.
- Use **Clear all** in the settings console to wipe the vault on a shared machine.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy run fails on the Pages configuration step | Pages source isn't set to GitHub Actions yet — see section 1 |
| Agents list is empty | The indexer found no markdown; confirm agent folders are present and rerun the build |
| Every chat fails | No provider configured, or all keys rejected. Open Settings → AI Models and use **Test** on each one |
| Playwright **Connect** fails | Companion not running, or HTTPS→localhost blocked — see section 4 |
| KlingAI errors | Kling needs the companion running for JWT signing |
| Scraping returns nothing | Add a Firecrawl key, or start the companion so Playwright can render the page |
