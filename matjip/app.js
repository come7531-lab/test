/* 맛집 레이더 — mobile-first restaurant finder. Plain JS, no build step. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CATS = [
    ['all', '전체'], ['korean', '한식'], ['meat', '고기'], ['seafood', '해산물'], ['chinese', '중식'],
    ['japanese', '일식'], ['western', '양식'], ['asian', '아시안'], ['snack', '분식'], ['chicken', '치킨·버거'],
    ['bar', '술집'], ['cafe', '카페·디저트'], ['etc', '기타'],
  ];
  const EMOJI = { korean: '🍚', meat: '🥩', seafood: '🦐', chinese: '🥟', japanese: '🍣', western: '🍝', asian: '🍜', snack: '🍢', chicken: '🍗', bar: '🍶', cafe: '☕', etc: '🍽️' };
  const PASTEL = ['#f3d5c0', '#d8e5cf', '#d3e0ee', '#eed6e4', '#eee2c4', '#dbd5ee', '#cfe7e3'];
  const RATIOS = [0.75, 0.8, 1, 0.66, 0.9, 1.2];
  const THEME_TAG = { parents: '부모님과', view: '뷰맛집', pretty: '감성인테리어' };
  const THEME_HINT = {
    parents: /한정식|한우|장어|오리|보양|갈비|코스|정식|백숙|삼계탕|전복|일식집|가든/,
    view: /루프탑|오션뷰|리버뷰|한강|전망|뷰|테라스|스카이/,
    pretty: /갤러리|가든|정원|온실|아뜰리에|하우스|플라워|베이커리/,
  };
  const PAGE = 40;

  // ---------- storage (best effort) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
  };

  const S = {
    demo: false,
    status: {},
    center: null,
    radius: Number(store.get('mj.radius')) || 500,
    places: [],
    hits: { parents: new Set(), view: new Set(), pretty: new Set() },
    themeLoaded: {},
    cat: 'all',
    theme: null,
    sort: 'dist',
    view: 'grid',
    shown: PAGE,
    analyses: store.get('mj.analyses') || {},
    images: store.get('mj.images') || {},
    open: null,
  };

  // ---------- API ----------
  async function api(path, { method = 'GET', body, timeout = 20000, retry = true } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const headers = { 'content-type': 'application/json' };
    const key = store.get('mj.key');
    if (key) headers['x-app-key'] = key;
    try {
      const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      if (res.status === 401 && retry) {
        const code = prompt('앱 비밀번호를 입력해 주세요');
        if (code) { store.set('mj.key', code); return api(path, { method, body, timeout, retry: false }); }
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } finally { clearTimeout(t); }
  }

  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

  // ---------- helpers ----------
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function dist(m) { return m == null ? '' : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`; }
  function catLabel(k) { return (CATS.find((c) => c[0] === k) || [, '기타'])[1]; }
  function shortCat(p) { const parts = (p.category || '').split('>').map((s) => s.trim()); return parts[parts.length - 1] || catLabel(p.cat); }
  function stars(score) {
    const full = Math.round(score);
    return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }
  function breakShort(a) {
    if (!a || a.break_time.status !== '있음') return '';
    const m = a.break_time.detail.match(/(\d{1,2})[:시]?(\d{2})?\s*[~\-–]\s*(\d{1,2})/);
    return m ? `${m[1]}–${m[3]}시` : '있음';
  }
  function saveAnalyses() {
    const ids = Object.keys(S.analyses);
    if (ids.length > 400) ids.slice(0, ids.length - 400).forEach((id) => delete S.analyses[id]);
    store.set('mj.analyses', S.analyses);
  }

  // ---------- categories ----------
  function renderCats() {
    const counts = {};
    S.places.forEach((p) => { counts[p.cat] = (counts[p.cat] || 0) + 1; });
    $('#cats').innerHTML = CATS
      .filter(([k]) => k === 'all' || counts[k] || !S.places.length)
      .map(([k, label]) => `<button class="cat${S.cat === k ? ' on' : ''}" data-cat="${k}">${label}${S.places.length ? `<em>${k === 'all' ? S.places.length : counts[k] || 0}</em>` : ''}</button>`)
      .join('');
  }

  // ---------- filtering ----------
  function matches(p) {
    if (S.cat !== 'all' && p.cat !== S.cat) return false;
    if (!S.theme) return true;
    const a = S.analyses[p.id];
    if (S.theme === 'parking') return !!a && a.parking.status === '가능';
    const tag = THEME_TAG[S.theme];
    const tagged = !!a && a.tags.includes(tag);
    if (S.theme !== 'parents' && p.cat !== 'cafe' && !tagged) return false;
    if (S.theme === 'parents' && p.cat === 'cafe') return false;
    return tagged || S.hits[S.theme].has(p.id) || THEME_HINT[S.theme].test(`${p.name} ${p.category}`);
  }

  function visible() {
    const list = S.places.filter(matches);
    if (S.sort === 'score') {
      list.sort((x, y) => {
        const a = S.analyses[x.id]; const b = S.analyses[y.id];
        if (a && b) return b.score - a.score || x.distance - y.distance;
        if (a) return -1; if (b) return 1;
        return x.distance - y.distance;
      });
    } else {
      list.sort((x, y) => x.distance - y.distance);
    }
    return list;
  }

  // ---------- grid ----------
  function cardHTML(p) {
    const a = S.analyses[p.id];
    const img = S.images[p.id];
    const ratio = img && img.w && img.h ? Math.min(1.35, Math.max(0.62, img.h / img.w)) : RATIOS[hash(p.id) % RATIOS.length];
    const flags = [];
    if (a?.parking.status === '가능') flags.push('<span class="flag">P 주차</span>');
    const br = breakShort(a);
    if (br) flags.push(`<span class="flag">브레이크 ${esc(br)}</span>`);
    const color = PASTEL[hash(p.id) % PASTEL.length];
    return `<button class="card" data-id="${esc(p.id)}">
      <div class="pic" style="--ar:${(1 / ratio).toFixed(3)};background:${color}">
        ${img?.thumb ? `<img src="${esc(img.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : `<div class="ph">${EMOJI[p.cat] || '🍽️'}</div>`}
        ${a ? `<span class="score${a.confidence === '낮음' ? ' low' : ''}">${a.score.toFixed(1)}</span>` : ''}
        ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
      </div>
      <div class="info">
        <p class="name">${esc(p.name)}</p>
        <div class="meta">${esc(shortCat(p))} · ${dist(p.distance)}</div>
        ${a?.one_line ? `<div class="line">${esc(a.one_line)}</div>` : ''}
      </div>
    </button>`;
  }

  function render() {
    renderCats();
    $$('.theme').forEach((b) => b.classList.toggle('on', b.dataset.theme === S.theme));
    const list = visible();
    const analyzed = list.filter((p) => S.analyses[p.id]).length;
    $('#count').innerHTML = `<b>${list.length}</b>곳${analyzed ? ` · AI 평가 ${analyzed}` : ''}`;
    const empty = $('#empty');
    if (!list.length) {
      empty.hidden = false;
      empty.textContent = S.theme === 'parking'
        ? '아직 주차를 확인한 곳이 없어요. 아래 “보이는 곳 AI 평가”를 눌러 리뷰에서 주차 정보를 찾아보세요.'
        : S.places.length ? '조건에 맞는 곳이 없어요. 반경을 넓혀 보세요.' : '';
    } else empty.hidden = true;

    if (S.view === 'map') {
      $('#grid').hidden = true; $('#more').hidden = true; $('#bigmap').hidden = false;
      renderBigMap(list);
    } else {
      $('#bigmap').hidden = true; $('#grid').hidden = false;
      $('#grid').innerHTML = list.slice(0, S.shown).map(cardHTML).join('');
      $('#more').hidden = list.length <= S.shown;
      observeImages();
    }
    $('#ai-batch').hidden = S.demo || !(S.status.claude && S.status.naver) || !list.some((p) => !S.analyses[p.id]);
  }

  function updateCard(id) {
    const old = $(`.card[data-id="${CSS.escape(id)}"]`);
    const p = S.places.find((x) => x.id === id);
    if (!old || !p) return;
    const t = document.createElement('div');
    t.innerHTML = cardHTML(p);
    old.replaceWith(t.firstElementChild);
    observeImages();
  }

  // ---------- lazy photos ----------
  let io;
  const imgQueue = [];
  let imgActive = 0;
  function observeImages() {
    if (S.demo || !S.status.naver) return;
    io ??= new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const id = e.target.dataset.id;
        if (!(id in S.images)) { imgQueue.push(id); pumpImages(); }
      });
    }, { rootMargin: '300px' });
    $$('.card').forEach((c) => { if (!(c.dataset.id in S.images)) io.observe(c); });
  }
  function pumpImages() {
    while (imgActive < 4 && imgQueue.length) {
      const id = imgQueue.shift();
      const p = S.places.find((x) => x.id === id);
      if (!p || id in S.images) continue;
      imgActive++;
      api(`/api/image?${qs({ q: `${p.area} ${p.name}` })}`)
        .then((r) => { S.images[id] = r.thumb ? r : { thumb: null }; })
        .catch(() => { S.images[id] = { thumb: null }; })
        .finally(() => {
          imgActive--;
          const keys = Object.keys(S.images);
          if (keys.length > 800) keys.slice(0, 200).forEach((k) => delete S.images[k]);
          store.set('mj.images', S.images);
          updateCard(id);
          pumpImages();
        });
    }
  }

  // ---------- maps ----------
  const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
  function tiles() {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    });
  }
  let bigMap; let bigLayer;
  function renderBigMap(list) {
    if (!window.L) { toast('지도를 불러오지 못했어요'); return; }
    if (!bigMap) {
      bigMap = L.map('bigmap', { zoomControl: false, attributionControl: true });
      tiles().addTo(bigMap);
      L.control.zoom({ position: 'bottomright' }).addTo(bigMap);
      bigLayer = L.layerGroup().addTo(bigMap);
    }
    setTimeout(() => bigMap.invalidateSize(), 50);
    bigLayer.clearLayers();
    if (S.center) {
      L.circle([S.center.lat, S.center.lng], { radius: S.radius, color: '#e2402c', weight: 1, fillOpacity: 0.04 }).addTo(bigLayer);
      L.circleMarker([S.center.lat, S.center.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#2f6fd6', fillOpacity: 1 }).addTo(bigLayer);
    }
    list.slice(0, 400).forEach((p) => {
      const a = S.analyses[p.id];
      const label = a ? `★${a.score.toFixed(1)}` : p.name.length > 7 ? `${p.name.slice(0, 7)}…` : p.name;
      const icon = L.divIcon({ className: '', html: `<div class="mk${a && a.score >= 4 ? ' s' : ''}">${esc(label)}</div>`, iconSize: null });
      L.marker([p.lat, p.lng], { icon }).on('click', () => openPlace(p.id)).addTo(bigLayer);
    });
    if (S.center) bigMap.setView([S.center.lat, S.center.lng], S.radius > 900 ? 14 : 15);
  }

  // ---------- loading places ----------
  function skeleton() {
    $('#grid').hidden = false; $('#bigmap').hidden = true;
    $('#grid').innerHTML = Array.from({ length: 8 }, (_, i) => `<div class="card"><div class="pic skeleton" style="--ar:${(1 / RATIOS[i % RATIOS.length]).toFixed(3)}"></div></div>`).join('');
  }

  function mostCommonArea(places) {
    const c = {};
    places.slice(0, 60).forEach((p) => { if (p.area) c[p.area] = (c[p.area] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  async function loadPlaces(params) {
    skeleton();
    $('#where').textContent = '동네 가게를 모두 모으는 중…';
    try {
      const r = await api(`/api/places?${qs({ ...params, radius: S.radius })}`, { timeout: 30000 });
      S.center = r.center;
      S.places = r.places;
      S.hits = { parents: new Set(), view: new Set(), pretty: new Set() };
      S.themeLoaded = {};
      S.shown = PAGE;
      if (S.center.label === '현재 위치') S.center.label = `현재 위치 · ${mostCommonArea(S.places) || ''}`;
      store.set('mj.last', { lat: S.center.lat, lng: S.center.lng, label: S.center.label });
      $('#where').innerHTML = `<b>${esc(S.center.label)}</b> 반경 ${dist(S.radius)} · 음식점·카페 ${S.places.length}곳${r.truncated ? ' (너무 많아 일부만)' : ''}`;
      if (S.theme && S.theme !== 'parking') await loadTheme(S.theme);
      render();
    } catch (e) {
      $('#grid').innerHTML = '';
      $('#where').textContent = '불러오지 못했어요';
      toast(e.message);
    }
  }

  async function loadTheme(theme) {
    if (S.demo || S.themeLoaded[theme] || !S.center) return;
    try {
      const r = await api(`/api/places?${qs({ lat: S.center.lat, lng: S.center.lng, radius: S.radius, theme })}`);
      S.themeLoaded[theme] = true;
      const known = new Map(S.places.map((p) => [p.id, p]));
      r.places.forEach((p) => {
        S.hits[theme].add(p.id);
        if (!known.has(p.id)) S.places.push(p);
      });
    } catch (e) { toast(e.message); }
  }

  function locate(initial) {
    const btn = $('#locate');
    const fallback = () => {
      const last = store.get('mj.last');
      if (last) loadPlaces(last.label?.startsWith('현재 위치') ? { lat: last.lat, lng: last.lng, label: '현재 위치' } : { q: last.label });
      else loadPlaces({ q: '성수동' });
    };
    if (!navigator.geolocation) { if (initial) fallback(); return; }
    btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => { btn.classList.remove('busy'); loadPlaces({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: '현재 위치' }); },
      () => { btn.classList.remove('busy'); if (initial) fallback(); else toast('위치 권한을 허용해 주세요'); },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    );
  }

  function loadDemo() {
    const D = window.DEMO;
    S.center = D.center;
    S.places = D.places.map((p) => ({ ...p }));
    D.places.forEach((p) => { if (p.demo?.analysis) S.analyses[p.id] = p.demo.analysis; (p.demo?.themes || []).forEach((t) => S.hits[t]?.add(p.id)); });
    $('#where').innerHTML = `<b>${esc(D.center.label)}</b> · 샘플 ${S.places.length}곳`;
    render();
  }

  // ---------- AI analysis ----------
  async function fetchReviews(p) {
    if (S.demo) return p.demo?.reviews || { blog: [], cafe: [] };
    return api(`/api/reviews?${qs({ name: p.name, area: p.area })}`);
  }

  async function analyze(p, reviews) {
    const all = [...(reviews.blog || []), ...(reviews.cafe || [])];
    if (!all.length) throw new Error('리뷰가 없어 분석할 수 없어요');
    const r = await api('/api/analyze', {
      method: 'POST', timeout: 60000,
      body: { place: { name: p.name, category: p.category, address: p.address, road: p.road }, reviews: all },
    });
    S.analyses[p.id] = r.analysis;
    saveAnalyses();
    return r.analysis;
  }

  async function batchAnalyze() {
    const btn = $('#ai-batch');
    const todo = visible().filter((p) => !S.analyses[p.id]).slice(0, 10);
    if (!todo.length) return;
    btn.disabled = true;
    let done = 0; let failed = 0;
    const label = $('span', btn);
    label.textContent = `AI가 리뷰 읽는 중 0/${todo.length}`;
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try { await analyze(p, await fetchReviews(p)); updateCard(p.id); } catch { failed++; }
        done++;
        label.textContent = `AI가 리뷰 읽는 중 ${done}/${todo.length}`;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    btn.disabled = false;
    label.textContent = '보이는 곳 AI 평가';
    toast(`${todo.length - failed}곳 평가 완료${failed ? ` · ${failed}곳은 리뷰가 부족했어요` : ''}`);
    render();
  }

  // ---------- detail sheet ----------
  let miniMap;
  function openPlace(id, push = true) {
    const p = S.places.find((x) => x.id === id);
    if (!p) return;
    S.open = p;
    if (push) history.pushState({ sheet: id }, '');
    const a = S.analyses[p.id];
    const nameQ = encodeURIComponent(`${p.area} ${p.name}`.trim());
    const tagQ = encodeURIComponent(p.name.replace(/\s+/g, ''));
    $('#sheet-body').innerHTML = `
      <div class="d-head">
        <div class="d-cat">${esc(p.category || catLabel(p.cat))}${p.distance != null ? ` · ${dist(p.distance)}` : ''}</div>
        <h2 class="d-name">${esc(p.name)}</h2>
        <div class="d-addr">${esc(p.road || p.address)}</div>
        ${S.demo ? '<p class="note">샘플 데이터예요 — 실제 가게가 아니에요.</p>' : ''}
      </div>
      <div id="d-map" class="d-map"></div>
      <div class="d-actions">
        <a href="https://map.naver.com/p/search/${nameQ}" target="_blank" rel="noopener"><span>🟢</span>네이버 평점</a>
        <a href="${esc(p.url || `https://map.kakao.com/?q=${nameQ}`)}" target="_blank" rel="noopener"><span>🟡</span>카카오 평점</a>
        <a href="https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}" target="_blank" rel="noopener"><span>🧭</span>길찾기</a>
        <a href="https://www.instagram.com/explore/tags/${tagQ}/" target="_blank" rel="noopener"><span>📷</span>인스타</a>
        ${p.phone ? `<a href="tel:${esc(p.phone)}"><span>📞</span>전화</a>` : ''}
      </div>
      <div id="d-facts" class="facts">${factsHTML(a)}</div>
      <section id="d-ai" class="box">${a ? aiHTML(a) : '<div class="loading"><span class="dot"></span>리뷰를 모으는 중…</div>'}</section>
      <section class="box"><h3>근처 주차장 <small>공영 우선 · 가까운 순</small></h3><div id="d-lots"><div class="loading"><span class="dot"></span>찾는 중…</div></div></section>
      <section class="box" id="d-reviews"><h3>리뷰</h3><div class="loading"><span class="dot"></span>블로그·카페 글을 찾는 중…</div></section>
    `;
    $('#sheet-backdrop').hidden = false;
    $('#sheet').classList.add('open');
    $('#sheet').setAttribute('aria-hidden', 'false');
    $('#sheet-body').scrollTop = 0;
    document.body.style.overflow = 'hidden';

    setTimeout(() => initMiniMap(p), 260);
    loadLots(p);
    loadReviewsAndAI(p);
  }

  function closeSheet(fromPop) {
    if (!S.open) return;
    S.open = null;
    $('#sheet').classList.remove('open');
    $('#sheet').setAttribute('aria-hidden', 'true');
    $('#sheet-backdrop').hidden = true;
    document.body.style.overflow = '';
    if (!fromPop && history.state?.sheet) history.back();
  }

  function factsHTML(a) {
    const pk = a?.parking; const br = a?.break_time;
    const pkCls = !pk ? '' : pk.status === '가능' ? 'good' : pk.status === '정보없음' ? 'warn' : 'bad';
    const brCls = !br ? '' : br.status === '있음' ? 'warn' : br.status === '없음' ? 'good' : '';
    const pkVal = !pk ? '확인 중' : pk.status === '정보없음' ? '리뷰에 언급 없음' : pk.status;
    const brVal = !br ? '확인 중' : br.status === '있음' ? (br.detail || '있음') : br.status === '없음' ? '없음' : '리뷰에 언급 없음';
    return `
      <div class="fact ${pkCls}"><div class="k">🅿️ 주차</div><div class="v">${esc(pkVal)}</div>${pk?.detail && pk.status !== '정보없음' ? `<div class="s">${esc(pk.detail)}</div>` : pk && pk.status !== '가능' ? '<div class="s">아래 공영주차장을 확인하세요</div>' : ''}</div>
      <div class="fact ${brCls}"><div class="k">⏰ 브레이크타임</div><div class="v">${esc(brVal)}</div>${br && br.status !== '있음' && br.status !== '없음' ? '<div class="s">방문 전 전화로 확인하세요</div>' : a?.hours ? `<div class="s">${esc(a.hours)}</div>` : ''}</div>`;
  }

  function aiHTML(a) {
    const list = (xs) => (xs || []).slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>-</li>';
    return `
      <h3>AI 리뷰 평점 <small>리뷰 ${a.review_count || 0}개 분석${a.ad_suspect_count ? ` · 광고의심 ${a.ad_suspect_count}` : ''}</small></h3>
      <div class="ai-top">
        <div class="ai-score">${a.score.toFixed(1)}<small>/5</small></div>
        <div><div class="stars">${stars(a.score)}</div><div class="ai-sub">신뢰도 ${esc(a.confidence)}</div></div>
      </div>
      <p class="ai-line">“${esc(a.one_line)}”</p>
      <p class="ai-sum">${esc(a.summary)}</p>
      ${a.menus?.length ? `<div class="tags">${a.menus.slice(0, 6).map((m) => `<span class="tag">🍴 ${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="pc"><div class="p"><b>좋아요</b><ul>${list(a.pros)}</ul></div><div class="c"><b>아쉬워요</b><ul>${list(a.cons)}</ul></div></div>
      ${a.tags?.length ? `<div class="tags">${a.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      ${S.demo ? '' : '<p class="note"><button class="btn ghost" data-reanalyze>다시 분석</button></p>'}`;
  }

  function initMiniMap(p) {
    if (!window.L || S.open !== p) return;
    if (miniMap) { miniMap.remove(); miniMap = null; }
    miniMap = L.map('d-map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([p.lat, p.lng], 16);
    tiles().addTo(miniMap);
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [30, 30], iconAnchor: [15, 30] }) }).addTo(miniMap);
    miniMap._lots = L.layerGroup().addTo(miniMap);
    if (p._lots) drawLots(p, p._lots);
  }

  function drawLots(p, lots) {
    if (!miniMap?._lots || S.open !== p) return;
    miniMap._lots.clearLayers();
    lots.forEach((l) => {
      L.marker([l.lat, l.lng], { icon: L.divIcon({ className: '', html: '<div class="pin p"></div>', iconSize: [24, 24], iconAnchor: [12, 24] }) })
        .bindPopup(`<b>${esc(l.name)}</b><br>${l.public ? '공영 · ' : ''}${dist(l.distance)}`)
        .addTo(miniMap._lots);
    });
    if (lots.length) {
      const b = L.latLngBounds([[p.lat, p.lng], ...lots.slice(0, 4).map((l) => [l.lat, l.lng])]);
      miniMap.fitBounds(b, { padding: [24, 24], maxZoom: 17 });
    }
  }

  async function loadLots(p) {
    let lots = [];
    try {
      lots = S.demo ? (p.demo?.lots || []) : (await api(`/api/parking?${qs({ lat: p.lat, lng: p.lng })}`)).lots;
    } catch { /* shown as empty */ }
    p._lots = lots;
    if (S.open !== p) return;
    $('#d-lots').innerHTML = lots.length
      ? `<ul class="lots">${lots.slice(0, 6).map((l) => `
          <li>${l.public ? '<span class="pub">공영</span>' : ''}
            <div class="nm">${esc(l.name)}<small>${dist(l.distance)} · ${esc(l.address || '')}</small></div>
            <a href="${esc(l.url || `https://map.kakao.com/link/to/${encodeURIComponent(l.name)},${l.lat},${l.lng}`)}" target="_blank" rel="noopener">요금·길찾기</a>
          </li>`).join('')}</ul><p class="note">공영주차장이 보통 가장 저렴해요. 요금은 각 주차장 상세에서 확인하세요.</p>`
      : '<p class="note">700m 안에 등록된 주차장이 없어요.</p>';
    drawLots(p, lots);
  }

  async function loadReviewsAndAI(p, force = false) {
    let reviews;
    try {
      reviews = await fetchReviews(p);
    } catch (e) {
      if (S.open === p) {
        $('#d-reviews').innerHTML = `<h3>리뷰</h3><p class="note">${S.status.naver ? esc(e.message) : '네이버 검색 API 키를 넣으면 블로그·카페 리뷰가 보여요.'}</p>`;
        if (!S.analyses[p.id]) $('#d-ai').innerHTML = '<h3>AI 리뷰 평점</h3><p class="note">리뷰를 불러오지 못해 분석할 수 없어요.</p>';
      }
      return;
    }
    if (S.open !== p) return;
    renderReviews(p, reviews);

    if (S.analyses[p.id] && !force) return;
    if (S.demo) return;
    if (!S.status.claude) {
      $('#d-ai').innerHTML = '<h3>AI 리뷰 평점</h3><p class="note">Claude API 키를 넣으면 AI가 리뷰를 읽고 점수·주차·브레이크타임을 정리해 줘요.</p>';
      return;
    }
    $('#d-ai').innerHTML = `<div class="loading"><span class="dot"></span>AI가 리뷰 ${(reviews.blog?.length || 0) + (reviews.cafe?.length || 0)}개를 읽는 중…</div>`;
    try {
      const a = await analyze(p, reviews);
      if (S.open !== p) return;
      $('#d-ai').innerHTML = aiHTML(a);
      $('#d-facts').innerHTML = factsHTML(a);
      updateCard(p.id);
    } catch (e) {
      if (S.open === p) $('#d-ai').innerHTML = `<h3>AI 리뷰 평점</h3><p class="note">${esc(e.message)}</p>`;
    }
  }

  function renderReviews(p, r) {
    const blog = r.blog || []; const cafe = r.cafe || [];
    const item = (x) => `<a class="rv" href="${esc(x.link || '#')}" target="_blank" rel="noopener">
        <div class="t">${esc(x.title)}</div>
        <div class="d">${esc(x.description)}</div>
        <div class="m">${esc(x.author)}${x.date ? ` · ${esc(x.date)}` : ''}${x.ad ? ' · <span class="ad">광고의심</span>' : ''}</div>
      </a>`;
    const box = $('#d-reviews');
    const show = (which) => {
      const xs = which === 'cafe' ? cafe : blog;
      box.innerHTML = `<h3>리뷰 <small>네이버 블로그·카페</small></h3>
        <div class="tabs"><button data-rt="blog" class="${which === 'blog' ? 'on' : ''}">블로그 ${blog.length}</button><button data-rt="cafe" class="${which === 'cafe' ? 'on' : ''}">카페 ${cafe.length}</button></div>
        ${xs.length ? xs.map(item).join('') : '<p class="note">찾은 글이 없어요.</p>'}
        <p class="note"><a href="https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${p.area} ${p.name}`)}" target="_blank" rel="noopener">네이버에서 블로그 더 보기 →</a></p>`;
      $$('[data-rt]', box).forEach((b) => b.addEventListener('click', () => show(b.dataset.rt)));
    };
    show(blog.length || !cafe.length ? 'blog' : 'cafe');
  }

  // sheet: swipe down to close
  function bindSwipe() {
    const sheet = $('#sheet'); const body = $('#sheet-body');
    let y0 = null; let dy = 0;
    sheet.addEventListener('touchstart', (e) => {
      if (body.scrollTop > 0 || e.target.closest('#d-map')) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (y0 == null) return;
      sheet.style.transition = ''; sheet.style.transform = '';
      if (dy > 110) closeSheet();
      y0 = null;
    });
  }

  // ---------- events ----------
  function bind() {
    $('#radius').value = String(S.radius);
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#q').value.trim();
      if (!q) return;
      $('#q').blur();
      if (S.demo) { toast('샘플 모드에서는 동네 검색이 안 돼요. API 키를 넣어 주세요.'); return; }
      loadPlaces({ q });
    });
    $('#radius').addEventListener('change', () => {
      S.radius = Number($('#radius').value);
      store.set('mj.radius', S.radius);
      if (!S.demo && S.center) loadPlaces({ lat: S.center.lat, lng: S.center.lng, label: S.center.label });
    });
    $('#locate').addEventListener('click', () => (S.demo ? toast('샘플 모드예요. API 키를 넣으면 현재 위치로 찾아요.') : locate(false)));
    $('#cats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      S.cat = b.dataset.cat; S.shown = PAGE; render();
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    $$('.theme').forEach((b) => b.addEventListener('click', async () => {
      const t = b.dataset.theme;
      S.theme = S.theme === t ? null : t;
      S.shown = PAGE;
      if (S.theme === 'view' || S.theme === 'pretty') S.cat = 'all';
      if (S.theme && S.theme !== 'parking' && !S.demo && !S.themeLoaded[S.theme]) { b.classList.add('on'); skeleton(); await loadTheme(S.theme); }
      render();
    }));
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
      S.sort = b.dataset.sort;
      $$('[data-sort]').forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      S.view = b.dataset.view;
      $$('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    $('#more').addEventListener('click', () => { S.shown += PAGE; render(); });
    $('#grid').addEventListener('click', (e) => { const c = e.target.closest('.card[data-id]'); if (c) openPlace(c.dataset.id); });
    $('#ai-batch').addEventListener('click', batchAnalyze);
    $('#sheet-close').addEventListener('click', () => closeSheet());
    $('#sheet-backdrop').addEventListener('click', () => closeSheet());
    $('#sheet-body').addEventListener('click', (e) => {
      if (e.target.closest('[data-reanalyze]') && S.open) {
        $('#d-ai').innerHTML = '<div class="loading"><span class="dot"></span>다시 분석하는 중…</div>';
        loadReviewsAndAI(S.open, true);
      }
    });
    addEventListener('popstate', () => { if (S.open) closeSheet(true); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    bindSwipe();
  }

  async function init() {
    bind();
    renderCats();
    try { S.status = await api('/api/status', { timeout: 5000, retry: false }); } catch { S.status = {}; }
    S.demo = !S.status.kakao;
    if (S.demo) {
      $('#demo-banner').hidden = false;
      if (!window.DEMO) { $('#where').textContent = 'API 키가 필요해요'; return; }
      loadDemo();
      return;
    }
    locate(true);
  }

  init();
})();
