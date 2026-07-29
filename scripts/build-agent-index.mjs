#!/usr/bin/env node
/**
 * Static build step for GitHub Pages.
 *
 * The original app relied on server.ts to scan the repository for agent
 * markdown files at request time. GitHub Pages is static hosting, so we do
 * that scan once at build time and emit plain JSON + markdown into public/.
 *
 *   public/agents-index.json   -> metadata for every agent (no bodies)
 *   public/agents-content/*.md -> the system prompt body for each agent
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public");
const CONTENT_DIR = path.join(OUT_DIR, "agents-content");

const divisions = [
  { id: "engineering", name: "Engineering Division", emoji: "\u{1F4BB}", color: "sky", description: "Building the future, one commit at a time." },
  { id: "design", name: "Design Division", emoji: "\u{1F3A8}", color: "pink", description: "Making it beautiful, usable, and delightful." },
  { id: "paid-media", name: "Paid Media Division", emoji: "\u{1F4B0}", color: "emerald", description: "Turning ad spend into measurable business outcomes." },
  { id: "sales", name: "Sales Division", emoji: "\u{1F4BC}", color: "indigo", description: "Turning pipeline into revenue through craft." },
  { id: "marketing", name: "Marketing Division", emoji: "\u{1F4E2}", color: "orange", description: "Growing your audience, one authentic interaction at a time." },
  { id: "product", name: "Product Division", emoji: "\u{1F680}", color: "purple", description: "Building the right thing at the right time." },
  { id: "project-management", name: "Project Management", emoji: "\u{1F3AC}", color: "cyan", description: "Keeping the trains running on time (and under budget)." },
  { id: "testing", name: "Testing Division", emoji: "\u{1F9EA}", color: "red", description: "Breaking things so users don't have to." },
  { id: "support", name: "Support Division", emoji: "\u{1F6E0}", color: "teal", description: "The backbone of the operation." },
  { id: "spatial-computing", name: "Spatial Computing", emoji: "\u{1F97D}", color: "violet", description: "Building the immersive future." },
  { id: "specialized", name: "Specialized Division", emoji: "\u{1F3AF}", color: "yellow", description: "The unique specialists who don't fit in a box." },
  { id: "game-development", name: "Game Development", emoji: "\u{1F3AE}", color: "rose", description: "Building worlds, systems, and experiences." }
];

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out = out.concat(walk(full));
    else if (entry.endsWith(".md") && !entry.toLowerCase().endsWith("readme.md")) out.push(full);
  }
  return out;
}

function titleCase(id, category) {
  const stripped = id.replace(new RegExp("^" + category + "-"), "");
  return stripped.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAgentFile(filePath, category) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const id = path.basename(filePath, ".md");
  const frontmatter = {};
  let content = raw;

  if (raw.startsWith("---")) {
    const parts = raw.split("---");
    if (parts.length >= 3) {
      for (const line of parts[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      content = parts.slice(2).join("---").trim();
    }
  }

  return {
    id,
    name: frontmatter.name || titleCase(id, category),
    description: frontmatter.description || "Specialized AI Agent within The Agency.",
    color: frontmatter.color || "indigo",
    emoji: frontmatter.emoji || "\u{1F916}",
    vibe: frontmatter.vibe || "",
    category,
    filePath: "/" + path.relative(ROOT, filePath).split(path.sep).join("/"),
    content
  };
}

fs.mkdirSync(CONTENT_DIR, { recursive: true });
for (const stale of fs.readdirSync(CONTENT_DIR)) {
  if (stale.endsWith(".md")) fs.unlinkSync(path.join(CONTENT_DIR, stale));
}

const index = [];
const seen = new Set();

for (const div of divisions) {
  for (const filePath of walk(path.join(ROOT, div.id))) {
    const agent = parseAgentFile(filePath, div.id);
    let slug = agent.id;
    if (seen.has(slug)) slug = div.id + "--" + agent.id;
    seen.add(slug);

    fs.writeFileSync(path.join(CONTENT_DIR, slug + ".md"), agent.content, "utf-8");
    const { content, ...meta } = agent;
    index.push({ ...meta, contentFile: slug + ".md" });
  }
}

index.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

fs.writeFileSync(path.join(OUT_DIR, "agents-index.json"), JSON.stringify({ divisions, agents: index }, null, 0), "utf-8");
fs.writeFileSync(path.join(OUT_DIR, ".nojekyll"), "", "utf-8");

console.log("Indexed " + index.length + " agents across " + divisions.length + " divisions.");
