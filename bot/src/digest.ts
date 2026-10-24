import type { Env, DataFile, RepoEntry, HfEntry } from './types';
import { TelegramAPI } from './telegram';
import { getDataFile, putDataFile, getCategories, fetchReleasesBatch, searchNewRepos, getHfFile, putHfFile, type RepoSnapshot, type SearchHit } from './github';
import { fetchHfMeta, fetchHfTrending, classifyHf, HF_KIND_LABEL, type HfTrendHit } from './hf';

export interface DigestSummary {
  releases: number;
  starMovers: number;
  recs: number;
  hf?: { updates: number; movers: number; recs: number };
  errors: string[];
  report?: string; // dry-run일 때만 — 발송 없이 내용 검수용
}

// 매주 cron + /digest 명령 + /api/digest/run 이 전부 이 함수 하나를 탄다
// dry=true면 텔레그램 발송·data.json 저장 없이 보고서 내용만 만들어 반환 (검수용)
export async function runDigest(env: Env, chatId: number, dry = false): Promise<DigestSummary> {
  const tg = new TelegramAPI(env);
  const errors: string[] = [];
  const { data, sha } = await getDataFile(env);
  const now = new Date().toISOString();

  // 1) 저장된 repo 전체 릴리즈/스타 스냅샷 — GraphQL 한 방
  let releases: { repo: RepoEntry; tag: string; name: string | null; url: string }[] = [];
  let movers: { repo: RepoEntry; delta: number }[] = [];
  try {
    const snaps = await fetchReleasesBatch(env, data.repos);
    for (const repo of data.repos) {
      const snap: RepoSnapshot | undefined = snaps[repo.id];
      if (!snap) continue;
      if (snap.stars > 0) {
        const delta = snap.stars - repo.stars;
        if (delta >= 20) movers.push({ repo, delta });
        repo.stars = snap.stars;
        repo.stars_updated_at = now;
      }
      if (snap.releaseTag) {
        // 첫 실행은 기록만 하고 보고 안 함 (전부 "신규"로 뜨는 것 방지)
        if (repo.last_release && repo.last_release !== snap.releaseTag) {
          releases.push({ repo, tag: snap.releaseTag, name: snap.releaseName, url: snap.releaseUrl || repo.url });
        }
        repo.last_release = snap.releaseTag;
      }
    }
    movers.sort((a, b) => b.delta - a.delta);
    movers = movers.slice(0, 3);
  } catch (e: any) {
    errors.push(`releases: ${e?.message || e}`);
  }

  // 2) 레이더 — 상위 카테고리 취향 기반 신규 repo 검색
  let recs: (SearchHit & { descKo: string })[] = [];
  try {
    const savedIds = new Set(data.repos.map((r) => r.id));
    const topCats = topCategories(data.repos, 3);
    const cats = await getCategories(env);
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const cat of topCats) {
      const kw = cats.categories[cat]?.keywords?.strong?.[0];
      if (!kw) continue;
      const found = await searchNewRepos(env, kw, 30);
      for (const h of found) {
        if (savedIds.has(h.id) || seen.has(h.id)) continue;
        seen.add(h.id);
        hits.push(h);
      }
    }
    hits.sort((a, b) => b.stars - a.stars);
    const top = hits.slice(0, 5);
    recs = [];
    for (const h of top) {
      recs.push({ ...h, descKo: await explainKo(env, h.id, h.description, []) });
    }
  } catch (e: any) {
    errors.push(`radar: ${e?.message || e}`);
  }

  // 릴리즈 난 repo들도 한글 설명 확보 (한 번 만들면 data.json에 캐시, 최대 5개/회)
  let explained = 0;
  for (const r of releases) {
    if (!r.repo.desc_ko && explained < 5) {
      r.repo.desc_ko = await explainKo(env, r.repo.id, r.repo.description, r.repo.topics);
      explained++;
    }
  }

  // 2.5) v3.7 허깅페이스 — 저장한 자료 업데이트·좋아요 급등 + 지금 뜨는 모델·스페이스 추천
  const hf = await collectHf(env, now, errors);

  // 3) 상태 저장 (last_release / stars 갱신)
  if (!dry) {
    try {
      data.updated_at = now;
      await putDataFile(env, data, sha, 'weekly digest refresh');
    } catch (e: any) {
      errors.push(`commit: ${e?.message || e}`);
    }
    if (hf.dirty) {
      try {
        hf.file.updated_at = now;
        await putHfFile(env, hf.file, hf.sha, 'weekly digest refresh (huggingface)');
      } catch (e: any) {
        errors.push(`hf commit: ${e?.message || e}`);
      }
    }
  }
  const hfCounts = { updates: hf.updates.length, movers: hf.movers.length, recs: hf.recs.length };

  // 4) 텔레그램 보고
  const date = now.slice(0, 10);
  if (dry) {
    return {
      releases: releases.length,
      starMovers: movers.length,
      recs: recs.length,
      hf: hfCounts,
      errors,
      report: renderReportTxt(date, releases, movers, recs, hf),
    };
  }
  const text = renderDigest(releases, movers, recs, errors, hf);
  const keyboard = recs
    .filter((r) => `add:${r.id}`.length <= 64) // Telegram callback_data 64byte 제한
    .map((r) => [{ text: `➕ ${r.name} 저장`, callback_data: `add:${r.id}` }]);
  for (const h of hf.recs) {
    const cb = `hfadd:${hfPath(h)}`;
    if (new TextEncoder().encode(cb).length > 64) continue;
    keyboard.push([{ text: `➕ 🤗 ${h.repoId.split('/').pop()} 저장`, callback_data: cb }]);
  }
  const replyMarkup = keyboard.length ? { inline_keyboard: keyboard } : undefined;
  const res = await tg.sendMessage(chatId, text, { replyMarkup });
  if (!res.ok) {
    // repo 이름의 _ 등이 Markdown 파싱을 깨면 plain 텍스트로 재전송 (cron은 실패해도 아무도 못 보니까)
    console.error('digest markdown send failed', res.status);
    await tg.sendMessage(chatId, text, { replyMarkup, parseMode: null });
  }

  // 5) 상세 보고서 — txt 첨부는 수신측 뷰어가 인코딩을 깨뜨려서 폐기(v3), 메시지 본문으로 나눠 보낸다
  const report = renderReportTxt(date, releases, movers, recs, hf);
  for (const chunk of chunkText(report, 3900)) {
    const r = await tg.sendMessage(chatId, chunk, { parseMode: null });
    if (!r.ok) errors.push(`report send: ${r.status}`);
  }

  return { releases: releases.length, starMovers: movers.length, recs: recs.length, hf: hfCounts, errors };
}

// ===== v3.7 허깅페이스 주간 보고 =====

interface HfDigest {
  file: { version: number; updated_at: string; items: HfEntry[] };
  sha: string;
  dirty: boolean;
  updates: HfEntry[]; // 저장한 것 중 이번 주 파일이 바뀐 것
  movers: { item: HfEntry; delta: number }[];
  recs: (HfTrendHit & { descKo: string })[];
}

const HF_REFRESH_MAX = 10; // Workers 무료 플랜 subrequest 50개 제한 — 한 주에 오래된 순 10개씩 돌아가며 갱신
const HF_MOVER_MIN = 10;

function hfPath(h: { kind: string; repoId: string }): string {
  return `${h.kind === 'dataset' ? 'datasets/' : h.kind === 'space' ? 'spaces/' : ''}${h.repoId}`;
}

async function collectHf(env: Env, now: string, errors: string[]): Promise<HfDigest> {
  const out: HfDigest = { file: { version: 1, updated_at: now, items: [] }, sha: '', dirty: false, updates: [], movers: [], recs: [] };
  try {
    const { data, sha } = await getHfFile(env);
    out.file = data;
    out.sha = sha;
  } catch (e: any) {
    errors.push(`hf load: ${e?.message || e}`);
    return out;
  }

  // 1) 저장한 자료 갱신 (오래된 순)
  const targets = [...out.file.items]
    .sort((a, b) => (a.stats_updated_at || '').localeCompare(b.stats_updated_at || ''))
    .slice(0, HF_REFRESH_MAX);
  for (const item of targets) {
    try {
      const meta = await fetchHfMeta(item.kind, item.repo_id, env);
      if (!meta) continue;
      const delta = meta.likes - (item.likes || 0);
      if (delta >= HF_MOVER_MIN) out.movers.push({ item, delta });
      // 첫 기록은 보고 안 함 (전부 "업데이트"로 뜨는 것 방지)
      if (item.last_modified && meta.last_modified && meta.last_modified !== item.last_modified) out.updates.push(item);
      item.likes = meta.likes;
      item.downloads = meta.downloads;
      item.last_modified = meta.last_modified;
      item.stats_updated_at = now;
      out.dirty = true;
    } catch (e: any) {
      errors.push(`hf refresh ${item.id}: ${e?.message || e}`);
      break; // 허깅페이스 쪽 장애면 나머지도 실패할 테니 중단
    }
  }
  out.movers.sort((a, b) => b.delta - a.delta);
  out.movers = out.movers.slice(0, 3);

  // 2) 지금 뜨는 모델·스페이스 추천 — 내가 많이 저장한 카테고리 우선, 각 2개
  try {
    const saved = new Set(out.file.items.map((i) => i.id));
    const cats = await getCategories(env);
    const counts: Record<string, number> = {};
    for (const i of out.file.items) counts[i.category] = (counts[i.category] || 0) + 1;
    const favCats = new Set(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c));
    const pick: HfTrendHit[] = [];
    for (const kind of ['model', 'space'] as const) {
      const hits = (await fetchHfTrending(kind, 30, env)).filter((h) => !saved.has(h.id));
      const catOf = (h: HfTrendHit) =>
        classifyHf(
          { kind: h.kind, repoId: h.repoId, owner: h.repoId.split('/')[0], name: h.repoId.split('/')[1] || h.repoId, description: h.description, likes: h.likes, downloads: null, pipeline_tag: h.pipeline_tag, library: null, sdk: null, tags: [], license: null, gated: false, last_modified: null },
          cats
        ).category;
      const preferred = favCats.size ? hits.filter((h) => favCats.has(catOf(h))) : [];
      const chosen = [...preferred, ...hits.filter((h) => !preferred.includes(h))].slice(0, 2);
      pick.push(...chosen);
    }
    for (const h of pick) {
      out.recs.push({ ...h, descKo: await explainKo(env, `허깅페이스 ${h.kind} ${h.repoId}`, h.description, h.pipeline_tag ? [h.pipeline_tag] : []) });
    }
  } catch (e: any) {
    errors.push(`hf radar: ${e?.message || e}`);
  }
  return out;
}

function renderReportTxt(
  date: string,
  releases: { repo: RepoEntry; tag: string; name: string | null; url: string }[],
  movers: { repo: RepoEntry; delta: number }[],
  recs: { id: string; stars: number; descKo: string; url: string }[],
  hf?: HfDigest
): string {
  const L: string[] = [];
  L.push(`🔴 asuka 주간 보고서 — ${date}`);
  L.push('='.repeat(40));
  L.push('');

  L.push(`■ 새 릴리즈 — 저장해둔 것 중 새 버전이 나온 repo (${releases.length}개)`);
  if (releases.length === 0) {
    L.push('  이번 주는 없음.');
  }
  releases.forEach((r, i) => {
    L.push('');
    L.push(`${i + 1}. ${r.repo.id}  →  새 버전 ${r.tag}`);
    L.push(`   뭐 하는 물건: ${r.repo.desc_ko || r.repo.description || '설명 없음'}`);
    L.push(`   카테고리: ${r.repo.category} / 별점: ⭐${r.repo.stars.toLocaleString()}`);
    L.push(`   릴리즈 보기: ${r.url}`);
  });
  L.push('');

  if (movers.length) {
    L.push(`■ 스타 급등 — 이번 주 인기 오른 저장 repo`);
    movers.forEach((m) => {
      L.push(`  • ${m.repo.id}  ⭐+${m.delta.toLocaleString()} (총 ${m.repo.stars.toLocaleString()})${m.repo.desc_ko ? ` — ${m.repo.desc_ko}` : ''}`);
    });
    L.push('');
  }

  L.push(`■ 새로 뜨는 repo 추천 (${recs.length}개)`);
  L.push('  마음에 드는 건 텔레그램 메시지의 ➕ 버튼으로 저장하면 돼.');
  recs.forEach((r, i) => {
    L.push('');
    L.push(`${i + 1}. ${r.id}  ⭐${r.stars.toLocaleString()}`);
    L.push(`   ${r.descKo || '설명 없음'}`);
    L.push(`   구경하기: ${r.url}`);
  });
  L.push('');

  if (hf) {
    L.push(`■ 허깅페이스 — 저장한 것 중 이번 주 업데이트 (${hf.updates.length}개)`);
    if (hf.updates.length === 0) L.push('  이번 주는 없음.');
    hf.updates.forEach((u, i) => {
      L.push('');
      L.push(`${i + 1}. ${u.repo_id} (${HF_KIND_LABEL[u.kind]})  →  파일 업데이트됨`);
      L.push(`   뭐 하는 물건: ${u.desc_ko || u.description || '설명 없음'}`);
      L.push(`   카테고리: ${u.category} / 좋아요: ♥${u.likes.toLocaleString()}`);
      L.push(`   보기: ${u.url}`);
    });
    L.push('');
    if (hf.movers.length) {
      L.push('■ 허깅페이스 좋아요 급등 — 이번 주 인기 오른 저장 자료');
      hf.movers.forEach((m) => {
        L.push(`  • ${m.item.repo_id}  ♥+${m.delta.toLocaleString()} (총 ${m.item.likes.toLocaleString()})${m.item.desc_ko ? ` — ${m.item.desc_ko}` : ''}`);
      });
      L.push('');
    }
    L.push(`■ 허깅페이스 지금 뜨는 모델·스페이스 (${hf.recs.length}개)`);
    L.push('  마음에 드는 건 텔레그램 메시지의 ➕ 🤗 버튼으로 저장하면 돼.');
    hf.recs.forEach((r, i) => {
      L.push('');
      L.push(`${i + 1}. ${r.repoId} (${HF_KIND_LABEL[r.kind]})  ♥${r.likes.toLocaleString()}`);
      L.push(`   ${r.descKo || '설명 없음'}`);
      L.push(`   구경하기: ${r.url}`);
    });
    L.push('');
  }
  L.push('— asuka 🔴 · asuka_bot v3.7');
  return L.join('\n');
}

// Telegram 메시지 4096자 제한 대비 줄 단위 분할 (보고서 줄은 전부 짧아서 줄 하나가 max를 넘는 경우는 없음)
function chunkText(s: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const line of s.split('\n')) {
    if (cur && cur.length + line.length + 1 > max) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out;
}

function topCategories(repos: RepoEntry[], n: number): string[] {
  const count: Record<string, number> = {};
  for (const r of repos) {
    if (r.category === '기타') continue;
    count[r.category] = (count[r.category] || 0) + 1;
  }
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c]) => c);
}

// repo 하나를 비전공자용 한글로 설명. JSON 형식 요구 없음 → 형식 깨져서 영어 폴백되는 사고 원천 차단.
// 70b 모델 우선, 실패하면 8b, 그래도 실패하면 영어 원문.
export async function explainKo(
  env: Env,
  name: string,
  description: string,
  topics: string[]
): Promise<string> {
  const prompt = `이름: ${name}\n영어 설명: ${(description || '').slice(0, 300)}\n토픽: ${topics.slice(0, 6).join(', ') || '없음'}`;
  const system =
    '너는 개발 지식이 없는 사람에게 GitHub 저장소나 허깅페이스 자료(AI 모델·데이터셋·데모 스페이스)를 설명하는 도우미다. 이것이 뭐 하는 물건인지, 어디에 쓰면 좋은지를 쉬운 한국어 1~2문장으로 설명해라. 전문용어를 쓰면 바로 쉬운 말로 풀어라. 인사말·서론 없이 설명 문장만 출력해라.';
  const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
  for (const model of models) {
    try {
      const aiRes = (await (env.AI as any).run(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      })) as { response: string };
      const text = (aiRes.response || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
      // v3.7: 중국어·일본어 한자가 섞이면 다음 모델로 다시 (마지막 모델이면 한자만 지우고 사용)
      if (text && /[\u3040-\u30ff\u4e00-\u9fff]/.test(text)) {
        if (model !== models[models.length - 1]) continue;
        const cleaned = text.replace(/[\u3040-\u30ff\u4e00-\u9fff]+/g, '').replace(/\s{2,}/g, ' ').trim();
        if (cleaned) return cleaned.slice(0, 300);
        continue;
      }
      if (text) return text.slice(0, 300);
    } catch (e: any) {
      console.error(`explainKo ${model} failed`, e?.message || e);
    }
  }
  return description || '설명 없음';
}

function renderDigest(
  releases: { repo: RepoEntry; tag: string; name: string | null; url: string }[],
  movers: { repo: RepoEntry; delta: number }[],
  recs: { id: string; stars: number; descKo: string; url: string }[],
  errors: string[],
  hf?: HfDigest
): string {
  const parts: string[] = ['🔴 *asuka 주간 보고*'];

  // repo id/태그는 backtick, 링크 텍스트는 고정 문자열만 — 이름에 _ 있어도 Markdown 안 깨지게
  if (releases.length) {
    const lines = releases
      .slice(0, 10)
      .map((r) => `• \`${r.repo.id}\` 새 버전 \`${r.tag}\` [열기](${r.url})`);
    parts.push(`📦 *새 릴리즈* (${releases.length})\n${lines.join('\n')}`);
  } else {
    parts.push('📦 이번 주 새 릴리즈 없음. 조용하네.');
  }

  if (movers.length) {
    const lines = movers.map((m) => `• \`${m.repo.id}\` ⭐ +${m.delta.toLocaleString()}`);
    parts.push(`🚀 *스타 급등*\n${lines.join('\n')}`);
  }

  if (recs.length) {
    const lines = recs.map(
      (r, i) => `${i + 1}. \`${r.id}\` ⭐${r.stars.toLocaleString()} [열기](${r.url})\n   ${r.descKo || '설명 없음'}`
    );
    parts.push(
      `🛰 *새로 뜨는 repo* — 맘에 드는 것만 아래 버튼으로 저장해\n\n${lines.join('\n')}`
    );
  }

  if (hf) {
    const hl: string[] = [];
    if (hf.updates.length) {
      hl.push(...hf.updates.slice(0, 8).map((u) => `• \`${u.repo_id}\` 업데이트됨 [열기](${u.url})`));
    } else {
      hl.push('저장한 것 중 이번 주 업데이트 없음.');
    }
    if (hf.movers.length) hl.push(...hf.movers.map((m) => `• \`${m.item.repo_id}\` ♥ +${m.delta.toLocaleString()}`));
    if (hf.recs.length) {
      hl.push('', '*지금 뜨는 모델·스페이스*');
      hf.recs.forEach((r, i) => hl.push(`${i + 1}. \`${r.repoId}\` (${HF_KIND_LABEL[r.kind]}) ♥${r.likes.toLocaleString()} [열기](${r.url})\n   ${r.descKo || '설명 없음'}`));
    }
    parts.push(`🤗 *허깅페이스*\n${hl.join('\n')}`);
  }

  if (errors.length) {
    parts.push(`⚠️ 일부 실패: ${errors.join(' / ')}`);
  }

  parts.push('— asuka 🔴');
  return parts.join('\n\n');
}
