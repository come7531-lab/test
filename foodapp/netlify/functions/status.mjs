// GET /api/status -> which keys are set (never returns the keys themselves).
import { json, env, envOnly, loadConfig, claudeKey } from './_lib.mjs';

export default async () => {
  const config = await loadConfig().catch(() => ({}));
  return json({
    kakao: !!env('KAKAO_REST_KEY'),
    naver: !!(env('NAVER_CLIENT_ID') && env('NAVER_CLIENT_SECRET')),
    claude: !!claudeKey(),
    analyzer: claudeKey() ? 'claude' : 'free',
    passcode: !!(envOnly('APP_PASSCODE') || config.APP_PASSCODE_HASH),
    // keys can be entered in the app unless they come from Netlify environment variables
    setup: envOnly('KAKAO_REST_KEY') ? 'netlify-env' : config.KAKAO_REST_KEY ? 'saved' : 'needed',
  });
};

export const config = { path: '/api/status' };
