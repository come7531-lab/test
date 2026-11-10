// Shared helpers for the 맛집 레이더 API functions.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { getStore } from '@netlify/blobs';

// ---------- keys & settings ----------
// Keys come from Netlify environment variables, or from the in-app setup screen,
// which saves them in this site's private Blobs store (never sent back to the browser).
const CONFIG = {};
let loadedAt = 0;
const LOCAL_FILE = process.env.MATJIP_CONFIG_FILE || '.matjip-config.json';

function configStore() {
  try { return getStore({ name: 'matjip-config', consistency: 'strong' }); } catch { return null; }
}

export async function readConfig() {
  const store = configStore();
  if (store) return (await store.get('config', { type: 'json' })) || {};
  // local dev without Netlify: a git-ignored file
  try { return JSON.parse(await readFile(LOCAL_FILE, 'utf8')); } catch { return {}; }
}

export async function writeConfig(obj) {
  const store = configStore();
  if (store) await store.setJSON('config', obj);
  else await writeFile(LOCAL_FILE, JSON.stringify(obj));
  Object.keys(CONFIG).forEach((k) => delete CONFIG[k]);
  Object.assign(CONFIG, obj);
  loadedAt = Date.now();
}

export async function loadConfig(force = false) {
  if (!force && Date.now() - loadedAt < 30_000) return CONFIG;
  const c = await readConfig().catch(() => ({}));
  Object.keys(CONFIG).forEach((k) => delete CONFIG[k]);
  Object.assign(CONFIG, c);
  loadedAt = Date.now();
  return CONFIG;
}

export const hashCode = (s) => createHash('sha256').update(`matjip:${s}`).digest('hex');

export function envOnly(key) {
  const v = globalThis.Netlify?.env?.get?.(key) ?? process.env[key];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export function env(key) {
  return envOnly(key) ?? (CONFIG[key] ? String(CONFIG[key]) : undefined);
}

// Your own Claude key only. Netlify's AI Gateway injects ANTHROPIC_API_KEY plus
// ANTHROPIC_BASE_URL into every function and bills Netlify credits, so that key is
// ignored unless MATJIP_USE_NETLIFY_AI=true.
export function claudeKey() {
  if (CONFIG.ANTHROPIC_API_KEY) return String(CONFIG.ANTHROPIC_API_KEY);
  const k = envOnly('ANTHROPIC_API_KEY');
  if (!k) return undefined;
  if (envOnly('ANTHROPIC_BASE_URL') && envOnly('MATJIP_USE_NETLIFY_AI') !== 'true') return undefined;
  return k;
}

// A key saved in the app goes straight to Anthropic; an env key uses the env base URL (if any).
export function claudeBaseURL() {
  if (CONFIG.ANTHROPIC_API_KEY) return 'https://api.anthropic.com';
  return envOnly('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com';
}

export function passcodeOk(req) {
  const given = req.headers.get('x-app-key') || '';
  const plain = envOnly('APP_PASSCODE');
  const hash = CONFIG.APP_PASSCODE_HASH;
  if (!plain && !hash) return true;
  return (plain && given === plain) || (hash && hashCode(given) === hash);
}

export function json(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

// Optional passcode so strangers can't spend your API quota.
// Loads saved keys, then checks the app passcode (if one is set).
export async function checkPasscode(req) {
  await loadConfig();
  return passcodeOk(req) ? null : fail('passcode required', 401);
}

// ---------- small concurrency limiter ----------
function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const kakaoLimit = limiter(12);
const naverLimit = limiter(6);

// ---------- Kakao Local API ----------
export async function kakaoGet(path, params) {
  const key = env('KAKAO_REST_KEY');
  if (!key) throw new Error('KAKAO_REST_KEY not set');
  const url = new URL(`https://dapi.kakao.com${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  return kakaoLimit(async () => {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!res.ok) throw new Error(`kakao ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  });
}

// ---------- Naver Search API ----------
export async function naverSearch(kind, params) {
  const id = env('NAVER_CLIENT_ID');
  const secret = env('NAVER_CLIENT_SECRET');
  if (!id || !secret) throw new Error('NAVER keys not set');
  const url = new URL(`https://openapi.naver.com/v1/search/${kind}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return naverLimit(async () => {
    const res = await fetch(url, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
    if (!res.ok) throw new Error(`naver ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  });
}

export function stripTags(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
}

// ---------- geo + categories ----------
export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function mapCategory(name = '', group = '') {
  const n = name;
  if (group === 'CE7' || /카페|디저트|베이커리|제과/.test(n)) return 'cafe';
  if (/육류|고기|갈비|삼겹|곱창|막창|족발|보쌈|오리|닭갈비/.test(n)) return 'meat';
  if (/해물|생선|회|해산물|조개|게,대게|장어|아구/.test(n)) return 'seafood';
  if (/술집|호프|이자카야|포장마차|와인|칵테일|바\b/.test(n)) return 'bar';
  if (/분식|떡볶이|김밥/.test(n)) return 'snack';
  if (/치킨|패스트푸드|햄버거|피자/.test(n)) return 'chicken';
  if (/한식/.test(n)) return 'korean';
  if (/중식|중국/.test(n)) return 'chinese';
  if (/일식|초밥|돈까스|라멘|우동|일본/.test(n)) return 'japanese';
  if (/양식|이탈리안|프랑스|스테이크|파스타|멕시칸|브런치/.test(n)) return 'western';
  if (/아시아|베트남|태국|인도|쌀국수/.test(n)) return 'asian';
  return 'etc';
}

export function areaOf(address = '') {
  const t = address.split(/\s+/);
  const dong = t[2] || t[1] || '';
  return dong.replace(/\d+가$/, '').replace(/\d+동$/, '동');
}

export function normalizePlace(d, center) {
  const p = { lat: Number(d.y), lng: Number(d.x) };
  return {
    id: d.id,
    name: d.place_name,
    category: d.category_name,
    cat: mapCategory(d.category_name, d.category_group_code),
    group: d.category_group_code,
    phone: d.phone || '',
    address: d.address_name || '',
    road: d.road_address_name || '',
    lat: p.lat,
    lng: p.lng,
    url: d.place_url,
    distance: center ? Math.round(haversine(center, p)) : null,
    area: areaOf(d.address_name),
    themes: [],
  };
}

export function num(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
