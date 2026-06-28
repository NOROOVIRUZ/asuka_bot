import type { Env, RepoEntry, PromptEntry } from './types';
import { TelegramAPI } from './telegram';
import { fetchRepoMeta, getDataFile, putDataFile, getCategories, parseGithubUrl, getPromptsFile, putPromptsFile } from './github';
import { classify } from './classifier';
import { msg } from './i18n';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // 헬스체크 / 루트 / API
    if (req.method === 'GET') {
      if (url.pathname === '/api/prompt/delete') {
        return handlePromptDeleteApi(url, env);
      }
      return new Response('asuka_bot online 🔴', { status: 200 });
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
};

async function handleUpdate(update: any, env: Env): Promise<void> {
  const tg = new TelegramAPI(env);
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
    let title = content.split('\n')[0].slice(0, 40);
    let category = '기타';
    try {
      const aiRes = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: `다음 프롬프트를 분석해서 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만:\n{"title":"한글 20자 이내 제목","category":"글쓰기|코딩|분석|이미지|번역|요약|아이디어|기타 중 하나"}`,
          },
          { role: 'user', content: content.slice(0, 500) },
        ],
      }) as { response: string };
      const parsed = JSON.parse(aiRes.response.trim());
      if (parsed.title) title = String(parsed.title).slice(0, 40);
      if (parsed.category) category = String(parsed.category);
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
      content,
      category,
      saved_at: now,
      added_by: `telegram:${userId}`,
      notes: null,
    };

    data.prompts.unshift(entry);
    data.updated_at = now;
    await putPromptsFile(env, data, sha, `add prompt ${id}`);

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
