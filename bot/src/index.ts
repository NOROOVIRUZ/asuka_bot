import type { Env, RepoEntry } from './types';
import { TelegramAPI } from './telegram';
import { fetchRepoMeta, getDataFile, putDataFile, getCategories, parseGithubUrl } from './github';
import { classify } from './classifier';
import { msg } from './i18n';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // 헬스체크 / 루트
    if (req.method === 'GET' || !url.pathname.startsWith('/webhook/')) {
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
    await tg.sendMessage(chatId, msg.helpHint());
    return;
  }

  for (const u of urls) {
    await addRepoFlow(u, chatId, userId, tg, env);
  }
}

function extractGithubUrls(text: string): string[] {
  const re = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?=[\s?#)]|$)/g;
  return [...text.matchAll(re)].map((m) => m[0]);
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

      default:
        await tg.sendMessage(chatId, msg.unknownCommand(cmd));
    }
  } catch (e: any) {
    console.error('handleCommand error', e?.message || e);
    await tg.sendMessage(chatId, msg.error());
  }
}
