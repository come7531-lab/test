// Free review analysis: keyword and pattern rules, no AI and no cost.
// Rougher than the Claude analysis, but it reads the same review excerpts and
// returns the same shape, so the app shows it the same way.

const POS = [
  [/존맛|JMT|인생\s?맛집|인생\s?\S{1,4}|미쳤|대박/g, 2, '극찬하는 리뷰가 많아요'],
  [/맛있|맛나|맛집 인정|훌륭|완벽|감동|최고/g, 1, '맛있다는 평이 많아요'],
  [/재방문|또 가|또가|또 올|또올|단골/g, 1.5, '재방문 의사가 많아요'],
  [/강추|추천해|추천합|추천드/g, 1, '추천이 많아요'],
  [/친절/g, 1, '친절해요'],
  [/깔끔|청결|정갈/g, 1, '깔끔하고 정갈해요'],
  [/푸짐|양이 많|양 많|넉넉/g, 1, '양이 푸짐해요'],
  [/가성비|저렴|착한 가격|합리적/g, 1, '가성비가 좋아요'],
  [/신선|부드럽|촉촉|바삭|쫄깃|담백|고소/g, 0.7, '식감·재료가 좋다는 평'],
  [/분위기 좋|분위기가 좋|아늑|예쁘|예뻐/g, 0.7, '분위기가 좋아요'],
];
const NEG = [
  [/별로|그닥|그다지|그저 그|평범|무난했/g, 1, '평범하다는 의견'],
  [/실망|기대 이하|다시는|최악|비추/g, 2, '실망했다는 리뷰가 있어요'],
  [/불친절|퉁명|무뚝뚝/g, 1.5, '불친절 언급이 있어요'],
  [/비싸|비싼|가격대가 있|가격이 좀/g, 0.7, '가격대가 있어요'],
  [/짜다|짰|짜서|느끼|비린|싱거|식어/g, 1, '간·맛 아쉬움 언급'],
  [/웨이팅|줄을 서|줄 서|대기가 길|오래 기다/g, 0.3, '웨이팅이 있어요'],
  [/좁|협소|시끄|북적/g, 0.5, '자리가 좁거나 시끄러워요'],
  [/위생|머리카락|벌레/g, 2, '위생 관련 언급'],
];

const TAG_RULES = [
  ['부모님과', /부모님|엄마|아빠|어머니|아버지|어르신|가족\s?모임|효도|생신/],
  ['데이트', /데이트|기념일|남친|여친|남자친구|여자친구/, 2],
  ['뷰맛집', /뷰가|뷰 맛집|뷰맛집|오션뷰|리버뷰|한강뷰|시티뷰|마운틴뷰|전망|야경|루프탑|통창/],
  ['감성인테리어', /인테리어|감성|사진 맛집|포토존|사진이 잘|예쁜 카페|예쁜 공간/, 2],
  ['가성비', /가성비|저렴|착한 가격/],
  ['웨이팅있음', /웨이팅|줄을 서|줄 서|오픈런/],
  ['혼밥', /혼밥|혼자 먹|혼자 가/],
  ['단체모임', /단체|회식|모임|룸이|룸 있/],
  ['아이동반', /아이랑|아이와|아이들|아기|애기|키즈|유모차|아기의자/],
  ['반려동물', /애견|반려견|반려동물|강아지 동반|댕댕/],
  ['조용함', /조용/, 2],
  ['노포', /노포|오래된 집|전통|대를 이어|\d{2}년 된/],
];

const DISH = /(냉면|국밥|국수|칼국수|수제비|만두|곰탕|설렁탕|해장국|순대국|찌개|전골|갈비탕|삼계탕|백숙|비빔밥|덮밥|정식|한정식|보쌈|족발|수육|제육|불고기|갈비|삼겹살|목살|항정살|막창|곱창|대창|닭갈비|닭볶음탕|치킨|짜장면|짬뽕|탕수육|마라탕|딤섬|초밥|스시|사시미|회|오마카세|라멘|우동|소바|돈까스|돈카츠|규동|파스타|리조또|피자|스테이크|버거|샐러드|브런치|쌀국수|팟타이|커리|카레|떡볶이|김밥|라떼|아메리카노|커피|에이드|케이크|케익|타르트|크루아상|소금빵|베이글|스콘|빙수|와플|마카롱|휘낭시에|쿠키|도넛|푸딩)/;
const STOP = /^(진짜|정말|너무|완전|제일|가장|역시|그리고|저는|우리는|메뉴|메뉴는|가격|가격은|이번|오늘|여기|이집|사장님|주문|시킨|먹은|먹었|대표|인기|시그니처|추천|기본|후기|솔직후기|리뷰|방문|내돈내산|맛집|점심|저녁|메뉴판)$/;

function cleanDish(raw) {
  const words = raw.replace(/[^가-힣A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter((w) => w && !STOP.test(w));
  const last = words[words.length - 1] || '';
  // "후기 물냉면" -> "물냉면"; keep two words only when the last one alone isn't a dish ("치즈 돈까스" stays via DISH)
  const tail = DISH.test(last) || words.length < 2 ? last : words.slice(-2).join(' ');
  return tail.length >= 2 && tail.length <= 14 ? tail : '';
}

function findMenus(texts) {
  const count = new Map();
  const price = new Map();
  const add = (name, w, p) => {
    if (!name) return;
    count.set(name, (count.get(name) || 0) + w);
    if (p && !price.has(name)) price.set(name, p);
  };
  for (const t of texts) {
    // "물냉면 15,000원" style
    for (const m of t.matchAll(/([가-힣A-Za-z][가-힣A-Za-z ]{1,14}?)\s*[:(]?\s*(\d{1,3}(?:,\d{3})+|\d{4,6})\s*원/g)) {
      add(cleanDish(m[1]), 2, `${Number(m[2].replace(/,/g, '')).toLocaleString('ko-KR')}원`);
    }
    // any word that ends with a dish name
    for (const m of t.matchAll(new RegExp(`([가-힣A-Za-z]{0,6}${DISH.source})`, 'g'))) {
      const name = cleanDish(m[1]);
      if (name && !STOP.test(name)) add(name, 1);
    }
  }
  // merge "평양냉면" into "냉면" counts etc. by preferring the longer, specific names
  const names = [...count.keys()];
  for (const short of names) {
    const longer = names.find((n) => n !== short && n.endsWith(short) && count.get(n) >= 2);
    if (longer) { count.set(longer, count.get(longer) + count.get(short)); count.delete(short); }
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, c]) => ({ name, price: price.get(name) || '', note: `리뷰 언급 ${Math.round(c)}회` }));
}

function around(text, idx, len = 34) {
  const s = idx;
  return text.slice(s, s + len).replace(/\s+/g, ' ').trim();
}

function findParking(texts) {
  const rules = [
    ['불가', /주차\s?(?:는|가|도|를)?\s?(불가|안\s?돼|안\s?됨|안\s?되|공간(이)?\s?없|할\s?곳(이)?\s?없|어렵|힘들)/],
    ['유료/제한', /발렛|유료\s?주차|주차\s?(요금|비)|공영\s?주차|근처\s?주차장|인근\s?주차장/],
    ['가능', /(무료\s?주차|주차\s?(?:는|가|도)?\s?(가능|무료|편|여유|넉넉)|전용\s?주차|주차장\s?(있|완비|넓)|건물\s?(지하)?\s?주차|\d시간\s?무료)/],
  ];
  const votes = {};
  const detail = {};
  for (const t of texts) {
    for (const [status, re] of rules) {
      const m = t.match(re);
      if (m) {
        votes[status] = (votes[status] || 0) + 1;
        detail[status] ??= around(t, m.index);
      }
    }
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? { status: best[0], detail: detail[best[0]] } : { status: '정보없음', detail: '' };
}

const hm = (h, m) => `${String(Number(h) < 7 && Number(h) > 0 ? Number(h) + 12 : Number(h)).padStart(2, '0')}:${m || '00'}`;

function findBreak(texts) {
  for (const t of texts) {
    if (/브레이크\s?타임\s?(이\s?)?없|브레이크\s?없/.test(t)) return { status: '없음', detail: '' };
    const m = t.match(/(브레이크\s?타임?|쉬는\s?시간|휴게\s?시간)[^0-9]{0,10}(\d{1,2})\s?(?::|시)?\s?(\d{2})?\s?(?:분)?\s?[~\-–부터]+\s?(\d{1,2})\s?(?::|시)?\s?(\d{2})?/);
    if (m) return { status: '있음', detail: `${hm(m[2], m[3])}~${hm(m[4], m[5])}` };
  }
  if (texts.some((t) => /브레이크\s?타임|쉬는\s?시간/.test(t))) return { status: '있음', detail: '시간은 전화로 확인' };
  return { status: '정보없음', detail: '' };
}

function findHours(texts) {
  for (const t of texts) {
    const m = t.match(/영업\s?시간[^0-9]{0,8}(\d{1,2}:\d{2})\s?[~\-–]\s?(\d{1,2}:\d{2})/);
    if (m) return `${m[1]}~${m[2]}`;
  }
  return '';
}

export function freeAnalyze(place, reviews) {
  const items = reviews.map((r) => ({ ad: !!r.ad, text: `${r.title || ''} ${r.description || ''}` }));
  const texts = items.map((i) => i.text);
  const proHits = new Map();
  const conHits = new Map();
  let P = 0; let N = 0;
  for (const { ad, text } of items) {
    const w = ad ? 0.3 : 1;
    for (const [re, weight, label] of POS) {
      const n = (text.match(re) || []).length;
      if (n) { P += Math.min(n, 2) * weight * w; proHits.set(label, (proHits.get(label) || 0) + w); }
    }
    for (const [re, weight, label] of NEG) {
      const n = (text.match(re) || []).length;
      if (n) { N += Math.min(n, 2) * weight * w; conHits.set(label, (conHits.get(label) || 0) + w); }
    }
  }
  const real = items.filter((i) => !i.ad).length + items.filter((i) => i.ad).length * 0.3;
  const ratio = P + N > 0 ? P / (P + N * 1.4) : 0.5;
  const raw = 2.6 + 2.2 * ratio;
  const score = (real * raw + 4 * 3.5) / (real + 4); // few reviews -> pulled toward 3.5
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const pros = top(proHits);
  const cons = top(conHits);
  const menus = findMenus(texts);
  const tags = TAG_RULES.filter(([, re, min = 1]) => texts.filter((t) => re.test(t)).length >= min).map(([t]) => t);
  const adCount = items.filter((i) => i.ad).length;
  const n = items.length;
  const one = (menus[0] ? `대표 메뉴 ${menus[0].name} · ` : '') + (pros[0] || (n < 3 ? '리뷰가 적어 판단이 어려워요' : ''));
  return {
    score: Math.round(Math.min(5, Math.max(0, score)) * 10) / 10,
    confidence: n >= 12 ? '높음' : n >= 5 ? '보통' : '낮음',
    one_line: one,
    summary: `리뷰 ${n}개를 키워드로 읽었어요. 칭찬 표현 ${Math.round(P)}점, 아쉬운 표현 ${Math.round(N)}점${adCount ? `, 광고의심 ${adCount}개는 덜 반영했어요` : ''}.`,
    pros,
    cons,
    menus,
    parking: findParking(texts),
    break_time: findBreak(texts),
    hours: findHours(texts),
    tags,
    ad_suspect_count: adCount,
    review_count: n,
    engine: 'free',
    analyzed_at: new Date().toISOString(),
  };
}
