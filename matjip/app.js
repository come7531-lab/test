/* 맛집 레이더 — mobile-first restaurant finder for 서울·경기. Plain JS, no build step. */
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
  const THEME_NAME = { parents: '부모님과 갈 곳', view: '뷰 좋은 카페', pretty: '눈이 즐거운 카페', parking: '주차 편한 곳' };
  const THEME_HINT = {
    parents: /한정식|한우|장어|오리|보양|갈비|코스|정식|백숙|삼계탕|전복|일식집|가든/,
    view: /루프탑|오션뷰|리버뷰|한강|전망|뷰|테라스|스카이/,
    pretty: /갤러리|가든|정원|온실|아뜰리에|하우스|플라워|베이커리/,
  };
  const SEOUL = ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'];
  const GYEONGGI = ['수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시', '남양주시', '화성시', '평택시', '의정부시', '시흥시', '파주시', '김포시', '광명시', '광주시', '군포시', '하남시', '오산시', '이천시', '안성시', '의왕시', '양주시', '구리시', '포천시', '여주시', '동두천시', '과천시', '가평군', '양평군', '연천군'];
  const PAGE = 40;

  // ---------- storage (best effort) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
  };

  const S = {
    demo: false,
    status: {},
    scope: store.get('mj.scope') === 'region' ? 'region' : 'near',
    home: null, // the user's own location (for distances in region-wide results)
    center: null,
    radius: Number(store.get('mj.radius')) || 500,
    places: [], // every place around the current center
    kw: null, // { q, region, places } — food keyword search results
    regionThemes: {}, // theme -> places across 서울·경기
    byId: new Map(),
    hits: { parents: new Set(), view: new Set(), pretty: new Set() },
    themeLoaded: {},
    cat: 'all',
    theme: null,
    sort: 'dist',
    view: 'grid',
    shown: PAGE,
    analyses: store.get('mj.analyses') || {},
    images: store.get('mj.images2') || {},
    gallery: {},
    menuPics: {},
    open: null,
  };

  const remember = (list) => list.forEach((p) => S.byId.set(p.id, p));

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
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('시간이 너무 오래 걸려요. 다시 시도해 주세요.');
      throw e;
    } finally { clearTimeout(t); }
  }

  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

  // ---------- helpers ----------
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function dist(m) { return m == null ? '' : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`; }
  function catLabel(k) { return (CATS.find((c) => c[0] === k) || [, '기타'])[1]; }
  function shortCat(p) { const parts = (p.category || '').split('>').map((s) => s.trim()); return parts[parts.length - 1] || catLabel(p.cat); }
  function stars(score) { const full = Math.round(score); return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full); }
  function regionOf(p) { const t = (p.address || '').split(/\s+/); return t[1] && t[0] !== '서울' ? t[1] : t[1] || ''; }
  function menus(a) {
    return (a?.menus || []).map((m) => (typeof m === 'string' ? { name: m, price: '', note: '' } : m)).filter((m) => m && m.name);
  }
  function haversine(a, b) {
    const R = 6371000; const r = (d) => (d * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
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
    if (ids.length > 600) ids.slice(0, ids.length - 600).forEach((id) => delete S.analyses[id]);
    store.set('mj.analyses', S.analyses);
  }
  function saveImages() {
    const keys = Object.keys(S.images);
    if (keys.length > 800) keys.slice(0, 200).forEach((k) => delete S.images[k]);
    store.set('mj.images2', S.images);
  }

  // Which list is on screen: keyword results, a region-wide theme, or the area around the center.
  function dataset() {
    if (S.kw) return S.kw.places;
    if (S.scope === 'region' && S.regionThemes[S.theme]) return S.regionThemes[S.theme];
    return S.places;
  }

  // ---------- header line ----------
  function renderWhere() {
    const el = $('#where');
    if (S.demo) { el.innerHTML = `<b>${esc(S.center.label)}</b> · 샘플 ${S.places.length}곳`; return; }
    if (S.kw) {
      el.innerHTML = `<b>‘${esc(S.kw.q)}’</b> ${S.kw.region ? '서울·경기 전체' : '내 주변'} ${S.kw.places.length}곳 <button class="x" data-clear-kw>✕ 지우기</button>`;
      return;
    }
    if (S.scope === 'region' && S.regionThemes[S.theme]) {
      el.innerHTML = `<b>서울·경기 전체</b> · ${esc(THEME_NAME[S.theme])} ${S.regionThemes[S.theme].length}곳`;
      return;
    }
    if (!S.center) return;
    el.innerHTML = `<button class="where-btn" data-regions><b>${esc(S.center.label)}</b> ▾</button> 반경 ${dist(S.radius)} · 음식점·카페 ${S.places.length}곳${S.truncated ? ' (너무 많아 일부만)' : ''}`;
  }

  // ---------- categories ----------
  function renderCats() {
    const list = dataset();
    const counts = {};
    list.forEach((p) => { counts[p.cat] = (counts[p.cat] || 0) + 1; });
    $('#cats').innerHTML = CATS
      .filter(([k]) => k === 'all' || counts[k] || !list.length || S.cat === k)
      .map(([k, label]) => `<button class="cat${S.cat === k ? ' on' : ''}" data-cat="${k}">${label}${list.length ? `<em>${k === 'all' ? list.length : counts[k] || 0}</em>` : ''}</button>`)
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
    const list = dataset().filter(matches);
    const d = (p) => p.distance ?? 1e9;
    if (S.sort === 'score') {
      list.sort((x, y) => {
        const a = S.analyses[x.id]; const b = S.analyses[y.id];
        if (a && b) return b.score - a.score || d(x) - d(y);
        if (a) return -1; if (b) return 1;
        return d(x) - d(y);
      });
    } else list.sort((x, y) => d(x) - d(y));
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
    const top = menus(a)[0];
    const src = img?.big || img?.thumb;
    const wide = S.kw || (S.scope === 'region' && S.regionThemes[S.theme]);
    return `<button class="card" data-id="${esc(p.id)}">
      <div class="pic" style="--ar:${(1 / ratio).toFixed(3)};background:${color}">
        ${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="if(this.dataset.f){this.remove()}else{this.dataset.f=1;this.src='${esc(img.thumb || '')}'}">` : `<div class="ph">${EMOJI[p.cat] || '🍽️'}</div>`}
        ${a ? `<span class="score${a.confidence === '낮음' ? ' low' : ''}">${a.score.toFixed(1)}</span>` : ''}
        ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
      </div>
      <div class="info">
        <p class="name">${esc(p.name)}</p>
        ${top ? `<div class="menu1">🍴 ${esc(top.name)}${top.price ? ` <span>${esc(top.price)}</span>` : ''}</div>` : ''}
        <div class="meta">${esc(shortCat(p))}${wide && regionOf(p) ? ` · ${esc(regionOf(p))}` : ''} · ${dist(p.distance)}</div>
        ${a?.one_line ? `<div class="line">${esc(a.one_line)}</div>` : ''}
      </div>
    </button>`;
  }

  function render() {
    renderCats();
    renderWhere();
    $$('.theme').forEach((b) => b.classList.toggle('on', b.dataset.theme === S.theme));
    $$('[data-scope]').forEach((b) => b.classList.toggle('on', b.dataset.scope === S.scope));
    $('#q').placeholder = S.scope === 'region' ? '서울·경기 전체에서 · 평양냉면, 오마카세…' : '동네나 메뉴 · 성수동, 연남동, 평양냉면…';
    const list = visible();
    const analyzed = list.filter((p) => S.analyses[p.id]).length;
    $('#count').innerHTML = `<b>${list.length}</b>곳${analyzed ? ` · 평가 ${analyzed}` : ''}`;
    const empty = $('#empty');
    if (!list.length) {
      empty.hidden = false;
      empty.textContent = S.theme === 'parking'
        ? '아직 주차를 확인한 곳이 없어요. 아래 “보이는 곳 리뷰 평가”를 눌러 리뷰에서 주차 정보를 찾아보세요.'
        : dataset().length ? '조건에 맞는 곳이 없어요. 반경을 넓혀 보세요.' : '';
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
    $('#ai-batch').hidden = S.demo || !S.status.naver || !list.some((p) => !S.analyses[p.id]);
  }

  function updateCard(id) {
    const old = $(`.card[data-id="${CSS.escape(id)}"]`);
    const p = S.byId.get(id);
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
    $$('.card[data-id]').forEach((c) => { if (!(c.dataset.id in S.images)) io.observe(c); });
  }
  function pumpImages() {
    while (imgActive < 4 && imgQueue.length) {
      const id = imgQueue.shift();
      const p = S.byId.get(id);
      if (!p || id in S.images) continue;
      imgActive++;
      api(`/api/image?${qs({ q: `${p.area} ${p.name}` })}`)
        .then((r) => { S.images[id] = r.thumb ? { thumb: r.thumb, big: r.big, w: r.w, h: r.h } : { thumb: null }; })
        .catch(() => { S.images[id] = { thumb: null }; })
        .finally(() => { imgActive--; saveImages(); updateCard(id); pumpImages(); });
    }
  }

  // ---------- maps ----------
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
    const wide = dataset() !== S.places;
    if (S.center && !wide) {
      L.circle([S.center.lat, S.center.lng], { radius: S.radius, color: '#e2402c', weight: 1, fillOpacity: 0.04 }).addTo(bigLayer);
    }
    if (S.home) L.circleMarker([S.home.lat, S.home.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#2f6fd6', fillOpacity: 1 }).addTo(bigLayer);
    const shown = list.slice(0, 500);
    shown.forEach((p) => {
      const a = S.analyses[p.id];
      const label = a ? `★${a.score.toFixed(1)}` : p.name.length > 7 ? `${p.name.slice(0, 7)}…` : p.name;
      const icon = L.divIcon({ className: '', html: `<div class="mk${a && a.score >= 4 ? ' s' : ''}">${esc(label)}</div>`, iconSize: null });
      L.marker([p.lat, p.lng], { icon }).on('click', () => openPlace(p.id)).addTo(bigLayer);
    });
    if (wide && shown.length) bigMap.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
    else if (S.center) bigMap.setView([S.center.lat, S.center.lng], S.radius > 2500 ? 13 : S.radius > 900 ? 14 : 15);
  }

  // ---------- loading ----------
  function skeleton(msg) {
    $('#grid').hidden = false; $('#bigmap').hidden = true; $('#empty').hidden = true;
    $('#grid').innerHTML = Array.from({ length: 8 }, (_, i) => `<div class="card"><div class="pic skeleton" style="--ar:${(1 / RATIOS[i % RATIOS.length]).toFixed(3)}"></div></div>`).join('');
    if (msg) $('#where').textContent = msg;
  }

  function mostCommonArea(places) {
    const c = {};
    places.slice(0, 60).forEach((p) => { if (p.area) c[p.area] = (c[p.area] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  // Distances in region-wide results are measured from the user (or the current center).
  function withDistance(list) {
    const from = S.home || S.center;
    if (from) list.forEach((p) => { p.distance = haversine(from, p); });
    return list;
  }

  async function loadPlaces(params) {
    skeleton(S.radius > 1500 ? '넓은 범위라 조금 걸려요. 가게를 모두 모으는 중…' : '동네 가게를 모두 모으는 중…');
    try {
      const r = await api(`/api/places?${qs({ ...params, radius: S.radius })}`, { timeout: 30000 });
      S.center = r.center;
      S.places = r.places;
      S.truncated = r.truncated;
      S.kw = null;
      S.regionThemes = {};
      S.hits = { parents: new Set(), view: new Set(), pretty: new Set() };
      S.themeLoaded = {};
      S.shown = PAGE;
      remember(S.places);
      if (S.center.label === '현재 위치') S.center.label = `현재 위치 · ${mostCommonArea(S.places) || ''}`;
      store.set('mj.last', { lat: S.center.lat, lng: S.center.lng, label: S.center.label });
      if (S.theme && S.theme !== 'parking') await loadTheme(S.theme);
      render();
    } catch (e) {
      $('#grid').innerHTML = '';
      $('#where').textContent = '불러오지 못했어요';
      toast(e.message);
    }
  }

  // Search box: a 동네 moves the map there; a food word lists matching places.
  async function search(q) {
    const region = S.scope === 'region';
    const from = S.home || S.center;
    skeleton(region ? `서울·경기 전체에서 ‘${q}’ 찾는 중…` : `‘${q}’ 찾는 중…`);
    try {
      const r = await api(`/api/places?${qs({ q, scope: S.scope, radius: S.radius, lat: from?.lat, lng: from?.lng })}`, { timeout: 30000 });
      if (r.mode === 'area') {
        S.center = r.center; S.places = r.places; S.truncated = r.truncated; S.kw = null;
        S.regionThemes = {}; S.hits = { parents: new Set(), view: new Set(), pretty: new Set() }; S.themeLoaded = {};
        if (S.scope === 'region') { S.scope = 'near'; store.set('mj.scope', 'near'); }
        store.set('mj.last', { lat: S.center.lat, lng: S.center.lng, label: S.center.label });
      } else {
        S.kw = { q, region, places: withDistance(r.places) };
        S.cat = 'all';
      }
      remember(r.places);
      S.shown = PAGE;
      render();
      scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      render();
      toast(e.message);
    }
  }

  async function loadTheme(theme) {
    if (S.demo || !S.center) return;
    if (S.scope === 'region') {
      if (S.regionThemes[theme]) return;
      const from = S.home || S.center;
      const r = await api(`/api/places?${qs({ theme, scope: 'region', lat: from.lat, lng: from.lng })}`, { timeout: 30000 });
      S.regionThemes[theme] = withDistance(r.places);
      r.places.forEach((p) => S.hits[theme].add(p.id));
      remember(r.places);
      return;
    }
    if (S.themeLoaded[theme]) return;
    const r = await api(`/api/places?${qs({ lat: S.center.lat, lng: S.center.lng, radius: S.radius, theme })}`);
    S.themeLoaded[theme] = true;
    r.places.forEach((p) => {
      S.hits[theme].add(p.id);
      if (!S.byId.has(p.id) || !S.places.includes(S.byId.get(p.id))) { S.places.push(p); S.byId.set(p.id, p); }
    });
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
      (pos) => {
        btn.classList.remove('busy');
        S.home = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        loadPlaces({ ...S.home, label: '현재 위치' });
      },
      () => { btn.classList.remove('busy'); if (initial) fallback(); else toast('위치 권한을 허용해 주세요'); },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    );
  }

  function loadDemo() {
    const D = window.DEMO;
    S.center = D.center;
    S.places = D.places.map((p) => ({ ...p }));
    remember(S.places);
    D.places.forEach((p) => { if (p.demo?.analysis) S.analyses[p.id] = p.demo.analysis; (p.demo?.themes || []).forEach((t) => S.hits[t]?.add(p.id)); });
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
    label.textContent = `리뷰 읽는 중 0/${todo.length}`;
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try { await analyze(p, await fetchReviews(p)); updateCard(p.id); } catch { failed++; }
        done++;
        label.textContent = `리뷰 읽는 중 ${done}/${todo.length}`;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    btn.disabled = false;
    label.textContent = '보이는 곳 리뷰 평가';
    toast(`${todo.length - failed}곳 평가 완료${failed ? ` · ${failed}곳은 리뷰가 부족했어요` : ''}`);
    render();
  }

  // ---------- sheets ----------
  function showSheet(html, state) {
    $('#sheet-body').innerHTML = html;
    $('#sheet-backdrop').hidden = false;
    $('#sheet').classList.add('open');
    $('#sheet').setAttribute('aria-hidden', 'false');
    $('#sheet-body').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    if (!history.state?.sheet) history.pushState({ sheet: state }, '');
  }

  function closeSheet(fromPop) {
    if (!$('#sheet').classList.contains('open')) return;
    S.open = null;
    $('#sheet').classList.remove('open');
    $('#sheet').setAttribute('aria-hidden', 'true');
    $('#sheet-backdrop').hidden = true;
    document.body.style.overflow = '';
    if (!fromPop && history.state?.sheet) history.back();
  }

  function openRegions() {
    const chips = (prefix, list) => list.map((g) => `<button class="cat" data-region="${esc(`${prefix} ${g}`)}">${esc(g)}</button>`).join('');
    showSheet(`
      <div class="d-head"><h2 class="d-name">어디서 찾을까요?</h2><div class="d-addr">구·시를 고르면 그 중심에서 반경 안의 가게를 모두 보여줘요. 동 이름은 검색창에 입력하세요.</div></div>
      <section class="box"><h3>서울</h3><div class="region-grid">${chips('서울', SEOUL)}</div></section>
      <section class="box"><h3>경기</h3><div class="region-grid">${chips('경기', GYEONGGI)}</div></section>`, 'regions');
  }

  let miniMap;
  function openPlace(id) {
    const p = S.byId.get(id);
    if (!p) return;
    S.open = p;
    const a = S.analyses[p.id];
    const nameQ = encodeURIComponent(`${p.area} ${p.name}`.trim());
    const tagQ = encodeURIComponent(p.name.replace(/\s+/g, ''));
    showSheet(`
      <div id="d-gallery" class="gallery">${galleryHTML(p)}</div>
      <div class="d-head">
        <div class="d-cat">${esc(p.category || catLabel(p.cat))}${p.distance != null ? ` · ${dist(p.distance)}` : ''}</div>
        <h2 class="d-name">${esc(p.name)}</h2>
        <div class="d-addr">${esc(p.road || p.address)}</div>
        ${S.demo ? '<p class="note">샘플 데이터예요 — 실제 가게가 아니에요.</p>' : ''}
      </div>
      <section id="d-menus" class="box menus-box">${menusHTML(p, a)}</section>
      <div id="d-facts" class="facts">${factsHTML(a)}</div>
      <div id="d-map" class="d-map"></div>
      <div class="d-actions">
        <a href="https://map.naver.com/p/search/${nameQ}" target="_blank" rel="noopener"><span>🟢</span>네이버 평점</a>
        <a href="${esc(p.url || `https://map.kakao.com/?q=${nameQ}`)}" target="_blank" rel="noopener"><span>🟡</span>카카오 평점</a>
        <a href="https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}" target="_blank" rel="noopener"><span>🧭</span>길찾기</a>
        <a href="https://www.instagram.com/explore/tags/${tagQ}/" target="_blank" rel="noopener"><span>📷</span>인스타</a>
        ${p.phone ? `<a href="tel:${esc(p.phone)}"><span>📞</span>전화</a>` : ''}
      </div>
      <section id="d-ai" class="box">${a ? aiHTML(a) : '<div class="loading"><span class="dot"></span>리뷰를 모으는 중…</div>'}</section>
      <section class="box"><h3>근처 주차장 <small>공영 우선 · 가까운 순</small></h3><div id="d-lots"><div class="loading"><span class="dot"></span>찾는 중…</div></div></section>
      <section class="box" id="d-reviews"><h3>리뷰</h3><div class="loading"><span class="dot"></span>블로그·카페 글을 찾는 중…</div></section>
    `, id);

    setTimeout(() => initMiniMap(p), 260);
    loadGallery(p);
    if (a) loadMenuPics(p, a);
    loadLots(p);
    loadReviewsAndAI(p);
  }

  // ----- photos in the sheet -----
  function galleryHTML(p) {
    const pics = S.gallery[p.id];
    if (S.demo || !S.status.naver) {
      return `<div class="g-ph" style="background:${PASTEL[hash(p.id) % PASTEL.length]}">${EMOJI[p.cat] || '🍽️'}<small>${S.demo ? '샘플 모드에는 사진이 없어요' : '네이버 키를 넣으면 사진이 보여요'}</small></div>`;
    }
    if (!pics) return '<div class="g-row">' + '<div class="g-item skeleton"></div>'.repeat(3) + '</div>';
    if (!pics.length) return `<div class="g-ph" style="background:${PASTEL[hash(p.id) % PASTEL.length]}">${EMOJI[p.cat] || '🍽️'}<small>사진을 찾지 못했어요</small></div>`;
    return `<div class="g-row">${pics.map((im, i) => `<button class="g-item" data-photo="${i}"><img src="${esc(im.big || im.thumb)}" alt="" loading="${i < 3 ? 'eager' : 'lazy'}" referrerpolicy="no-referrer" onerror="if(this.dataset.f){this.closest('.g-item').remove()}else{this.dataset.f=1;this.src='${esc(im.thumb)}'}"></button>`).join('')}</div>
      <div class="g-count">사진 ${pics.length}장 · 넘겨 보세요</div>`;
  }

  async function loadGallery(p) {
    if (S.demo || !S.status.naver || S.gallery[p.id]) return;
    try {
      const r = await api(`/api/image?${qs({ q: `${p.area} ${p.name}`, n: 12 })}`);
      S.gallery[p.id] = r.images || [];
    } catch { S.gallery[p.id] = []; }
    if (S.open === p) $('#d-gallery').innerHTML = galleryHTML(p);
  }

  function openViewer(p, i) {
    const pics = S.gallery[p.id] || [];
    if (!pics.length) return;
    let k = i;
    const v = $('#viewer');
    const show = () => {
      const im = pics[k];
      $('img', v).src = im.big || im.thumb;
      $('img', v).dataset.thumb = im.thumb;
      $('.v-count', v).textContent = `${k + 1} / ${pics.length}`;
      $('.v-src', v).href = im.link || '#';
    };
    v.hidden = false; show();
    v.onclick = (e) => {
      if (e.target.closest('.v-src')) return;
      if (e.target.closest('.v-close')) { v.hidden = true; return; }
      k = (k + (e.clientX > innerWidth / 2 ? 1 : pics.length - 1)) % pics.length; show();
    };
  }

  // ----- signature menus -----
  function menusHTML(p, a) {
    const list = menus(a);
    if (!a) return '<h3>대표 메뉴</h3><div class="loading"><span class="dot"></span>리뷰에서 대표 메뉴를 찾는 중…</div>';
    if (!list.length) return '<h3>대표 메뉴</h3><p class="note">리뷰에서 메뉴 언급을 찾지 못했어요.</p>';
    const pics = S.menuPics[p.id] || {};
    return `<h3>대표 메뉴 <small>리뷰에서 많이 추천한 순</small></h3>
      <div class="menu-row">${list.map((m, i) => {
        const im = pics[m.name];
        return `<div class="menu-card">
          <div class="m-pic" style="background:${PASTEL[(hash(p.id) + i) % PASTEL.length]}">
            ${im ? `<img src="${esc(im.big || im.thumb)}" alt="" referrerpolicy="no-referrer" onerror="if(this.dataset.f){this.remove()}else{this.dataset.f=1;this.src='${esc(im.thumb)}'}">` : `<span>${EMOJI[p.cat] || '🍽️'}</span>`}
            ${i === 0 ? '<em>BEST</em>' : ''}
          </div>
          <b>${esc(m.name)}</b>
          ${m.price ? `<div class="m-price">${esc(m.price)}</div>` : ''}
          ${m.note ? `<div class="m-note">${esc(m.note)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
  }

  async function loadMenuPics(p, a) {
    if (S.demo || !S.status.naver) return;
    const list = menus(a).slice(0, 5);
    S.menuPics[p.id] ??= {};
    await Promise.all(list.map(async (m) => {
      if (m.name in S.menuPics[p.id]) return;
      try {
        const r = await api(`/api/image?${qs({ q: `${p.name} ${m.name}` })}`);
        S.menuPics[p.id][m.name] = r.thumb ? { thumb: r.thumb, big: r.big } : null;
      } catch { S.menuPics[p.id][m.name] = null; }
    }));
    if (S.open === p) $('#d-menus').innerHTML = menusHTML(p, S.analyses[p.id]);
  }

  // ----- facts, AI box -----
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
      <h3>${a.engine === 'free' ? '리뷰 점수 <span class="engine">무료 키워드 분석</span>' : 'AI 리뷰 평점'} <small>리뷰 ${a.review_count || 0}개${a.ad_suspect_count ? ` · 광고의심 ${a.ad_suspect_count}` : ''}</small></h3>
      <div class="ai-top">
        <div class="ai-score">${a.score.toFixed(1)}<small>/5</small></div>
        <div><div class="stars">${stars(a.score)}</div><div class="ai-sub">신뢰도 ${esc(a.confidence)}</div></div>
      </div>
      <p class="ai-line">“${esc(a.one_line)}”</p>
      <p class="ai-sum">${esc(a.summary)}</p>
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
        if (!S.analyses[p.id]) {
          $('#d-ai').innerHTML = '<h3>AI 리뷰 평점</h3><p class="note">리뷰를 불러오지 못해 분석할 수 없어요.</p>';
          $('#d-menus').innerHTML = '<h3>대표 메뉴</h3><p class="note">리뷰가 있어야 대표 메뉴를 찾을 수 있어요.</p>';
        }
      }
      return;
    }
    if (S.open !== p) return;
    renderReviews(p, reviews);

    if (S.analyses[p.id] && !force) return;
    if (S.demo) return;
    $('#d-ai').innerHTML = `<div class="loading"><span class="dot"></span>${S.status.claude ? 'AI가' : ''} 리뷰 ${(reviews.blog?.length || 0) + (reviews.cafe?.length || 0)}개를 읽는 중…</div>`;
    try {
      const a = await analyze(p, reviews);
      if (S.open !== p) return;
      $('#d-ai').innerHTML = aiHTML(a);
      $('#d-facts').innerHTML = factsHTML(a);
      $('#d-menus').innerHTML = menusHTML(p, a);
      loadMenuPics(p, a);
      updateCard(p.id);
    } catch (e) {
      if (S.open === p) {
        $('#d-ai').innerHTML = `<h3>AI 리뷰 평점</h3><p class="note">${esc(e.message)}</p>`;
        $('#d-menus').innerHTML = '<h3>대표 메뉴</h3><p class="note">분석에 실패했어요.</p>';
      }
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
      if (body.scrollTop > 0 || e.target.closest('#d-map, .g-row, .menu-row')) { y0 = null; return; }
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
    if ($('#radius').value !== String(S.radius)) { S.radius = 500; $('#radius').value = '500'; }
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#q').value.trim();
      if (!q) return;
      $('#q').blur();
      if (S.demo) { toast('샘플 모드에서는 검색이 안 돼요. API 키를 넣어 주세요.'); return; }
      search(q);
    });
    $('#radius').addEventListener('change', () => {
      S.radius = Number($('#radius').value);
      store.set('mj.radius', S.radius);
      if (!S.demo && S.center) loadPlaces({ lat: S.center.lat, lng: S.center.lng, label: S.center.label });
    });
    $$('[data-scope]').forEach((b) => b.addEventListener('click', async () => {
      if (S.scope === b.dataset.scope) return;
      if (S.demo) { toast('샘플 모드에서는 범위를 바꿀 수 없어요.'); return; }
      S.scope = b.dataset.scope;
      store.set('mj.scope', S.scope);
      S.kw = null; S.shown = PAGE;
      if (S.scope === 'region') toast('테마와 메뉴 검색이 서울·경기 전체에서 찾아져요');
      if (S.theme && S.theme !== 'parking') {
        skeleton(S.scope === 'region' ? '서울·경기 전체에서 찾는 중…' : '');
        try { await loadTheme(S.theme); } catch (e) { toast(e.message); }
      }
      render();
    }));
    $('#locate').addEventListener('click', () => (S.demo ? toast('샘플 모드예요. API 키를 넣으면 현재 위치로 찾아요.') : locate(false)));
    $('#where').addEventListener('click', (e) => {
      if (e.target.closest('[data-clear-kw]')) { S.kw = null; S.shown = PAGE; $('#q').value = ''; render(); }
      else if (e.target.closest('[data-regions]') && !S.demo) openRegions();
    });
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
      if (S.theme) S.kw = null;
      if (S.theme === 'view' || S.theme === 'pretty') S.cat = 'all';
      if (S.theme && S.theme !== 'parking' && !S.demo) {
        b.classList.add('on');
        skeleton(S.scope === 'region' ? `서울·경기 전체에서 ${THEME_NAME[t]} 찾는 중…` : '');
        try { await loadTheme(S.theme); } catch (e) { toast(e.message); }
      }
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
      const region = e.target.closest('[data-region]');
      if (region) {
        closeSheet();
        S.kw = null;
        if (S.radius < 1500) { S.radius = 1500; $('#radius').value = '1500'; store.set('mj.radius', S.radius); }
        loadPlaces({ q: region.dataset.region });
        return;
      }
      const photo = e.target.closest('[data-photo]');
      if (photo && S.open) { openViewer(S.open, Number(photo.dataset.photo)); return; }
      if (e.target.closest('[data-reanalyze]') && S.open) {
        $('#d-ai').innerHTML = '<div class="loading"><span class="dot"></span>다시 분석하는 중…</div>';
        loadReviewsAndAI(S.open, true);
      }
    });
    addEventListener('popstate', () => {
      if (!$('#viewer').hidden) { $('#viewer').hidden = true; }
      closeSheet(true);
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#viewer').hidden = true; closeSheet(); } });
    bindSwipe();
  }

  async function init() {
    bind();
    renderCats();
    try { S.status = await api('/api/status', { timeout: 5000, retry: false }); } catch { S.status = {}; }
    S.demo = !S.status.kakao;
    if (S.demo) {
      S.scope = 'near';
      $('#demo-banner').hidden = false;
      if (!window.DEMO) { $('#where').textContent = 'API 키가 필요해요'; return; }
      loadDemo();
      return;
    }
    locate(true);
  }

  init();
})();
