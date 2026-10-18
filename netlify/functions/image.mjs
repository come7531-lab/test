// GET /api/image?q=  -> one photo thumbnail for a card (Naver image search).
import { json, fail, naverSearch, checkPasscode } from './_lib.mjs';

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const q = (new URL(req.url).searchParams.get('q') || '').slice(0, 80);
  if (!q) return fail('q required');
  try {
    const r = await naverSearch('image', { query: q, display: 5, sort: 'sim', filter: 'medium' });
    const it = r.items?.[0];
    return json({ thumb: it?.thumbnail || null, w: Number(it?.sizewidth) || null, h: Number(it?.sizeheight) || null }, 200, 86400);
  } catch (e) {
    return fail(String(e.message || e), 502);
  }
};

export const config = { path: '/api/image' };
