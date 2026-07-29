#!/usr/bin/env node
/**
 * AgentOsirus local companion service.
 *
 * Runs on your own machine and gives the hosted app two things the browser
 * cannot do by itself:
 *
 *   1. A real Playwright browser the agents can open and drive at will.
 *   2. Signed KlingAI generation requests (JWT signing needs the secret key
 *      server-side).
 *
 * Start it with:
 *     cd companion && npm install && npm start
 *
 * Then set the companion URL in the app's Settings (default http://localhost:8787).
 * Nothing is exposed publicly; it binds to localhost only.
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";

// Origins allowed to call this service. Add your Pages URL here.
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
  // GitHub Pages origin for this project:
  "https://fame510.github.io"
];

let browser = null;
let page = null;
let playwrightModule = null;

async function getPlaywright() {
  if (playwrightModule) return playwrightModule;
  try {
    playwrightModule = await import("playwright");
    return playwrightModule;
  } catch {
    throw new Error(
      "Playwright is not installed. Run: cd companion && npm install && npx playwright install chromium"
    );
  }
}

async function ensureBrowser(headless) {
  const { chromium } = await getPlaywright();
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: Boolean(headless) });
    page = null;
  }
  if (!page || page.isClosed()) {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  }
  return page;
}

function cleanText(html) {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

/** KlingAI requires an HS256 JWT signed with the secret key. */
function klingToken(accessKey, secretKey) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const unsigned = b64(header) + "." + b64(payload);
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(unsigned)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return unsigned + "." + signature;
}

const routes = {
  async health() {
    let playwrightReady = false;
    try {
      await getPlaywright();
      playwrightReady = true;
    } catch {
      playwrightReady = false;
    }
    return { ok: true, playwright: playwrightReady, browserOpen: Boolean(browser && browser.isConnected()) };
  },

  async open({ url, headless }) {
    const p = await ensureBrowser(headless);
    if (url) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    return { ok: true, url: p.url(), title: await p.title() };
  },

  async read({ url }) {
    const p = await ensureBrowser(true);
    if (url) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const html = await p.content();
    return { ok: true, url: p.url(), title: await p.title(), text: cleanText(html).slice(0, 40000) };
  },

  async click({ selector }) {
    if (!page) throw new Error("No page is open. Call open first.");
    await page.click(selector, { timeout: 15000 });
    return { ok: true, url: page.url() };
  },

  async type({ selector, text }) {
    if (!page) throw new Error("No page is open. Call open first.");
    await page.fill(selector, text);
    return { ok: true };
  },

  async screenshot({ url }) {
    const p = await ensureBrowser(true);
    if (url) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const buffer = await p.screenshot({ fullPage: false });
    return { ok: true, dataUrl: "data:image/png;base64," + buffer.toString("base64") };
  },

  async close() {
    if (browser) await browser.close();
    browser = null;
    page = null;
    return { ok: true };
  },

  async kling({ prompt, kind, accessKey, secretKey }) {
    if (!accessKey || !secretKey) throw new Error("KlingAI keys are required.");
    const token = klingToken(accessKey, secretKey);
    const endpoint =
      kind === "video"
        ? "https://api-singapore.klingai.com/v1/videos/text2video"
        : "https://api-singapore.klingai.com/v1/images/generations";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (!response.ok) throw new Error("KlingAI " + response.status + ": " + JSON.stringify(data).slice(0, 300));
    return { ok: true, data };
  }
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o));

  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const action = (req.url || "/").replace(/^\//, "").split("?")[0] || "health";
  const handler = routes[action];

  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unknown action: " + action }));
  }

  let body = {};
  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
    }
  }

  try {
    const result = await handler(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message || String(err) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log("AgentOsirus companion listening on http://" + HOST + ":" + PORT);
  console.log("Allowed origins: " + ALLOWED_ORIGINS.join(", "));
  console.log("Set this URL in the app Settings under Browser companion.");
});
