# AgentOsirus Companion

A tiny local service that gives the hosted app abilities a browser tab cannot
have on its own:

- **A real Playwright browser** the agents can open, navigate, click, type,
  read, and screenshot — visible or headless, spun up on demand.
- **Signed KlingAI requests**, since KlingAI requires JWT signing with a secret
  key that must never live in a web page.

It binds to `127.0.0.1` only and is never exposed to the internet.

## Setup

```bash
cd companion
npm install          # also downloads Chromium
npm start
```

You should see:

```
AgentOsirus companion listening on http://127.0.0.1:8787
```

In the app, open **Settings → Browser companion** and confirm the URL matches
(`http://localhost:8787` by default). The status dot turns green when connected.

## Allowing your hosted origin

Browsers require the companion to allow the calling origin. The GitHub Pages
origin for this project is already allowed. To add others:

```bash
ALLOWED_ORIGINS=https://your-domain.example npm start
```

## Note on hosted pages and localhost

A page served over HTTPS may block requests to plain `http://localhost`
depending on the browser. If the companion shows as offline on the hosted site
while working locally, run the app locally with `npm run dev` for browser
automation, or put the companion behind an HTTPS tunnel and set that URL in
Settings.

## Actions

| Action | Purpose |
|---|---|
| `GET /health` | Readiness, Playwright install state, browser state |
| `POST /open` | Launch/reuse a browser and navigate |
| `POST /read` | Return readable text after JavaScript executes |
| `POST /click` | Click a selector |
| `POST /type` | Fill an input |
| `POST /screenshot` | PNG data URL of the current page |
| `POST /close` | Close the browser |
| `POST /kling` | Signed KlingAI image/video generation |
