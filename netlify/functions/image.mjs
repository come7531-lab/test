// GET /api/image?q=&n=  -> photos for a place or a dish (Naver image search).
// `big` is a sharper version of Naver's thumbnail; the app falls back to `thumb` if it fails.
import { json, fail, naverSearch, checkPasscode, num } from './_lib.mjs';

const bigger = (u = '') => (/type=b\d+/.test(u) ? u.replace(/type=b\d+/, 'type=w773') : u);

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') || '').slice(0, 80);
  const n = num(u.searchParams.get('n'), 1, 1, 20);
  if (!q) return fail('q required');
  try {
    let r = await naverSearch('image', { query: q, display: Math.max(5, n), sort: 'sim', filter: 'large' });
    if ((r.items || []).length < n) r = await naverSearch('image', { query: q, display: Math.max(5, n), sort: 'sim', filter: 'all' });
    const images = (r.items || []).slice(0, n).map((it) => ({
      thumb: it.thumbnail,
      big: bigger(it.thumbnail),
      link: it.link,
      w: Number(it.sizewidth) || null,
      h: Number(it.sizeheight) || null,
    }));
    const first = images[0] || {};
    return json({ thumb: first.thumb || null, big: first.big || null, w: first.w || null, h: first.h || null, images }, 200, 86400);
  } catch (e) {
    return fail(String(e.message || e), 502);
  }
};

export const config = { path: '/api/image' };
