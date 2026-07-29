/**
 * Static-hosting API shim.
 *
 * The React components call /api/divisions, /api/agents, /api/agents/:cat/:id,
 * /api/scrape, /api/chat and /api/chain. On static hosting there is no server,
 * so this module patches window.fetch and answers those routes locally using
 * the prebuilt agent index plus the browser-side provider chain.
 *
 * It also publishes progress to the activity bus, which drives the live mind map.
 */
import { generate, MissingKeyError, LlmMessage } from "./llm";
import { loadConfig } from "./keyVault";
import { firecrawl, playwright } from "./integrations";
import { startRun, endRun, addNode, updateNode, linkNodes } from "./activityBus";

interface AgentMeta {
  id: string;
  name: string;
  description: string;
  color: string;
  emoji: string;
  vibe: string;
  category: string;
  filePath: string;
  contentFile: string;
}

interface AgentIndex {
  divisions: Array<Record<string, string>>;
  agents: AgentMeta[];
}

interface ChainStep {
  agentId: string;
  name: string;
  emoji: string;
  task: string;
  output: string;
  provider?: string;
  model?: string;
}

const BASE = import.meta.env.BASE_URL || "/";

let indexPromise: Promise<AgentIndex> | null = null;
const contentCache = new Map<string, string>();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function loadIndex(): Promise<AgentIndex> {
  if (!indexPromise) {
    indexPromise = fetch(BASE + "agents-index.json")
      .then((r) => {
        if (!r.ok) throw new Error("Agent index missing (HTTP " + r.status + ").");
        return r.json() as Promise<AgentIndex>;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

async function loadContent(agent: AgentMeta): Promise<string> {
  const cached = contentCache.get(agent.contentFile);
  if (cached !== undefined) return cached;
  const response = await fetch(BASE + "agents-content/" + agent.contentFile);
  if (!response.ok) return "";
  const text = await response.text();
  contentCache.set(agent.contentFile, text);
  return text;
}

function stripHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  text = text.replace(/<(header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n");
  return text.trim().slice(0, 30000);
}

/**
 * Reads a page using the best tool available:
 *   1. Firecrawl, when a key is saved (most reliable).
 *   2. The local Playwright companion, when running (executes JavaScript).
 *   3. A configurable read proxy, then a direct fetch.
 */
async function readUrl(url: string): Promise<string> {
  if (firecrawl.available) {
    try {
      const text = await firecrawl.scrape(url);
      if (text) return text;
    } catch {
      // fall through
    }
  }

  try {
    if (await playwright.available()) {
      const text = await playwright.read(url);
      if (text) return text;
    }
  } catch {
    // fall through
  }

  const proxy = loadConfig().corsProxy;
  const attempts: string[] = [];
  if (proxy) attempts.push(proxy.replace(/\/?$/, "/") + url);
  attempts.push(url);

  for (const target of attempts) {
    try {
      const response = await fetch(target, { redirect: "follow" });
      if (!response.ok) continue;
      const body = await response.text();
      const text = /<[a-z][\s\S]*>/i.test(body.slice(0, 2000)) ? stripHtml(body) : body.trim().slice(0, 30000);
      if (text) return text;
    } catch {
      // try next strategy
    }
  }

  return "[Could not read " + url + ". Add a Firecrawl key or start the browser companion in Settings.]";
}

async function augmentWithUrls(message: string): Promise<{ message: string; context: string }> {
  const urls = message.match(/(https?:\/\/[^\s]+)/g);
  if (!urls || urls.length === 0) return { message, context: "" };

  let context = "";
  for (const url of urls.slice(0, 3)) {
    context += "\n\n--- INLINE READ OF " + url + " ---\n";
    context += await readUrl(url);
    context += "\n--- END INLINE READ ---\n";
  }
  return {
    message:
      message +
      "\n\n[System note: the following external page contents were fetched at runtime to assist your response:]" +
      context,
    context
  };
}

function errorResponse(err: unknown): Response {
  const error = err as Error;
  const status = error instanceof MissingKeyError ? 428 : 500;
  return json({ error: error.message || "Request failed." }, status);
}

async function handleChat(body: Record<string, unknown>): Promise<Response> {
  const message = String(body.message || "");
  const history = (body.history as LlmMessage[]) || [];
  const systemInstruction = body.systemInstruction as string | undefined;
  const agentName = String(body.agentName || "Assistant");
  const agentEmoji = String(body.agentEmoji || "\u{1F4AC}");

  startRun(message.slice(0, 110) || "Direct conversation");
  addNode({ id: "solo", label: agentName, emoji: agentEmoji, state: "thinking", detail: "Reading the request" });

  try {
    const augmented = await augmentWithUrls(message);
    if (augmented.context) {
      updateNode("solo", { detail: "Reading linked pages" });
    }

    updateNode("solo", { state: "streaming", detail: "Composing the response" });

    const result = await generate({
      message: augmented.message,
      history,
      systemInstruction:
        systemInstruction || "You are a helpful AI assistant running fully in the user's browser.",
      temperature: 0.7,
      maxOutputTokens: 2048
    });

    updateNode("solo", {
      state: "done",
      detail: "Answered via " + result.provider,
      provider: result.provider,
      model: result.model
    });
    endRun();

    return json({ text: result.text, provider: result.provider, model: result.model });
  } catch (err) {
    updateNode("solo", { state: "error", detail: (err as Error).message.slice(0, 120) });
    endRun();
    return errorResponse(err);
  }
}

async function handleChain(body: Record<string, unknown>): Promise<Response> {
  const message = String(body.message || "");
  startRun(message.slice(0, 110) || "Swarm workflow");
  addNode({ id: "planner", label: "Swarm Architect", emoji: "\u{1F9E9}", state: "thinking", detail: "Selecting specialists" });

  try {
    const index = await loadIndex();
    const roster = index.agents.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      desc: (a.description || "").slice(0, 90)
    }));

    const augmented = await augmentWithUrls(message);
    if (augmented.context) updateNode("planner", { detail: "Read linked sources" });

    const coordinatorInstruction =
      'You are the Lead Swarm Architect of "The Agency". Analyze the task and compile a pipeline of up to 3 specialists to solve it sequentially.\n\n' +
      "Respond with a JSON object exactly matching this structure:\n" +
      '{ "plan": "high-level overview of the chain", "chain": [ { "agentId": "agent-id-slug", "task": "concise instruction for this agent" } ] }\n\n' +
      "Roster of available agent IDs:\n" +
      JSON.stringify(roster);

    const planResult = await generate({
      message:
        "User Query:\n" + message +
        "\n\nFetched context (if any):\n" + augmented.context +
        "\n\nTask: orchestrate the specialist swarm and return a JSON workflow plan.",
      systemInstruction: coordinatorInstruction,
      temperature: 0.2,
      maxOutputTokens: 1200,
      json: true
    });

    let plan: { plan?: string; chain?: Array<{ agentId: string; task: string }> };
    try {
      plan = JSON.parse(planResult.text.trim());
    } catch {
      const match = planResult.text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("The planner did not return a readable workflow.");
      plan = JSON.parse(match[0]);
    }

    const chain = Array.isArray(plan.chain) ? plan.chain.slice(0, 3) : [];
    if (chain.length === 0) throw new Error("The planner returned an empty workflow.");

    updateNode("planner", {
      state: "done",
      detail: chain.length + " specialists selected",
      provider: planResult.provider,
      model: planResult.model
    });

    // Seed the map so the whole planned pipeline is visible up front.
    const resolved = chain
      .map((step) => ({ step, agent: index.agents.find((a) => a.id === step.agentId) }))
      .filter((entry) => Boolean(entry.agent));

    resolved.forEach((entry, i) => {
      const agent = entry.agent as AgentMeta;
      addNode({
        id: agent.id,
        label: agent.name,
        emoji: agent.emoji || "\u{1F916}",
        state: "idle",
        detail: entry.step.task.slice(0, 90)
      });
      if (i > 0) {
        linkNodes((resolved[i - 1].agent as AgentMeta).id, agent.id);
      }
    });

    const steps: ChainStep[] = [];
    let previousOutput = "";

    for (let i = 0; i < resolved.length; i++) {
      const { step, agent } = resolved[i] as { step: { agentId: string; task: string }; agent: AgentMeta };

      updateNode(agent.id, { state: "thinking", detail: "Loading specialist brief" });

      const systemInstruction =
        (await loadContent(agent)) || "You are " + agent.name + ". Vibe: " + (agent.vibe || "Professional");

      let prompt = "### TASK STATEMENT\n" + step.task + "\n\n";
      prompt += "### CLIENT ORIGINAL DIRECTIVE\n" + message + "\n\n";
      if (augmented.context) prompt += "### FETCHED SOURCE CONTEXT\n" + augmented.context + "\n\n";
      if (previousOutput) {
        prompt +=
          "### WORK-IN-PROGRESS DELIVERABLE FROM PREVIOUS AGENT (" +
          (steps[i - 1] ? steps[i - 1].name : "prior step") + ")\n" + previousOutput +
          "\n\nInstruction: build directly on top of, audit, or refine the above deliverable into your specialized format. Do not start from scratch. Make the output complete and production-ready.";
      } else {
        prompt += "Instruction: you are the starting agent. Initialize the core architecture, draft, or scaffold.";
      }

      updateNode(agent.id, { state: "streaming", detail: step.task.slice(0, 90) });

      try {
        const stepResult = await generate({
          message: prompt,
          systemInstruction,
          temperature: 0.5,
          maxOutputTokens: 2048
        });

        previousOutput = stepResult.text;
        updateNode(agent.id, {
          state: "done",
          detail: "Delivered " + stepResult.text.length.toLocaleString() + " chars",
          provider: stepResult.provider,
          model: stepResult.model
        });

        steps.push({
          agentId: agent.id,
          name: agent.name,
          emoji: agent.emoji || "\u{1F916}",
          task: step.task,
          output: stepResult.text,
          provider: stepResult.provider,
          model: stepResult.model
        });
      } catch (err) {
        updateNode(agent.id, { state: "error", detail: (err as Error).message.slice(0, 110) });
        throw err;
      }
    }

    endRun();
    return json({ plan: plan.plan || "Multi-agent workflow executed.", steps, finalOutput: previousOutput });
  } catch (err) {
    updateNode("planner", { state: "error", detail: (err as Error).message.slice(0, 120) });
    endRun();
    return errorResponse(err);
  }
}

async function route(pathname: string, init: RequestInit | undefined): Promise<Response | null> {
  const path = pathname.replace(BASE.replace(/\/$/, ""), "");

  if (path === "/api/divisions") {
    const index = await loadIndex();
    return json(index.divisions);
  }

  if (path === "/api/agents") {
    const index = await loadIndex();
    return json(index.agents);
  }

  const detail = path.match(/^\/api\/agents\/([^/]+)\/([^/]+)$/);
  if (detail) {
    const index = await loadIndex();
    const agent = index.agents.find((a) => a.category === detail[1] && a.id === detail[2]);
    if (!agent) return json({ error: "Agent not found." }, 404);
    const content = await loadContent(agent);
    return json({ ...agent, content });
  }

  let body: Record<string, unknown> = {};
  if (init && typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = {};
    }
  }

  if (path === "/api/scrape") {
    const url = String(body.url || "");
    if (!url) return json({ error: "No URL provided." }, 400);
    return json({ text: await readUrl(url) });
  }

  if (path === "/api/chat") return handleChat(body);
  if (path === "/api/chain") return handleChain(body);

  return null;
}

export function installApiShim(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let pathname = "";
    try {
      if (typeof input === "string") pathname = new URL(input, window.location.href).pathname;
      else if (input instanceof URL) pathname = input.pathname;
      else if (input instanceof Request) pathname = new URL(input.url).pathname;
    } catch {
      pathname = "";
    }

    if (pathname.includes("/api/")) {
      let requestInit = init;
      if (!requestInit && input instanceof Request) {
        const cloned = input.clone();
        const text = await cloned.text().catch(() => "");
        requestInit = { method: input.method, body: text };
      }
      try {
        const handled = await route(pathname, requestInit);
        if (handled) return handled;
      } catch (err) {
        return errorResponse(err);
      }
    }

    return originalFetch(input as RequestInfo, init);
  };
}
