// asuka 봇 · GitHub 저장소 대시보드
// data.json + categories.json fetch → 렌더 → 필터/정렬

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
  filter: { search: '', category: 'all' },
  sort: 'saved_desc',
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
    const [dataRes, catRes] = await Promise.all([
      fetch(`./data.json?v=${Date.now()}`),
      fetch(`./categories.json?v=${Date.now()}`),
    ]);
    const data = await dataRes.json();
    const cats = await catRes.json();
    state.repos = data.repos || [];
    state.categories = cats.categories || {};
  } catch (e) {
    console.error('데이터 로드 실패', e);
    document.getElementById('cardGrid').innerHTML =
      '<div class="empty-state"><div class="empty-emoji">⚠️</div><div class="empty-title">데이터를 불러올 수 없어</div><div class="empty-sub">data.json 경로를 확인해줘</div></div>';
  }
}

// ===== Filter & Sort =====

function applyFilter() {
  const q = state.filter.search.trim().toLowerCase();
  const cat = state.filter.category;

  let result = state.repos.filter(r => {
    if (cat !== 'all' && r.category !== cat) return false;
    if (!q) return true;
    const hay = [
      r.id,
      r.name,
      r.owner,
      r.description || '',
      r.category,
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

// ===== Render =====

function renderChips() {
  const chipRow = document.getElementById('categoryChips');
  const counts = {};
  state.repos.forEach(r => {
    counts[r.category] = (counts[r.category] || 0) + 1;
  });

  const sortedCats = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const chips = [
    { key: 'all', label: '전체', emoji: '✨', count: state.repos.length },
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
      renderChips();
      renderCards();
    });
  });
}

function renderCards() {
  const filtered = applyFilter();
  const grid = document.getElementById('cardGrid');
  const empty = document.getElementById('emptyState');
  const countEl = document.getElementById('resultCount');

  countEl.textContent = `${filtered.length}개`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = filtered
    .map(r => {
      const emoji = CATEGORY_EMOJI[r.category] || '📦';
      const desc = r.description || '<span class="card-desc empty">설명 없음</span>';
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
    })
    .join('');

  grid.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      window.open(el.dataset.url, '_blank', 'noopener');
    });
  });
}

function renderHeaderStats() {
  const total = state.repos.length;
  const totalStars = state.repos.reduce((s, r) => s + (r.stars || 0), 0);
  document.getElementById('brandStats').textContent = `${total}개 · ⭐ ${formatStars(totalStars)}`;
}

// ===== Init =====

function bindEvents() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const sort = document.getElementById('sortSelect');

  input.addEventListener('input', () => {
    state.filter.search = input.value;
    clearBtn.hidden = !input.value;
    renderCards();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.filter.search = '';
    clearBtn.hidden = true;
    input.focus();
    renderCards();
  });

  sort.addEventListener('change', () => {
    state.sort = sort.value;
    renderCards();
  });
}

(async function init() {
  await loadData();
  bindEvents();
  renderHeaderStats();
  renderChips();
  renderCards();
})();
