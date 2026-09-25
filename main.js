// ROWBREAK の画面。決まりは logic.js にあり、ここは描く・触る・鳴らす・保存するだけ。
import * as L from './logic.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。キーは必ず 'rowbreak.' で始める。
const STORE = 'rowbreak.';

function load(key) {
  try {
    const v = localStorage.getItem(STORE + key);
    return v == null ? null : JSON.parse(v);
  } catch { return null; }
}
function save(key, value) {
  try {
    if (value == null) localStorage.removeItem(STORE + key);
    else localStorage.setItem(STORE + key, JSON.stringify(value));
  } catch { /* 保存できなくても遊べる */ }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}

// お金の区切り（仕様 11）。結果を閉じて次を始めるところで呼ぶ。最初の版では何もしない
function adBreak(_kind) {}

// ---------- 言葉 ----------

const T = {
  ja: {
    title: 'ROWBREAK — 置いて消す 8×8 ブロック',
    about: '8×8 の盤に、下に出る 3 つのブロックを好きな順に置き、縦か横の列をうめて消していく。今日の盤は全員に同じ順番でブロックが配られるので、同じ条件でスコアを比べられる。',
    'mode.daily': '今日の盤', 'mode.endless': 'エンドレス',
    'sound.on': '音 オン', 'sound.off': '音 オフ',
    lang: '日本語',
    best: 'ベスト {n}',
    'daily.label': '今日の盤 {date}',
    'coach.1': '下のブロックを指で盤へ運んで置く。回せない',
    'coach.2': '縦か横の 1 列がうまると消える。何列もまとめて消すほど高い点',
    'coach.3': 'どれも置けなくなったら終わり',
    'coach.ok': 'はじめる',
    'pop.lines': '{n} 列', 'pop.streak': '連続 {n}', 'pop.clear': '全部消し',
    'over.title': 'もう置けない',
    'result.score': '{n} 点', 'result.lines': '{n} 列', 'result.best': '自己ベスト', 'result.days': '{n} 日連続',
    'result.again': 'もう 1 回', 'result.toEndless': 'エンドレスへ', 'result.next': '次の盤まで あと {h} 時間 {m} 分',
    'daily.done': '今日の盤は遊んだ。また明日',
    retry: '引き直し（1 回だけ）',
    share: '共有', install: 'アプリにする', credit: 'T.OF... のアプリ',
    'share.daily': 'ROWBREAK 今日の盤 {date}\n{score} 点・{lines} 列',
    'share.endless': 'ROWBREAK で {score} 点（{lines} 列）',
    'share.best': '自己ベスト！',
  },
  en: {
    title: 'ROWBREAK — Place, fill, break',
    about: 'Drop three blocks at a time onto an 8×8 board and fill rows or columns to break them. The Daily board deals everyone the same blocks in the same order, so scores are directly comparable.',
    'mode.daily': 'Daily', 'mode.endless': 'Endless',
    'sound.on': 'Sound on', 'sound.off': 'Sound off',
    lang: 'English',
    best: 'Best {n}',
    'daily.label': 'Daily {date}',
    'coach.1': 'Drag a block onto the board. No rotating.',
    'coach.2': 'Fill a row or column to break it. Break several at once for more.',
    'coach.3': 'The game ends when nothing fits.',
    'coach.ok': 'Start',
    'pop.lines': '{n} lines', 'pop.streak': 'Streak {n}', 'pop.clear': 'Board clear',
    'over.title': 'No room left',
    'result.score': '{n} pts', 'result.lines': '{n} lines', 'result.best': 'New best', 'result.days': '{n}-day streak',
    'result.again': 'Play again', 'result.toEndless': 'Play Endless', 'result.next': 'Next board in {h}h {m}m',
    'daily.done': "You've played today's board. See you tomorrow.",
    retry: 'Redraw (once)',
    share: 'Share', install: 'Install', credit: 'An app by T.OF...',
    'share.daily': 'ROWBREAK Daily {date}\n{score} pts · {lines} lines',
    'share.endless': 'Scored {score} on ROWBREAK ({lines} lines)',
    'share.best': 'New best!',
  },
};

const settings = L.readSettings(load('settings'));
const saveSettings = () => save('settings', settings);
const deviceLang = () => ((navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en');
let lang = settings.lang || deviceLang();
const t = (key, vars = {}) => T[lang][key].replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const num = (n) => n.toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US');

// ---------- 音（Web Audio で作る） ----------

const sfx = (() => {
  let ctx = null, out = null;
  function ensure() {
    if (!settings.sound) return null;
    setAudioSession(true);
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.5;
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone({ f, to, type = 'sine', at = 0, dur = 0.1, vol = 0.12 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + at + 0.005;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  // 5 音音階（ソ ラ シ レ ミ …）の i 段目
  const step = (i) => 392 * 2 ** ((12 * Math.floor(i / 5) + [0, 2, 4, 7, 9][i % 5]) / 12);
  return {
    lift: () => tone({ f: 1500, dur: 0.03, vol: 0.04 }),
    // 大きい形ほど少し低く
    place: (cells) => tone({ f: 260 - cells * 12, to: 150 - cells * 6, type: 'triangle', dur: 0.06, vol: 0.2 }),
    back: () => tone({ f: 520, to: 300, dur: 0.08, vol: 0.06 }),
    // 列の数だけ上へ重ねる（4 音まで）。連続ごとに 1 段上がる
    clear(n, streak) {
      const base = Math.min(streak - 1, 7) + 3;
      for (let k = 0; k < Math.min(n, 4); k++) tone({ f: step(base + k * 2), type: 'triangle', at: k * 0.02, dur: 0.22 + k * 0.04, vol: 0.1 });
    },
    allClear: () => [0, 2, 4, 5].forEach((k, i) => tone({ f: step(10 + k), type: 'triangle', at: 0.18 + i * 0.07, dur: 0.18, vol: 0.09 })),
    deal: () => [0, 1, 2].forEach((i) => tone({ f: 900, at: i * 0.05, dur: 0.02, vol: 0.03 })),
    over: () => [440, 370, 311].forEach((f, i) => tone({ f, type: 'triangle', at: i * 0.18, dur: 0.26, vol: 0.09 })),
    best: () => [1568, 2093, 2637].forEach((f, i) => tone({ f, at: i * 0.08, dur: 0.14, vol: 0.05 })),
    click: () => tone({ f: 700, dur: 0.02, vol: 0.04 }),
  };
})();

// ---------- 画面の部品 ----------

const $ = (s) => document.querySelector(s);
const app = $('#app'), boardEl = $('#board'), fxEl = $('#fx'), floatEl = $('#float'), coachEl = $('#coach');
const slots = [...document.querySelectorAll('.slot')];
const resultEl = $('#result');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const cells = Array.from({ length: 64 }, () => {
  const el = document.createElement('div');
  el.className = 'cell';
  boardEl.append(el);
  return el;
});

function pieceEl(id, color, size) {
  const s = L.SHAPES[id];
  const el = document.createElement('div');
  el.className = 'piece';
  el.style.cssText = `--s:${size};--g:var(--c${color});width:calc(${size} * ${s.w});height:calc(${size} * ${s.h})`;
  for (const [r, c] of s.cells) {
    const b = document.createElement('i');
    b.style.left = `calc(${size} * ${c})`;
    b.style.top = `calc(${size} * ${r})`;
    el.append(b);
  }
  return el;
}

// ---------- 遊びの状態 ----------

let today = L.dateKey();
let stats = L.readStats(load('stats'));
const daily = L.readDaily(load('daily'));
let endless = L.readGame(load('endless'));
let game = null;
let last = null;            // エンドレスの最後の結果 { best }
let resultFresh = false;    // 結果が、いま終わった遊びのものか（今日の盤を開き直したときは false）
let epoch = 0;              // モードを変えたら、待っている演出を捨てる

function dailyGame() {
  today = L.dateKey();
  if (daily.current?.date !== today) {
    daily.current = { date: today, game: L.newGame(L.dailySeed(today)) };
    save('daily', L.saveDaily(daily));
  }
  // 記録は 1 日 1 回。記録があれば、盤が空いていても終わった扱い
  if (daily.days[today]) daily.current.game = { ...daily.current.game, over: true };
  return daily.current.game;
}

function persist() {
  if (settings.mode === 'daily') {
    daily.current.game = game;
    save('daily', L.saveDaily(daily));
  } else {
    endless = game.over ? null : game;
    save('endless', endless && L.saveGame(endless));
  }
}

// 終わった遊びを記録する（置いたその場で。閉じてもなかったことにしない）
function record() {
  if (settings.mode === 'daily') {
    daily.days[daily.current.date] = { score: game.score, lines: game.lines };
  } else {
    const isBest = game.score > stats.best;
    stats = { ...stats, games: stats.games + 1, lines: stats.lines + game.lines };
    if (isBest) stats = { ...stats, best: game.score, bestDate: today };
    save('stats', stats);
    last = { best: isBest };
  }
  persist();
}

// ---------- 描く ----------

function renderBoard() {
  cells.forEach((el, i) => {
    if (game.board[i]) el.dataset.c = game.board[i];
    else delete el.dataset.c;
  });
}

function renderHand(enter = false) {
  slots.forEach((el, k) => {
    el.classList.remove('lifted', 'shake', 'enter');
    el.replaceChildren();
    const id = game.hand[k];
    if (id == null) return;
    el.append(pieceEl(id, L.colorOf(game, k), 'var(--hc)'));
    el.classList.toggle('dim', !L.anyFit(game.board, id));
    if (enter && !reduced.matches) el.classList.add('enter');
  });
}

function renderTop() {
  const rec = settings.mode === 'daily' && daily.days[daily.current.date];
  $('#score').textContent = num(rec ? rec.score : game.score);
  $('#sub').textContent = settings.mode === 'daily'
    ? t('daily.label', { date: L.shortDate(daily.current.date) })
    : t('best', { n: num(stats.best) });
  document.querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode)));
}

function renderAll() {
  renderBoard();
  renderHand();
  renderTop();
  showGhost(null);
  app.classList.toggle('is-over', game.over);
  fxEl.replaceChildren();
  if (game.over) showResult(false);
  else resultEl.hidden = true;
}

function showResult(fresh) {
  resultFresh = fresh;
  const d = settings.mode === 'daily';
  const rec = d ? (daily.days[daily.current.date] || game) : game;
  $('#rTitle').textContent = d && !fresh ? t('daily.done') : t('over.title');
  $('#rLabel').textContent = d ? `${t('daily.label', { date: L.shortDate(daily.current.date) })} · ${t('result.days', { n: L.dayStreak(daily.days, today) })}` : '';
  $('#rLabel').hidden = !d;
  $('#rScore').textContent = t('result.score', { n: num(rec.score) });
  $('#rLines').textContent = t('result.lines', { n: num(rec.lines) });
  $('#rBest').textContent = t('result.best');
  $('#rBest').hidden = d || !last?.best;
  $('#rNote').textContent = t('result.next', L.untilTomorrow());
  $('#rNote').hidden = !d;
  $('#again').textContent = d ? t('result.toEndless') : t('result.again');
  resultEl.hidden = false;
}

// ---------- 持ち上げて置く ----------

let drag = null;

function showGhost(p) {
  cells.forEach((el) => { el.classList.remove('ghost', 'hot'); el.style.removeProperty('--g'); });
  if (!p) return;
  const color = `var(--c${L.colorOf(game, p.k)})`;
  for (const [dr, dc] of L.SHAPES[p.id].cells) {
    const el = cells[(p.r + dr) * 8 + p.c + dc];
    el.classList.add('ghost');
    el.style.setProperty('--g', color);
  }
  const { rows, cols } = L.linesIfPlaced(game.board, p.id, p.r, p.c);
  for (const r of rows) for (let j = 0; j < 8; j++) cells[r * 8 + j].classList.add('hot');
  for (const c of cols) for (let j = 0; j < 8; j++) cells[j * 8 + c].classList.add('hot');
}

$('#hand').addEventListener('pointerdown', (e) => {
  const slotEl = e.target.closest('.slot');
  if (!slotEl || drag || !floatEl.hidden || game.over) return;
  const k = Number(slotEl.dataset.slot);
  const id = game.hand[k];
  if (id == null) return;
  e.preventDefault();
  if (!coachEl.hidden) closeCoach();
  sfx.lift();
  const rect = boardEl.getBoundingClientRect();
  const cell = rect.width / 8;
  floatEl.replaceChildren(pieceEl(id, L.colorOf(game, k), `${cell}px`));
  floatEl.classList.remove('back');
  floatEl.hidden = false;
  // 指で隠れないように、少し上（2 マスぶん）に浮かせる。マウスはそのまま
  drag = { k, id, s: L.SHAPES[id], cell, rect, pid: e.pointerId, lift: e.pointerType === 'mouse' ? 0 : 2 * cell, target: null, slotEl };
  slotEl.classList.add('lifted');
  move(e);
});

function move(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  const { s, cell, rect } = drag;
  const x = e.clientX - (s.w * cell) / 2;
  const y = e.clientY - drag.lift - (s.h * cell) / 2;
  floatEl.style.transform = `translate(${x}px, ${y}px)`;
  const r = Math.round((y - rect.top) / cell), c = Math.round((x - rect.left) / cell);
  const target = L.fits(game.board, drag.id, r, c) ? r * 8 + c : null;
  if (target !== drag.target) {
    drag.target = target;
    showGhost(target == null ? null : { k: drag.k, id: drag.id, r, c });
  }
}

function up(e, cancel = false) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag;
  drag = null;
  showGhost(null);
  if (!cancel && d.target != null) {
    floatEl.hidden = true;
    place(d.k, Math.floor(d.target / 8), d.target % 8);
    return;
  }
  // 置けなければ手札へ戻る（0.15 秒）
  sfx.back();
  const piece = d.slotEl.querySelector('.piece').getBoundingClientRect();
  floatEl.classList.add('back');
  floatEl.style.transformOrigin = '0 0';
  floatEl.style.transform = `translate(${piece.left}px, ${piece.top}px) scale(${piece.width / (d.s.w * d.cell)})`;
  setTimeout(() => {
    floatEl.hidden = true;
    floatEl.style.transformOrigin = '';
    d.slotEl.classList.remove('lifted');
  }, reduced.matches ? 0 : 150);
}

addEventListener('pointermove', move);
addEventListener('pointerup', (e) => up(e));
addEventListener('pointercancel', (e) => up(e, true));

function place(k, r, c) {
  const shape = L.SHAPES[game.hand[k]];
  const res = L.play(game, k, r, c);
  if (!res) return;
  game = res.state;
  sfx.place(shape.cells.length);
  renderBoard();
  if (res.n) {
    burst(res);
    sfx.clear(res.n, res.streak);
    if (res.empty) sfx.allClear();
    pop(res, r + shape.h / 2, c + shape.w / 2);
  }
  renderHand(res.dealt);
  if (res.dealt) setTimeout(sfx.deal, 120);
  renderTop();
  if (game.over) gameOver(res.n ? 450 : 150);
  else persist();
}

// うまった列に光が走り、マスが列の真ん中から外へはじける
function burst(res) {
  const cell = boardEl.getBoundingClientRect().width / 8;
  const add = (cls, css) => {
    const el = document.createElement('div');
    el.className = cls;
    el.style.cssText = css;
    fxEl.append(el);
    setTimeout(() => el.remove(), 800);
  };
  for (const r of res.rows) add('flash', `left:0;right:0;top:${(r + 0.5) * cell - 1}px;height:2px`);
  for (const c of res.cols) add('flash', `top:0;bottom:0;left:${(c + 0.5) * cell - 1}px;width:2px`);
  const hit = new Set();
  for (const r of res.rows) for (let j = 0; j < 8; j++) hit.add(r * 8 + j);
  for (const c of res.cols) for (let j = 0; j < 8; j++) hit.add(j * 8 + c);
  for (const i of hit) {
    const r = i >> 3, c = i & 7;
    const inRow = res.rows.includes(r), inCol = res.cols.includes(c);
    const dx = inRow ? (c - 3.5) * cell * 0.4 : ((i * 37) % 7 - 3) * 2;
    const dy = inCol ? (r - 3.5) * cell * 0.4 : ((i * 53) % 7 - 3) * 2;
    const from = Math.abs((inRow ? c : r) - 3.5);
    add('bit', `left:${c * cell}px;top:${r * cell}px;--g:var(--c${res.filled[i]});--dx:${dx}px;--dy:${dy}px;animation-delay:${0.08 + from * 0.02}s`);
  }
}

// 取った点を盤の上に小さく。ほめ言葉の段階表示は使わない
function pop(res, y, x) {
  const el = document.createElement('div');
  el.className = 'pop';
  const notes = [];
  if (res.n >= 2) notes.push(t('pop.lines', { n: res.n }));
  if (res.streak >= 2) notes.push(t('pop.streak', { n: res.streak }));
  if (res.empty) notes.push(t('pop.clear'));
  el.textContent = `+${num(res.gained)}`;
  if (notes.length) {
    const s = document.createElement('small');
    s.textContent = notes.join(' · ');
    el.append(s);
  }
  el.style.left = `${Math.min(80, Math.max(20, (x / 8) * 100))}%`;
  el.style.top = `${Math.min(88, Math.max(10, (y / 8) * 100))}%`;
  fxEl.append(el);
  setTimeout(() => el.remove(), 1000);
}

// どれも置けなくなったら、置けない手札がゆれて、盤が少し暗くなり、結果が出る
function gameOver(delay) {
  record();
  renderTop();
  const my = epoch;
  setTimeout(() => {
    if (my !== epoch) return;
    slots.forEach((el) => { if (el.firstChild) el.classList.add('shake'); });
    app.classList.add('is-over');
    sfx.over();
  }, delay);
  setTimeout(() => {
    if (my !== epoch) return;
    if (last?.best && settings.mode === 'endless') sfx.best();
    showResult(true);
  }, delay + 800);
}

// ---------- モード・ボタン ----------

function setMode(mode) {
  epoch++;
  settings.mode = mode;
  saveSettings();
  if (mode === 'daily') game = dailyGame();
  else {
    game = endless || L.newGame(L.newSeed());
    persist();
  }
  renderAll();
}

document.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => {
  if (drag || b.dataset.mode === settings.mode) return;
  sfx.click();
  setMode(b.dataset.mode);
}));

$('#again').addEventListener('click', () => {
  sfx.click();
  adBreak('next');
  if (settings.mode === 'endless') { endless = null; last = null; }
  setMode('endless');
  renderHand(true);
  sfx.deal();
});

$('#rShare').addEventListener('click', () => {
  const d = settings.mode === 'daily';
  const rec = d ? (daily.days[daily.current.date] || game) : game;
  const vars = { score: num(rec.score), lines: num(rec.lines) };
  const text = d
    ? `${t('share.daily', { ...vars, date: L.shortDate(daily.current.date) })}\n${L.emojiBoard(game.board)}`
    : `${last?.best ? t('share.best') + (lang === 'ja' ? '' : ' ') : ''}${t('share.endless', vars)}`;
  WebAppKit.share({ text });
});

function renderSound() {
  const b = $('#sound');
  b.textContent = t(settings.sound ? 'sound.on' : 'sound.off');
  b.setAttribute('aria-pressed', String(settings.sound));
}
$('#sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  setAudioSession(settings.sound);
  saveSettings();
  renderSound();
  sfx.click();
});

function applyLang() {
  document.documentElement.lang = lang;
  document.title = t('title');
  WebAppKit.init({ lang, title: 'ROWBREAK', text: t('about') });
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  $('#lang').textContent = T[lang === 'ja' ? 'en' : 'ja'].lang;   // 押すと変わる先の言葉を見せる
  renderSound();
  if (game) {
    renderTop();
    if (!resultEl.hidden) showResult(resultFresh);
  }
}
$('#lang').addEventListener('click', () => {
  lang = lang === 'ja' ? 'en' : 'ja';
  settings.lang = lang;
  saveSettings();
  sfx.click();
  applyLang();
});

function closeCoach() {
  coachEl.hidden = true;
  settings.coached = true;
  saveSettings();
}
$('#coachOk').addEventListener('click', () => { sfx.click(); closeCoach(); });

// 日付が変わったら今日の盤を入れ替え、「次の盤まで」を更新する
function tick() {
  if (settings.mode !== 'daily' || drag) return;
  if (L.dateKey() !== today) setMode('daily');
  else if (!resultEl.hidden) $('#rNote').textContent = t('result.next', L.untilTomorrow());
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
setInterval(tick, 30000);

// ---------- はじめ ----------

setAudioSession(settings.sound);
applyLang();
setMode(settings.mode);
coachEl.hidden = settings.coached;
