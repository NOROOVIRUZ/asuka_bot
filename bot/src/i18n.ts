import type { RepoEntry, HfEntry } from './types';
import { HF_KIND_LABEL } from './hf';

const fmtStars = (n: number) => n.toLocaleString();
const fmtConf = (c: number) => `${(c * 100).toFixed(0)}%`;

export const msg = {
  help: () =>
    `🔴 *asuka 봇* — 사용법

GitHub 저장소 링크나 허깅페이스(모델·데이터셋·스페이스) 링크를 그냥 던지면 알아서 분류해서 저장해줘.

*저장소 명령어:*
\`/add <url>\` — URL 명시적 추가 (깃허브·허깅페이스)
\`/list [카테고리]\` — 저장 목록
\`/search <키워드>\` — 검색
\`/retag <repo> <카테고리>\` — 분류 변경 (허깅페이스는 \`hf:owner/name\`)
\`/delete <repo>\` — 삭제 (허깅페이스는 \`hf:owner/name\`)
\`/dashboard\` \`/대쉬보드\` — 대시보드 URL
\`/find 질문\` \`/찾아 질문\` — 저장한 것 중 AI로 찾기
\`/digest\` \`/보고\` — 주간 보고 지금 받기 (매주 월 09:00 자동, 허깅페이스 포함)

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

  notALink: () =>
    `흥, 깃허브나 허깅페이스 링크만 저장해.

예: \`https://github.com/microsoft/markitdown\`
예: \`https://huggingface.co/openai/gpt-oss-20b\``,

  hfSaved: (r: HfEntry) =>
    `✅ *허깅페이스 저장 완료*

\`${r.repo_id}\` (${HF_KIND_LABEL[r.kind]})
${r.desc_ko || r.description || '_설명 없음_'}

📂 *${r.category}*  ♥ ${fmtStars(r.likes)}${r.downloads != null ? `  ⬇ ${fmtStars(r.downloads)}` : ''}  ${r.pipeline_tag || r.sdk || '—'}
신뢰도: ${fmtConf(r.confidence)}

— asuka 🔴`,

  hfLowConfidence: (r: HfEntry) =>
    `⚠️ 분류 좀 애매해서 일단 *${r.category}* 에 박아뒀어 (신뢰도 ${fmtConf(r.confidence)}).

\`${r.repo_id}\` (${HF_KIND_LABEL[r.kind]})
${r.desc_ko || r.description || '_설명 없음_'}

맘에 안 들면 \`/retag ${r.id} <카테고리>\` 로 바꿔.`,

  hfAlreadySaved: (r: HfEntry) =>
    `흥, 이미 저장돼있어.

\`${r.id}\` → *${r.category}*

바꾸고 싶으면 \`/retag ${r.id} <카테고리>\` 써.`,

  hfNotFound: (url: string) =>
    `🤔 그런 허깅페이스 자료 없어 (비공개일 수도 있어).

${url}

링크 다시 확인해줘.`,

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
