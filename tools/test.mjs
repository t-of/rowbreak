// node tools/test.mjs — 決まりの自己チェック（形の引き方・置く・消す・点・終わり・今日の盤・保存）
import assert from 'node:assert/strict';
import * as L from '../logic.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };
const id = (pattern) => L.SHAPES.findIndex((s) => s.cells.length === pattern.cells && s.w === pattern.w && s.h === pattern.h);
const MONO = id({ cells: 1, w: 1, h: 1 });
const BAR8 = id({ cells: 5, w: 5, h: 1 });   // 横 5
const BAR3 = id({ cells: 3, w: 3, h: 1 });   // 横 3
const game = (board, hand) => ({ seed: 't', draws: 3, board, hand, score: 0, streak: 0, lines: 0, over: false });
const fill = (cells) => { const b = L.emptyBoard(); for (const i of cells) b[i] = 1; return b; };
const row = (r, from = 0, to = 8) => Array.from({ length: to - from }, (_, j) => r * 8 + from + j);
const col = (c, from = 0, to = 8) => Array.from({ length: to - from }, (_, j) => (from + j) * 8 + c);

test('形: 30 前後で、どれも 8×8 に入り、重なりがない', () => {
  assert.ok(L.SHAPES.length >= 28 && L.SHAPES.length <= 36, `${L.SHAPES.length} 個`);
  for (const s of L.SHAPES) {
    assert.ok(s.w <= 5 && s.h <= 5 && s.weight > 0);
    assert.equal(new Set(s.cells.map(([r, c]) => `${r},${c}`)).size, s.cells.length);
  }
});

test('同じ種ならいつも同じ形の並び、種が違えば違う並び', () => {
  const seq = (seed) => Array.from({ length: 300 }, (_, i) => L.drawShape(seed, i));
  assert.deepEqual(seq('abc'), seq('abc'));
  assert.notDeepEqual(seq('abc'), seq('abd'));
  assert.ok(seq('abc').every((x) => x >= 0 && x < L.SHAPES.length));
  assert.ok(new Set(seq('abc')).size > 20, 'いろいろな形が出る');
});

test('重みのとおりに出る（小さい形が多め）', () => {
  const count = new Array(L.SHAPES.length).fill(0);
  for (let i = 0; i < 40000; i++) count[L.drawShape('w', i)]++;
  const total = L.SHAPES.reduce((a, s) => a + s.weight, 0);
  L.SHAPES.forEach((s, k) => {
    const want = (40000 * s.weight) / total;
    assert.ok(Math.abs(count[k] - want) < want * 0.25 + 30, `形 ${k}: ${count[k]} / 期待 ${want.toFixed(0)}`);
  });
});

test('今日の盤: 同じ日は同じ並び、日が違えば違う並び。途中から続けても同じ', () => {
  const a = L.newGame(L.dailySeed('2026-09-25'));
  const b = L.newGame(L.dailySeed('2026-09-25'));
  const c = L.newGame(L.dailySeed('2026-09-26'));
  assert.deepEqual(a.hand, b.hand);
  assert.notDeepEqual(
    Array.from({ length: 30 }, (_, i) => L.drawShape(L.dailySeed('2026-09-25'), i)),
    Array.from({ length: 30 }, (_, i) => L.drawShape(L.dailySeed('2026-09-26'), i)));
  assert.equal(a.draws, 3);
  // 保存して戻しても、次に配られる 3 つは同じ
  const back = L.readGame(JSON.parse(JSON.stringify(L.saveGame(a))));
  assert.deepEqual(back, a);
  assert.deepEqual([0, 1, 2].map((k) => L.drawShape(back.seed, back.draws + k)), [3, 4, 5].map((i) => L.drawShape(a.seed, i)));
  assert.ok(c.hand);
});

test('置く: 空いていれば置け、はみ出し・重なりは置けない', () => {
  const b = fill([0]);
  assert.equal(L.fits(b, MONO, 0, 0), false);
  assert.equal(L.fits(b, MONO, 0, 1), true);
  assert.equal(L.fits(b, BAR8, 0, 3), true);
  assert.equal(L.fits(b, BAR8, 0, 4), false, '右にはみ出す');
  assert.equal(L.fits(b, MONO, 8, 0), false);
  assert.equal(L.fits(b, MONO, -1, 0), false);
  const r = L.play(game(b, [MONO, MONO, MONO]), 0, 3, 3);
  assert.equal(r.state.board[27], L.colorOf(game(b, []), 0));
  assert.equal(r.state.hand[0], null);
  assert.equal(r.gained, 1, '1 マス = 1 点');
  assert.equal(L.play(game(b, [MONO, MONO, MONO]), 0, 0, 0), null, '重なる所には置けない');
  assert.equal(L.play(game(b, [null, MONO, MONO]), 0, 1, 1), null, '置いた手札はもうない');
});

test('消す: 行と列が同時にうまると両方消え、交わりを二重に数えない', () => {
  // 行 0 と列 0 が (0,0) だけ空き
  const b = fill([...row(0, 1), ...col(0, 1)]);
  const r = L.play(game(b, [MONO, MONO, MONO]), 0, 0, 0);
  assert.deepEqual(r.rows, [0]);
  assert.deepEqual(r.cols, [0]);
  assert.equal(r.n, 2);
  assert.ok(r.state.board.every((v) => v === 0));
  assert.equal(r.state.lines, 2);
  assert.equal(r.gained, 1 + 40 + 300, '1 マス + 2 本 40 + 全部消し 300');
});

test('点: 1 本 10・2 本 40・3 本 90・4 本 160', () => {
  assert.equal(L.scoreFor(0, 1, 1, false), 10);
  assert.equal(L.scoreFor(0, 2, 1, false), 40);
  assert.equal(L.scoreFor(0, 3, 1, false), 90);
  assert.equal(L.scoreFor(0, 4, 1, false), 160);
  assert.equal(L.scoreFor(5, 0, 0, false), 5);
});

test('点: 連続は 2 回目から +20 × (連続 − 1)、消さずに置くと 0 に戻る', () => {
  // 行 7 と行 6 が、それぞれ 3 マスあければうまる。ほかに 1 マス残しておく（全部消しにしない）
  const b = fill([...row(7, 3), ...row(6, 3), 0]);
  let s = game(b, [BAR3, BAR3, MONO]);
  let r = L.play(s, 0, 7, 0);
  assert.equal(r.streak, 1);
  assert.equal(r.gained, 3 + 10);
  r = L.play(r.state, 1, 6, 0);
  assert.equal(r.streak, 2);
  assert.equal(r.gained, 3 + 10 + 20);
  r = L.play({ ...r.state, hand: [MONO, MONO, MONO] }, 0, 3, 3);
  assert.equal(r.streak, 0, '消さずに置いた');
  assert.equal(r.gained, 1);
});

test('全部置くと次の 3 つが配られる', () => {
  const s = L.newGame('deal');
  let st = { ...s, hand: [MONO, MONO, MONO] };
  st = L.play(st, 0, 0, 0).state;
  st = L.play(st, 1, 0, 2).state;
  const r = L.play(st, 2, 0, 4);
  assert.equal(r.dealt, true);
  assert.equal(r.state.draws, 6);
  assert.deepEqual(r.state.hand, [3, 4, 5].map((i) => L.drawShape('deal', i)));
});

test('終わり: 残りの手札がどこにも置けないと over', () => {
  // 市松模様（1 マスずつ空き）。1 マスは置けるが、横 5 は置けない
  const checker = L.emptyBoard().map((_, i) => ((i >> 3) + (i & 7)) % 2);
  assert.equal(L.anyFit(checker, MONO), true);
  assert.equal(L.anyFit(checker, BAR8), false);
  // 1 マスを置いて、残りが横 5 だけなら終わり
  const r = L.play(game(checker, [MONO, BAR8, null]), 0, 0, 0);
  assert.equal(r.state.over, true);
  assert.equal(L.play(r.state, 1, 0, 0), null, '終わったら置けない');
  // まだ 1 マスが残っていれば終わらない
  const r2 = L.play(game(checker, [MONO, MONO, BAR8]), 0, 0, 0);
  assert.equal(r2.state.over, false);
});

test('置けない形は影を出さない / 置けば消える列を先に教える', () => {
  const b = fill(row(2, 0, 7));
  assert.deepEqual(L.linesIfPlaced(b, MONO, 2, 7), { rows: [2], cols: [] });
  assert.deepEqual(L.linesIfPlaced(b, MONO, 3, 7), { rows: [], cols: [] });
});

test('保存: 壊れたものは捨て、足りない項目は埋める', () => {
  assert.equal(L.readGame(null), null);
  assert.equal(L.readGame({ seed: 'x', draws: 3, board: '0'.repeat(63), hand: [0, 0, 0] }), null);
  assert.equal(L.readGame({ seed: 'x', draws: 4, board: '0'.repeat(64), hand: [0, 0, 0] }), null);
  assert.equal(L.readGame({ seed: 'x', draws: 3, board: '0'.repeat(64), hand: [999, 0, 0] }), null);
  const g = L.readGame({ seed: 'x', draws: 3, board: '0'.repeat(64), hand: [0, null, 1], junk: 1 });
  assert.equal(g.score, 0);
  assert.equal('junk' in g, false);
  assert.deepEqual(L.readSettings({ sound: false, lang: 'fr', extra: 1 }), { v: 1, sound: false, lang: null, coached: false, mode: 'daily' });
  assert.deepEqual(L.readStats('oops'), { v: 1, best: 0, bestDate: null, games: 0, lines: 0 });
  const d = L.readDaily({ days: { '2026-09-25': { score: 12, lines: 1 }, bad: { score: 1 } }, current: { date: '2026-09-25', ...L.saveGame(L.newGame('q')), over: false } });
  assert.deepEqual(Object.keys(d.days), ['2026-09-25']);
  assert.deepEqual(L.readDaily(JSON.parse(JSON.stringify(L.saveDaily(d)))), d);
});

test('日付: 連続日数・次の盤まで・短い日付・絵文字の盤', () => {
  const days = { '2026-09-23': {}, '2026-09-24': {}, '2026-09-25': {} };
  assert.equal(L.dayStreak(days, '2026-09-25'), 3);
  assert.equal(L.dayStreak(days, '2026-09-26'), 3, 'まだ遊んでいない日は昨日まで');
  assert.equal(L.dayStreak(days, '2026-09-28'), 0);
  assert.deepEqual(L.untilTomorrow(new Date(2026, 8, 25, 18, 48)), { h: 5, m: 12 });
  assert.equal(L.shortDate('2026-09-05'), '9/5');
  assert.equal(L.dateKey(new Date(2026, 0, 2)), '2026-01-02');
  const e = L.emojiBoard(fill([0, 63])).split('\n');
  assert.equal(e.length, 8);
  assert.ok(e[0].startsWith('🟨⬜') && e[7].endsWith('⬜🟨'));
});

test('ランダムに最後まで遊んでも、盤と点がくずれない', () => {
  let s = L.newGame('fuzz');
  let moves = 0;
  while (!s.over && moves < 2000) {
    const opts = [];
    s.hand.forEach((h, k) => { if (h == null) return; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (L.fits(s.board, h, r, c)) opts.push([k, r, c]); });
    assert.ok(opts.length > 0, 'over でなければ置ける所がある');
    const [k, r, c] = opts[(moves * 7919) % opts.length];
    const before = s.score;
    const res = L.play(s, k, r, c);
    assert.ok(res.state.score > before);
    assert.equal(L.fullLines(res.state.board).rows.length + L.fullLines(res.state.board).cols.length, 0, 'うまった列は残らない');
    s = res.state;
    moves++;
  }
  assert.ok(s.over, '終わる');
});

console.log(`\n${n} 件 ok`);
