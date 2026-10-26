// v3.7 — 허깅페이스(모델·데이터셋·스페이스) 저장. 깃허브 저장소 흐름과 같은 방식:
// 링크 → 공개 API 메타 → 8종 카테고리 분류 → 한글 설명 → docs/hf.json 커밋
import type { Env, HfKind, HfMeta, HfEntry, HfFile, CategoriesFile, ClassifyResult } from './types';
import { classify } from './classifier';

const HF_API = 'https://huggingface.co/api';

// huggingface.co/<여기> 첫 단어가 이거면 저장소가 아님 (목록·문서·로그인 등)
const RESERVED = new Set([
  'models', 'papers', 'docs', 'blog', 'collections', 'organizations', 'settings', 'login', 'join',
  'pricing', 'tasks', 'learn', 'posts', 'chat', 'enterprise', 'spaces-dev', 'search', 'api', 'new',
  'new-space', 'new-dataset', 'notifications', 'inference-endpoints', 'welcome', 'terms-of-service',
  'privacy', 'huggingchat', 'changelog', 'brand', 'jobs', 'events', 'hardware', 'datasets', 'spaces',
]);

export const HF_KIND_LABEL: Record<HfKind, string> = { model: '모델', dataset: '데이터셋', space: '스페이스' };
const KIND_API: Record<HfKind, string> = { model: 'models', dataset: 'datasets', space: 'spaces' };
const KIND_PATH: Record<HfKind, string> = { model: '', dataset: 'datasets/', space: 'spaces/' };

export function hfEntryId(kind: HfKind, repoId: string): string {
  return `hf:${KIND_PATH[kind]}${repoId.toLowerCase()}`;
}

export function hfUrl(kind: HfKind, repoId: string): string {
  return `https://huggingface.co/${KIND_PATH[kind]}${repoId}`;
}

export function parseHfUrl(url: string): { kind: HfKind; repoId: string } | null {
  const m = url.match(/^https?:\/\/(?:www\.)?(?:huggingface\.co|hf\.co)\/([^?#]+)/i);
  if (!m) return null;
  const segs = m[1].split('/').filter(Boolean);
  if (!segs.length) return null;
  let kind: HfKind = 'model';
  if (segs[0] === 'datasets' || segs[0] === 'spaces') {
    kind = segs[0] === 'datasets' ? 'dataset' : 'space';
    segs.shift();
  } else if (RESERVED.has(segs[0].toLowerCase())) {
    return null;
  }
  if (segs.length < 2) return null; // owner/name 형식만 (옛 단일 이름 모델은 지원 안 함)
  const ok = /^[\w.-]+$/;
  if (!ok.test(segs[0]) || !ok.test(segs[1])) return null;
  return { kind, repoId: `${segs[0]}/${segs[1]}` };
}

export function extractHfUrls(text: string): string[] {
  const re = /https?:\/\/(?:www\.)?(?:huggingface\.co|hf\.co)\/[^\s<>"')\]]+/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.match(re) || []) {
    const p = parseHfUrl(raw);
    if (!p) continue;
    const id = hfEntryId(p.kind, p.repoId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(hfUrl(p.kind, p.repoId));
  }
  return out;
}

function cleanText(s: string, max: number): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function fetchHfMeta(kind: HfKind, repoId: string, env?: Env): Promise<HfMeta | null> {
  const headers: Record<string, string> = { 'User-Agent': 'asuka-bot' };
  if (env?.HF_TOKEN) headers.Authorization = `Bearer ${env.HF_TOKEN}`;
  const res = await fetch(`${HF_API}/${KIND_API[kind]}/${repoId}`, { headers });
  if (res.status === 404 || res.status === 401) return null; // 없음 또는 비공개
  if (!res.ok) throw new Error(`hf fetch failed: ${res.status}`);
  const d = (await res.json()) as any;
  const id: string = d.id || repoId;
  const [owner, ...rest] = id.split('/');
  const card = d.cardData || {};
  const tags: string[] = (d.tags || []).filter((t: unknown) => typeof t === 'string');
  const licenseTag = tags.find((t) => t.startsWith('license:'));
  let description = '';
  if (kind === 'space') description = card.short_description || card.title || '';
  else if (kind === 'dataset') description = d.description || card.pretty_name || '';
  else description = card.model_name || '';
  let pipeline: string | null = d.pipeline_tag || null;
  if (kind === 'space' && !pipeline && Array.isArray(d.models) && d.models[0]) {
    try {
      const mr = await fetch(`${HF_API}/models/${d.models[0]}`, { headers });
      if (mr.ok) pipeline = ((await mr.json()) as any).pipeline_tag || null;
    } catch { /* 보충 실패는 무시 */ }
  }
  return {
    kind,
    repoId: id,
    owner,
    name: rest.join('/') || id,
    description: cleanText(description, 300),
    likes: d.likes ?? 0,
    downloads: typeof d.downloads === 'number' ? d.downloads : null,
    pipeline_tag: pipeline,
    library: d.library_name || null,
    sdk: d.sdk || null,
    tags: tags.filter((t) => !/^(region|license|arxiv|endpoints_compatible|autotrain_compatible|deploy|doi):/.test(t) && !['region:us', 'endpoints_compatible', 'autotrain_compatible'].includes(t)).slice(0, 15),
    license: card.license ? String(card.license) : licenseTag ? licenseTag.slice(8) : null,
    gated: !!d.gated,
    last_modified: d.lastModified || null,
  };
}

// 허깅페이스 작업 종류(pipeline_tag) → 용도 중심 8종. 표에 없으면 키워드 분류기로.
const PIPELINE_CATEGORY: Record<string, string> = {
  'text-to-image': '미디어 생성', 'image-to-image': '미디어 생성', 'unconditional-image-generation': '미디어 생성',
  'text-to-video': '미디어 생성', 'image-to-video': '미디어 생성', 'video-to-video': '미디어 생성',
  'text-to-speech': '미디어 생성', 'text-to-audio': '미디어 생성', 'audio-to-audio': '미디어 생성',
  'image-to-3d': '3D·렌더', 'text-to-3d': '3D·렌더', 'image-segmentation': '미디어 생성',
  'mask-generation': '미디어 생성', 'depth-estimation': '미디어 생성', 'keypoint-detection': '미디어 생성',
  'image-feature-extraction': '미디어 생성',
  'text-generation': '에이전트·자동화', 'image-text-to-text': '에이전트·자동화', 'any-to-any': '에이전트·자동화',
  'audio-text-to-text': '에이전트·자동화', 'video-text-to-text': '에이전트·자동화', 'visual-question-answering': '에이전트·자동화',
  'reinforcement-learning': '에이전트·자동화', 'robotics': '에이전트·자동화',
  'translation': '글쓰기·카피', 'summarization': '글쓰기·카피', 'text2text-generation': '글쓰기·카피', 'fill-mask': '글쓰기·카피',
  'automatic-speech-recognition': '문서·데이터', 'image-to-text': '문서·데이터', 'document-question-answering': '문서·데이터',
  'table-question-answering': '문서·데이터', 'question-answering': '문서·데이터', 'tabular-classification': '문서·데이터',
  'tabular-regression': '문서·데이터', 'time-series-forecasting': '문서·데이터',
  'feature-extraction': '리서치·수집', 'sentence-similarity': '리서치·수집', 'text-ranking': '리서치·수집',
  'zero-shot-classification': '개발도구', 'text-classification': '개발도구', 'token-classification': '개발도구',
  'image-classification': '개발도구', 'object-detection': '개발도구', 'zero-shot-image-classification': '개발도구',
  'zero-shot-object-detection': '개발도구', 'audio-classification': '개발도구', 'video-classification': '개발도구',
};

export function classifyHf(meta: HfMeta, cats: CategoriesFile): ClassifyResult {
  const valid = new Set(Object.keys(cats.categories));
  if (meta.kind === 'dataset' && valid.has('문서·데이터')) {
    return { category: '문서·데이터', confidence: 0.9, top3: [{ category: '문서·데이터', score: 3 }] };
  }
  // 데이터셋·스페이스는 task_categories 태그를 pipeline처럼 씀
  const pipe = meta.pipeline_tag || meta.tags.find((t) => t.startsWith('task_categories:'))?.slice(16) || null;
  const mapped = pipe ? PIPELINE_CATEGORY[pipe] : undefined;
  if (mapped && valid.has(mapped)) {
    return { category: mapped, confidence: 0.85, top3: [{ category: mapped, score: 3 }] };
  }
  const r = classify(
    {
      owner: meta.owner,
      name: meta.name,
      description: meta.description,
      language: null,
      stars: meta.likes,
      topics: [...meta.tags, pipe || '', meta.library || '', meta.sdk || ''].filter(Boolean),
      license: meta.license,
      archived: false,
    },
    cats
  );
  if (valid.has(r.category)) return r;
  // 점수 0 → 분류기가 '기타'를 줌. 8종에 없는 값이 저장되지 않게 종류별 기본값으로
  const fallback = meta.kind === 'dataset' ? '문서·데이터' : meta.kind === 'space' ? '미디어 생성' : '개발도구';
  return { ...r, category: fallback, confidence: 0.3 };
}

export function buildHfEntry(meta: HfMeta, result: ClassifyResult, userId: string, descKo: string): HfEntry {
  const now = new Date().toISOString();
  return {
    id: hfEntryId(meta.kind, meta.repoId),
    kind: meta.kind,
    repo_id: meta.repoId,
    owner: meta.owner,
    name: meta.name,
    url: hfUrl(meta.kind, meta.repoId),
    description: meta.description,
    likes: meta.likes,
    downloads: meta.downloads,
    pipeline_tag: meta.pipeline_tag,
    library: meta.library,
    sdk: meta.sdk,
    tags: [],
    hf_tags: meta.tags,
    license: meta.license,
    gated: meta.gated,
    category: result.category,
    confidence: Number(result.confidence.toFixed(2)),
    classified_by: 'rule',
    saved_at: now,
    stats_updated_at: now,
    last_modified: meta.last_modified,
    added_by: userId,
    notes: null,
    desc_ko: descKo,
  };
}

// ===== 주간 보고용 =====

export interface HfTrendHit {
  kind: HfKind;
  repoId: string;
  id: string;
  url: string;
  likes: number;
  pipeline_tag: string | null;
  description: string;
}

// 추천에서 거르는 이름 — 성인물·도박·스팸 의심 (REA 합법성 규칙과 같은 취지)
const BLOCK_RE = /uncensor|nsfw|nud(e|ity)|porn|hentai|erotic|sex|lewd|onlyfans|deepnude|undress|slot|gacor|casino|togel|judi|bet\d|777|crack|keygen|jailbreak|deepfake|face-?swap|faceswap/i;

// 지금 뜨는 모델·스페이스 (trendingScore 정렬) — 요청 1번씩
export async function fetchHfTrending(kind: 'model' | 'space', limit: number, env?: Env): Promise<HfTrendHit[]> {
  const headers: Record<string, string> = { 'User-Agent': 'asuka-bot' };
  if (env?.HF_TOKEN) headers.Authorization = `Bearer ${env.HF_TOKEN}`;
  const res = await fetch(`${HF_API}/${KIND_API[kind]}?sort=trendingScore&limit=${limit}&full=true`, { headers });
  if (!res.ok) throw new Error(`hf trending failed: ${res.status}`);
  const arr = ((await res.json()) as any[]).filter(
    (d) => !BLOCK_RE.test(d.id || '') && (d.likes ?? 0) >= (kind === 'space' ? 100 : 50) && !d.private && !d.disabled
  );
  return arr.map((d) => ({
    kind,
    repoId: d.id,
    id: hfEntryId(kind, d.id),
    url: hfUrl(kind, d.id),
    likes: d.likes ?? 0,
    pipeline_tag: d.pipeline_tag || null,
    description: cleanText(d.cardData?.short_description || d.cardData?.title || '', 200),
  }));
}

export const EMPTY_HF_FILE = (): HfFile => ({ version: 1, updated_at: new Date().toISOString(), items: [] });
