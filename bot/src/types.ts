export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  GITHUB_TOKEN: string;
  WEBHOOK_SECRET: string;
  ALLOWED_USER_IDS: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  DATA_PATH: string;
  CATEGORIES_PATH: string;
  HF_PATH: string; // v3.7 허깅페이스 저장 파일 (docs/hf.json)
  HF_TOKEN?: string; // 선택 — 없어도 공개 API로 동작
  AI: Ai;
  ALARM_KV: KVNamespace;
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
  last_release?: string | null; // 주간 다이제스트가 마지막으로 본 릴리즈 태그
  desc_ko?: string | null; // AI가 만든 비전공자용 한글 설명 (한 번 만들면 캐시)
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

// ===== v3.7 허깅페이스 =====

export type HfKind = 'model' | 'dataset' | 'space';

export interface HfMeta {
  kind: HfKind;
  repoId: string; // owner/name (원래 대소문자)
  owner: string;
  name: string;
  description: string;
  likes: number;
  downloads: number | null; // 스페이스는 없음
  pipeline_tag: string | null;
  library: string | null;
  sdk: string | null;
  tags: string[];
  license: string | null;
  gated: boolean;
  last_modified: string | null;
}

export interface HfEntry {
  id: string; // hf:owner/name · hf:datasets/owner/name · hf:spaces/owner/name (소문자)
  kind: HfKind;
  repo_id: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  likes: number;
  downloads: number | null;
  pipeline_tag: string | null;
  library: string | null;
  sdk: string | null;
  tags: string[]; // 사용자 태그 (저장소와 동일)
  hf_tags: string[]; // 허깅페이스 원본 태그
  license: string | null;
  gated: boolean;
  category: string;
  confidence: number;
  classified_by: 'rule' | 'user' | 'fallback' | string;
  saved_at: string;
  stats_updated_at: string;
  last_modified: string | null;
  added_by: string;
  notes: string | null;
  desc_ko?: string | null;
  status?: string; // 설치/대기/탈락 (저장소와 동일)
}

export interface HfFile {
  version: number;
  updated_at: string;
  items: HfEntry[];
}
