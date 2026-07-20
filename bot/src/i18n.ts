import type { RepoEntry, PromptEntry } from './types';

const fmtStars = (n: number) => n.toLocaleString();
const fmtConf = (c: number) => `${(c * 100).toFixed(0)}%`;

export const msg = {
  help: () =>
    `🔴 *asuka 봇* — 사용법

GitHub URL 아니면 프롬프트로 저장해. GitHub URL 그냥 던지면 알아서 저장해줘.

*저장소 명령어:*
\`/add <url>\` — URL 명시적 추가
\`/list [카테고리]\` — 저장 목록
\`/search <키워드>\` — 검색
\`/retag <repo> <카테고리>\` — 분류 변경
\`/delete <repo>\` — 삭제
\`/dashboard\` \`/대쉬보드\` — 대시보드 URL
\`/find 질문\` \`/찾아 질문\` — 저장한 것 중 AI로 찾기
\`/digest\` \`/보고\` — 주간 보고 지금 받기 (매주 월 09:00 자동)

*프롬프트 명령어:*
\`/prompt 내용\` — 프롬프트 저장
\`/plist\` — 프롬프트 목록
\`/pdelete <id>\` — 프롬프트 삭제

\`/알람끔\` \`/알람켬\` — 모든 봇 알람 스위치
\`/help\` — 이 메시지

흥, 어렵지도 않잖아.`,

  saved: (r: RepoEntry) =>
    `✅ *저장 완료*

\`${r.owner}/${r.name}\`
${r.description || '_설명 없음_'}

📂 *${r.category}*  ⭐ ${fmtStars(r.stars)}  ${r.language || '—'}
신뢰도: ${fmtConf(r.confidence)}

— asuka 🔴`,

  lowConfidence: (r: RepoEntry) =>
    `⚠️ 분류 좀 애매해서 일단 *${r.category}* 에 박아뒀어 (신뢰도 ${fmtConf(r.confidence)}).

\`${r.owner}/${r.name}\`
${r.description || '_설명 없음_'}

맘에 안 들면 \`/retag ${r.id} <카테고리>\` 로 바꿔.`,

  alreadySaved: (r: RepoEntry) =>
    `흥, 이미 저장돼있어.

\`${r.id}\` → *${r.category}*

바꾸고 싶으면 \`/retag ${r.id} <카테고리>\` 써.`,

  notFound: (url: string) =>
    `🤔 그런 저장소 없어.

${url}

URL 다시 확인해줘.`,

  invalidUrl: () =>
    `이게 GitHub URL 맞아? 흥, 다시 확인해줘.

예: \`https://github.com/microsoft/markitdown\``,

  searchHits: (count: number, query: string) =>
    count === 0
      ? `🤔 "${query}" 검색 결과 없어.`
      : `🔍 *"${query}"* — ${count}개 찾았어:`,

  listEmpty: (cat?: string) =>
    cat
      ? `📭 *${cat}* 카테고리에 아무것도 없어.`
      : `📭 아직 아무것도 저장 안 했어.`,

  retagged: (id: string, oldCat: string, newCat: string) =>
    `✅ \`${id}\` 카테고리 바꿨어

${oldCat} → *${newCat}*`,

  noCategory: (cat: string) =>
    `그런 카테고리 없어: \`${cat}\`

\`/help\` 또는 대시보드에서 카테고리 확인해.`,

  notFoundInData: (id: string) =>
    `\`${id}\` 못 찾았어. 정확한 owner/repo 형식이야?`,

  deleted: (id: string) =>
    `🗑 \`${id}\` 삭제했어. 안녕.`,

  dashboard: (url: string) =>
    `🌐 [대시보드 열기](${url})

흥, 거기서 한눈에 봐.`,

  unknownCommand: (cmd: string) =>
    `모르는 명령: \`${cmd}\`

\`/help\` 써.`,

  helpHint: () =>
    `명령어를 모르겠으면 \`/help\` 써. URL이면 그냥 던져도 돼.`,

  error: () =>
    `⚠️ 어... 뭔가 잘못됐어. 다시 시도해봐.`,

  searchUsage: () =>
    `검색어를 입력해줘. 예: \`/search voice\``,

  retagUsage: () =>
    `사용법: \`/retag owner/repo 카테고리\``,

  deleteUsage: () =>
    `사용법: \`/delete owner/repo\``,

  addUsage: () =>
    `사용법: \`/add https://github.com/owner/repo\``,

  promptSaved: (title: string, category: string) =>
    `✅ *프롬프트 저장 완료*\n\n📝 ${title}\n📂 *${category}*\n\n— asuka 🔴`,

  promptAlreadyHint: () =>
    `흥, 이미 GitHub URL이면 저장소로, 아니면 프롬프트로 저장돼. 그게 다야.`,

  promptList: (items: PromptEntry[]) => {
    const lines = items.slice(0, 10).map((p, i) =>
      `${i + 1}. \`${p.id}\` *${p.title}* _[${p.category}]_`
    );
    return `📝 *최근 프롬프트* (${items.length}개)\n\n${lines.join('\n')}`;
  },

  promptListEmpty: () => `📭 저장된 프롬프트 없어.`,

  promptDeleted: (id: string) => `🗑 \`${id}\` 삭제했어.`,

  promptNotFound: (id: string) => `\`${id}\` 못 찾았어.`,

  promptDeleteUsage: () => `사용법: \`/pdelete p_<id>\``,

  promptDuplicate: (title: string) =>
    `흥, 이미 저장된 프롬프트야.\n\n📝 *${title}*\n\n똑같은 거 두 번 넣지 마.`,

  findUsage: () =>
    `뭘 찾는지 말해줘. 예: \`/find PDF 표 뽑는 거\``,

  findResult: (q: string, found: { repo: RepoEntry; reason: string }[]) => {
    if (found.length === 0) {
      return `🤔 "${q}" 에 맞는 건 저장 목록에 없는 것 같아.\n\n키워드 검색 \`/search\` 도 써봐.`;
    }
    const lines = found.map(
      (f, i) =>
        `${i + 1}. \`${f.repo.id}\` ⭐${fmtStars(f.repo.stars)} _[${f.repo.category}]_ [열기](${f.repo.url})\n   ${f.reason}`
    );
    return `🔍 *"${q}"* — 이거 말하는 거지?\n\n${lines.join('\n')}\n\n— asuka 🔴`;
  },

  digestStarting: () =>
    `📡 보고서 만드는 중... 잠깐 기다려. 릴리즈 체크하고 신상 repo까지 훑어올 테니까.`,
};
