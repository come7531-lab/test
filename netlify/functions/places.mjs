// GET /api/places
//   ?lat&lng&radius            every restaurant (FD6) and cafe (CE7) in the circle
//   ?q=성수동                   a 동네 in 서울·경기 -> same as above around it
//   ?q=평양냉면[&scope=region]  a food keyword -> near lat/lng, or across all of 서울·경기
//   ?theme=view[&scope=region] theme picks near lat/lng, or across all of 서울·경기
// Kakao returns at most 45 results per query, so busy areas are split into smaller
// rectangles, and region-wide searches run once per 구/시.
import { json, fail, kakaoGet, normalizePlace, haversine, num, checkPasscode } from './_lib.mjs';

const THEMES = {
  parents: { group: 'FD6', queries: ['한정식', '부모님 모시고', '보양식', '코스요리', '한우', '장어'] },
  view: { group: 'CE7', queries: ['뷰 카페', '루프탑 카페', '오션뷰 카페', '리버뷰 카페', '전망 카페', '한강뷰 카페'] },
  pretty: { group: 'CE7', queries: ['감성 카페', '예쁜 카페', '인테리어 카페', '대형 카페', '정원 카페', '베이커리 카페'] },
};

export const REGIONS = [
  ...['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'].map((g) => `서울 ${g}`),
  ...['수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시', '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'].map((g) => `경기 ${g}`),
];
const IN_AREA = /^(서울|경기)/;
const FOOD = new Set(['FD6', 'CE7']);
const SEOUL_HALL = { lat: 37.5663, lng: 126.9779 };

// Turn a search box entry into either a place in 서울·경기 or a food keyword.
async function resolve(q) {
  const a = await kakaoGet('/v2/local/search/address.json', { query: q, size: 10 });
  const addr = a.documents?.find((d) => IN_AREA.test(d.address_name));
  if (addr) return { kind: 'area', center: { lat: Number(addr.y), lng: Number(addr.x), label: q } };
  const k = await kakaoGet('/v2/local/search/keyword.json', { query: q, size: 15 });
  const docs = (k.documents || []).filter((d) => IN_AREA.test(d.address_name));
  const food = docs.filter((d) => FOOD.has(d.category_group_code)).length;
  if (docs.length && food < docs.length / 2) {
    const d = docs.find((x) => !FOOD.has(x.category_group_code)) || docs[0];
    return { kind: 'area', center: { lat: Number(d.y), lng: Number(d.x), label: d.place_name } };
  }
  if (food) return { kind: 'keyword' };
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
  if (total > 45 && depth < 6) {
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

// Keyword search near a point (up to 45 per query).
async function keywordNear(queries, group, center, radius, pages = 2) {
  const found = new Map();
  await Promise.all(queries.map(async (query) => {
    for (let page = 1; page <= pages; page++) {
      const r = await kakaoGet('/v2/local/search/keyword.json', {
        query, x: center.lng, y: center.lat, radius: Math.min(20000, Math.max(radius, 1500)),
        category_group_code: group, size: 15, page, sort: 'accuracy',
      });
      r.documents.forEach((d) => found.set(d.id, d));
      if (r.meta.is_end) break;
    }
  }));
  return found;
}

// Keyword search across every 구 of 서울 and every 시·군 of 경기.
async function keywordRegion(queries, group) {
  const found = new Map();
  const jobs = REGIONS.flatMap((region) => queries.map((q) => `${region} ${q}`));
  await Promise.all(jobs.map(async (query) => {
    const r = await kakaoGet('/v2/local/search/keyword.json', { query, category_group_code: group, size: 15, page: 1, sort: 'accuracy' })
      .catch(() => ({ documents: [] }));
    r.documents.forEach((d) => { if (IN_AREA.test(d.address_name)) found.set(d.id, d); });
  }));
  return found;
}

const toPlaces = (map, center, theme) => [...map.values()]
  .filter((d) => FOOD.has(d.category_group_code))
  .map((d) => { const p = normalizePlace(d, center); if (theme) p.themes.push(theme); return p; })
  .sort((a, b) => a.distance - b.distance);

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const radius = num(u.searchParams.get('radius'), 500, 100, 5000);
  const theme = u.searchParams.get('theme');
  const region = u.searchParams.get('scope') === 'region';
  const q = (u.searchParams.get('q') || '').trim().slice(0, 40);
  const lat = Number(u.searchParams.get('lat'));
  const lng = Number(u.searchParams.get('lng'));
  const here = Number.isFinite(lat) && Number.isFinite(lng) && u.searchParams.get('lat') !== null
    ? { lat, lng, label: u.searchParams.get('label') || '현재 위치' } : null;

  try {
    if (theme) {
      if (!THEMES[theme]) return fail('unknown theme');
      const t = THEMES[theme];
      if (region) {
        const found = await keywordRegion(t.queries.slice(0, 2), t.group);
        return json({ mode: 'region-theme', theme, center: here || SEOUL_HALL, places: toPlaces(found, here || SEOUL_HALL, theme) }, 200, 3600);
      }
      if (!here) return fail('lat/lng required');
      const found = await keywordNear(t.queries, t.group, here, radius);
      return json({ mode: 'theme', theme, center: here, places: toPlaces(found, here, theme) }, 200, 600);
    }

    let center = here;
    if (q) {
      const r = await resolve(q);
      if (!r) return fail('서울·경기에서 찾지 못했어요', 404);
      if (r.kind === 'keyword') {
        const base = here || SEOUL_HALL;
        const [near, wide] = await Promise.all([
          region ? keywordRegion([q], 'FD6').then(async (m) => { (await keywordRegion([q], 'CE7')).forEach((v, k) => m.set(k, v)); return m; })
            : keywordNear([q], 'FD6', base, Math.max(radius, 3000), 3),
          region ? Promise.resolve(new Map()) : keywordNear([q], 'CE7', base, Math.max(radius, 3000), 1),
        ]);
        wide.forEach((v, k) => near.set(k, v));
        const places = toPlaces(near, base).filter((p) => IN_AREA.test(p.address));
        return json({ mode: region ? 'region-keyword' : 'keyword', keyword: q, center: base, places }, 200, 600);
      }
      center = r.center;
    }
    if (!center) return fail('lat/lng 또는 q가 필요해요');

    const budget = { left: radius > 1500 ? 220 : 120, truncated: false };
    const raw = new Map();
    const rect = rectAround(center, radius);
    await Promise.all(['FD6', 'CE7'].map((g) => collectRect(g, rect, budget, raw)));
    const places = [...raw.values()]
      .map((d) => normalizePlace(d, center))
      .filter((p) => haversine(center, p) <= radius * 1.05)
      .sort((a, b) => a.distance - b.distance);
    return json({ mode: 'area', center, radius, truncated: budget.truncated, places }, 200, 600);
  } catch (e) {
    return fail(String(e.message || e), 502);
  }
};

export const config = { path: '/api/places' };
