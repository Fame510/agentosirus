export interface Agent {
  id: string; // slug of the file (e.g. engineering-frontend-developer)
  name: string;
  description: string;
  color: string;
  emoji: string;
  vibe: string;
  category: string;
  filePath: string;
  content?: string;
  contentFile?: string; // static markdown file emitted at build time
}

export interface Division {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface TeamScenario {
  id: string;
  name: string;
  description: string;
  recommendedAgents: string[]; // agent slugs/ids
}
