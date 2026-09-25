// ROWBREAK の決まりごと。画面（DOM）に触らない部分をここに集める。
// main.js（ブラウザ）と tools/test.mjs（node）から読む。
//
// 形は種（seed）から引く。i 個目の形は hash(seed + ":" + i) で決まるので、
// 「何個引いたか（draws）」だけ覚えておけば、続きから同じ順番を出せる。
// 今日の盤は種が "rowbreak:YYYY-MM-DD" なので、同じ日なら誰でも同じ順番。
// 盤の様子を見て出しやすい形を選ぶ「手加減」はしない（全員同じ条件にするため）。

export const N = 8;
export const COLORS = 5;   // 手札ごとに 1 色。1〜5 を順番に使う

// ---- 形 ----
// '#' がマス、'.' が空き、'/' で次の行。回さないので、向きごとに別の形として持つ。
// 並びを変えない・消さない（保存と手札が形の番号で持つ）。足すなら最後に足す。
// ponytail: 重みは仮の値。遊んで直す
const DEFS = [
  ['#', 4],
  ['##', 4], ['#/#', 4],
  ['###', 3], ['#/#/#', 3],
  ['####', 2], ['#/#/#/#', 2],
  ['#####', 1], ['#/#/#/#/#', 1],
  ['##/##', 4],
  ['###/###/###', 1],
  ['###/###', 2], ['##/##/##', 2],
  // 3 マスの L
  ['#./##', 3], ['.#/##', 3], ['##/#.', 3], ['##/.#', 3],
  // 4 マスの L
  ['#./#./##', 2], ['###/#..', 2], ['##/.#/.#', 2], ['..#/###', 2],
  // T
  ['###/.#.', 2], ['#./##/#.', 2], ['.#./###', 2], ['.#/##/.#', 2],
  // S と Z
  ['.##/##.', 2], ['#./##/.#', 2], ['##./.##', 2], ['.#/##/#.', 2],
  // 5 マスの大きな L（3×3 の角）
  ['#../#../###', 1], ['###/#../#..', 1], ['###/..#/..#', 1], ['..#/..#/###', 1],
];

export const SHAPES = DEFS.map(([s, weight]) => {
  const rows = s.split('/');
  const cells = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
  return { cells, h: rows.length, w: Math.max(...rows.map((x) => x.length)), weight };
});
const TOTAL = SHAPES.reduce((a, s) => a + s.weight, 0);

// ---- 種から作る乱数 ----

// FNV-1a（32 ビット）
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// mulberry32 の 1 回ぶん。0 以上 1 未満
function mix(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// 種の i 個目（0 から）の形の番号
export function drawShape(seed, i) {
  let x = mix(hash32(`${seed}:${i}`)) * TOTAL;
  for (let id = 0; id < SHAPES.length; id++) {
    x -= SHAPES[id].weight;
    if (x < 0) return id;
  }
  return SHAPES.length - 1;
}

export const newSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
export const dailySeed = (date) => `rowbreak:${date}`;

// ---- 盤 ----

export const emptyBoard = () => new Array(N * N).fill(0);

export function fits(board, id, r, c) {
  const s = SHAPES[id];
  if (r < 0 || c < 0 || r + s.h > N || c + s.w > N) return false;
  return s.cells.every(([dr, dc]) => board[(r + dr) * N + c + dc] === 0);
}

export function anyFit(board, id) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(board, id, r, c)) return true;
  return false;
}

// うまっている行と列（同時に数える）
export function fullLines(board) {
  const rows = [], cols = [];
  for (let i = 0; i < N; i++) {
    let row = true, col = true;
    for (let j = 0; j < N; j++) {
      if (!board[i * N + j]) row = false;
      if (!board[j * N + i]) col = false;
    }
    if (row) rows.push(i);
    if (col) cols.push(i);
  }
  return { rows, cols };
}

// 置いたとしたら消える行と列（影を明るくするため）
export function linesIfPlaced(board, id, r, c) {
  const b = board.slice();
  for (const [dr, dc] of SHAPES[id].cells) b[(r + dr) * N + c + dc] = 1;
  return fullLines(b);
}

// 点: 置いたマス 1 点 + 消した列 n 本で 10 × n²。続けて消すと 2 回目から +20 × (連続 − 1)。盤が空になったら +300
export function scoreFor(cells, n, streak, empty) {
  return cells + 10 * n * n + (n && streak > 1 ? 20 * (streak - 1) : 0) + (empty ? 300 : 0);
}

// ---- 1 回の遊び ----
// state: { seed, draws, board: number[64], hand: [id|null ×3], score, streak, lines, over }

function deal(s) {
  return { ...s, hand: [0, 1, 2].map((k) => drawShape(s.seed, s.draws + k)), draws: s.draws + 3 };
}
const judge = (s) => ({ ...s, over: !s.hand.some((id) => id != null && anyFit(s.board, id)) });

export function newGame(seed) {
  return judge(deal({ seed, draws: 0, board: emptyBoard(), hand: [null, null, null], score: 0, streak: 0, lines: 0, over: false }));
}

// 手札の slot 番目の色（1〜5）。手札は 3 つずつ引くので、draws − 3 + slot がその形の通し番号
export const colorOf = (s, slot) => ((s.draws - 3 + slot) % COLORS) + 1;

// 手札の slot 番目を (r, c) に置く。置けなければ null
export function play(s, slot, r, c) {
  const id = s.hand[slot];
  if (s.over || id == null || !fits(s.board, id, r, c)) return null;
  const shape = SHAPES[id];
  const color = colorOf(s, slot);
  const filled = s.board.slice();
  for (const [dr, dc] of shape.cells) filled[(r + dr) * N + c + dc] = color;
  const { rows, cols } = fullLines(filled);
  const board = filled.slice();
  for (const i of rows) for (let j = 0; j < N; j++) board[i * N + j] = 0;
  for (const i of cols) for (let j = 0; j < N; j++) board[j * N + i] = 0;
  const n = rows.length + cols.length;
  const streak = n ? s.streak + 1 : 0;
  const empty = n > 0 && board.every((v) => v === 0);
  const gained = scoreFor(shape.cells.length, n, streak, empty);
  const hand = s.hand.slice();
  hand[slot] = null;
  let next = { ...s, board, hand, score: s.score + gained, streak, lines: s.lines + n };
  const dealt = hand.every((h) => h == null);
  if (dealt) next = deal(next);
  next = judge(next);
  return { state: next, filled, rows, cols, n, gained, streak, empty, dealt, color };
}

// ---- 保存の形 ----
// 読めないもの・知らない項目は捨て、足りない項目ははじめの値で埋める。

const int = (x, min = 0) => (Number.isInteger(x) && x >= min ? x : null);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function readSettings(o) {
  o = o && typeof o === 'object' ? o : {};
  return {
    v: 1,
    sound: o.sound !== false,
    lang: o.lang === 'ja' || o.lang === 'en' ? o.lang : null,
    coached: o.coached === true,
    mode: o.mode === 'endless' ? 'endless' : 'daily',
  };
}

export function readStats(o) {
  o = o && typeof o === 'object' ? o : {};
  return { v: 1, best: int(o.best) ?? 0, bestDate: isDate(o.bestDate) ? o.bestDate : null, games: int(o.games) ?? 0, lines: int(o.lines) ?? 0 };
}

export function saveGame(s) {
  return { v: 1, seed: s.seed, draws: s.draws, board: s.board.join(''), hand: s.hand.slice(), score: s.score, streak: s.streak, lines: s.lines };
}

// 保存した途中の遊びを戻す。おかしければ null
export function readGame(o) {
  if (!o || typeof o !== 'object' || typeof o.seed !== 'string' || !o.seed) return null;
  if (typeof o.board !== 'string' || !/^[0-5]{64}$/.test(o.board)) return null;
  const draws = int(o.draws, 3);
  if (draws == null || draws % 3) return null;
  if (!Array.isArray(o.hand) || o.hand.length !== 3) return null;
  if (!o.hand.every((h) => h == null || (int(h) != null && h < SHAPES.length))) return null;
  const s = {
    seed: o.seed, draws, board: [...o.board].map(Number), hand: o.hand.map((h) => h ?? null),
    score: int(o.score) ?? 0, streak: int(o.streak) ?? 0, lines: int(o.lines) ?? 0, over: false,
  };
  return judge(s.hand.every((h) => h == null) ? deal(s) : s);
}

export function readDaily(o) {
  o = o && typeof o === 'object' ? o : {};
  const days = {};
  for (const [d, r] of Object.entries(o.days && typeof o.days === 'object' ? o.days : {})) {
    if (isDate(d) && r && int(r.score) != null) days[d] = { score: r.score, lines: int(r.lines) ?? 0 };
  }
  let current = null;
  if (o.current && isDate(o.current.date)) {
    const g = readGame(o.current);
    if (g) current = { date: o.current.date, game: g };
  }
  return { v: 1, days, current };
}

export function saveDaily(d) {
  const current = d.current && { date: d.current.date, ...saveGame(d.current.game), over: d.current.game.over };
  return { v: 1, days: d.days, current };
}

// ---- 日付（端末の時計の 0 時で変わる） ----

const pad = (x) => String(x).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const shortDate = (key) => { const [, m, d] = key.split('-').map(Number); return `${m}/${d}`; };

export function untilTomorrow(d = new Date()) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const min = Math.max(1, Math.ceil((next - d) / 60000));
  return { h: Math.floor(min / 60), m: min % 60 };
}

// 今日（まだなら昨日）から続けて遊んだ日数
export function dayStreak(days, today) {
  const d = new Date(`${today}T12:00:00`);
  if (!days[today]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// 共有用の盤の絵（空き ⬜ / 埋まり 🟨）
export const emojiBoard = (board) =>
  Array.from({ length: N }, (_, r) => board.slice(r * N, r * N + N).map((v) => (v ? '🟨' : '⬜')).join('')).join('\n');
