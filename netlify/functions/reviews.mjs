// GET /api/reviews?name=&area=
// Naver blog posts + Naver cafe posts that mention the place.
import { json, fail, naverSearch, stripTags, checkPasscode } from './_lib.mjs';

const AD = /협찬|제공받|원고료|체험단|소정의|광고|지원받아|초대받아/;

function keyName(name) {
  // "스타벅스 성수역점" -> "스타벅스"; keeps long single names as is.
  const parts = name.split(/\s+/).filter((t) => t.length >= 2);
  return (parts[0] || name).replace(/[()]/g, '');
}

function relevant(item, name) {
  const hay = (item.title + item.description).replace(/\s+/g, '');
  return hay.includes(keyName(name).replace(/\s+/g, ''));
}

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const name = (u.searchParams.get('name') || '').slice(0, 60);
  const area = (u.searchParams.get('area') || '').slice(0, 30);
  if (!name) return fail('name required');
  const query = `${area} ${name}`.trim();
  try {
    const [blog, cafe] = await Promise.all([
      naverSearch('blog', { query, display: 30, sort: 'sim' }),
      naverSearch('cafearticle', { query, display: 20, sort: 'sim' }).catch(() => ({ items: [] })),
    ]);
    const clean = (it, source) => {
      const title = stripTags(it.title);
      const description = stripTags(it.description);
      const d = it.postdate || '';
      return {
        source,
        title,
        description,
        link: it.link,
        author: it.bloggername || it.cafename || '',
        date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : '',
        ad: AD.test(title + description),
      };
    };
    const blogs = blog.items.map((it) => clean(it, 'blog')).filter((it) => relevant(it, name)).slice(0, 20);
    const cafes = cafe.items.map((it) => clean(it, 'cafe')).filter((it) => relevant(it, name)).slice(0, 10);
    return json({ query, blog: blogs, cafe: cafes, total: blog.total ?? 0 }, 200, 3600);
  } catch (e) {
    return fail(String(e.message || e), 502);
  }
};

export const config = { path: '/api/reviews' };
