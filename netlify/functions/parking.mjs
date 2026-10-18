// GET /api/parking?lat=&lng=
// Parking lots near a place. Public (공영) lots come first: they are usually the cheapest.
import { json, fail, kakaoGet, normalizePlace, checkPasscode } from './_lib.mjs';

const PUBLIC = /공영|공용|구립|시립|군립|공공|노상|환승/;

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat'));
  const lng = Number(u.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail('lat/lng required');
  try {
    const center = { lat, lng };
    const pages = await Promise.all([1, 2].map((page) =>
      kakaoGet('/v2/local/search/category.json', {
        category_group_code: 'PK6', x: lng, y: lat, radius: 700, sort: 'distance', size: 15, page,
      }).catch(() => ({ documents: [] }))));
    const seen = new Set();
    const lots = pages.flatMap((p) => p.documents)
      .filter((d) => !seen.has(d.id) && seen.add(d.id))
      .map((d) => {
        const p = normalizePlace(d, center);
        return { id: p.id, name: p.name, lat: p.lat, lng: p.lng, distance: p.distance, url: p.url, phone: p.phone, address: p.road || p.address, public: PUBLIC.test(d.place_name) };
      })
      .sort((a, b) => (b.public - a.public) || (a.distance - b.distance))
      .slice(0, 12);
    return json({ lots }, 200, 86400);
  } catch (e) {
    return fail(String(e.message || e), 502);
  }
};

export const config = { path: '/api/parking' };
