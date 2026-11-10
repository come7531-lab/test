// POST /api/setup  { kakao, naverId, naverSecret, claude, passcode }
// Saves API keys from the in-app setup screen into this site's private Blobs store.
// First save: anyone holding the URL can do it once and must choose a passcode.
// After that: changes need that passcode (x-app-key header). Keys are never returned.
import { json, fail, loadConfig, writeConfig, passcodeOk, hashCode, envOnly } from './_lib.mjs';

const clean = (v, max = 200) => String(v || '').trim().slice(0, max);

async function testKakao(key) {
  const r = await fetch('https://dapi.kakao.com/v2/local/search/address.json?query=%EC%84%B1%EC%88%98%EB%8F%99', { headers: { Authorization: `KakaoAK ${key}` } });
  if (r.ok) return 'ok';
  const t = await r.text();
  return /disabled|NotAuthorizedError|App\(.*\) disabled/i.test(t) ? 'kakaomap-off' : 'bad';
}

async function testNaver(id, secret) {
  const r = await fetch('https://openapi.naver.com/v1/search/blog.json?query=%EB%A7%9B%EC%A7%91&display=1', {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
  });
  return r.ok ? 'ok' : 'bad';
}

export default async (req) => {
  if (req.method !== 'POST') return fail('POST only', 405);
  const config = { ...(await loadConfig(true)) };
  const configured = !!(config.KAKAO_REST_KEY || config.APP_PASSCODE_HASH);
  if (envOnly('KAKAO_REST_KEY')) return fail('이 사이트는 Netlify 환경 변수로 키가 설정돼 있어요.', 409);
  if (configured && !passcodeOk(req)) return fail('비밀번호가 맞지 않아요', 401);

  let body;
  try { body = await req.json(); } catch { return fail('invalid json'); }
  const kakao = clean(body.kakao, 100);
  const naverId = clean(body.naverId, 100);
  const naverSecret = clean(body.naverSecret, 100);
  const claude = clean(body.claude, 300);
  const passcode = clean(body.passcode, 64);

  if (!configured && passcode.length < 4) return fail('앱 비밀번호를 4자 이상으로 정해 주세요');
  if (!configured && !kakao) return fail('카카오 REST API 키가 필요해요');
  if ((naverId && !naverSecret) || (!naverId && naverSecret)) return fail('네이버는 Client ID와 Secret을 둘 다 넣어 주세요');

  const checks = {};
  try {
    if (kakao) checks.kakao = await testKakao(kakao);
    if (naverId) checks.naver = await testNaver(naverId, naverSecret);
  } catch (e) {
    return fail(`키 확인 중 오류: ${e.message}`, 502);
  }
  if (checks.kakao && checks.kakao !== 'ok') {
    return json({ ok: false, checks, error: checks.kakao === 'kakaomap-off' ? '카카오 개발자 사이트에서 카카오맵 사용 설정을 켜 주세요' : '카카오 키가 맞지 않아요' }, 400);
  }
  if (checks.naver && checks.naver !== 'ok') return json({ ok: false, checks, error: '네이버 키가 맞지 않아요. 사용 API에 "검색"이 있는지 확인해 주세요' }, 400);

  if (kakao) config.KAKAO_REST_KEY = kakao;
  if (naverId) { config.NAVER_CLIENT_ID = naverId; config.NAVER_CLIENT_SECRET = naverSecret; }
  if (claude) config.ANTHROPIC_API_KEY = claude;
  if (body.removeClaude) delete config.ANTHROPIC_API_KEY;
  if (passcode) config.APP_PASSCODE_HASH = hashCode(passcode);
  config.updatedAt = new Date().toISOString();

  try {
    await writeConfig(config);
  } catch (e) {
    return fail(`저장하지 못했어요: ${e.message}`, 500);
  }
  return json({ ok: true, checks });
};

export const config = { path: '/api/setup' };
