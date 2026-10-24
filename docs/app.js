// asuka 봇 · GitHub 저장소 + 허깅페이스 대시보드
// data.json + hf.json + categories.json + teams.json → 섹션 렌더 → 필터/정렬
// v3.7: 프롬프트 탭 폐지, 허깅페이스 탭 신설 (저장소 탭과 같은 카드·필터·즐겨찾기·설치상태)

const CATEGORY_EMOJI = {
  // v2 체계 (2026-07-30 용도 중심 8종)
  '디자인·UI': '🎨',
  '글쓰기·카피': '✍️',
  '미디어 생성': '🎬',
  '문서·데이터': '📄',
  '리서치·수집': '🔍',
  '에이전트·자동화': '🤖',
  '클로드코드 운영': '🧩',
  '개발도구': '🛠️',
  // v1 잔존 키 (category_v1 표시 대비)
  '디자인': '🎨',
  'ai-이미지': '🖼️',
  'ai-비디오': '🎬',
  'ai-음성': '🎙️',
  'ai-3d': '🧊',
  'ai-텍스트': '✍️',
  'ai-문서': '📄',
  'ai-생산성': '⚡',
  'ai-api': '🔌',
  'cc-스킬': '🧩',
  'cc-저장소': '🤖',
  'mcp': '🔗',
  '개발도구': '🛠️',
  '스크래핑': '🕷️',
  '3d-cad': '📐',
  '한국어': '🇰🇷',
  'api리소스': '📚',
  '기타ai': '👾',
  '기타': '📦',
};

// v3.4: 설치상태 — data.json의 status 필드("설치"/"대기"/"탈락", 없으면 미표시)
const STATUS_META = {
  '설치': { emoji: '✅', label: '설치됨' },
  '대기': { emoji: '⏳', label: '승인 대기' },
  '탈락': { emoji: '🚫', label: '탈락' },
};

// v3.7: 허깅페이스 종류 — 저장소 탭의 워크스페이스 탭 자리에 종류 탭으로 표시
const HF_KINDS = {
  model: { label: '모델', emoji: '🧠' },
  dataset: { label: '데이터셋', emoji: '🗂️' },
  space: { label: '스페이스', emoji: '🚀' },
};

// 허깅페이스 작업 종류(pipeline_tag) 한글 표시
const PIPELINE_KO = {
  'text-generation': '텍스트 생성', 'image-text-to-text': '이미지 이해', 'text-to-image': '이미지 생성',
  'image-to-image': '이미지 편집', 'text-to-video': '영상 생성', 'image-to-video': '이미지→영상',
  'text-to-speech': '음성 합성', 'automatic-speech-recognition': '음성 인식', 'text-to-audio': '오디오 생성',
  'image-to-3d': '이미지→3D', 'text-to-3d': '텍스트→3D', 'feature-extraction': '임베딩',
  'sentence-similarity': '문장 유사도', 'translation': '번역', 'summarization': '요약',
  'image-segmentation': '이미지 분할', 'depth-estimation': '깊이 추정', 'object-detection': '물체 인식',
  'image-to-text': '이미지→텍스트', 'any-to-any': '멀티모달', 'text-classification': '텍스트 분류',
  'image-classification': '이미지 분류', 'mask-generation': '마스크 생성', 'text-ranking': '검색 순위',
};

const isHf = () => state.mode === 'hf';
const items = () => (isHf() ? state.hf : state.repos);
const pop = (r) => (r.stars ?? r.likes ?? 0); // 저장소=별, 허깅페이스=좋아요

const state = {
  repos: [],
  hf: [],
  categories: {},
  teams: { workspaces: {} },
  filter: { search: '', category: 'all', workspace: 'all', kind: 'all', favOnly: false, status: 'all' },
  sort: 'saved_desc',
  collapsed: {},
  mode: 'repos', // 'repos' | 'hf'
};

// ===== Favorites (localStorage — 이 브라우저에만 저장) =====

const FAVS_KEY = 'asuka_favs';
const favs = new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'));

function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  localStorage.setItem(FAVS_KEY, JSON.stringify([...favs]));
}

// ===== Utilities =====

function formatStars(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatRelativeKo(iso) {
  const now = new Date();
  const then = new Date(iso);
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== Fetch =====

async function loadData() {
  try {
    const [dataRes, catRes, teamsRes, hfRes] = await Promise.all([
      fetch(`./data.json?v=${Date.now()}`),
      fetch(`./categories.json?v=${Date.now()}`),
      fetch(`./teams.json?v=${Date.now()}`),
      fetch(`./hf.json?v=${Date.now()}`).catch(() => null),
    ]);

    const data = await dataRes.json();
    const cats = await catRes.json();
    const teams = await teamsRes.json();
    state.repos = data.repos || [];
    state.categories = cats.categories || {};
    state.teams = teams || { workspaces: {} };
    // hf.json은 첫 허깅페이스 저장 때 봇이 만든다 — 없으면 빈 목록
    state.hf = hfRes && hfRes.ok ? ((await hfRes.json()).items || []) : [];
  } catch (e) {
    console.error('데이터 로드 실패', e);
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-state"><div class="empty-emoji">⚠️</div><div class="empty-title">데이터를 불러올 수 없어</div><div class="empty-sub">data.json 경로를 확인해줘</div></div>';
  }
}

// ===== Filter & Sort =====

function applyFilter(repos, ignoreCategory = false) {
  const q = state.filter.search.trim().toLowerCase();
  const cat = state.filter.category;
  const ws = state.filter.workspace;
  const kind = state.filter.kind;

  let result = repos.filter(r => {
    if (state.filter.favOnly && !favs.has(r.id)) return false;
    if (isHf()) {
      if (kind !== 'all' && r.kind !== kind) return false;
    } else if (ws !== 'all' && (r.workspace || 'tools') !== ws) return false;
    if (!ignoreCategory && cat !== 'all' && r.category !== cat) return false;
    if (state.filter.status !== 'all' && r.status !== state.filter.status) return false;
    if (!q) return true;
    const hay = [
      r.id,
      r.name,
      r.owner,
      r.description || '',
      r.desc_ko || '',
      r.category,
      r.workspace || '',
      ...(r.tags || []),
      r.language || '',
      r.status || '',
      r.repo_id || '',
      r.pipeline_tag || '',
      PIPELINE_KO[r.pipeline_tag] || '',
      r.kind ? HF_KINDS[r.kind]?.label || '' : '',
      r.library || '',
      r.sdk || '',
      ...(r.hf_tags || []),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  switch (state.sort) {
    case 'stars_desc':
      result.sort((a, b) => pop(b) - pop(a));
      break;
    case 'stars_asc':
      result.sort((a, b) => pop(a) - pop(b));
      break;
    case 'name_asc':
      result.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      break;
    case 'saved_desc':
    default:
      result.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
  }

  return result;
}

// ===== Card HTML =====

function renderCardHtml(r) {
  const emoji = CATEGORY_EMOJI[r.category] || '📦';
  const st = STATUS_META[r.status];
  const statusBadge = st
    ? `<span class="card-status st-${escapeHtml(r.status)}">${st.emoji} ${st.label}</span>`
    : '';
  const tags = (r.tags || [])
    .slice(0, 5)
    .map(t => `<span class="card-tag">#${escapeHtml(t)}</span>`)
    .join('');
  const conf = r.confidence < 0.7
    ? `<span class="card-confidence low">신뢰도 ${(r.confidence * 100).toFixed(0)}%</span>`
    : '';
  if (r.kind) return renderHfCardHtml(r, emoji, statusBadge, tags, conf);
  return `
    <article class="card" data-url="${escapeHtml(r.url)}">
      <div class="card-top">
        <span class="card-category">${emoji} ${escapeHtml(r.category)}${statusBadge}</span>
        <span class="card-top-right">
          <span class="card-stars">⭐ ${formatStars(r.stars)}</span>
          <button class="card-fav ${favs.has(r.id) ? 'active' : ''}" data-id="${escapeHtml(r.id)}" aria-label="즐겨찾기" aria-pressed="${favs.has(r.id)}">${favs.has(r.id) ? '★' : '☆'}</button>
        </span>
      </div>
      <div>
        <div class="card-name">${escapeHtml(r.name)}</div>
        <div class="card-owner">${escapeHtml(r.owner)}</div>
      </div>
      <div class="card-desc">${escapeHtml(r.desc_ko || r.description) || '설명 없음'}</div>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      <div class="card-meta">
        ${r.language ? `<span class="card-language" data-lang="${escapeHtml(r.language)}">${escapeHtml(r.language)}</span>` : '<span></span>'}
        <span>${formatRelativeKo(r.saved_at)}</span>
      </div>
      ${conf}
    </article>
  `;
}

// v3.7: 허깅페이스 카드 — 별 자리에 좋아요, 언어 자리에 작업 종류, 다운로드 수 추가
function renderHfCardHtml(r, emoji, statusBadge, tags, conf) {
  const k = HF_KINDS[r.kind] || { label: r.kind, emoji: '🤗' };
  const task = PIPELINE_KO[r.pipeline_tag] || r.pipeline_tag || r.sdk || '';
  return `
    <article class="card card-hf" data-url="${escapeHtml(r.url)}">
      <div class="card-top">
        <span class="card-category">${emoji} ${escapeHtml(r.category)}${statusBadge}</span>
        <span class="card-top-right">
          <span class="card-stars">♥ ${formatStars(r.likes || 0)}</span>
          <button class="card-fav ${favs.has(r.id) ? 'active' : ''}" data-id="${escapeHtml(r.id)}" aria-label="즐겨찾기" aria-pressed="${favs.has(r.id)}">${favs.has(r.id) ? '★' : '☆'}</button>
        </span>
      </div>
      <div>
        <div class="card-name">${escapeHtml(r.name)}</div>
        <div class="card-owner">${escapeHtml(r.owner)} · <span class="card-kind kind-${escapeHtml(r.kind)}">${k.emoji} ${escapeHtml(k.label)}</span>${r.gated ? ' · 🔒 승인 필요' : ''}</div>
      </div>
      <div class="card-desc">${escapeHtml(r.desc_ko || r.description) || '설명 없음'}</div>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      <div class="card-meta">
        ${task ? `<span class="card-language card-task">${escapeHtml(task)}</span>` : '<span></span>'}
        <span>${r.downloads != null ? `⬇ ${formatStars(r.downloads)} · ` : ''}${formatRelativeKo(r.saved_at)}</span>
      </div>
      ${conf}
    </article>
  `;
}

// v3.7: 허깅페이스 모드의 종류 탭 (워크스페이스 탭 자리 재사용)
function renderKindTabs() {
  const tabBar = document.getElementById('workspaceTabs');
  const filtered = applyFilter(state.hf);
  const counts = {};
  filtered.forEach(r => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const tabs = [
    { key: 'all', label: '전체', emoji: '✨', count: filtered.length },
    ...Object.keys(HF_KINDS).filter(k => counts[k]).map(k => ({ key: k, label: HF_KINDS[k].label, emoji: HF_KINDS[k].emoji, count: counts[k] })),
  ];
  tabBar.innerHTML = tabs.map(t => `
      <button class="ws-tab ${state.filter.kind === t.key ? 'active' : ''}" data-kind="${escapeHtml(t.key)}">
        <span>${t.emoji}</span>
        <span class="ws-tab-label">${escapeHtml(t.label)}</span>
        <span class="ws-tab-count">${t.count}</span>
      </button>
    `).join('');
  tabBar.querySelectorAll('.ws-tab').forEach(el => {
    el.addEventListener('click', () => {
      state.filter.kind = el.dataset.kind;
      render();
    });
  });
}

// ===== Workspace Tabs =====

function renderWorkspaceTabs() {
  const tabBar = document.getElementById('workspaceTabs');
  const filtered = applyFilter(state.repos);
  const allCount = filtered.length;

  const wsCounts = {};
  filtered.forEach(r => {
    const ws = r.workspace || 'tools';
    wsCounts[ws] = (wsCounts[ws] || 0) + 1;
  });

  const wsOrder = Object.keys(state.teams.workspaces);

  const tabs = [
    { key: 'all', label: '전체', emoji: '✨', count: allCount },
    ...wsOrder
      .filter(k => wsCounts[k])
      .map(k => {
        const def = state.teams.workspaces[k];
        return { key: k, label: def.label, emoji: def.emoji, count: wsCounts[k] };
      }),
  ];

  tabBar.innerHTML = tabs
    .map(t => `
      <button class="ws-tab ${state.filter.workspace === t.key ? 'active' : ''}" data-ws="${escapeHtml(t.key)}">
        <span>${t.emoji}</span>
        <span class="ws-tab-label">${escapeHtml(t.label)}</span>
        <span class="ws-tab-count">${t.count}</span>
      </button>
    `)
    .join('');

  tabBar.querySelectorAll('.ws-tab').forEach(el => {
    el.addEventListener('click', () => {
      state.filter.workspace = el.dataset.ws;
      render();
    });
  });
}

// ===== Category Chips =====

function renderChips(repos) {
  const chipRow = document.getElementById('categoryChips');
  const counts = {};
  repos.forEach(r => {
    counts[r.category] = (counts[r.category] || 0) + 1;
  });

  const sortedCats = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const chips = [
    { key: 'all', label: '전체', emoji: '✨', count: repos.length },
    ...sortedCats.map(k => ({
      key: k,
      label: k,
      emoji: CATEGORY_EMOJI[k] || '📦',
      count: counts[k],
    })),
  ];

  chipRow.innerHTML = chips
    .map(c => `
      <button class="chip ${state.filter.category === c.key ? 'active' : ''}" data-key="${escapeHtml(c.key)}">
        <span class="chip-emoji">${c.emoji}</span>
        <span>${escapeHtml(c.label)}</span>
        <span class="chip-count">${c.count}</span>
      </button>
    `)
    .join('');

  chipRow.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      state.filter.category = el.dataset.key;
      render();
    });
  });
}

// v3.4: 설치상태 칩 — 전체 저장소 기준 카운트, 재클릭 시 해제
function renderStatusChips() {
  const chipRow = document.getElementById('statusChips');
  if (!chipRow) return;
  const counts = {};
  items().forEach(r => {
    if (r.status) counts[r.status] = (counts[r.status] || 0) + 1;
  });
  chipRow.innerHTML = Object.keys(STATUS_META)
    .filter(k => counts[k])
    .map(k => `
      <button class="chip chip-status ${state.filter.status === k ? 'active' : ''}" data-status="${escapeHtml(k)}">
        <span class="chip-emoji">${STATUS_META[k].emoji}</span>
        <span>${STATUS_META[k].label}</span>
        <span class="chip-count">${counts[k]}</span>
      </button>
    `)
    .join('');
  chipRow.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      state.filter.status = state.filter.status === el.dataset.status ? 'all' : el.dataset.status;
      render();
    });
  });
}

// ===== Section Render =====

function renderSections(filtered) {
  const main = document.getElementById('mainContent');
  const empty = document.getElementById('emptyState');
  const countEl = document.getElementById('resultCount');

  countEl.textContent = `${filtered.length}개`;

  if (filtered.length === 0) {
    main.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // 전체 뷰: 섹션으로 분리 (저장소=워크스페이스, 허깅페이스=종류)
  const groupAll = isHf() ? state.filter.kind === 'all' : state.filter.workspace === 'all';
  if (groupAll) {
    const groupDefs = isHf() ? HF_KINDS : state.teams.workspaces;
    const wsOrder = Object.keys(groupDefs);
    const grouped = {};
    filtered.forEach(r => {
      const ws = isHf() ? r.kind : (r.workspace || 'tools');
      if (!grouped[ws]) grouped[ws] = [];
      grouped[ws].push(r);
    });

    main.innerHTML = wsOrder
      .filter(k => grouped[k]?.length > 0)
      .map(k => {
        const def = groupDefs[k];
        const repos = grouped[k];
        const isCollapsed = state.collapsed[k] || false;
        return `
          <section class="team-section" data-ws="${escapeHtml(k)}">
            <div class="team-section-header">
              <div class="team-section-title">
                <span class="team-section-emoji">${def.emoji}</span>
                <span class="team-section-name">${escapeHtml(def.label)}</span>
                <span class="team-section-count">${repos.length}</span>
              </div>
              <button class="section-toggle" data-ws="${escapeHtml(k)}" aria-label="섹션 접기/펼치기">
                ${isCollapsed ? '펼치기' : '접기'}
              </button>
            </div>
            <div class="card-grid section-body ${isCollapsed ? 'collapsed' : ''}" id="section-${escapeHtml(k)}">
              ${repos.map(renderCardHtml).join('')}
            </div>
          </section>
        `;
      })
      .join('');
  } else {
    // 특정 워크스페이스 선택: 단일 그리드
    main.innerHTML = `<div class="card-grid">${filtered.map(renderCardHtml).join('')}</div>`;
  }

  // 카드 클릭 이벤트 + 진입 스태거 (상한 12 → 총 500ms 이내)
  main.querySelectorAll('.card').forEach((el, i) => {
    el.style.setProperty('--i', Math.min(i, 12));
    el.addEventListener('click', (e) => {
      if (e.target.closest('.card-fav')) return;
      window.open(el.dataset.url, '_blank', 'noopener');
    });
  });

  // 즐겨찾기 토글 (재렌더 없이 버튼만 갱신 — 카드 위치 유지)
  main.querySelectorAll('.card-fav').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(btn.dataset.id);
      const on = favs.has(btn.dataset.id);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '★' : '☆';
      if (state.filter.favOnly && !on) render();
    });
  });

  // 섹션 접기/펼치기
  main.querySelectorAll('.section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const ws = btn.dataset.ws;
      state.collapsed[ws] = !state.collapsed[ws];
      const body = document.getElementById(`section-${ws}`);
      if (body) {
        body.classList.toggle('collapsed', state.collapsed[ws]);
        btn.textContent = state.collapsed[ws] ? '펼치기' : '접기';
      }
    });
  });
}

// ===== Master Render =====

function render() {
  const wsFiltered = applyFilter(items());

  // 워크스페이스 탭 / 허깅페이스 종류 탭 (전체 기준 카운트)
  if (isHf()) renderKindTabs();
  else renderWorkspaceTabs();

  // 카테고리 칩 — 카테고리 필터는 무시하고 그린다 (v3.32: 칩은 항상 전 카테고리 유지,
  // 선택은 하이라이트만 → '전체' 안 거치고 칩끼리 바로바로 이동)
  renderChips(applyFilter(items(), true));

  // 설치상태 칩 (v3.4)
  renderStatusChips();

  // 카드 섹션
  renderSections(wsFiltered);
}

function renderHeaderStats() {
  const total = state.repos.length;
  const totalStars = state.repos.reduce((s, r) => s + (r.stars || 0), 0);
  const hfCount = state.hf.length;
  document.getElementById('brandStats').textContent =
    `저장소 ${total}개 · ⭐ ${formatStars(totalStars)} · 허깅페이스 ${hfCount}개`;
}

// ===== Init =====

function bindEvents() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const sort = document.getElementById('sortSelect');

  // 모드 탭 (저장소 / 허깅페이스) — 바꾸면 검색·카테고리·상태 필터 초기화
  document.getElementById('modeTabs').querySelectorAll('.mode-tab').forEach(el => {
    el.addEventListener('click', () => {
      if (state.mode === el.dataset.mode) return;
      state.mode = el.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t === el));
      input.value = '';
      state.filter.search = '';
      state.filter.category = 'all';
      state.filter.status = 'all';
      clearBtn.hidden = true;
      applyModeLabels();
      render();
    });
  });

  input.addEventListener('input', () => {
    state.filter.search = input.value;
    clearBtn.hidden = !input.value;
    render();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.filter.search = '';
    clearBtn.hidden = true;
    input.focus();
    render();
  });

  sort.addEventListener('change', () => {
    state.sort = sort.value;
    render();
  });

  const favBtn = document.getElementById('favToggle');
  favBtn.addEventListener('click', () => {
    state.filter.favOnly = !state.filter.favOnly;
    favBtn.classList.toggle('active', state.filter.favOnly);
    favBtn.setAttribute('aria-pressed', String(state.filter.favOnly));
    favBtn.textContent = state.filter.favOnly ? '★ 즐겨찾기' : '☆ 즐겨찾기';
    render();
  });
}

// v3.7: 모드별 검색창 안내·정렬 이름 (별 ↔ 좋아요)
function applyModeLabels() {
  const hf = isHf();
  document.getElementById('searchInput').placeholder = hf ? '모델 · 데이터셋 · 스페이스 검색' : '저장소 · 설명 · 태그 검색';
  const sel = document.getElementById('sortSelect');
  sel.querySelector('option[value="stars_desc"]').textContent = hf ? '♥ 좋아요 많은순' : '⭐ 별 많은순';
  sel.querySelector('option[value="stars_asc"]').textContent = hf ? '♥ 좋아요 적은순' : '⭐ 별 적은순';
}

(async function init() {
  await loadData();
  bindEvents();
  renderHeaderStats();
  render();
})();
