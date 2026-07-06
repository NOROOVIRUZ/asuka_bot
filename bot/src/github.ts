import type { Env, DataFile, CategoriesFile, RepoMeta, PromptsFile } from './types';

const GH_API = 'https://api.github.com';

let cachedCategories: CategoriesFile | null = null;

export async function getCategories(env: Env): Promise<CategoriesFile> {
  if (cachedCategories) return cachedCategories;
  // raw.githubusercontent.com은 무인증이라 Cloudflare 공유 IP에서 429 잘 맞음 → 토큰 인증 API 사용
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.CATEGORIES_PATH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.raw+json',
      'User-Agent': 'asuka-bot',
    },
  });
  if (!res.ok) throw new Error(`categories fetch failed: ${res.status}`);
  cachedCategories = (await res.json()) as CategoriesFile;
  return cachedCategories;
}

export function parseGithubUrl(url: string): { owner: string; name: string } | null {
  const m = url.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:[/?#]|\.git|$)/i);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

export async function fetchRepoMeta(url: string, token?: string): Promise<RepoMeta | null> {
  const parsed = parseGithubUrl(url);
  if (!parsed) return null;
  const headers: Record<string, string> = {
    'User-Agent': 'asuka-bot',
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GH_API}/repos/${parsed.owner}/${parsed.name}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`repo fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  return {
    owner: data.owner.login,
    name: data.name,
    description: data.description || '',
    language: data.language,
    stars: data.stargazers_count,
    topics: data.topics || [],
    license: data.license?.spdx_id || null,
    archived: data.archived,
  };
}

export async function getDataFile(env: Env): Promise<{ data: DataFile; sha: string }> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'asuka-bot',
    },
  });
  if (!res.ok) throw new Error(`data fetch failed: ${res.status}`);
  const r = (await res.json()) as { content: string; sha: string };
  const decoded = decodeBase64(r.content);
  return { data: JSON.parse(decoded) as DataFile, sha: r.sha };
}

export async function putDataFile(
  env: Env,
  data: DataFile,
  sha: string,
  message: string
): Promise<void> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`;
  const content = encodeBase64(JSON.stringify(data, null, 2) + '\n');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'asuka-bot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content,
      sha,
      branch: 'main',
      committer: { name: 'asuka-bot', email: 'bot@asuka.local' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`commit failed: ${res.status} ${errText}`);
  }
}

export async function getPromptsFile(env: Env): Promise<{ data: PromptsFile; sha: string }> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.PROMPTS_PATH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'asuka-bot',
    },
  });
  if (res.status === 404) {
    return {
      data: { version: 1, updated_at: new Date().toISOString(), prompts: [] },
      sha: '',
    };
  }
  if (!res.ok) throw new Error(`prompts fetch failed: ${res.status}`);
  const r = (await res.json()) as { content: string; sha: string };
  const decoded = decodeBase64(r.content);
  return { data: JSON.parse(decoded) as PromptsFile, sha: r.sha };
}

export async function putPromptsFile(
  env: Env,
  data: PromptsFile,
  sha: string,
  message: string
): Promise<void> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.PROMPTS_PATH}`;
  const content = encodeBase64(JSON.stringify(data, null, 2) + '\n');
  const body: Record<string, unknown> = {
    message,
    content,
    branch: 'main',
    committer: { name: 'asuka-bot', email: 'bot@asuka.local' },
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'asuka-bot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`prompts commit failed: ${res.status} ${errText}`);
  }
}

export interface RepoSnapshot {
  stars: number;
  releaseTag: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
}

// 저장된 repo 전체의 최신 릴리즈+스타를 GraphQL 요청 1번으로 조회
// (Workers 무료 플랜 subrequest 50개 제한 때문에 repo당 REST 호출은 불가)
export async function fetchReleasesBatch(
  env: Env,
  repos: { id: string; owner: string; name: string }[]
): Promise<Record<string, RepoSnapshot>> {
  const fields = repos
    .map(
      (r, i) =>
        `r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { stargazerCount latestRelease { tagName name url } }`
    )
    .join('\n');
  const res = await fetch(`${GH_API}/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'asuka-bot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: `query {\n${fields}\n}` }),
  });
  if (!res.ok) throw new Error(`graphql failed: ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, any> };
  const out: Record<string, RepoSnapshot> = {};
  repos.forEach((r, i) => {
    const node = body.data?.[`r${i}`];
    if (!node) return; // 삭제/이동된 repo는 null로 옴
    out[r.id] = {
      stars: node.stargazerCount ?? 0,
      releaseTag: node.latestRelease?.tagName ?? null,
      releaseName: node.latestRelease?.name ?? null,
      releaseUrl: node.latestRelease?.url ?? null,
    };
  });
  return out;
}

export interface SearchHit {
  id: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  stars: number;
}

// 최근 N일 내 생성된 repo 중 keyword 매칭 상위 검색 (레이더용)
export async function searchNewRepos(env: Env, keyword: string, days: number): Promise<SearchHit[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`${keyword} created:>${since} stars:>50`);
  const res = await fetch(`${GH_API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'asuka-bot',
    },
  });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const body = (await res.json()) as { items?: any[] };
  return (body.items || [])
    .filter((it) => !it.archived)
    .map((it) => ({
      id: `${it.owner.login.toLowerCase()}/${it.name.toLowerCase()}`,
      owner: it.owner.login,
      name: it.name,
      url: it.html_url,
      description: it.description || '',
      stars: it.stargazers_count,
    }));
}

function decodeBase64(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
