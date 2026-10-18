// GET /api/status -> which API keys are configured (never returns the keys).
import { json, env } from './_lib.mjs';

export default async () => json({
  kakao: !!env('KAKAO_REST_KEY'),
  naver: !!(env('NAVER_CLIENT_ID') && env('NAVER_CLIENT_SECRET')),
  claude: !!env('ANTHROPIC_API_KEY'),
  analyzer: env('ANTHROPIC_API_KEY') ? 'claude' : 'free',
  passcode: !!env('APP_PASSCODE'),
});

export const config = { path: '/api/status' };
