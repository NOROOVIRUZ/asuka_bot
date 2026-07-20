import type { Env, RepoEntry, PromptEntry } from './types';
import { TelegramAPI } from './telegram';
import { fetchRepoMeta, getDataFile, putDataFile, getCategories, parseGithubUrl, getPromptsFile, putPromptsFile } from './github';
import { classify } from './classifier';
import { msg } from './i18n';
import { runDigest, explainKo } from './digest';

// cron에는 채팅 컨텍스트가 없으니 허용 유저 1번(노루군)에게 보냄 (1:1 챗은 chat_id == user_id)
function ownerChatId(env: Env): number {
  return Number(env.ALLOWED_USER_IDS.split(',')[0].trim());
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // 헬스체크 / 루트 / API
    if (req.method === 'GET') {
      if (url.pathname === '/api/prompt/delete') {
        return handlePromptDeleteApi(url, env);
      }
      if (url.pathname === '/api/prompts') {
        return handlePromptsApi(env);
      }
      if (url.pathname === '/api/mindmap/summarize') {
        return handleMindmapSummarize(url, env);
      }
      if (url.pathname === '/api/digest/run') {
        return handleDigestApi(url, env);
      }
      if (url.pathname === '/api/translate/backfill') {
        return handleBackfillApi(url, env);
      }
      return new Response('asuka_bot online 🔴', { status: 200 });
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!url.pathname.startsWith('/webhook/')) {
      return new Response('asuka_bot online 🔴', { status: 200 });
    }

    // path secret 1차 검증
    const pathSecret = url.pathname.slice('/webhook/'.length);
    if (pathSecret !== env.WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 401 });
    }

    // Telegram secret_token 헤더 2차 검증
    const headerSecret = req.headers.get('x-telegram-bot-api-secret-token');
    if (headerSecret !== env.WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 401 });
    }

    let update: any;
    try {
      update = await req.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    // ALLOWED_USER_IDS 체크 (외부 spam 차단)
    const allowed = env.ALLOWED_USER_IDS.split(',').map((s) => s.trim()).filter(Boolean);
    const fromId = String(
      update?.message?.from?.id ?? update?.callback_query?.from?.id ?? ''
    );
    if (!fromId || !allowed.includes(fromId)) {
      return new Response('ok'); // silent ignore
    }

    // Telegram 5초 timeout 회피 — 무거운 작업은 background
    ctx.waitUntil(
      handleUpdate(update, env).catch((e) => console.error('handle error', e))
    );
    return new Response('ok');
  },

  // 매주 월요일 09:00 KST (wrangler.toml crons) — 주간 다이제스트
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // /알람끔 상태(공유 KV)면 주간 다이제스트도 침묵
        if (await env.ALARM_KV.get('alarm_muted')) return;
        await runDigest(env, ownerChatId(env));
      })().catch((e) => console.error('digest error', e))
    );
  },
};

async function handleUpdate(update: any, env: Env): Promise<void> {
  const tg = new TelegramAPI(env);

  // 인라인 버튼 콜백 (다이제스트 추천 repo 저장)
  if (update.callback_query) {
    await handleCallback(update.callback_query, tg, env);
    return;
  }

  if (!update.message) return;

  const m = update.message;
  const chatId = m.chat.id;
  const userId = m.from.id;
  const text = (m.text || '').trim();
  if (!text) return;

  if (text.startsWith('/')) {
    await handleCommand(text, chatId, userId, tg, env);
    return;
  }

  const urls = extractGithubUrls(text);
  if (urls.length === 0) {
    await addPromptFlow(text, chatId, userId, tg, env);
    return;
  }

  for (const u of urls) {
    await addRepoFlow(u, chatId, userId, tg, env);
  }
}

async function handlePromptsApi(env: Env): Promise<Response> {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const { data } = await getPromptsFile(env);
    return new Response(JSON.stringify(data), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}

async function handlePromptDeleteApi(url: URL, env: Env): Promise<Response> {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const secret = url.searchParams.get('secret');
  const id = url.searchParams.get('id');
  if (!secret || secret !== env.WEBHOOK_SECRET || !id) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 401, headers: cors });
  }
  try {
    const { data, sha } = await getPromptsFile(env);
    const idx = data.prompts.findIndex((p) => p.id === id);
    if (idx < 0) {
      return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404, headers: cors });
    }
    data.prompts.splice(idx, 1);
    data.updated_at = new Date().toISOString();
    await putPromptsFile(env, data, sha, `delete prompt ${id}`);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
  }
}

async function handleMindmapSummarize(url: URL, env: Env): Promise<Response> {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 401, headers: cors });
  }
  const text = (url.searchParams.get('text') || '').trim().slice(0, 1500);
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'text required' }), { status: 400, headers: cors });
  }
  try {
    const aiRes = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: '당신은 마인드맵 보조 AI입니다. 입력된 텍스트에서 핵심 개념들을 추출하세요.\n반드시 아래 JSON 형식으로만 응답하세요:\n{"summary":"<한국어 2문장 요약>","nodes":[{"label":"<한국어 개념명 최대 5글자>","type":"project|concept|tool|idea"}]}\n최대 8개 노드 추출.',
        },
        { role: 'user', content: text },
      ],
    }) as { response: string };
    const raw = aiRes.response || '';
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw.trim();
    try {
      const parsed = JSON.parse(jsonStr);
      const summary = String(parsed.summary || '');
      const nodes = Array.isArray(parsed.nodes) ? parsed.nodes.slice(0, 8) : [];
      return new Response(JSON.stringify({ ok: true, summary, nodes }), { headers: cors });
    } catch {
      return new Response(JSON.stringify({ ok: true, summary: raw.slice(0, 200), nodes: [{ label: '요약', type: 'concept' }] }), { headers: cors });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
  }
}

async function handleCallback(cq: any, tg: TelegramAPI, env: Env): Promise<void> {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id ?? ownerChatId(env);
  try {
    if (data.startsWith('add:')) {
      const id = data.slice(4);
      await tg.answerCallbackQuery(cq.id, `${id} 저장 중...`);
      await addRepoFlow(`https://github.com/${id}`, chatId, cq.from.id, tg, env);
      return;
    }
    await tg.answerCallbackQuery(cq.id);
  } catch (e: any) {
    console.error('callback error', e?.message || e);
    await tg.answerCallbackQuery(cq.id, '⚠️ 실패했어');
  }
}

async function handleDigestApi(url: URL, env: Env): Promise<Response> {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 401, headers: cors });
  }
  try {
    const dry = url.searchParams.get('dry') === '1';
    const summary = await runDigest(env, ownerChatId(env), dry);
    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
  }
}

// 기존 저장분 한글 설명 일괄 생성 — 한 번에 최대 15개씩 (Workers 무료 플랜 subrequest 50개 제한)
async function handleBackfillApi(url: URL, env: Env): Promise<Response> {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 401, headers: cors });
  }
  try {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 15);
    const { data, sha } = await getDataFile(env);
    const targets = data.repos.filter((r) => !r.desc_ko).slice(0, limit);
    for (const r of targets) {
      r.desc_ko = await explainKo(env, r.id, r.description, r.topics);
    }
    if (targets.length) {
      data.updated_at = new Date().toISOString();
      await putDataFile(env, data, sha, `translate ${targets.length} descriptions to Korean`);
    }
    const remaining = data.repos.filter((r) => !r.desc_ko).length;
    return new Response(JSON.stringify({ ok: true, translated: targets.length, remaining }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
  }
}

// /find — 저장된 repo 중에서 자연어로 찾기 (Workers AI)
async function findFlow(question: string, chatId: number, tg: TelegramAPI, env: Env): Promise<void> {
  try {
    const { data } = await getDataFile(env);
    if (data.repos.length === 0) {
      await tg.sendMessage(chatId, msg.listEmpty());
      return;
    }
    const catalog = data.repos.map((r) => ({
      id: r.id,
      d: (r.description || '').slice(0, 120),
      c: r.category,
      l: r.language,
    }));
    const aiRes = (await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content:
            'You match a user question to saved GitHub repos. Given a JSON catalog and a question, pick up to 3 best matching repos. Respond with ONLY valid JSON: {"matches":[{"id":"<exact id from catalog>","reason":"<한국어 한 문장 이유>"}]}. No match → {"matches":[]}.',
        },
        { role: 'user', content: `catalog: ${JSON.stringify(catalog)}\n\nquestion: ${question}` },
      ],
    })) as { response: string };
    const jsonStr = (aiRes.response || '').match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    let matches: { id: string; reason: string }[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.matches)) matches = parsed.matches;
    } catch { /* AI가 JSON 약속을 어기면 결과 없음으로 처리 */ }

    const found = matches
      .map((m) => ({ repo: data.repos.find((r) => r.id === String(m.id).toLowerCase()), reason: String(m.reason || '') }))
      .filter((m): m is { repo: RepoEntry; reason: string } => !!m.repo);

    await tg.sendMessage(chatId, msg.findResult(question, found));
  } catch (e: any) {
    console.error('findFlow error', e?.message || e);
    await tg.sendMessage(chatId, msg.error());
  }
}

function extractGithubUrls(text: string): string[] {
  const re = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/g;
  return [...text.matchAll(re)].map((m) => `https://github.com/${m[1]}/${m[2]}`);
}

async function addRepoFlow(
  url: string,
  chatId: number,
  userId: number,
  tg: TelegramAPI,
  env: Env
): Promise<void> {
  try {
    const meta = await fetchRepoMeta(url, env.GITHUB_TOKEN);
    if (!meta) {
      await tg.sendMessage(chatId, msg.notFound(url));
      return;
    }

    const id = `${meta.owner.toLowerCase()}/${meta.name.toLowerCase()}`;
    const { data, sha } = await getDataFile(env);

    const exists = data.repos.find((r) => r.id === id);
    if (exists) {
      await tg.sendMessage(chatId, msg.alreadySaved(exists));
      return;
    }

    const cats = await getCategories(env);
    const result = classify(meta, cats);
    const now = new Date().toISOString();

    const entry: RepoEntry = {
      id,
      owner: meta.owner,
      name: meta.name,
      url: `https://github.com/${meta.owner}/${meta.name}`,
      description: meta.description,
      language: meta.language,
      stars: meta.stars,
      topics: meta.topics,
      license: meta.license,
      archived: meta.archived,
      category: result.category,
      tags: [],
      confidence: Number(result.confidence.toFixed(2)),
      classified_by: 'rule',
      saved_at: now,
      stars_updated_at: now,
      added_by: `telegram:${userId}`,
      notes: null,
      // 저장 순간 비전공자용 한글 설명 생성 (대시보드 카드용)
      desc_ko: await explainKo(env, id, meta.description, meta.topics),
    };

    data.repos.unshift(entry);
    data.updated_at = now;

    await putDataFile(env, data, sha, `add ${id} (${result.category})`);

    if (result.confidence < 0.7) {
      await tg.sendMessage(chatId, msg.lowConfidence(entry));
    } else {
      await tg.sendMessage(chatId, msg.saved(entry));
    }
  } catch (e: any) {
    console.error('addRepoFlow error', e?.message || e);
    await tg.sendMessage(chatId, msg.error());
  }
}

async function addPromptFlow(
  content: string,
  chatId: number,
  userId: number,
  tg: TelegramAPI,
  env: Env
): Promise<void> {
  try {
    // Workers AI로 한글 제목 + 카테고리 생성
    const firstLine = content.split('\n').find((l) => l.trim()) || '';
    let title = firstLine.slice(0, 40) || content.slice(0, 40);
    let category = '기타';
    let description: string | null = null;
    try {
      const aiRes = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'Respond with ONLY valid JSON, no other text:\n{"title":"<Korean title max 20 chars>","description":"<Korean one-sentence description of what image/result this prompt creates, max 40 chars>","category":"글쓰기|코딩|분석|이미지|번역|요약|아이디어|기타"}',
          },
          { role: 'user', content: `Classify this prompt:\n${content.slice(0, 500)}` },
        ],
      }) as { response: string };
      const raw = aiRes.response || '';
      const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0] ?? raw.trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.title) title = String(parsed.title).slice(0, 40);
      if (parsed.category) category = String(parsed.category);
      if (parsed.description) description = String(parsed.description).slice(0, 60);
    } catch (aiErr: any) {
      console.error('AI classify failed:', aiErr?.message || aiErr);
    }

    const { data, sha } = await getPromptsFile(env);

    // 중복 체크 — content.trim() 완전 일치
    const trimmed = content.trim();
    const dup = data.prompts.find((p) => p.content.trim() === trimmed);
    if (dup) {
      await tg.sendMessage(chatId, msg.promptDuplicate(dup.title));
      return;
    }

    const now = new Date().toISOString();
    const id = `p_${Date.now()}`;

    const entry: PromptEntry = {
      id,
      title,
      description,
      content,
      category,
      saved_at: now,
      added_by: `telegram:${userId}`,
      notes: null,
    };

    data.prompts.unshift(entry);
    data.updated_at = now;
    try {
      await putPromptsFile(env, data, sha, `add prompt ${id}`);
    } catch (putErr: any) {
      // sha 충돌(race condition) → 최신 파일 다시 읽어서 재시도
      if (putErr.message.includes('422') || putErr.message.includes('409')) {
        const { data: fresh, sha: freshSha } = await getPromptsFile(env);
        if (!fresh.prompts.find((p) => p.id === id)) {
          fresh.prompts.unshift(entry);
          fresh.updated_at = now;
          await putPromptsFile(env, fresh, freshSha, `add prompt ${id}`);
        }
      } else {
        throw putErr;
      }
    }

    await tg.sendMessage(chatId, msg.promptSaved(title, category));
  } catch (e: any) {
    console.error('addPromptFlow error', e?.message || e);
    await tg.sendMessage(chatId, msg.error());
  }
}

async function handleCommand(
  text: string,
  chatId: number,
  userId: number,
  tg: TelegramAPI,
  env: Env
): Promise<void> {
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1);

  try {
    switch (cmd) {
      case '/알람끔':
        await env.ALARM_KV.put('alarm_muted', '1');
        await tg.sendMessage(chatId, '🔕 알람 전부 껐어. 다시 들으려면 /알람켬');
        return;

      case '/알람켬':
        await env.ALARM_KV.delete('alarm_muted');
        await tg.sendMessage(chatId, '🔔 알람 켰어. 이제 다 알려줄게.');
        return;

      case '/start':
      case '/help':
        await tg.sendMessage(chatId, msg.help());
        return;

      case '/dashboard':
      case '/대쉬보드':
        await tg.sendMessage(
          chatId,
          msg.dashboard(`https://${env.GITHUB_OWNER.toLowerCase()}.github.io/${env.GITHUB_REPO}/`)
        );
        return;

      case '/add': {
        const url = args[0];
        if (!url || !parseGithubUrl(url)) {
          await tg.sendMessage(chatId, msg.addUsage());
          return;
        }
        await addRepoFlow(url, chatId, userId, tg, env);
        return;
      }

      case '/list': {
        const filterCat = args[0];
        const { data } = await getDataFile(env);
        let filtered = data.repos;
        if (filterCat) filtered = filtered.filter((r) => r.category === filterCat);
        if (filtered.length === 0) {
          await tg.sendMessage(chatId, msg.listEmpty(filterCat));
          return;
        }
        const lines = filtered
          .slice(0, 20)
          .map((r) => `• \`${r.id}\` ⭐${r.stars.toLocaleString()} _[${r.category}]_`);
        const header = filterCat
          ? `📂 *${filterCat}* (${filtered.length}개)`
          : `📋 전체 (${filtered.length}개)`;
        const more =
          filtered.length > 20
            ? `\n\n_상위 20개만 표시. 전체는 /dashboard_`
            : '';
        await tg.sendMessage(chatId, `${header}\n\n${lines.join('\n')}${more}`);
        return;
      }

      case '/search': {
        const q = args.join(' ').toLowerCase().trim();
        if (!q) {
          await tg.sendMessage(chatId, msg.searchUsage());
          return;
        }
        const { data } = await getDataFile(env);
        const hits = data.repos.filter((r) => {
          const hay = [
            r.id,
            r.description,
            r.category,
            ...r.tags,
            r.language || '',
          ].join(' ').toLowerCase();
          return hay.includes(q);
        });
        const header = msg.searchHits(hits.length, q);
        if (hits.length === 0) {
          await tg.sendMessage(chatId, header);
          return;
        }
        const lines = hits
          .slice(0, 20)
          .map((r) => `• \`${r.id}\` ⭐${r.stars.toLocaleString()} _[${r.category}]_`);
        await tg.sendMessage(chatId, `${header}\n\n${lines.join('\n')}`);
        return;
      }

      case '/retag': {
        const [rawId, newCat] = args;
        if (!rawId || !newCat) {
          await tg.sendMessage(chatId, msg.retagUsage());
          return;
        }
        const cats = await getCategories(env);
        if (!cats.categories[newCat]) {
          await tg.sendMessage(chatId, msg.noCategory(newCat));
          return;
        }
        const id = rawId.toLowerCase();
        const { data, sha } = await getDataFile(env);
        const repo = data.repos.find((r) => r.id === id);
        if (!repo) {
          await tg.sendMessage(chatId, msg.notFoundInData(rawId));
          return;
        }
        const oldCat = repo.category;
        repo.category = newCat;
        repo.confidence = 1.0;
        repo.classified_by = 'user';
        data.updated_at = new Date().toISOString();
        await putDataFile(env, data, sha, `retag ${id} (${oldCat} → ${newCat})`);
        await tg.sendMessage(chatId, msg.retagged(id, oldCat, newCat));
        return;
      }

      case '/delete': {
        const rawId = args[0];
        if (!rawId) {
          await tg.sendMessage(chatId, msg.deleteUsage());
          return;
        }
        const id = rawId.toLowerCase();
        const { data, sha } = await getDataFile(env);
        const idx = data.repos.findIndex((r) => r.id === id);
        if (idx < 0) {
          await tg.sendMessage(chatId, msg.notFoundInData(rawId));
          return;
        }
        data.repos.splice(idx, 1);
        data.updated_at = new Date().toISOString();
        await putDataFile(env, data, sha, `delete ${id}`);
        await tg.sendMessage(chatId, msg.deleted(id));
        return;
      }

      case '/find':
      case '/찾아': {
        const q = args.join(' ').trim();
        if (!q) {
          await tg.sendMessage(chatId, msg.findUsage());
          return;
        }
        await findFlow(q, chatId, tg, env);
        return;
      }

      case '/digest':
      case '/보고': {
        await tg.sendMessage(chatId, msg.digestStarting());
        await runDigest(env, chatId);
        return;
      }

      case '/prompt':
      case '/p': {
        const promptText = args.join(' ').trim();
        if (!promptText) {
          await tg.sendMessage(chatId, `사용법: \`/prompt 내용\``);
          return;
        }
        await addPromptFlow(promptText, chatId, userId, tg, env);
        return;
      }

      case '/plist': {
        const { data } = await getPromptsFile(env);
        if (data.prompts.length === 0) {
          await tg.sendMessage(chatId, msg.promptListEmpty());
          return;
        }
        await tg.sendMessage(chatId, msg.promptList(data.prompts));
        return;
      }

      case '/pdelete': {
        const pid = args[0];
        if (!pid) {
          await tg.sendMessage(chatId, msg.promptDeleteUsage());
          return;
        }
        const { data, sha } = await getPromptsFile(env);
        const idx = data.prompts.findIndex((p) => p.id === pid);
        if (idx < 0) {
          await tg.sendMessage(chatId, msg.promptNotFound(pid));
          return;
        }
        data.prompts.splice(idx, 1);
        data.updated_at = new Date().toISOString();
        await putPromptsFile(env, data, sha, `delete prompt ${pid}`);
        await tg.sendMessage(chatId, msg.promptDeleted(pid));
        return;
      }

      default:
        await tg.sendMessage(chatId, msg.unknownCommand(cmd));
    }
  } catch (e: any) {
    console.error('handleCommand error', e?.message || e);
    await tg.sendMessage(chatId, msg.error());
  }
}
