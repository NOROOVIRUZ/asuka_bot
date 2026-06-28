export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  GITHUB_TOKEN: string;
  WEBHOOK_SECRET: string;
  ALLOWED_USER_IDS: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  DATA_PATH: string;
  CATEGORIES_PATH: string;
  PROMPTS_PATH: string;
  AI: Ai;
}

export interface RepoEntry {
  id: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  language: string | null;
  stars: number;
  topics: string[];
  license: string | null;
  archived: boolean;
  category: string;
  tags: string[];
  confidence: number;
  classified_by: 'rule' | 'user' | 'fallback';
  saved_at: string;
  stars_updated_at: string;
  added_by: string;
  notes: string | null;
}

export interface DataFile {
  version: number;
  updated_at: string;
  source?: string;
  repos: RepoEntry[];
}

export interface CategoryDef {
  label?: string;
  description?: string;
  keywords: { strong: string[]; medium: string[]; weak: string[] };
  name_patterns?: string[];
  languages?: string[];
  exclude_keywords?: string[];
}

export interface CategoriesFile {
  version: number;
  categories: Record<string, CategoryDef>;
}

export interface RepoMeta {
  owner: string;
  name: string;
  description: string;
  language: string | null;
  stars: number;
  topics: string[];
  license: string | null;
  archived: boolean;
}

export interface ClassifyResult {
  category: string;
  confidence: number;
  top3: { category: string; score: number }[];
}

export interface PromptEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  saved_at: string;
  added_by: string;
  notes: string | null;
}

export interface PromptsFile {
  version: number;
  updated_at: string;
  prompts: PromptEntry[];
}
