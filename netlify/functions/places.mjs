// GET /api/places?lat=&lng=&radius=&q=&theme=
// Lists every restaurant (FD6) and cafe (CE7) inside the radius, not only famous ones.
// Kakao returns at most 45 results per query, so busy areas are split into smaller
// rectangles until each piece fits.
import { json, fail, kakaoGet, normalizePlace, haversine, num, checkPasscode } from './_lib.mjs';

const THEMES = {
  parents: { group: 'FD6', queries: ['한정식', '부모님 모시고', '보양식', '코스요리', '한우', '장어'] },
  view: { group: 'CE7', queries: ['뷰 카페', '루프탑 카페', '오션뷰 카페', '리버뷰 카페', '전망 카페', '한강뷰 카페'] },
  pretty: { group: 'CE7', queries: ['감성 카페', '예쁜 카페', '인테리어 카페', '대형 카페', '정원 카페', '베이커리 카페'] },
};

async function geocode(q) {
  const a = await kakaoGet('/v2/local/search/address.json', { query: q, size: 1 });
  if (a.documents?.length) {
    const d = a.documents[0];
    return { lat: Number(d.y), lng: Number(d.x), label: q };
  }
  const k = await kakaoGet('/v2/local/search/keyword.json', { query: q, size: 1 });
  if (k.documents?.length) {
    const d = k.documents[0];
    return { lat: Number(d.y), lng: Number(d.x), label: d.place_name };
  }
  return null;
}

function rectAround(c, r) {
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return [c.lng - dLng, c.lat - dLat, c.lng + dLng, c.lat + dLat];
}

async function collectRect(group, rect, budget, out, depth = 0) {
  if (budget.left <= 0) { budget.truncated = true; return; }
  budget.left--;
  const params = { category_group_code: group, rect: rect.join(','), size: 15 };
  const first = await kakaoGet('/v2/local/search/category.json', { ...params, page: 1 });
  const total = first.meta?.total_count ?? 0;
  if (total > 45 && depth < 4) {
    const [x1, y1, x2, y2] = rect;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const quads = [[x1, y1, mx, my], [mx, y1, x2, my], [x1, my, mx, y2], [mx, my, x2, y2]];
    await Promise.all(quads.map((q) => collectRect(group, q, budget, out, depth + 1)));
    return;
  }
  if (total > 45) budget.truncated = true;
  first.documents.forEach((d) => out.set(d.id, d));
  let meta = first.meta;
  for (let page = 2; !meta.is_end && page <= 3; page++) {
    if (budget.left <= 0) { budget.truncated = true; return; }
    budget.left--;
    const r = await kakaoGet('/v2/local/search/category.json', { ...params, page });
    r.documents.forEach((d) => out.set(d.id, d));
    meta = r.meta;
  }
}

async function themeSearch(theme, center, radius) {
  const t = THEMES[theme];
  const found = new Map();
  await Promise.all(t.queries.map(async (query) => {
    for (let page = 1; page <= 2; page++) {
      const r = await kakaoGet('/v2/local/search/keyword.json', {
        query, x: center.lng, y: center.lat, radius: Math.max(radius, 1500),
        category_group_code: t.group, size: 15, page, sort: 'accuracy',
      });
      r.documents.forEach((d) => found.set(d.id, d));
      if (r.meta.is_end) break;
    }
  }));
  return found;
}

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const radius = num(u.searchParams.get('radius'), 500, 100, 1500);
  const theme = u.searchParams.get('theme');
  try {
    let center;
    const q = u.searchParams.get('q');
    if (q) {
      center = await geocode(q);
      if (!center) return fail('동네를 찾지 못했어요', 404);
    } else {
      const lat = Number(u.searchParams.get('lat'));
      const lng = Number(u.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail('lat/lng 또는 q가 필요해요');
      center = { lat, lng, label: u.searchParams.get('label') || '현재 위치' };
    }

    if (theme) {
      if (!THEMES[theme]) return fail('unknown theme');
      const found = await themeSearch(theme, center, radius);
      const places = [...found.values()].map((d) => {
        const p = normalizePlace(d, center);
        p.themes.push(theme);
        return p;
      }).sort((a, b) => a.distance - b.distance);
      return json({ center, theme, places }, 200, 600);
    }

    const budget = { left: 90, truncated: false };
    const raw = new Map();
    const rect = rectAround(center, radius);
    await Promise.all(['FD6', 'CE7'].map((g) => collectRect(g, rect, budget, raw)));
    const places = [...raw.values()]
      .map((d) => normalizePlace(d, center))
      .filter((p) => haversine(center, p) <= radius * 1.05)
      .sort((a, b) => a.distance - b.distance);
    return json({ center, radius, truncated: budget.truncated, places }, 200, 600);
  } catch (e) {
    return fail(String(e.message || e), 502);
  }
};

export const config = { path: '/api/places' };
