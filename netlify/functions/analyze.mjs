// POST /api/analyze  { place, reviews: [{source,title,description,date,ad}] }
// Claude reads the review excerpts and returns a score, summary, parking and break time.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { json, fail, env, checkPasscode } from './_lib.mjs';

export const TAGS = ['부모님과', '데이트', '뷰맛집', '감성인테리어', '가성비', '웨이팅있음', '혼밥', '단체모임', '아이동반', '반려동물', '조용함', '노포'];

const pick = (opts) => z.string().describe(`다음 중 하나: ${opts.join(' | ')}`);
const PARKING = ['가능', '유료/제한', '불가', '정보없음'];
const BREAK = ['있음', '없음', '정보없음'];
const CONF = ['높음', '보통', '낮음'];

const Analysis = z.object({
  score: z.number().describe('0.0~5.0, 소수점 한 자리'),
  confidence: pick(CONF),
  one_line: z.string().describe('카드에 들어갈 20자 안팎 한 줄 평'),
  summary: z.string().describe('2~3문장 요약'),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  menus: z.array(z.string()).describe('리뷰에서 자주 언급된 대표 메뉴'),
  parking: z.object({ status: pick(PARKING), detail: z.string() }),
  break_time: z.object({ status: pick(BREAK), detail: z.string().describe('예: 평일 15:00~17:00') }),
  hours: z.string().describe('리뷰에 영업시간이 있으면 적고, 없으면 빈 문자열'),
  tags: z.array(z.string()).describe(`해당하는 것만: ${TAGS.join(', ')}`),
  ad_suspect_count: z.number().int(),
});

// Exact match first; otherwise the longest option contained in the text
// (so '정보없음' wins over '없음' and '불가능' over '가능').
const oneOf = (v, opts, fallback) => {
  const t = String(v || '').trim();
  if (opts.includes(t)) return t;
  if (/불가능/.test(t) && opts.includes('불가')) return '불가';
  return [...opts].sort((a, b) => b.length - a.length).find((o) => t.includes(o)) || fallback;
};

const SYSTEM = `너는 맛집에 아주 진심인 한국 음식 평론가이자 리뷰 분석가다.
주어진 네이버 블로그·카페 리뷰 발췌문만 근거로 식당/카페를 평가한다.

원칙
- 리뷰에 없는 사실은 지어내지 않는다. 근거가 없으면 '정보없음'이라고 쓴다.
- '광고의심' 표시가 있거나 협찬·체험단 냄새가 나는 글은 가중치를 크게 낮춘다.
- 다른 가게 이야기이거나 장소와 무관한 글은 무시한다.
- 점수 기준(5점 만점): 3.0 무난, 3.5 괜찮음, 4.0 확실히 맛있음, 4.5 일부러 찾아갈 만함, 4.8 이상은 극히 드묾.
  근거 리뷰가 5개 미만이면 confidence는 '낮음'이고 점수를 3.5 쪽으로 당긴다.
- 주차: 주차 가능/발렛/전용주차장/주차 불가/근처 공영주차장 이용 같은 언급을 찾는다.
- 브레이크타임: '브레이크타임', '쉬는시간', '15시~17시' 같은 표현을 찾아 시간까지 적는다.
- tags는 리뷰 근거가 있을 때만 붙인다. '부모님과'는 정갈함, 조용함, 좌석 편안함, 부모님·가족 모임 언급이 있을 때.
  '뷰맛집'은 전망·오션뷰·리버뷰·루프탑 언급, '감성인테리어'는 인테리어·사진 맛집 언급이 있을 때.
- 모든 문장은 짧고 담백한 한국어로 쓴다.`;

let client;

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  if (req.method !== 'POST') return fail('POST only', 405);
  if (!env('ANTHROPIC_API_KEY')) return fail('ANTHROPIC_API_KEY not set', 503);

  let body;
  try { body = await req.json(); } catch { return fail('invalid json'); }
  const place = body.place || {};
  const reviews = Array.isArray(body.reviews) ? body.reviews.slice(0, 30) : [];
  if (!place.name) return fail('place.name required');
  if (!reviews.length) return fail('리뷰가 없어 분석할 수 없어요', 422);

  const clip = (s, n) => String(s || '').slice(0, n);
  const lines = reviews.map((r, i) =>
    `[${i + 1} | ${r.source === 'cafe' ? '카페글' : '블로그'} | ${clip(r.date, 10) || '날짜없음'}${r.ad ? ' | 광고의심' : ''}] ${clip(r.title, 120)} — ${clip(r.description, 400)}`);

  const prompt = `장소: ${clip(place.name, 60)}
분류: ${clip(place.category, 80)}
주소: ${clip(place.road || place.address, 100)}

리뷰 발췌 ${lines.length}개:
${lines.join('\n')}

위 리뷰만 근거로 분석해줘.`;

  try {
    client ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 25_000, maxRetries: 1 });
    const res = await client.beta.messages.parse({
      model: env('CLAUDE_MODEL') || 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Analysis) },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') return fail('분석이 거절됐어요', 422);
    const a = res.parsed_output;
    if (!a) return fail('분석 결과를 읽지 못했어요', 502);
    a.score = Math.round(Math.min(5, Math.max(0, Number(a.score) || 0)) * 10) / 10;
    a.confidence = oneOf(a.confidence, CONF, '보통');
    a.parking.status = oneOf(a.parking.status, PARKING, '정보없음');
    a.break_time.status = oneOf(a.break_time.status, BREAK, '정보없음');
    a.tags = [...new Set((a.tags || []).filter((t) => TAGS.includes(t)))];
    a.review_count = reviews.length;
    a.analyzed_at = new Date().toISOString();
    return json({ analysis: a });
  } catch (e) {
    const status = e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500;
    return fail(String(e.message || e), status);
  }
};

export const config = { path: '/api/analyze' };
