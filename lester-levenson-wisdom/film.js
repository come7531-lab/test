// THE FILM — 레스터 레븐슨의 지혜. Crayon colours, hand-drawn lines, hand-written words.
// Every frame is a pure function of t.
(function () {
  const U = globalThis.U, G = globalThis.G, S = globalThis.SCORE, Studio = globalThis.Studio;
  const { T, ev } = S;
  const { clamp, lerp, ease } = U;
  const W = G.W, H = G.H;
  const H1 = (...a) => U.hash(...a);

  // ======================= STYLE TOOLKIT — keep as is (palette, crayon fill/line, words, arrows, person) =======================
  // ---------- palette (crayon box) ----------
  const C = {
    paper: '#F7F0E1', ink: '#4A3B33', inkSoft: '#6B5A4E',
    sky: '#AFC8DA', skyWarm: '#F6C9A8', hill: '#9DBF7E', hill2: '#7FA868', lake: '#7FB0C9',
    coral: '#EE8C78', purple: '#A98BC9', teal: '#6CB9A9', yellow: '#F7CF5B', orange: '#F2A15B',
    pink: '#F2A7B5', red: '#E46F6A', skin: '#F4CFAE', shirt: '#7FA7D6', sack: '#A9825E', cream: '#FBF3E3', lilac: '#D9CFE6',
  };
  const FONT = '"Gaegu", "NanumPen", sans-serif';
  let grain = null; // wax texture: little specks of paper showing through the crayon
  let tBoil = 0; // slow line boil (4 fps): alive but calm

  const pr = (t, t0, d) => clamp((t - t0) / d);
  const sm = (x) => x * x * (3 - 2 * x);

  // ---------- crayon toolkit ----------
  function blobPts(cx, cy, rx, ry, seed, n = 44, amp = 0.04) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + amp * (0.6 * Math.sin(a * 2 + seed * 1.7) + 0.4 * Math.sin(a * 3 + seed * 0.9)) + (H1(seed, i) - 0.5) * 0.008;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  }
  function rrPts(x, y, w, h, r) {
    const pts = [], n = 6;
    const arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
    return pts;
  }
  function trace(ctx, pts, closed = true) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
  }
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12];
  }

  // colour a closed shape in with crayon strokes; p = how much is coloured in so far (0..1)
  function crayonFill(ctx, pts, color, { p = 1, seed = 1, angle = -0.55, gap = 8, lw = 9, tint = 0.32, alpha = 0.85 } = {}) {
    if (p <= 0) return;
    const [bx, by, bw, bh] = bbox(pts);
    ctx.save();
    trace(ctx, pts); ctx.clip();
    ctx.globalAlpha = tint * Math.min(1, p * 1.4);
    ctx.fillStyle = color; ctx.fillRect(bx, by, bw, bh);
    const cx = bx + bw / 2, cy = by + bh / 2, R = Math.hypot(bw, bh) / 2 + 10;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const n = Math.ceil((2 * R) / gap), shown = Math.floor(n * p);
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < shown; i++) {
      const off = -R + i * gap + (H1(seed, i, 1) - 0.5) * gap * 0.8;
      ctx.globalAlpha = alpha * (0.55 + 0.45 * H1(seed, i, 2));
      ctx.lineWidth = lw * (0.7 + 0.5 * H1(seed, i, 3));
      ctx.beginPath();
      const steps = Math.max(3, Math.ceil((2 * R) / 46));
      for (let k = 0; k <= steps; k++) {
        const along = -R + (k / steps) * 2 * R;
        const jit = (H1(seed, i, k + 10) - 0.5) * gap * 0.9;
        const x = cx + ca * along - sa * (off + jit), y = cy + sa * along + ca * (off + jit);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (grain) { ctx.fillStyle = grain; ctx.fillRect(bx, by, bw, bh); }
    ctx.restore();
  }

  // a crayon line that draws itself on as p goes 0 → 1
  function crayonLine(ctx, pts, { color = C.ink, lw = 6, p = 1, seed = 3, alpha = 0.92, closed = false } = {}) {
    if (p <= 0 || pts.length < 2) return;
    const P = closed ? [...pts, pts[0]] : pts;
    // resample + jitter
    const res = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14));
      for (let k = 0; k < n; k++) res.push([lerp(x0, x1, k / n), lerp(y0, y1, k / n)]);
    }
    res.push(P[P.length - 1]);
    let L = 0; const acc = [0];
    for (let i = 1; i < res.length; i++) { L += Math.hypot(res[i][0] - res[i - 1][0], res[i][1] - res[i - 1][1]); acc.push(L); }
    const stop = L * p;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass ? alpha * 0.45 : alpha;
      ctx.lineWidth = pass ? lw * 0.55 : lw;
      ctx.beginPath();
      for (let i = 0; i < res.length && acc[i] <= stop; i++) {
        const a = pass ? 1.6 : 0.8;
        const x = res[i][0] + (H1(seed, i, pass, tBoil) - 0.5) * a * 2 + (pass ? 1.4 : 0);
        const y = res[i][1] + (H1(seed + 5, i, pass, tBoil) - 0.5) * a * 2 + (pass ? -1 : 0);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  const shape = (ctx, pts, color, o = {}) => {
    crayonFill(ctx, pts, color, { p: o.fill ?? 1, seed: o.seed || 1, gap: o.gap, lw: o.flw, angle: o.angle, tint: o.tint });
    if (o.line !== false) crayonLine(ctx, pts, { color: o.stroke || C.ink, lw: o.lw || 5, p: o.p ?? 1, seed: (o.seed || 1) + 50, closed: true });
  };
  function curve(a, b, bend = 0.25, n = 24) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    const c = [mx - dy * bend, my + dx * bend];
    const pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]]); }
    return pts;
  }
  // hand-drawn arrow along a curve; the head appears when the line arrives
  function arrow(ctx, a, b, { bend = 0.25, color = C.ink, lw = 6, p = 1, seed = 9, head = 30 } = {}) {
    if (p <= 0) return;
    const pts = curve(a, b, bend);
    crayonLine(ctx, pts, { color, lw, p: Math.min(1, p / 0.85), seed });
    const hp = pr(p, 0.85, 0.15);
    if (hp > 0) {
      const e = pts[pts.length - 1], q = pts[pts.length - 4];
      const ang = Math.atan2(e[1] - q[1], e[0] - q[0]);
      for (const s of [-1, 1]) {
        const h = [e[0] - Math.cos(ang + s * 0.5) * head, e[1] - Math.sin(ang + s * 0.5) * head];
        crayonLine(ctx, [e, h], { color, lw, p: hp, seed: seed + s * 3 });
      }
    }
  }
  // hand-written word: writes on left → right, pops in with a little zoom
  function word(ctx, str, x, y, { size = 80, color = C.ink, t = 0, t0 = 0, d = 0.5, rot = 0, weight = 700, align = 'center', pop = true, fam = FONT, shadow = true } = {}) {
    const p = pr(t, t0, d);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `${weight} ${size}px ${fam}`;
    const w = ctx.measureText(str).width;
    const sc = pop ? lerp(0.55, 1, ease.outBack(pr(t, t0, 0.42), 2.2)) * (1 + 0.025 * Math.sin((t - t0) * 2.4)) : 1;
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
    const x0 = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    ctx.beginPath(); ctx.rect(x0 - 12, -size * 1.2, (w + 24) * p, size * 1.8); ctx.clip();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (shadow) { ctx.globalAlpha = 0.85; ctx.fillStyle = C.paper; ctx.lineWidth = size * 0.16; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(251,243,227,0.9)'; ctx.strokeText(str, x0, 0); }
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.fillText(str, x0, 0);
    ctx.globalAlpha = 0.35; ctx.fillText(str, x0 + 1.5, -1.5); // crayon double-pass
    ctx.restore();
  }
  // hand-drawn loop around something (a circle that overshoots)
  function loop(ctx, cx, cy, rx, ry, { color = C.coral, lw = 5, p = 1, seed = 4 } = {}) {
    const pts = [];
    for (let i = 0; i <= 50; i++) { const a = -2.2 + (i / 50) * Math.PI * 2.25; const k = 1 + 0.05 * Math.sin(i * 0.7 + seed); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    crayonLine(ctx, pts, { color, lw, p, seed });
  }
  function sparkle(ctx, x, y, r, t, t0, color = C.yellow) {
    const p = pr(t, t0, 0.35);
    if (p <= 0) return;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      crayonLine(ctx, [[x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45], [x + Math.cos(a) * r, y + Math.sin(a) * r]], { color, lw: 5, p, seed: i + x });
    }
  }
  function birdV(ctx, x, y, s, t, seed) {
    const f = Math.sin(t * 9 + seed) * 0.35;
    crayonLine(ctx, [[x - 22 * s, y - (8 + f * 14) * s], [x - 9 * s, y - 2 * s], [x, y + 3 * s], [x + 9 * s, y - 2 * s], [x + 22 * s, y - (8 + f * 14) * s]], { color: C.ink, lw: 4, seed });
  }
  function cloud(ctx, cx, cy, s, color, seed, o = {}) {
    const pts = [];
    const bumps = [[-1, 0.15, 0.55], [-0.45, -0.35, 0.65], [0.25, -0.45, 0.7], [0.9, -0.05, 0.6], [0.45, 0.35, 0.55], [-0.35, 0.4, 0.55]];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a) * 0.62;
      let best = 0;
      for (const [bx, by, br] of bumps) { const px = bx * 0.75, py = by * 0.75; const dd = dx * px + dy * py; const r = dd + Math.sqrt(Math.max(0, br * br - (px * px + py * py - dd * dd))); best = Math.max(best, r); }
      pts.push([cx + dx * best * s, cy + dy * best * s]);
    }
    shape(ctx, pts, color, { seed, ...o });
  }

  // dark hair on the top of a round head
  function hairCap(ctx, cx, cy, r, seed) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = Math.PI * 1.08 + (i / 20) * Math.PI * 0.84; pts.push([cx + Math.cos(a) * r * 1.04, cy + Math.sin(a) * r * 1.04]); }
    for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([lerp(cx + r * 0.9, cx - r * 0.9, u), cy - r * 0.42 - Math.sin(u * Math.PI) * r * 0.12 + Math.sin(u * 18) * r * 0.03]); }
    shape(ctx, pts, '#5A4335', { seed, lw: 4, tint: 0.7, gap: 6, flw: 8 });
  }

  // ---------- a little person ----------
  // feet at (x, y). arms: 'down' | 'up' | 'hold' (right hand up) ; face: 'tired' | 'calm' | 'smile'
  function person(ctx, x, y, s, { bend = 0, arms = 'down', face = 'calm', shirt = C.shirt, sit = false, seed = 20, fill = 1 } = {}) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (sit) {
      shape(ctx, blobPts(0, -22, 78, 26, seed + 1), '#8C7A6B', { seed: seed + 1, fill });
    } else {
      crayonLine(ctx, [[-16, -92], [-20, -4]], { lw: 11, seed: seed + 2 });
      crayonLine(ctx, [[16, -92], [22, -4]], { lw: 11, seed: seed + 3 });
      crayonLine(ctx, [[-30, -2], [-12, -2]], { lw: 10, seed: seed + 4 });
      crayonLine(ctx, [[12, -2], [32, -2]], { lw: 10, seed: seed + 5 });
    }
    ctx.translate(0, sit ? -40 : -88); ctx.rotate(bend);
    const hands = {
      down: [[-50, -18], [50, -18]], up: [[-84, -210], [84, -210]], hold: [[-50, -18], [70, -222]],
      lap: [[-30, -8], [30, -8]],
    }[arms];
    const sh = [[-34, -102], [34, -102]];
    // arms behind the body
    for (let i = 0; i < 2; i++) {
      const el = [lerp(sh[i][0], hands[i][0], 0.5) + (i ? 12 : -12), lerp(sh[i][1], hands[i][1], 0.5) + 6];
      crayonLine(ctx, [sh[i], el, hands[i]], { lw: 11, seed: seed + 10 + i });
      shape(ctx, blobPts(hands[i][0], hands[i][1], 11, 11, seed + 12 + i, 16), C.skin, { seed: seed + 12 + i, lw: 4, fill });
    }
    shape(ctx, rrPts(-44, -122, 88, 124, 34), shirt, { seed: seed + 6, fill, lw: 6 });
    shape(ctx, blobPts(0, -164, 42, 44, seed + 7, 36, 0.03), C.skin, { seed: seed + 7, fill, lw: 6 });
    hairCap(ctx, 0, -164, 42, seed + 8);
    // face
    if (face === 'tired') {
      crayonLine(ctx, [[-20, -160], [-8, -158]], { lw: 5, seed: seed + 20 });
      crayonLine(ctx, [[8, -158], [20, -160]], { lw: 5, seed: seed + 21 });
      crayonLine(ctx, curve([-12, -136], [12, -136], -0.25), { lw: 4, seed: seed + 22 }); // frown
      shape(ctx, blobPts(34, -184, 6, 10, seed + 23, 14), '#8EC7E8', { seed: seed + 23, lw: 3 });
    } else {
      crayonLine(ctx, curve([-22, -160], [-8, -160], 0.4), { lw: 4.5, seed: seed + 20 });
      crayonLine(ctx, curve([8, -160], [22, -160], 0.4), { lw: 4.5, seed: seed + 21 });
      crayonLine(ctx, curve([-14, -140], [14, -140], face === 'smile' ? 0.45 : 0.25), { lw: 4.5, seed: seed + 22 });
      ctx.globalAlpha = 0.35; ctx.fillStyle = C.pink;
      ctx.beginPath(); ctx.arc(-26, -146, 8, 0, 7); ctx.arc(26, -146, 8, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // world position of the right hand (for balloon strings), only exact when bend = 0
    return { handR: [x + hands[1][0] * s, y + ((sit ? -40 : -88) + hands[1][1]) * s], chest: [x, y + ((sit ? -40 : -88) - 64) * s] };
  }

  // ======================= PER-FILM PART — backgrounds and scenes: rewrite these for each new story =======================
  // ---------- full-frame crayon backgrounds (cached; they are fully coloured from the first frame) ----------
  const vgrad = (ctx, stops) => { const g = ctx.createLinearGradient(0, 0, 0, H); for (const [y, c] of stops) g.addColorStop(clamp(y / H), c); return g; };
  const FULL = (y0, y1) => [[-20, y0], [W + 20, y0], [W + 20, y1], [-20, y1]];
  function hillPts(base, amp, seed, phase = 0) {
    const pts = [[-20, H + 20]];
    for (let i = 0; i <= 24; i++) { const x = -20 + (i / 24) * (W + 40); pts.push([x, base - amp * Math.sin((i / 24) * Math.PI * 1.3 + phase) - (H1(seed, i) - 0.5) * 10]); }
    pts.push([W + 20, H + 20]);
    return pts;
  }
  const bgs = {
    want: (ctx) => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      crayonFill(ctx, FULL(-20, H + 20), C.sky, { seed: 101, gap: 9, lw: 11, tint: 0.4, alpha: 0.55 });
      crayonFill(ctx, hillPts(820, 70, 102), C.hill, { seed: 102, gap: 8, lw: 11, tint: 0.45 });
      crayonLine(ctx, hillPts(820, 70, 102).slice(1, -1), { lw: 5, seed: 103, color: '#5E7F4A' });
      for (let i = 0; i < 14; i++) { const x = 80 + i * 140 + H1(i, 9) * 60, y = 900 + H1(i, 8) * 120; crayonLine(ctx, [[x, y], [x - 8, y - 22]], { color: '#5E7F4A', lw: 4, seed: i }); crayonLine(ctx, [[x + 8, y], [x + 12, y - 18]], { color: '#5E7F4A', lw: 4, seed: i + 30 }); }
    },
    lack: (ctx) => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      crayonFill(ctx, FULL(-20, H + 20), C.lilac, { seed: 201, gap: 9, lw: 12, tint: 0.5, alpha: 0.6 });
      crayonFill(ctx, hillPts(900, 30, 202, 1), '#C9BBD9', { seed: 202, gap: 8, lw: 11, tint: 0.5 });
      for (let i = 0; i < 9; i++) { const x = 120 + i * 220 + H1(i, 3) * 80, y = 120 + H1(i, 4) * 120; G.star && crayonLine(ctx, [[x - 8, y], [x + 8, y]], { color: '#FFFFFF', lw: 4, seed: i }); crayonLine(ctx, [[x, y - 8], [x, y + 8]], { color: '#FFFFFF', lw: 4, seed: i + 40 }); }
    },
    release: (ctx) => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      crayonFill(ctx, FULL(-20, H + 20), vgrad(ctx, [[0, '#A9C6DC'], [380, '#C4D3D9'], [640, '#F4CBA9'], [900, '#F6C29E']]), { seed: 301, gap: 9, lw: 11, tint: 0.4, alpha: 0.55 });
      crayonFill(ctx, hillPts(860, 50, 303, 0.4), C.hill, { seed: 303, gap: 8, lw: 11, tint: 0.45 });
      crayonLine(ctx, hillPts(860, 50, 303, 0.4).slice(1, -1), { lw: 5, seed: 304, color: '#5E7F4A' });
    },
    within: (ctx) => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      crayonFill(ctx, FULL(-20, H + 20), '#F8DDBF', { seed: 401, gap: 9, lw: 12, tint: 0.55, alpha: 0.55 });
    },
    graph: (ctx) => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      crayonFill(ctx, FULL(-20, H + 20), '#DDEBD2', { seed: 501, gap: 9, lw: 12, tint: 0.5, alpha: 0.55 });
      // leafy corners
      const leaf = (x, y, a, s, i) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); const pts = []; for (let k = 0; k <= 16; k++) { const u = k / 16; pts.push([lerp(-40, 40, u) * s, -Math.sin(u * Math.PI) * 18 * s]); } for (let k = 16; k >= 0; k--) { const u = k / 16; pts.push([lerp(-40, 40, u) * s, Math.sin(u * Math.PI) * 18 * s]); } shape(ctx, pts, i % 2 ? C.hill : C.hill2, { seed: 510 + i, lw: 4 }); crayonLine(ctx, [[-36 * s, 0], [36 * s, 0]], { lw: 3, seed: 530 + i, color: '#4F7340' }); ctx.restore(); };
      [[70, 120, 0.6, 1.1], [150, 70, -0.4, 0.9], [60, 230, 1.2, 0.8], [W - 90, 110, -0.7, 1.1], [W - 190, 60, 0.3, 0.8], [W - 70, 240, 2.0, 0.9]].forEach(([x, y, a, s2], i) => leaf(x, y, a, s2, i));
    },
    free: (ctx) => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      crayonFill(ctx, FULL(-20, 660), vgrad(ctx, [[0, '#EFA9A6'], [260, '#F4BC9A'], [470, '#F7D08E'], [640, '#F9E4A6']]), { seed: 601, gap: 9, lw: 12, tint: 0.45, alpha: 0.6 });
      crayonFill(ctx, blobPts(W * 0.42, 640, 150, 150, 604, 48, 0.02), C.yellow, { seed: 604, gap: 7, lw: 10, tint: 0.6 });
      crayonFill(ctx, FULL(640, H + 20), C.lake, { seed: 605, gap: 8, lw: 11, tint: 0.5 });
      for (let i = 0; i < 6; i++) crayonLine(ctx, [[W * 0.42 - 120 + i * 12, 680 + i * 26], [W * 0.42 + 120 - i * 12, 680 + i * 26]], { color: '#FBE7A1', lw: 6, seed: 610 + i, alpha: 0.8 });
      crayonLine(ctx, [[-10, 640], [W + 10, 640]], { lw: 5, seed: 607, color: '#5D8AA3' });
      const isle = [[1000, H + 20], ...curve([1000, H + 20], [1300, 715], -0.25).slice(1), ...curve([1300, 715], [W + 20, 690], -0.08).slice(1), [W + 20, H + 20]];
      crayonFill(ctx, isle, C.hill2, { seed: 606, gap: 8, lw: 11, tint: 0.5 });
      crayonLine(ctx, isle.slice(1, -1), { lw: 5, seed: 608, color: '#4F7340' });
    },
  };
  const bg = (ctx, key) => ctx.drawImage(Studio.cache('bg-' + key, bgs[key], { variants: 1 }), 0, 0, W, H);

  // ---------- camera ----------
  function cam(ctx, z, cx, cy) {
    z = Math.max(1, z);
    const hw = W / (2 * z), hh = H / (2 * z);
    cx = clamp(cx, hw, W - hw); cy = clamp(cy, hh, H - hh);
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
  }

  // ---------- scenes ----------
  const WANTS = [{ w: '인정', c: C.coral, x: 300, y: 250 }, { w: '통제', c: C.purple, x: 720, y: 160 }, { w: '안전', c: C.teal, x: 1170, y: 250 }];

  function sceneWant(ctx, t) {
    const [t0] = S.S.want; const u = t - t0;
    cam(ctx, lerp(1.0, 1.1, sm(pr(t, t0, 3.6))), 860, 560);
    bg(ctx, 'want');
    // the heavy sack and the bent person under it
    const sway = Math.sin(u * 1.6) * 0.02;
    person(ctx, 1000, 880, 1.25, { bend: 0.45, arms: 'down', face: 'tired', seed: 30, fill: pr(t, t0 + 0.2, 0.9) });
    ctx.save(); ctx.translate(790, 545); ctx.rotate(sway);
    shape(ctx, blobPts(0, 0, 200, 175, 11, 50, 0.04), C.sack, { seed: 11, fill: pr(t, t0 + 0.1, 0.9), lw: 7 });
    crayonLine(ctx, [[-40, -160], [-10, -195], [30, -160]], { lw: 7, seed: 12 }); // the knot
    crayonLine(ctx, [[-60, -40], [-10, 0], [-50, 50]], { color: '#7A5B40', lw: 5, seed: 13 }); // patch
    ctx.restore();
    // weight lines + "무거워…"
    for (let i = 0; i < 3; i++) crayonLine(ctx, [[1170 + i * 22, 500 + i * 8], [1190 + i * 22, 530 + i * 8]], { lw: 5, seed: 40 + i, p: pr(t, t0 + 0.5, 0.3) });
    word(ctx, '무거워…', 1380, 500, { size: 78, t, t0: t0 + 0.6, d: 0.6, rot: 0.08, color: C.inkSoft });
    // the three wants, each with an arrow into the sack
    WANTS.forEach((wn, i) => {
      const te = ev.wants[i];
      const pop = ease.outBack(pr(t, te, 0.45), 2);
      if (pop <= 0) return;
      ctx.save(); ctx.translate(wn.x, wn.y); ctx.scale(pop, pop);
      cloud(ctx, 0, 0, 150, wn.c, 70 + i, { fill: pr(t, te, 0.6), lw: 5 });
      ctx.restore();
      word(ctx, wn.w, wn.x, wn.y + 26, { size: 84, t, t0: te + 0.08, d: 0.35 });
      arrow(ctx, [wn.x + (i - 1) * 20, wn.y + 90], [740 + i * 90, 395], { bend: i === 2 ? -0.2 : i === 1 ? 0.05 : 0.2, p: pr(t, te + 0.25, 0.45), seed: 80 + i, color: C.ink });
    });
  }

  function sceneLack(ctx, t) {
    const [t0] = S.S.lack;
    const k = sm(pr(t, t0, 3.4));
    cam(ctx, lerp(1.22, 1.0, k), lerp(560, 960, k), lerp(520, 540, k));
    bg(ctx, 'lack');
    const [n1, n2, n3] = ev.lackNodes;
    const Y = 470;
    // node 1: 원함 (a wanting cloud)
    const p1 = ease.outBack(pr(t, n1, 0.45), 2);
    if (p1 > 0) { ctx.save(); ctx.translate(380, Y - 30); ctx.scale(p1, p1); cloud(ctx, 0, 0, 210, C.pink, 210, { fill: pr(t, n1, 0.7), lw: 6 }); ctx.restore(); word(ctx, '원함', 380, Y + 2, { size: 110, t, t0: n1 + 0.1, d: 0.4, color: C.ink }); }
    // node 2: 부족함 (an empty cup)
    const p2 = pr(t, n2, 0.5);
    if (p2 > 0) {
      const cup = [[870, 330], [1050, 330], [1025, 560], [895, 560]];
      crayonFill(ctx, [[892, 530], [1028, 530], [1025, 560], [895, 560]], C.lake, { p: p2, seed: 220 });
      crayonLine(ctx, cup, { lw: 7, p: p2, seed: 221, closed: false });
      crayonLine(ctx, curve([1050, 380], [1050, 490], -0.7), { lw: 7, p: pr(t, n2 + 0.2, 0.3), seed: 222 });
      word(ctx, '부족함', 960, 660, { size: 92, t, t0: n2 + 0.15, d: 0.4 });
      word(ctx, '텅…', 960, 470, { size: 60, t, t0: n2 + 0.45, d: 0.3, color: C.inkSoft, pop: false });
    }
    // node 3: 괴로움 (a small person under a rain cloud)
    const p3 = pr(t, n3, 0.5);
    if (p3 > 0) {
      person(ctx, 1540, 640, 0.8, { face: 'tired', arms: 'down', seed: 230, shirt: '#9AA6C4', fill: p3 });
      ctx.save(); ctx.translate(1540, 300); ctx.scale(ease.outBack(p3, 2), ease.outBack(p3, 2)); cloud(ctx, 0, 0, 150, '#8E97AC', 231, { fill: p3 }); ctx.restore();
      for (let i = 0; i < 6; i++) { const ry = ((t * 260 + i * 53) % 150); crayonLine(ctx, [[1470 + i * 28, 360 + ry], [1462 + i * 28, 384 + ry]], { color: '#6E9CC0', lw: 5, seed: 240 + i, p: p3 }); }
      word(ctx, '괴로움', 1540, 760, { size: 92, t, t0: n3 + 0.15, d: 0.4 });
    }
    // arrows between them
    arrow(ctx, [560, Y - 40], [840, Y - 40], { bend: -0.25, p: pr(t, n1 + 0.55, 0.45), seed: 250, color: C.red, lw: 7 });
    arrow(ctx, [1080, Y - 40], [1380, Y - 40], { bend: -0.25, p: pr(t, n2 + 0.55, 0.45), seed: 251, color: C.red, lw: 7 });
    // ...and back again: the loop
    const pl = pr(t, n3 + 0.6, 0.6);
    if (pl > 0) {
      arrow(ctx, [1500, 820], [400, 600], { bend: -0.18, p: pl, seed: 252, color: C.purple, lw: 6 });
      word(ctx, '또 원함…', 960, 900, { size: 64, t, t0: n3 + 0.9, d: 0.35, color: C.purple });
    }
  }

  function sceneRelease(ctx, t) {
    const [t0, t1] = S.S.release;
    const k = sm(pr(t, t0, 2.4));
    // ends with a dive into the person's chest
    const dive = ease.inCubic(pr(t, t1 - 0.55, 0.75));
    const z = lerp(lerp(1.12, 1.0, k), 3.2, dive);
    const P = { x: 820, y: 900 };
    cam(ctx, z, lerp(lerp(860, 960, k), P.x, dive), lerp(lerp(600, 540, k), P.y - 230, dive));
    bg(ctx, 'release');
    // warm light grows as the balloons go
    const warm = pr(t, ev.letGo[0], 2.2);
    if (warm > 0) { const g = ctx.createRadialGradient(1300, 260, 20, 1300, 260, 900); g.addColorStop(0, `rgba(255,214,140,${0.45 * warm})`); g.addColorStop(1, 'rgba(255,214,140,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const me = person(ctx, P.x, P.y, 1.25, { arms: 'hold', face: t > ev.letGo[1] ? 'smile' : 'calm', seed: 330 });
    const hand = me.handR;
    WANTS.forEach((wn, i) => {
      const tg = ev.letGo[i];
      const fly = Math.max(0, t - tg);
      const rise = fly > 0 ? (fly * 180 + fly * fly * 140) : 0;
      const bx = hand[0] + (i - 1) * 110 + Math.sin(t * 1.7 + i * 2) * (10 + fly * 18) + fly * 40 * (i - 1);
      const by = hand[1] - 190 - (i === 1 ? 60 : 0) - rise;
      // string: tied to the hand until let go, then trails below
      const sEnd = fly > 0 ? [bx + Math.sin(t * 3 + i) * 20, by + 230] : hand;
      crayonLine(ctx, curve([bx, by + 92], sEnd, 0.12 * Math.sin(t * 2 + i)), { lw: 3, seed: 340 + i, color: C.inkSoft });
      shape(ctx, blobPts(bx, by, 80, 94, 350 + i, 40, 0.02), wn.c, { seed: 350 + i, lw: 5 });
      crayonLine(ctx, curve([bx - 36, by - 40], [bx - 10, by - 70], 0.3), { color: '#FFFFFF', lw: 6, seed: 360 + i, alpha: 0.7 });
      word(ctx, wn.w, bx, by + 18, { size: 54, t, t0: t0, d: 0.01, pop: false });
      if (fly > 0 && fly < 0.6) sparkle(ctx, hand[0], hand[1], 40 + i * 10, t, tg);
    });
    // hand-written point: 놓아버리기 + an arrow following the balloons up
    word(ctx, '놓아버리기!', 1500, 330, { size: 108, t, t0: ev.letGo[0] + 0.15, d: 0.55, rot: -0.06, color: C.red });
    crayonLine(ctx, curve([1290, 360], [1720, 370], 0.06), { color: C.red, lw: 6, p: pr(t, ev.letGo[0] + 0.7, 0.35), seed: 371 });
    arrow(ctx, [1180, 560], [1100, 200], { bend: 0.25, p: pr(t, ev.letGo[1] + 0.1, 0.5), seed: 372, color: C.orange, lw: 7 });
    word(ctx, '가벼워~', 1520, 600, { size: 72, t, t0: ev.letGo[2] + 0.1, d: 0.4, rot: 0.06, color: C.inkSoft });
    for (let i = 0; i < 3; i++) if (t > ev.letGo[2] + 0.2) birdV(ctx, 300 + i * 90 + (t - ev.letGo[2]) * 120, 220 + i * 35, 1.2, t, 380 + i);
  }

  function sceneWithin(ctx, t) {
    const [t0] = S.S.within;
    const k = sm(pr(t, t0, 2.6));
    cam(ctx, lerp(1.3, 1.0, k), lerp(960, 960, k), lerp(600, 540, k));
    bg(ctx, 'within');
    const hx = 960, hy = 600;
    // rays, spinning slowly, growing out from the heart
    const rp = pr(t, ev.sunOn, 1.6);
    if (rp > 0) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + (t - ev.sunOn) * 0.12;
        const r0 = 300, r1 = 300 + 380 * ease.outCubic(rp) * (i % 2 ? 0.75 : 1);
        crayonLine(ctx, [[hx + Math.cos(a) * r0, hy + Math.sin(a) * r0], [hx + Math.cos(a) * r1, hy + Math.sin(a) * r1]], { color: i % 2 ? C.orange : C.yellow, lw: 12, seed: 400 + i, alpha: 0.8 });
      }
    }
    // a big, calm upper body filling the frame
    shape(ctx, [...curve([360, H + 30], [560, 620], 0.12), ...curve([560, 620], [1360, 620], -0.12).slice(1), ...curve([1360, 620], [1560, H + 30], 0.12).slice(1)], C.shirt, { seed: 410, lw: 7, tint: 0.4 });
    shape(ctx, blobPts(960, 330, 200, 210, 411, 48, 0.02), C.skin, { seed: 411, lw: 7 });
    hairCap(ctx, 960, 330, 200, 412);
    crayonLine(ctx, curve([870, 340], [920, 340], 0.45), { lw: 6, seed: 413 });
    crayonLine(ctx, curve([1000, 340], [1050, 340], 0.45), { lw: 6, seed: 414 });
    crayonLine(ctx, curve([900, 420], [1020, 420], 0.4), { lw: 6, seed: 415 });
    // the heart, with a sun inside, beating very gently
    const beat = 1 + 0.04 * Math.max(0, Math.sin((t - t0) * Math.PI * 1.2));
    const hp = pr(t, t0 + 0.15, 0.7);
    ctx.save(); ctx.translate(hx, hy + 140); ctx.scale(beat, beat);
    const heart = [];
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; heart.push([16 * Math.pow(Math.sin(a), 3) * 7.5, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 7.5]); }
    shape(ctx, heart, C.red, { seed: 420, lw: 7, fill: hp, p: hp });
    if (t > ev.sunOn) {
      const sp = ease.outBack(pr(t, ev.sunOn, 0.5), 2);
      ctx.save(); ctx.scale(sp, sp);
      shape(ctx, blobPts(0, -10, 52, 52, 421, 30, 0.02), C.yellow, { seed: 421, lw: 5 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + t * 0.4; crayonLine(ctx, [[Math.cos(a) * 66, -10 + Math.sin(a) * 66], [Math.cos(a) * 86, -10 + Math.sin(a) * 86]], { color: C.yellow, lw: 7, seed: 430 + i }); }
      ctx.restore();
    }
    ctx.restore();
    // outside? → crossed out. inside! → arrow to the heart
    const ox = 300, oy = 330;
    if (t > t0 + 0.6) {
      shape(ctx, blobPts(ox - 40, oy, 44, 44, 440, 24), C.yellow, { seed: 440, lw: 5, fill: pr(t, t0 + 0.6, 0.4), p: pr(t, t0 + 0.6, 0.4) });
      word(ctx, '₩', ox - 40, oy + 20, { size: 56, t, t0: t0 + 0.7, d: 0.2, pop: false });
      shape(ctx, [[ox + 30, oy + 40], [ox + 30, oy - 20], [ox + 70, oy - 55], [ox + 110, oy - 20], [ox + 110, oy + 40]], C.coral, { seed: 441, lw: 5, fill: pr(t, t0 + 0.75, 0.4), p: pr(t, t0 + 0.75, 0.4) });
      word(ctx, '밖에서?', ox + 30, oy - 110, { size: 72, t, t0: t0 + 0.8, d: 0.4, color: C.inkSoft });
      const xp = pr(t, t0 + 1.4, 0.3);
      crayonLine(ctx, [[ox - 110, oy - 70], [ox + 150, oy + 80]], { color: C.red, lw: 9, p: xp, seed: 442 });
      crayonLine(ctx, [[ox + 150, oy - 70], [ox - 110, oy + 80]], { color: C.red, lw: 9, p: pr(t, t0 + 1.6, 0.3), seed: 443 });
    }
    word(ctx, '이미 여기에!', 1560, 260, { size: 100, t, t0: ev.sunOn + 0.4, d: 0.55, rot: 0.05, color: C.red });
    arrow(ctx, [1500, 320], [1110, 650], { bend: -0.3, p: pr(t, ev.sunOn + 0.8, 0.5), seed: 450, color: C.red, lw: 8 });
    loop(ctx, 1560, 232, 260, 90, { color: C.orange, p: pr(t, ev.sunOn + 1.1, 0.5), seed: 451 });
  }

  function sceneGraph(ctx, t) {
    const [t0] = S.S.graph;
    const d = ev.graphDraw;
    const g = pr(t, d, 2.2);
    cam(ctx, lerp(1.0, 1.08, sm(pr(t, t0, 3.5))), lerp(800, 1020, g), 520);
    bg(ctx, 'graph');
    const X0 = 380, Y0 = 760, X1 = 1560, Y1 = 200;
    // axes
    arrow(ctx, [X0, Y0], [X1 + 60, Y0], { bend: 0.0, p: pr(t, t0 + 0.05, 0.5), seed: 500, lw: 6, head: 26 });
    arrow(ctx, [X0, Y0], [X0, Y1 - 40], { bend: 0.0, p: pr(t, t0 + 0.05, 0.5), seed: 501, lw: 6, head: 26 });
    word(ctx, '내려놓을수록 →', X1 - 40, Y0 + 80, { size: 62, t, t0: t0 + 0.4, d: 0.5, color: C.inkSoft, align: 'right' });
    // lines
    const N = 30;
    const want = [], peace = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      want.push([lerp(X0 + 30, X1, u), lerp(Y1 + 60, Y0 - 60, ease.inOutQuad(u)) + Math.sin(u * 9) * 8]);
      peace.push([lerp(X0 + 30, X1, u), lerp(Y0 - 60, Y1 + 30, ease.inOutCubic(u)) + Math.sin(u * 7 + 1) * 6]);
    }
    crayonLine(ctx, want, { color: C.coral, lw: 12, p: g, seed: 510 });
    crayonLine(ctx, peace, { color: C.teal, lw: 12, p: g, seed: 511 });
    // labels at the starts, arrows at the ends
    word(ctx, '원함', X0 + 120, Y1 + 20, { size: 80, t, t0: d, d: 0.35, color: C.coral });
    word(ctx, '평화', X0 + 120, Y0 - 100, { size: 80, t, t0: d + 0.15, d: 0.35, color: C.teal });
    const e = pr(t, d + 2.2, 0.01);
    if (e > 0) {
      word(ctx, '↓ 줄고', X1 - 60, Y0 - 110, { size: 76, t, t0: d + 2.2, d: 0.35, color: C.coral, align: 'right' });
      word(ctx, '↑ 커져요', X1 - 60, Y1 - 10, { size: 76, t, t0: d + 2.35, d: 0.35, color: C.teal, align: 'right' });
      loop(ctx, X1 - 10, Y1 + 34, 64, 54, { color: C.teal, p: pr(t, d + 2.5, 0.35), seed: 520 });
      sparkle(ctx, X1 - 10, Y1 + 34, 105, t, d + 2.6, C.yellow);
    }
  }

  function sceneFree(ctx, t) {
    const [t0] = S.S.free;
    cam(ctx, lerp(1.16, 1.0, sm(pr(t, t0, 3.6))), lerp(1300, 960, sm(pr(t, t0, 3.6))), lerp(620, 540, sm(pr(t, t0, 3.6))));
    bg(ctx, 'free');
    // gentle ripples
    for (let i = 0; i < 4; i++) { const ph = (t * 0.5 + i * 0.25) % 1; crayonLine(ctx, [[400 + i * 300 - ph * 40, 760 + i * 60], [520 + i * 300 + ph * 40, 760 + i * 60]], { color: '#D7EAF2', lw: 5, seed: 620 + i, alpha: 0.8 * (1 - ph) }); }
    // a person sitting peacefully on the hill
    person(ctx, 1520, 740, 1.0, { sit: true, arms: 'lap', face: 'smile', seed: 630, shirt: C.coral });
    // birds drift across
    for (let i = 0; i < 4; i++) birdV(ctx, 120 + i * 110 + (t - t0) * 70, 520 + (i % 2) * 40 + Math.sin(t + i) * 8, 1.1, t, 640 + i);
    // the title, hand-written
    word(ctx, '내려놓음 = 자유', 860, 300, { size: 150, t, t0: ev.title, d: 0.9, rot: -0.03, color: C.ink });
    crayonLine(ctx, curve([400, 340], [1330, 330], 0.06), { color: C.red, lw: 9, p: pr(t, ev.title + 0.9, 0.5), seed: 650 });
    word(ctx, '레스터 레븐슨의 지혜', 860, 430, { size: 64, t, t0: ev.title + 1.3, d: 0.6, color: C.inkSoft, pop: false });
    sparkle(ctx, 1380, 210, 60, t, ev.title + 1.0, C.yellow);
  }

  const SCENES = [['want', sceneWant], ['lack', sceneLack], ['release', sceneRelease], ['within', sceneWithin], ['graph', sceneGraph], ['free', sceneFree]];

  // ======================= STYLE TOOLKIT again — subtitles + scene cross-fade runner: keep as is =======================
  // ---------- subtitles (outside the camera, bottom centre) ----------
  function subtitle(ctx, t) {
    for (const s of S.subtitles) {
      if (t < s.t - 0.01 || t > s.end + 0.3) continue;
      const a = Math.min(pr(t, s.t, 0.3), 1 - pr(t, s.end, 0.3));
      if (a <= 0) continue;
      const size = 56;
      ctx.save();
      ctx.font = `700 ${size}px ${FONT}`;
      const w = ctx.measureText(s.text).width;
      const cx = W / 2, cy = H - 108 + (1 - ease.outCubic(pr(t, s.t, 0.35))) * 14;
      ctx.globalAlpha = a;
      const box = rrPts(cx - w / 2 - 38, cy - 50, w + 76, 86, 30);
      ctx.fillStyle = 'rgba(251,245,232,0.88)'; trace(ctx, box); ctx.fill();
      crayonLine(ctx, box, { color: 'rgba(74,59,51,0.55)', lw: 3, seed: 900 + Math.round(s.t * 10), closed: true, alpha: a });
      ctx.globalAlpha = a;
      G.text(ctx, s.text, cx, cy + 14, { size, fam: FONT, weight: 700, color: C.ink, align: 'center', boil: 0 });
      ctx.restore();
    }
  }

  Studio.film({
    async init() {
      await Studio.loadFont('Gaegu', 'fonts/Gaegu-Bold.ttf', '700');
      await Studio.loadFont('Gaegu', 'fonts/Gaegu-Regular.ttf', '400');
      await Studio.loadFont('NanumPen', 'fonts/NanumPenScript-Regular.ttf', '400');
      // wax grain: tiny diagonal flecks of paper
      const c = G.makeCanvas(256, 256), x = c.getContext('2d');
      const r = U.mulberry32(42);
      x.strokeStyle = 'rgba(247,240,225,0.55)'; x.lineCap = 'round';
      for (let i = 0; i < 1400; i++) { const px = r() * 256, py = r() * 256, l = 1 + r() * 4; x.lineWidth = 0.6 + r() * 1.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + l, py - l * 0.6); x.stroke(); }
      grain = x.createPattern(c, 'repeat');
    },
    draw(ctx, t) {
      tBoil = Math.floor(t * 4) % 3;
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      // current scene + a soft cross-fade into the next one (0.45s after each bar line)
      const XF = 0.45;
      for (let i = 0; i < SCENES.length; i++) {
        const [key, fn] = SCENES[i];
        const [a, b] = S.S[key];
        if (t < a || t >= b + XF) continue;
        const alpha = i === 0 ? 1 : sm(pr(t, a, XF));
        ctx.save(); ctx.globalAlpha = 1;
        if (alpha < 1) sceneWithLayer(ctx, fn, t, alpha); // the whole scene fades in as one picture
        else fn(ctx, t);
        ctx.restore();
      }
      subtitle(ctx, t);
      const end = pr(t, S.DURATION - 0.7, 0.7); // settle into paper, not black
      if (end > 0) { ctx.fillStyle = `rgba(247,240,225,${0.85 * sm(end)})`; ctx.fillRect(0, 0, W, H); }
    },
    post: { paper: 0.55, vignette: 0.22, grain: 0.04 },
    fadeOut: 0,
  });

  let layer = null;
  function sceneWithLayer(ctx, fn, t, alpha) {
    const s = G.scale || 1;
    const cw = Math.round(W * s), ch = Math.round(H * s);
    if (!layer || layer.width !== cw) layer = G.makeCanvas(cw, ch);
    const lx = layer.getContext('2d');
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, cw, ch);
    lx.setTransform(s, 0, 0, s, 0, 0);
    fn(lx, t);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(layer, 0, 0); ctx.restore();
  }
})();
