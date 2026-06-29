// asuka 봇 · GitHub 저장소 대시보드
// data.json + categories.json + teams.json → 팀 섹션 렌더 → 필터/정렬

const CATEGORY_EMOJI = {
  '디자인': '🎨',
  'ai-이미지': '🖼️',
  'ai-비디오': '🎬',
  'ai-음성': '🎙️',
  'ai-3d': '🧊',
  'ai-텍스트': '✍️',
  'ai-문서': '📄',
  'ai-생산성': '⚡',
  'ai-api': '🔌',
  'claude-code': '🤖',
  'mcp': '🔗',
  '개발도구': '🛠️',
  '스크래핑': '🕷️',
  '3d-cad': '📐',
  '한국어': '🇰🇷',
  'api리소스': '📚',
  '기타ai': '👾',
  '기타': '📦',
};

const state = {
  repos: [],
  categories: {},
  teams: { workspaces: {} },
  filter: { search: '', category: 'all', workspace: 'all' },
  sort: 'saved_desc',
  collapsed: {},
  mode: 'repos',
  prompts: [],
  promptFilter: { search: '', category: 'all' },
};

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
    const wurl = localStorage.getItem('asuka_workers_url');
    const [dataRes, catRes, teamsRes] = await Promise.all([
      fetch(`./data.json?v=${Date.now()}`),
      fetch(`./categories.json?v=${Date.now()}`),
      fetch(`./teams.json?v=${Date.now()}`),
    ]);

    // Workers URL이 있으면 실시간 API, 없으면 정적 파일 fallback
    let promptsData = { prompts: [] };
    if (wurl) {
      try {
        const res = await fetch(`${wurl}/api/prompts`);
        if (res.ok) promptsData = await res.json();
      } catch (_) {}
    }
    if (!promptsData.prompts?.length) {
      try {
        const res = await fetch(`./prompts.json?v=${Date.now()}`);
        if (res.ok) promptsData = await res.json();
      } catch (_) {}
    }

    const data = await dataRes.json();
    const cats = await catRes.json();
    const teams = await teamsRes.json();
    state.repos = data.repos || [];
    state.categories = cats.categories || {};
    state.teams = teams || { workspaces: {} };
    state.prompts = promptsData.prompts || [];
  } catch (e) {
    console.error('데이터 로드 실패', e);
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-state"><div class="empty-emoji">⚠️</div><div class="empty-title">데이터를 불러올 수 없어</div><div class="empty-sub">data.json 경로를 확인해줘</div></div>';
  }
}

// ===== Prompt Category Emoji =====

const PROMPT_CATEGORY_EMOJI = {
  '글쓰기': '✍️', '코딩': '💻', '분석': '🔍',
  '이미지': '🖼️', '번역': '🌐', '요약': '📄',
  '아이디어': '💡', '기타': '📦',
};

// ===== Prompt Delete API =====

async function deletePrompt(id) {
  let wurl = localStorage.getItem('asuka_workers_url');
  let secret = localStorage.getItem('asuka_workers_secret');
  if (!wurl || !secret) {
    wurl = window.prompt('Workers URL 입력\n예: https://asuka-bot.xxx.workers.dev');
    if (!wurl) return;
    secret = window.prompt('WEBHOOK_SECRET 입력');
    if (!secret) return;
    localStorage.setItem('asuka_workers_url', wurl.replace(/\/$/, ''));
    localStorage.setItem('asuka_workers_secret', secret);
  }
  try {
    const res = await fetch(`${wurl}/api/prompt/delete?id=${encodeURIComponent(id)}&secret=${encodeURIComponent(secret)}`);
    const json = await res.json();
    if (json.ok) {
      state.prompts = state.prompts.filter(p => p.id !== id);
      renderPromptSections();
    } else if (json.error === 'forbidden') {
      // 시크릿 틀렸으면 초기화 후 재시도 유도
      localStorage.removeItem('asuka_workers_secret');
      alert('시크릿이 틀렸어. 다시 시도해줘.');
    } else {
      alert('삭제 실패: ' + (json.error || '알 수 없는 오류'));
    }
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

// ===== Prompt Card HTML =====

function renderPromptCardHtml(p) {
  const emoji = PROMPT_CATEGORY_EMOJI[p.category] || '📦';
  const preview = escapeHtml((p.content || '').slice(0, 120)) + (p.content?.length > 120 ? '…' : '');
  return `
    <article class="card prompt-card" data-content="${escapeHtml(p.content)}" data-id="${escapeHtml(p.id)}">
      <div class="card-top">
        <span class="card-category">${emoji} ${escapeHtml(p.category)}</span>
        <span class="card-stars" style="font-size:0.75rem;opacity:0.6">${formatRelativeKo(p.saved_at)}</span>
      </div>
      <div class="card-name">${escapeHtml(p.title)}</div>
      <div class="card-desc prompt-preview">${preview}</div>
      <div class="card-meta">
        <span class="card-copy-btn" style="background:#f1f3f5;color:#6b7684;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer">복사하기</span>
        <button class="prompt-delete-btn" data-id="${escapeHtml(p.id)}" title="삭제">🗑</button>
      </div>
    </article>
  `;
}

// ===== Prompt Sections Render =====

function renderPromptSections() {
  const main = document.getElementById('mainContent');
  const empty = document.getElementById('emptyState');
  const countEl = document.getElementById('resultCount');
  const chipRow = document.getElementById('categoryChips');

  const q = state.promptFilter.search.trim().toLowerCase();
  const cat = state.promptFilter.category;

  const filtered = state.prompts.filter(p => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (!q) return true;
    return [p.title, p.content, p.category].join(' ').toLowerCase().includes(q);
  });

  // 카테고리 칩
  const counts = {};
  state.prompts.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  const chips = [
    { key: 'all', label: '전체', emoji: '✨', count: state.prompts.length },
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      key: k, label: k, emoji: PROMPT_CATEGORY_EMOJI[k] || '📦', count: v,
    })),
  ];
  chipRow.innerHTML = chips.map(c => `
    <button class="chip ${state.promptFilter.category === c.key ? 'active' : ''}" data-key="${escapeHtml(c.key)}">
      <span class="chip-emoji">${c.emoji}</span>
      <span>${escapeHtml(c.label)}</span>
      <span class="chip-count">${c.count}</span>
    </button>
  `).join('');
  chipRow.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      state.promptFilter.category = el.dataset.key;
      renderPromptSections();
    });
  });

  countEl.textContent = `${filtered.length}개`;

  if (filtered.length === 0) {
    main.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  main.innerHTML = `<div class="card-grid">${filtered.map(renderPromptCardHtml).join('')}</div>`;

  // 복사 버튼
  main.querySelectorAll('.card-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.prompt-card');
      navigator.clipboard.writeText(card.dataset.content).then(() => {
        btn.textContent = '복사됨 ✓';
        setTimeout(() => { btn.textContent = '복사하기'; }, 1500);
      });
    });
  });

  // 삭제 버튼
  main.querySelectorAll('.prompt-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const title = btn.closest('.prompt-card').querySelector('.card-name').textContent;
      if (!confirm(`"${title}" 삭제할까?`)) return;
      deletePrompt(btn.dataset.id);
    });
  });

  // 카드 클릭 → 전체 내용 복사
  main.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.prompt-delete-btn, .card-copy-btn')) return;
      navigator.clipboard.writeText(card.dataset.content).then(() => {
        const nameEl = card.querySelector('.card-name');
        const orig = nameEl.textContent;
        nameEl.textContent = '✓ 복사됨!';
        setTimeout(() => { nameEl.textContent = orig; }, 1500);
      }).catch(() => {});
    });
  });
}

// ===== Filter & Sort =====

function applyFilter(repos) {
  const q = state.filter.search.trim().toLowerCase();
  const cat = state.filter.category;
  const ws = state.filter.workspace;

  let result = repos.filter(r => {
    if (ws !== 'all' && (r.workspace || 'tools') !== ws) return false;
    if (cat !== 'all' && r.category !== cat) return false;
    if (!q) return true;
    const hay = [
      r.id,
      r.name,
      r.owner,
      r.description || '',
      r.category,
      r.workspace || '',
      ...(r.tags || []),
      r.language || '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  switch (state.sort) {
    case 'stars_desc':
      result.sort((a, b) => b.stars - a.stars);
      break;
    case 'stars_asc':
      result.sort((a, b) => a.stars - b.stars);
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
  const tags = (r.tags || [])
    .slice(0, 5)
    .map(t => `<span class="card-tag">#${escapeHtml(t)}</span>`)
    .join('');
  const conf = r.confidence < 0.7
    ? `<span class="card-confidence low">신뢰도 ${(r.confidence * 100).toFixed(0)}%</span>`
    : '';
  return `
    <article class="card" data-url="${escapeHtml(r.url)}">
      <div class="card-top">
        <span class="card-category">${emoji} ${escapeHtml(r.category)}</span>
        <span class="card-stars">⭐ ${formatStars(r.stars)}</span>
      </div>
      <div>
        <div class="card-name">${escapeHtml(r.name)}</div>
        <div class="card-owner">${escapeHtml(r.owner)}</div>
      </div>
      <div class="card-desc">${escapeHtml(r.description) || '설명 없음'}</div>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      <div class="card-meta">
        ${r.language ? `<span class="card-language" data-lang="${escapeHtml(r.language)}">${escapeHtml(r.language)}</span>` : '<span></span>'}
        <span>${formatRelativeKo(r.saved_at)}</span>
      </div>
      ${conf}
    </article>
  `;
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

  // 전체 뷰: 워크스페이스 섹션으로 분리
  if (state.filter.workspace === 'all') {
    const wsOrder = Object.keys(state.teams.workspaces);
    const grouped = {};
    filtered.forEach(r => {
      const ws = r.workspace || 'tools';
      if (!grouped[ws]) grouped[ws] = [];
      grouped[ws].push(r);
    });

    main.innerHTML = wsOrder
      .filter(k => grouped[k]?.length > 0)
      .map(k => {
        const def = state.teams.workspaces[k];
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

  // 카드 클릭 이벤트
  main.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      window.open(el.dataset.url, '_blank', 'noopener');
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
  if (state.mode === 'prompts') {
    document.getElementById('workspaceTabs').hidden = true;
    document.getElementById('sortSelect').closest('.sort-box').hidden = true;
    renderPromptSections();
    return;
  }

  document.getElementById('workspaceTabs').hidden = false;
  document.getElementById('sortSelect').closest('.sort-box').hidden = false;

  const wsFiltered = applyFilter(state.repos);

  // 워크스페이스 탭 (전체 기준 카운트)
  renderWorkspaceTabs();

  // 카테고리 칩 (현재 워크스페이스 내 기준)
  renderChips(wsFiltered);

  // 카드 섹션
  renderSections(wsFiltered);
}

function renderHeaderStats() {
  const total = state.repos.length;
  const totalStars = state.repos.reduce((s, r) => s + (r.stars || 0), 0);
  const promptCount = state.prompts.length;
  document.getElementById('brandStats').textContent =
    `저장소 ${total}개 · ⭐ ${formatStars(totalStars)}${promptCount > 0 ? ` · 프롬프트 ${promptCount}개` : ''}`;
}

// ===== Init =====

function bindEvents() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const sort = document.getElementById('sortSelect');

  // 모드 탭 (저장소 / 프롬프트)
  document.getElementById('modeTabs').querySelectorAll('.mode-tab').forEach(el => {
    el.addEventListener('click', () => {
      state.mode = el.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t === el));
      input.value = '';
      state.filter.search = '';
      state.promptFilter.search = '';
      clearBtn.hidden = true;
      render();
    });
  });

  input.addEventListener('input', () => {
    if (state.mode === 'prompts') {
      state.promptFilter.search = input.value;
    } else {
      state.filter.search = input.value;
    }
    clearBtn.hidden = !input.value;
    render();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.filter.search = '';
    state.promptFilter.search = '';
    clearBtn.hidden = true;
    input.focus();
    render();
  });

  sort.addEventListener('change', () => {
    state.sort = sort.value;
    render();
  });
}

(async function init() {
  await loadData();
  bindEvents();
  renderHeaderStats();
  render();
})();
