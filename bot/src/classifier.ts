import type { CategoriesFile, RepoMeta, ClassifyResult } from './types';

export function classify(meta: RepoMeta, cats: CategoriesFile): ClassifyResult {
  const id = `${meta.owner.toLowerCase()}/${meta.name.toLowerCase()}`;
  const name = meta.name.toLowerCase();
  const description = (meta.description || '').toLowerCase();
  const topics = (meta.topics || []).map((t) => t.toLowerCase());
  const haystack = [id, name, description, ...topics].join(' ');

  const scores: Record<string, number> = {};
  for (const [catName, def] of Object.entries(cats.categories)) {
    let s = 0;
    for (const kw of def.keywords?.strong || []) if (haystack.includes(kw.toLowerCase())) s += 3;
    for (const kw of def.keywords?.medium || []) if (haystack.includes(kw.toLowerCase())) s += 1.5;
    for (const kw of def.keywords?.weak || []) if (haystack.includes(kw.toLowerCase())) s += 0.5;
    for (const pat of def.name_patterns || []) if (name.includes(pat.toLowerCase())) s += 2;
    if (meta.language && (def.languages || []).includes(meta.language)) s += 0.5;
    for (const kw of def.exclude_keywords || []) if (haystack.includes(kw.toLowerCase())) s -= 4;
    scores[catName] = s;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top1 = sorted[0];
  const top2 = sorted[1] || ['', 0];

  if (!top1 || top1[1] <= 0) {
    return {
      category: '기타',
      confidence: 0.3,
      top3: sorted.slice(0, 3).map(([category, score]) => ({ category, score })),
    };
  }

  const raw = top1[1];
  const gap = top1[1] - top2[1];
  const confidence = Math.max(0, Math.min(1, (raw / 6) * 0.6 + (gap / 4) * 0.4));

  return {
    category: top1[0],
    confidence,
    top3: sorted.slice(0, 3).map(([category, score]) => ({ category, score })),
  };
}
