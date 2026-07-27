import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

interface ParsedAgent {
  id: string;
  name: string;
  description: string;
  color: string;
  emoji: string;
  vibe: string;
  category: string;
  filePath: string;
  content: string;
}

// Map of categories to descriptive names
const divisions = [
  { id: "engineering", name: "Engineering Division", emoji: "💻", color: "sky", description: "Building the future, one commit at a time." },
  { id: "design", name: "Design Division", emoji: "🎨", color: "pink", description: "Making it beautiful, usable, and delightful." },
  { id: "paid-media", name: "Paid Media Division", emoji: "💰", color: "emerald", description: "Turning ad spend into measurable business outcomes." },
  { id: "sales", name: "Sales Division", emoji: "💼", color: "indigo", description: "Turning pipeline into revenue through craft." },
  { id: "marketing", name: "Marketing Division", emoji: "📢", color: "orange", description: "Growing your audience, one authentic interaction at a time." },
  { id: "product", name: "Product Division", emoji: "📊", color: "purple", description: "Building the right thing at the right time." },
  { id: "project-management", name: "Project Management", emoji: "🎬", color: "cyan", description: "Keeping the trains running on time (and under budget)." },
  { id: "testing", name: "Testing Division", emoji: "🧪", color: "red", description: "Breaking things so users don't have to." },
  { id: "support", name: "Support Division", emoji: "🛟", color: "teal", description: "The backbone of the operation." },
  { id: "spatial-computing", name: "Spatial Computing", emoji: "🥽", color: "violet", description: "Building the immersive future." },
  { id: "specialized", name: "Specialized Division", emoji: "🎯", color: "yellow", description: "The unique specialists who don't fit in a box." },
  { id: "game-development", name: "Game Development", emoji: "🎮", color: "rose", description: "Building worlds, systems, and experiences." }
];

// Recursively find all markdown files in a directory
function getMarkdownFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getMarkdownFiles(fullPath));
    } else if (file.endsWith(".md") && !file.toLowerCase().endsWith("readme.md")) {
      results.push(fullPath);
    }
  });
  return results;
}

// Simple custom frontmatter and content parser
function parseAgentFile(filePath: string, category: string): ParsedAgent | null {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const id = path.basename(filePath, ".md");
    
    let frontmatter: Record<string, string> = {};
    let content = rawContent;
    
    if (rawContent.startsWith("---")) {
      const parts = rawContent.split("---");
      if (parts.length >= 3) {
        const lines = parts[1].split("\n");
        lines.forEach((line) => {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0) {
            const key = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            frontmatter[key] = val;
          }
        });
        content = parts.slice(2).join("---").trim();
      }
    }
    
    // Normalize properties
    const relativePath = path.relative(process.cwd(), filePath);
    return {
      id,
      name: frontmatter.name || id.replace(/^(engineering|design|paid-media|sales|marketing|product|project-management|testing|support|spatial-computing|specialized|game-development)-/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: frontmatter.description || "Specialized AI Agent within The Agency.",
      color: frontmatter.color || "indigo",
      emoji: frontmatter.emoji || "🤖",
      vibe: frontmatter.vibe || "",
      category,
      filePath: "/" + relativePath.replace(/\\/g, "/"),
      content
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

// Lazy-initialized Gemini client to prevent crashing on missing keys at boot
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Helper for SiliconFlow OpenAI-compatible API (Primary Provider)
async function callSiliconFlow(params: any): Promise<{ text: string }> {
  const rawKey = process.env.SILICONFLOW_API_KEY;
  const apiKey = rawKey ? rawKey.trim().replace(/^["']|["']$/g, '') : '';
  if (!apiKey) {
    throw new Error("SILICONFLOW_API_KEY is missing or empty.");
  }

  const preferredModel = process.env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-72B-Instruct";
  const candidateModels = Array.from(new Set([
    preferredModel,
    "deepseek-ai/DeepSeek-V3",
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "deepseek-ai/DeepSeek-R1",
    "THUDM/glm-4-9b-chat"
  ]));

  const messages: any[] = [];
  
  const sysInst = params.config?.systemInstruction;
  if (sysInst) {
    const sysText = typeof sysInst === "string" ? sysInst : (sysInst.parts?.[0]?.text || sysInst.text || "");
    if (sysText) {
      messages.push({ role: "system", content: sysText });
    }
  }

  if (params.contents && Array.isArray(params.contents)) {
    for (const item of params.contents) {
      const role = (item.role === "model" || item.role === "assistant") ? "assistant" : "user";
      let text = "";
      if (typeof item === "string") {
        text = item;
      } else if (item.parts && Array.isArray(item.parts)) {
        text = item.parts.map((p: any) => (typeof p === "string" ? p : p.text || "")).join("\n");
      } else if (item.text) {
        text = item.text;
      }
      messages.push({ role, content: text });
    }
  }

  const endpoint = "https://api.siliconflow.cn/v1/chat/completions";
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    console.log(`[1/3 SiliconFlow Primary] Calling model '${model}'...`);
    const requestBody: any = {
      model,
      messages,
      temperature: params.config?.temperature ?? 0.7,
      max_tokens: params.config?.maxOutputTokens || 2048,
    };

    if (params.config?.responseMimeType === "application/json") {
      requestBody.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(6000) // Fast 6s latency failover
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[SiliconFlow API Error] (${response.status}): ${errText}`);
        if (response.status === 401) {
          throw new Error(`SiliconFlow API Key is invalid or unauthorized (HTTP 401). Check SILICONFLOW_API_KEY.`);
        }
        lastError = new Error(`SiliconFlow API Error (${response.status}): ${errText}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      console.log(`[SiliconFlow Success] Response received from '${model}'`);
      return { text: content };
    } catch (err: any) {
      if (err.message?.includes("401")) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error("SiliconFlow request failed.");
}

// Helper for OpenRouter OpenAI-compatible API (Secondary Provider - Free Chinese Models Only)
async function callOpenRouter(params: any): Promise<{ text: string }> {
  const rawKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY;
  const apiKey = rawKey ? rawKey.trim().replace(/^["']|["']$/g, '') : '';
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing or empty.");
  }

  const preferredModel = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat:free";
  // Strict list of free Chinese intelligent models on OpenRouter
  const candidateModels = Array.from(new Set([
    preferredModel,
    "deepseek/deepseek-chat:free",
    "deepseek/deepseek-r1:free",
    "qwen/qwen-2.5-coder-32b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "THUDM/glm-4-9b-chat:free"
  ]));

  const messages: any[] = [];
  
  const sysInst = params.config?.systemInstruction;
  if (sysInst) {
    const sysText = typeof sysInst === "string" ? sysInst : (sysInst.parts?.[0]?.text || sysInst.text || "");
    if (sysText) {
      messages.push({ role: "system", content: sysText });
    }
  }

  if (params.contents && Array.isArray(params.contents)) {
    for (const item of params.contents) {
      const role = (item.role === "model" || item.role === "assistant") ? "assistant" : "user";
      let text = "";
      if (typeof item === "string") {
        text = item;
      } else if (item.parts && Array.isArray(item.parts)) {
        text = item.parts.map((p: any) => (typeof p === "string" ? p : p.text || "")).join("\n");
      } else if (item.text) {
        text = item.text;
      }
      messages.push({ role, content: text });
    }
  }

  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    console.log(`[2/3 OpenRouter Secondary] Calling free model '${model}'...`);
    const requestBody: any = {
      model,
      messages,
      temperature: params.config?.temperature ?? 0.7,
      max_tokens: params.config?.maxOutputTokens || 2048, // Constrain tokens for speed & no 402 errors
    };

    if (params.config?.responseMimeType === "application/json") {
      requestBody.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ai.studio",
          "X-Title": "AI Studio Build",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(6000) // Fast 6s latency failover
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[OpenRouter API Error] (${response.status}): ${errText}`);
        lastError = new Error(`OpenRouter API Error (${response.status}): ${errText}`);
        if (response.status === 401) {
          throw new Error(`OpenRouter API Key is invalid or unauthorized (HTTP 401). Check OPENROUTER_API_KEY.`);
        }
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      console.log(`[OpenRouter Success] Response received from '${model}'`);
      return { text: content };
    } catch (err: any) {
      if (err.message?.includes("401")) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error("OpenRouter request failed.");
}

// Helper to execute generateContent calls with 3-tier provider hierarchy:
// Tier 1: SiliconFlow (Primary) -> Tier 2: OpenRouter (Secondary) -> Tier 3: Gemini (Tertiary)
async function generateContentWithRetry(client: GoogleGenAI | null, params: any, maxRetries = 2): Promise<any> {
  // 1. PRIMARY: SiliconFlow
  const sfKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (sfKey) {
    try {
      return await callSiliconFlow(params);
    } catch (sfErr: any) {
      console.warn(`[SiliconFlow Primary Failed] ${sfErr?.message || sfErr}. Falling back to OpenRouter...`);
    }
  }

  // 2. SECONDARY: OpenRouter
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY)?.trim();
  if (openRouterKey) {
    try {
      return await callOpenRouter(params);
    } catch (orErr: any) {
      console.warn(`[OpenRouter Secondary Failed] ${orErr?.message || orErr}. Falling back to Gemini...`);
    }
  }

  // 3. TERTIARY: Gemini
  const geminiClient = client || getGeminiClient();
  if (geminiClient) {
    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.5-pro",
      "gemini-flash-latest"
    ];

    let startIdx = candidateModels.indexOf(params.model);
    if (startIdx === -1) {
      startIdx = 0;
    }

    for (let m = startIdx; m < candidateModels.length; m++) {
      const currentModel = candidateModels[m];
      const currentParams = { ...params, model: currentModel };
      
      let attempt = 0;
      let delay = 500;
      
      while (attempt < maxRetries) {
        try {
          console.log(`[3/3 Gemini Tertiary Fallback] Requesting model '${currentModel}' (Attempt ${attempt + 1}/${maxRetries})...`);
          return await geminiClient.models.generateContent(currentParams);
        } catch (error: any) {
          attempt++;
          const errorMessage = error?.message || "";
          const isTransient = errorMessage.includes("503") || 
                              errorMessage.toLowerCase().includes("unavailable") || 
                              errorMessage.toLowerCase().includes("overloaded") ||
                              errorMessage.toLowerCase().includes("high demand") ||
                              error?.status === "UNAVAILABLE" ||
                              error?.status === 503;

          const isQuotaExceeded = errorMessage.includes("429") ||
                                  errorMessage.toLowerCase().includes("quota") ||
                                  errorMessage.toLowerCase().includes("rate limit") ||
                                  error?.status === "RESOURCE_EXHAUSTED" ||
                                  error?.status === 429;
                            
          if (isTransient && attempt < maxRetries) {
            console.warn(`[Gemini Fallback Transient Error] '${currentModel}' (Attempt ${attempt}/${maxRetries}): ${errorMessage}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
          
          if (m < candidateModels.length - 1) {
            console.warn(`[Gemini Model Fallback] '${currentModel}' failed (${isQuotaExceeded ? 'Quota Exceeded' : 'Error'}): ${errorMessage}. Falling back to next candidate model: '${candidateModels[m + 1]}'...`);
            break; // Move to next candidate Gemini model
          }
          
          console.error(`[Gemini Fallback Failed] Last error on '${currentModel}':`, errorMessage);
          break;
        }
      }
    }
  }

  throw new Error("All AI generation providers failed (1. SiliconFlow, 2. OpenRouter, 3. Gemini). Please verify API keys in environment variables.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Divisions Endpoint
  app.get("/api/divisions", (_req, res) => {
    res.json(divisions);
  });

  // 2. Scan and return all agents
  app.get("/api/agents", (_req, res) => {
    const agents: ParsedAgent[] = [];
    divisions.forEach((div) => {
      const divPath = path.join(process.cwd(), div.id);
      if (fs.existsSync(divPath)) {
        const files = getMarkdownFiles(divPath);
        files.forEach((filePath) => {
          const parsed = parseAgentFile(filePath, div.id);
          if (parsed) {
            agents.push(parsed);
          }
        });
      }
    });
    res.json(agents);
  });

  // 3. API route for single agent detail
  app.get("/api/agents/:category/:id", (req, res) => {
    const { category, id } = req.params;
    // Walk division paths or find specific file
    const potentialPaths = [
      path.join(process.cwd(), category, `${id}.md`),
      path.join(process.cwd(), category, id, `${id}.md`), // for nested folders in game-development
    ];
    
    // Check game-development subfolders if category is game-development
    if (category === "game-development") {
      const subdirs = ["blender", "godot", "roblox-studio", "unity", "unreal-engine"];
      subdirs.forEach(sub => {
        potentialPaths.push(path.join(process.cwd(), category, sub, `${id}.md`));
      });
    }

    let foundPath = "";
    for (const p of potentialPaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      return res.status(404).json({ error: "Agent file not found." });
    }

    const parsed = parseAgentFile(foundPath, category);
    if (!parsed) {
      return res.status(500).json({ error: "Error parsing agent file." });
    }

    return res.json(parsed);
  });

  // Helper to extract and sanitize readable text from HTML for AI context consumption
  function extractCleanText(html: string): string {
    // Remove script, style, head, header, footer, nav to minimize noise and tokens
    let text = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "");
    text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");
    text = text.replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, "");
    text = text.replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, "");
    text = text.replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, "");
    text = text.replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, "");
    
    // Convert major layout structures into distinct newlines
    text = text.replace(/<\/p>|<\/div>|<\/h1>|<\/h2>|<\/h3>|<\/h4>|<\/li>|<\/tr>/gi, "\n");
    
    // Strip remaining HTML tag syntax
    text = text.replace(/<[^>]+>/g, "");
    
    // Clean up excessive whitespace
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n\s*\n+/g, "\n\n");
    
    return text.trim().slice(0, 30000); // 30k character safety buffer
  }

  // Live web fetch crawler helper
  async function scrapeUrlInternal(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000) // 8-second request timeout
      });
      const html = await response.text();
      return extractCleanText(html);
    } catch (error: any) {
      console.error(`Error crawling ${url}:`, error);
      return `[Failed to retrieve or crawl content from URL ${url}: ${error.message || error}]`;
    }
  }

  // 4. Manual Web Crawler Scraper Endpoint
  app.post("/api/scrape", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "No URL provided." });
      }
      const text = await scrapeUrlInternal(url);
      return res.json({ text });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "An error occurred during crawling." });
    }
  });

  // 5. Gemini Chat Proxy with Automatic Scraping & Search Grounding
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, systemInstruction, enableSearch } = req.body;
      
      const client = getGeminiClient();
      
      // Auto-detect URLs in user message and scrape them inline
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = message.match(urlRegex);
      let augmentedMessage = message;
      
      if (urls && urls.length > 0) {
        let scrapedPayload = "";
        for (const url of urls) {
          scrapedPayload += `\n\n--- INLINE SCRAPE OF ${url} ---\n`;
          const text = await scrapeUrlInternal(url);
          scrapedPayload += text;
          scrapedPayload += `\n--- END INLINE SCRAPE ---\n`;
        }
        augmentedMessage = `${message}\n\n[System note: The following external webpage contents were fetched automatically at runtime to assist your response:]${scrapedPayload}`;
      }

      // Structure contents array safely
      const contents = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: augmentedMessage }]
      });

      // Configure tools - enable Google Search Grounding if requested
      const config: any = {
        systemInstruction: systemInstruction || "You are a helpful AI assistant with live browsing and search grounding capabilities.",
        temperature: 0.7,
      };

      if (enableSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await generateContentWithRetry(client, {
        model: "gemini-3.5-flash", // Use the robust flash model that supports search tools
        contents,
        config
      });

      return res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Proxy Error:", error);
      return res.status(500).json({ error: error.message || "An error occurred while generating content." });
    }
  });

  // 6. Multi-Agent Swarm Orchestration / Auto-Chaining Endpoint
  app.post("/api/chain", async (req, res) => {
    try {
      const { message } = req.body;
      const client = getGeminiClient();

      // Gather list of all indexed agents to let the master coordinator pick
      const allAgents: any[] = [];
      divisions.forEach((div) => {
        const divPath = path.join(process.cwd(), div.id);
        if (fs.existsSync(divPath)) {
          const files = getMarkdownFiles(divPath);
          files.forEach((filePath) => {
            const parsed = parseAgentFile(filePath, div.id);
            if (parsed) {
              allAgents.push({
                id: parsed.id,
                name: parsed.name,
                category: parsed.category,
                description: parsed.description,
                emoji: parsed.emoji,
                vibe: parsed.vibe
              });
            }
          });
        }
      });

      // Step A: Auto-crawl any URL in the user query before compiling the plan
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = message.match(urlRegex);
      let scrapedWebContext = "";
      if (urls && urls.length > 0) {
        for (const url of urls) {
          scrapedWebContext += `\n--- WEB SCRAPE DATA FOR ${url} ---\n`;
          const text = await scrapeUrlInternal(url);
          scrapedWebContext += text;
          scrapedWebContext += `\n--- END WEB SCRAPE DATA ---\n`;
        }
      }

      // Step B: Query Master Coordinator to decide the workflow chain
      const coordinatorInstruction = `You are the Lead Swarm Architect of "The Agency". Your primary objective is to analyze the user's task and compile a highly structured pipeline of up to 3 specialized agents to solve the task sequentially.

We have a roster of 144 specialists. Choose 1, 2, or 3 agents in logical order to execute the request.
For instance:
- For frontend apps or components: Design UI Designer -> Senior Frontend Developer -> Testing Reality Checker.
- For product/business: Product Manager -> UX Architect -> Marketing Content Creator.
- For audits: Database Optimizer -> Security Engineer -> Code Reviewer.

You must respond with a JSON object conforming exactly to this structure:
{
  "plan": "Explain the multi-step agent chain in a friendly, high-level overview.",
  "chain": [
    {
      "agentId": "agent-id-slug",
      "task": "A concise instruction for this agent telling them what previous output to build on and what specific deliverable to construct."
    }
  ]
}

Roster of available Agent IDs & Descriptions:
${JSON.stringify(allAgents.map(a => ({ id: a.id, name: a.name, category: a.category, desc: (a.description || "").slice(0, 90) })), null, 2)}`;

      const masterResponse = await generateContentWithRetry(client, {
        model: "gemini-3.5-flash",
        contents: [
          { role: "user", parts: [{ text: `User Query:\n${message}\n\nScraped context (if any):\n${scrapedWebContext}\n\nTask: Orchestrate the specialist swarm and return a JSON workflow plan.` }] }
        ],
        config: {
          systemInstruction: coordinatorInstruction,
          responseMimeType: "application/json",
          temperature: 0.2 // lower temp for strict routing logic
        }
      });

      let masterPlan: any;
      try {
        const cleanText = masterResponse.text?.trim() || "{}";
        masterPlan = JSON.parse(cleanText);
      } catch (err) {
        console.warn("Failed to parse master planner JSON, applying smart regex extract:", err);
        const match = masterResponse.text?.match(/\{[\s\S]*\}/);
        if (match) {
          masterPlan = JSON.parse(match[0]);
        } else {
          throw new Error("Master Planner failed to return a readable JSON configuration.");
        }
      }

      const steps: any[] = [];
      let previousOutput = "";

      // Step C: Execute each agent in the decided sequence
      for (let i = 0; i < masterPlan.chain.length; i++) {
        const stepDef = masterPlan.chain[i];
        const agentMeta = allAgents.find(a => a.id === stepDef.agentId);
        if (!agentMeta) continue;

        // Fetch full instructions for this agent
        const category = agentMeta.category;
        const potentialPaths = [
          path.join(process.cwd(), category, `${agentMeta.id}.md`),
          path.join(process.cwd(), category, agentMeta.id, `${agentMeta.id}.md`),
        ];
        if (category === "game-development") {
          const subdirs = ["blender", "godot", "roblox-studio", "unity", "unreal-engine"];
          subdirs.forEach(sub => potentialPaths.push(path.join(process.cwd(), category, sub, `${agentMeta.id}.md`)));
        }

        let fullAgentPath = "";
        for (const p of potentialPaths) {
          if (fs.existsSync(p)) {
            fullAgentPath = p;
            break;
          }
        }

        const agentParsed = parseAgentFile(fullAgentPath || potentialPaths[0], category);
        const agentSystemInstruction = agentParsed?.content || `You are ${agentMeta.name}. Vibe: ${agentMeta.vibe || "Professional"}`;

        // Build the compilation prompt for this step
        let stepPrompt = `### TASK STATEMENT\n${stepDef.task}\n\n`;
        stepPrompt += `### CLIENT ORIGINAL DIRECTIVE\n${message}\n\n`;
        if (scrapedWebContext) {
          stepPrompt += `### SCRAPED SOURCE WEB CONTEXT\n${scrapedWebContext}\n\n`;
        }
        if (previousOutput) {
          stepPrompt += `### WORK-IN-PROGRESS DELIVERABLE FROM PREVIOUS AGENT (${steps[i-1]?.name || "Prior step"})\n${previousOutput}\n\n`;
          stepPrompt += `Instruction: Build directly on top of, audit, refine, or translate the above work-in-progress deliverable into your designated specialized format. Do not start from scratch unless requested. Ensure your output is complete, production-ready, and polished.`;
        } else {
          stepPrompt += `Instruction: You are the starting agent. Initialize the core architecture, draft, design, or scaffold based on the instructions.`;
        }

        const agentResponse = await generateContentWithRetry(client, {
          model: "gemini-3.5-flash",
          contents: [{ role: "user", parts: [{ text: stepPrompt }] }],
          config: {
            systemInstruction: agentSystemInstruction,
            temperature: 0.5
          }
        });

        const outputText = agentResponse.text || "";
        previousOutput = outputText;

        steps.push({
          agentId: agentMeta.id,
          name: agentMeta.name,
          emoji: agentMeta.emoji || "🤖",
          task: stepDef.task,
          output: outputText
        });
      }

      return res.json({
        plan: masterPlan.plan,
        steps,
        finalOutput: previousOutput
      });

    } catch (error: any) {
      console.error("Multi-Agent Swarm Chain Error:", error);
      return res.status(500).json({ error: error.message || "An error occurred during swarm orchestration." });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
