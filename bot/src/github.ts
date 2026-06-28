import type { Env, DataFile, CategoriesFile, RepoMeta, PromptsFile } from './types';

const GH_API = 'https://api.github.com';

let cachedCategories: CategoriesFile | null = null;

export async function getCategories(env: Env): Promise<CategoriesFile> {
  if (cachedCategories) return cachedCategories;
  const url = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/main/${env.CATEGORIES_PATH}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'asuka-bot' } });
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
