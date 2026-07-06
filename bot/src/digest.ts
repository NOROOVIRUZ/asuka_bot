import type { Env, DataFile, RepoEntry } from './types';
import { TelegramAPI } from './telegram';
import { getDataFile, putDataFile, getCategories, fetchReleasesBatch, searchNewRepos, type RepoSnapshot, type SearchHit } from './github';

export interface DigestSummary {
  releases: number;
  starMovers: number;
  recs: number;
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

  // 3) 상태 저장 (last_release / stars 갱신)
  if (!dry) {
    try {
      data.updated_at = now;
      await putDataFile(env, data, sha, 'weekly digest refresh');
    } catch (e: any) {
      errors.push(`commit: ${e?.message || e}`);
    }
  }

  // 4) 텔레그램 보고
  const date = now.slice(0, 10);
  if (dry) {
    return {
      releases: releases.length,
      starMovers: movers.length,
      recs: recs.length,
      errors,
      report: renderReportTxt(date, releases, movers, recs),
    };
  }
  const text = renderDigest(releases, movers, recs, errors);
  const keyboard = recs
    .filter((r) => `add:${r.id}`.length <= 64) // Telegram callback_data 64byte 제한
    .map((r) => [{ text: `➕ ${r.name} 저장`, callback_data: `add:${r.id}` }]);
  const replyMarkup = keyboard.length ? { inline_keyboard: keyboard } : undefined;
  const res = await tg.sendMessage(chatId, text, { replyMarkup });
  if (!res.ok) {
    // repo 이름의 _ 등이 Markdown 파싱을 깨면 plain 텍스트로 재전송 (cron은 실패해도 아무도 못 보니까)
    console.error('digest markdown send failed', res.status);
    await tg.sendMessage(chatId, text, { replyMarkup, parseMode: null });
  }

  // 5) 한글 설명 다 담은 상세 보고서 txt 첨부
  const report = renderReportTxt(date, releases, movers, recs);
  const docRes = await tg.sendDocument(
    chatId,
    `asuka_주간보고_${date}.txt`,
    report,
    '📎 상세 보고서야. 한글 설명 다 써놨으니까 천천히 읽어봐.'
  );
  if (!docRes.ok) {
    errors.push(`doc send: ${docRes.status} ${await docRes.text().catch(() => '')}`);
  }

  return { releases: releases.length, starMovers: movers.length, recs: recs.length, errors };
}

function renderReportTxt(
  date: string,
  releases: { repo: RepoEntry; tag: string; name: string | null; url: string }[],
  movers: { repo: RepoEntry; delta: number }[],
  recs: { id: string; stars: number; descKo: string; url: string }[]
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
  L.push('— asuka 🔴');
  return L.join('\n');
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
  const prompt = `GitHub repo 이름: ${name}\n영어 설명: ${(description || '').slice(0, 300)}\n토픽: ${topics.slice(0, 6).join(', ') || '없음'}`;
  const system =
    '너는 개발 지식이 없는 사람에게 GitHub 프로젝트를 설명하는 도우미다. 이 repo가 뭐 하는 물건인지, 어디에 쓰면 좋은지를 쉬운 한국어 1~2문장으로 설명해라. 전문용어를 쓰면 바로 쉬운 말로 풀어라. 인사말·서론 없이 설명 문장만 출력해라.';
  for (const model of ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct']) {
    try {
      const aiRes = (await (env.AI as any).run(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      })) as { response: string };
      const text = (aiRes.response || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
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
  errors: string[]
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

  if (errors.length) {
    parts.push(`⚠️ 일부 실패: ${errors.join(' / ')}`);
  }

  parts.push('— asuka 🔴');
  return parts.join('\n\n');
}
