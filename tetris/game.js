// 俄罗斯方块 · 微信小游戏
// 入口文件：画布初始化、场景（菜单 / 游戏）、主循环、触控输入与 Canvas 渲染。
// 核心逻辑见 utils/engine.js，音频见 utils/audio.js。

const engine = require('./utils/engine.js');
const audio = require('./utils/audio.js');
const { COLS, ROWS, COLORS, SHAPES, CLEAR_MS, cellsOf } = engine;

// ---------- 系统信息 ----------
function getSys() {
  const i = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
  const W = i.windowWidth || i.screenWidth;
  const H = i.windowHeight || i.screenHeight;
  const dpr = i.pixelRatio || 1;
  const sa = i.safeArea || { top: 0, bottom: H };
  return {
    W, H,
    DPR: dpr,
    safeTop: sa.top || 0,
    safeBottom: Math.max(0, H - (sa.bottom || H))
  };
}
let sys = getSys();

// ---------- 画布 ----------
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

function applyScale() {
  canvas.width = sys.W * sys.DPR;
  canvas.height = sys.H * sys.DPR;
  ctx.setTransform(sys.DPR, 0, 0, sys.DPR, 0, 0);
}
applyScale();

// ---------- 状态 ----------
const game = new engine.Game();
let scene = 'menu';            // 'menu' | 'game'
let highscore = 0;
try { highscore = parseInt(wx.getStorageSync('tetris_high') || '0', 10) || 0; } catch (e) {}

let modal = { show: false };   // { show, emoji, title, sub, primary, primaryAction, ghost, ghostAction }
let layout = { buttons: [], modalButtons: [] };

// 触控状态：identifier -> 按住的按钮 action
const activeTouches = {};
let repeatTimer = null;

// ---------- 常量 ----------
const REPEAT = { left: 1, right: 1, down: 1 };
const ACTION_LABEL = { left: '◀', down: '▼', right: '▶', rotate: '↻', harddrop: '⤓', hold: 'H' };
const BG_TOP = '#1c2740', BG_BOTTOM = '#0f1420';
const PANEL = '#1a2233', BORDER = '#2a3550', TEXT = '#e6ecf7', MUTED = '#8896b0', ACCENT = '#4da3ff';

// ---------- 绘图工具 ----------
function roundRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(x, y, w, h, r, fill, stroke) {
  roundRectPath(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function drawText(text, x, y, size, color, weight, align) {
  ctx.fillStyle = color;
  ctx.font = (weight || 400) + ' ' + size + 'px sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawButton(b, o) {
  o = o || {};
  const bg = o.bg || PANEL;
  const border = o.border === undefined ? BORDER : o.border;
  const r = o.radius != null ? o.radius : 10;
  fillRoundRect(b.x, b.y, b.w, b.h, r, bg, border);
  if (o.label) drawText(o.label, b.x + b.w / 2, b.y + b.h / 2, o.fontSize || 16, o.color || TEXT, o.weight || 400);
}

function drawSwitch(sw, on) {
  fillRoundRect(sw.x, sw.y, sw.w, sw.h, sw.h / 2, on ? ACCENT : 'rgba(255,255,255,0.18)');
  const r = sw.h / 2 - 3;
  const kx = on ? sw.x + sw.w - r - 3 : sw.x + 3 + r;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(kx, sw.y + sw.h / 2, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 布局 ----------
function computeMenuLayout() {
  const W = sys.W;
  const cx = W / 2;
  const panelW = Math.min(360, W - 40);
  const panelX = (W - panelW) / 2;
  const rowH = 48;
  const switchW = 50, switchH = 28;
  let y = sys.safeTop + 28;

  const m = {};
  m.logoY = y; y += 54;
  m.titleY = y; y += 44;
  m.subY = y; y += 40;
  m.start = { x: cx - 120, y, w: 240, h: 54 }; y += 54 + 20;

  m.panel = { x: panelX, y, w: panelW, h: 26 + rowH * 2 + 10 };
  m.panelTitleY = m.panel.y + 20;
  m.row1c = m.panel.y + 26 + rowH / 2;
  m.row2c = m.row1c + rowH;
  const swX = panelX + panelW - 14 - switchW;
  m.bgmSwitch = { x: swX, y: m.row1c - switchH / 2, w: switchW, h: switchH };
  m.sfxSwitch = { x: swX, y: m.row2c - switchH / 2, w: switchW, h: switchH };
  y += m.panel.h + 16;

  const instrLines = ['◀ ▶ 左右移动 · ▼ 加速下落', '↻ 旋转 · ⤓ 硬降 · H 暂存', '⏸ 暂停 · 长按方向键连续移动'];
  m.instruct = { x: panelX, y, w: panelW, h: 20 + 18 + instrLines.length * 20 + 8 };
  m.instructTitleY = m.instruct.y + 20;
  m.instructLines = instrLines.map((t, i) => ({ text: t, y: m.instruct.y + 20 + 18 + i * 20 + 4 }));
  y += m.instruct.h + 18;

  m.highY = y;

  layout.menu = m;
  layout.buttons = [
    { x: m.start.x, y: m.start.y, w: m.start.w, h: m.start.h, action: 'start' },
    { x: m.bgmSwitch.x - 10, y: m.bgmSwitch.y - 10, w: switchW + 20, h: switchH + 20, action: 'bgm' },
    { x: m.sfxSwitch.x - 10, y: m.sfxSwitch.y - 10, w: switchW + 20, h: switchH + 20, action: 'sfx' }
  ];
}

function computeLayout() {
  const W = sys.W, H = sys.H;
  layout = { buttons: [], modalButtons: [], orientation: (W > H ? 'landscape' : 'portrait') };

  if (scene === 'menu') { computeMenuLayout(); return; }

  const topBarH = 46;
  const tbtnSize = 40;
  const ty = sys.safeTop + (topBarH - tbtnSize) / 2;
  layout.topBarH = topBarH;
  layout.back = { x: 10, y: ty, w: tbtnSize, h: tbtnSize, action: 'back' };
  layout.bgm = { x: W - 18 - tbtnSize * 3, y: ty, w: tbtnSize, h: tbtnSize, action: 'bgm' };
  layout.sfx = { x: W - 14 - tbtnSize * 2, y: ty, w: tbtnSize, h: tbtnSize, action: 'sfx' };
  layout.pause = { x: W - 10 - tbtnSize, y: ty, w: tbtnSize, h: tbtnSize, action: 'pause' };
  layout.scoreX = (layout.back.x + layout.back.w + layout.bgm.x) / 2;
  layout.scoreY = sys.safeTop + 15;
  layout.metaY = sys.safeTop + 34;

  const pad = 8;

  if (W > H) {
    // ---- 横屏：左侧棋盘，右侧信息 + 按钮 ----
    const panelW = Math.min(210, Math.floor(W * 0.3));
    const sideX = W - panelW - pad;
    const availH = H - sys.safeTop - sys.safeBottom - topBarH - pad * 2;
    const boardAreaW = sideX - pad;
    const cell = Math.max(8, Math.floor(Math.min((boardAreaW - pad) / COLS, (availH - pad) / ROWS)));
    const bw = cell * COLS, bh = cell * ROWS;
    layout.board = { x: Math.floor((boardAreaW - bw) / 2), y: sys.safeTop + topBarH + pad + Math.floor((availH - bh) / 2), w: bw, h: bh, cell };

    const innerX = sideX + pad;
    const innerW = panelW - pad * 2;
    let y = sys.safeTop + topBarH + pad;
    layout.nextLabel = { x: innerX + innerW / 2, y: y + 6 };
    layout.next = { x: innerX, y: y + 18, w: innerW, h: 56 };
    y += 18 + 56 + 8;
    layout.holdLabel = { x: innerX + innerW / 2, y: y + 6 };
    layout.hold = { x: innerX, y: y + 18, w: innerW, h: 34 };
    y += 18 + 34 + 12;

    const gap = 8;
    const bwBtn = Math.floor((innerW - gap * 2) / 3);
    const bhBtn = 46;
    layout.controlButtons = [];
    [['left', 'down', 'right'], ['rotate', 'harddrop', 'hold']].forEach((row, ri) => {
      row.forEach((a, ci) => layout.controlButtons.push({
        x: innerX + ci * (bwBtn + gap), y: y + ri * (bhBtn + gap), w: bwBtn, h: bhBtn,
        action: a, label: ACTION_LABEL[a], repeat: !!REPEAT[a]
      }));
    });
  } else {
    // ---- 竖屏：顶部栏 / 棋盘 / 预览 / 底部按钮 ----
    const controlsH = 104, previewH = 96;
    const controlsBottom = H - sys.safeBottom;
    const controlsTop = controlsBottom - controlsH;
    const previewTop = controlsTop - pad - previewH;
    const boardTop = sys.safeTop + topBarH + pad;
    const boardBottom = previewTop - pad;
    const boardAreaW = W - pad * 2;
    const boardAreaH = boardBottom - boardTop;
    const cell = Math.max(8, Math.floor(Math.min(boardAreaW / COLS, boardAreaH / ROWS)));
    const bw = cell * COLS, bh = cell * ROWS;
    layout.board = { x: Math.floor((W - bw) / 2), y: Math.floor(boardTop + (boardAreaH - bh) / 2), w: bw, h: bh, cell };

    const nextW = 64, nextH = 64, holdW = 88, holdH = 36, pgap = 24;
    const totalW = nextW + pgap + holdW;
    const px = (W - totalW) / 2;
    const labelY = previewTop + 8;
    const boxY = previewTop + 18;
    const boxBottom = boxY + nextH;
    layout.next = { x: px, y: boxY, w: nextW, h: nextH };
    layout.hold = { x: px + nextW + pgap, y: boxBottom - holdH, w: holdW, h: holdH };
    layout.nextLabel = { x: px + nextW / 2, y: labelY };
    layout.holdLabel = { x: px + nextW + pgap + holdW / 2, y: labelY };

    const sidePad = 10, gap = 8, clusterGap = 24;
    const avail = W - sidePad * 2;
    const bwBtn = Math.floor((avail - clusterGap - gap * 4) / 6);
    const bhBtn = Math.min(56, bwBtn);
    const cy = controlsTop + (controlsH - bhBtn) / 2;
    const cw = bwBtn * 3 + gap * 2;
    layout.controlButtons = [];
    [['left', 'down', 'right'], ['rotate', 'harddrop', 'hold']].forEach((row, ri) => {
      const rx = ri === 0 ? sidePad : W - sidePad - cw;
      row.forEach((a, ci) => layout.controlButtons.push({
        x: rx + ci * (bwBtn + gap), y: cy, w: bwBtn, h: bhBtn,
        action: a, label: ACTION_LABEL[a], repeat: !!REPEAT[a]
      }));
    });
  }

  layout.buttons = [layout.back, layout.bgm, layout.sfx, layout.pause, ...layout.controlButtons];
}

// ---------- 渲染 ----------
function drawCell(px, py, type, size) {
  ctx.fillStyle = COLORS[type];
  ctx.fillRect(px, py, size - 1, size - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(px, py, size - 1, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px, py + size - 3, size - 1, 3);
}

function drawBoard(b) {
  const cell = b.cell, ox = b.x, oy = b.y;
  ctx.save();
  roundRectPath(ox, oy, b.w, b.h, 4);
  ctx.clip();

  // 网格
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++)
      if ((x + y) % 2 === 0) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);

  // 已固定方块
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (game.board[y][x]) drawCell(ox + x * cell, oy + y * cell, game.board[y][x], cell);

  // 消行闪烁
  if (game.clearing) {
    const el = Date.now() - (game.clearingDone - CLEAR_MS);
    const on = Math.floor(el / 90) % 2 === 0;
    ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)';
    for (const y of game.clearingRows) ctx.fillRect(ox, oy + y * cell, cell * COLS, cell);
  }

  // 当前方块 + 幽灵投影
  if (game.current && game.started && !game.gameOver) {
    const ghost = game.ghostOf();
    ctx.strokeStyle = COLORS[ghost.type] + '66';
    ctx.lineWidth = 1;
    for (const [x, y] of cellsOf(ghost)) {
      if (y < 0) continue;
      ctx.strokeRect(ox + x * cell + 1, oy + y * cell + 1, cell - 3, cell - 3);
    }
    for (const [x, y] of cellsOf(game.current)) {
      if (y < 0) continue;
      drawCell(ox + x * cell, oy + y * cell, game.current.type, cell);
    }
  }
  ctx.restore();
}

function drawMiniInBox(box, type) {
  fillRoundRect(box.x, box.y, box.w, box.h, 6, 'rgba(0,0,0,0.25)');
  if (!type) return;
  const m = SHAPES[type];
  const size = Math.max(4, Math.floor(Math.min(box.w / m[0].length, box.h / m.length)) - 2);
  const pw = m[0].length * size, ph = m.length * size;
  const ox = box.x + (box.w - pw) / 2;
  const oy = box.y + (box.h - ph) / 2;
  ctx.fillStyle = COLORS[type];
  for (let y = 0; y < m.length; y++)
    for (let x = 0; x < m[y].length; x++)
      if (m[y][x]) ctx.fillRect(ox + x * size, oy + y * size, size - 1, size - 1);
}

function renderMenu() {
  const m = layout.menu;
  drawText('🕹️', sys.W / 2, m.logoY, 48, TEXT);
  drawText('俄罗斯方块', sys.W / 2, m.titleY, 38, TEXT, 800);
  drawText('TETRIS', sys.W / 2, m.subY, 13, 'rgba(255,255,255,0.55)');
  drawButton(m.start, { label: '▶ 开始游戏', bg: ACCENT, color: '#081018', fontSize: 20, weight: 700, radius: m.start.h / 2 });

  fillRoundRect(m.panel.x, m.panel.y, m.panel.w, m.panel.h, 14, 'rgba(20,24,50,0.72)', 'rgba(255,255,255,0.12)');
  drawText('设置', m.panel.x + 16, m.panelTitleY, 14, ACCENT, 700, 'left');
  drawText('🎵 背景音乐', m.panel.x + 16, m.row1c, 15, TEXT, 400, 'left');
  drawText('🔔 音效', m.panel.x + 16, m.row2c, 15, TEXT, 400, 'left');
  drawSwitch(m.bgmSwitch, audio.getBgm());
  drawSwitch(m.sfxSwitch, audio.getSfx());

  fillRoundRect(m.instruct.x, m.instruct.y, m.instruct.w, m.instruct.h, 14, 'rgba(20,24,50,0.72)', 'rgba(255,255,255,0.12)');
  drawText('操作说明', m.instruct.x + 16, m.instructTitleY, 14, ACCENT, 700, 'left');
  for (const l of m.instructLines) drawText(l.text, m.instruct.x + 16, l.y, 12, 'rgba(255,255,255,0.75)', 400, 'left');

  drawText('🏆 最高分：' + (highscore ? highscore : '暂无'), sys.W / 2, m.highY, 13, 'rgba(255,255,255,0.5)');
}

function renderGame() {
  // 顶栏
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, sys.safeTop, sys.W, layout.topBarH);
  ctx.fillStyle = BORDER;
  ctx.fillRect(0, sys.safeTop + layout.topBarH - 1, sys.W, 1);

  drawButton(layout.back, { label: '‹', fontSize: 26 });
  drawButton(layout.bgm, { label: audio.getBgm() ? '🔊' : '🔇', fontSize: 18 });
  drawButton(layout.sfx, { label: audio.getSfx() ? '🔔' : '🔕', fontSize: 18 });
  drawButton(layout.pause, { label: game.paused ? '▶' : '⏸', fontSize: 18 });

  drawText(String(game.score), layout.scoreX, layout.scoreY, 22, TEXT, 800);
  drawText(game.level + '级 · ' + game.lines + '行', layout.scoreX, layout.metaY, 11, MUTED);

  // 棋盘
  const b = layout.board;
  fillRoundRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12, 8, PANEL, BORDER);
  drawBoard(b);

  // 预览
  drawText('下一个', layout.nextLabel.x, layout.nextLabel.y, 11, MUTED);
  drawMiniInBox(layout.next, game.queue[0]);
  drawText('暂存', layout.holdLabel.x, layout.holdLabel.y, 11, MUTED);
  drawMiniInBox(layout.hold, game.held);

  // 触控按钮
  for (const c of layout.controlButtons) drawButton(c, { label: c.label, fontSize: 22 });

  renderModal();
}

function renderModal() {
  if (!modal.show) return;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, sys.W, sys.H);

  const cw = Math.min(320, sys.W - 48);
  const ch = 230;
  const cx = (sys.W - cw) / 2, cy = (sys.H - ch) / 2;
  fillRoundRect(cx, cy, cw, ch, 20, '#1d2440', 'rgba(255,255,255,0.14)');
  drawText(modal.emoji || '🕹️', cx + cw / 2, cy + 40, 44, TEXT);
  drawText(modal.title, cx + cw / 2, cy + 84, 20, TEXT, 800);
  drawText(modal.sub, cx + cw / 2, cy + 112, 13, 'rgba(255,255,255,0.7)');

  const btnY = cy + ch - 54;
  const pad = 24, gap = 12;
  const bw = (cw - pad * 2 - gap) / 2;
  const pRect = { x: cx + pad, y: btnY, w: bw, h: 40 };
  drawButton(pRect, { label: modal.primary, bg: ACCENT, color: '#081018', fontSize: 15, weight: 700, radius: 20 });
  layout.modalButtons = [{ x: pRect.x, y: pRect.y, w: pRect.w, h: pRect.h, action: modal.primaryAction }];
  if (modal.ghost) {
    const gRect = { x: cx + pad + bw + gap, y: btnY, w: bw, h: 40 };
    drawButton(gRect, { label: modal.ghost, bg: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 15, radius: 20, border: null });
    layout.modalButtons.push({ x: gRect.x, y: gRect.y, w: gRect.w, h: gRect.h, action: modal.ghostAction });
  }
}

function render() {
  computeLayout();
  const g = ctx.createLinearGradient(0, 0, 0, sys.H);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(0.6, BG_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sys.W, sys.H);
  if (scene === 'menu') renderMenu();
  else renderGame();
}

// ---------- 游戏控制 ----------
function runGameAction(action) {
  const g = game;
  let events;
  switch (action) {
    case 'left': events = g.move(-1); break;
    case 'right': events = g.move(1); break;
    case 'down': events = g.softDrop(); break;
    case 'rotate': events = g.rotate(1); break;
    case 'harddrop': events = g.hardDrop(); break;
    case 'hold': events = g.hold(); break;
    default: return;
  }
  if (events && events.length) handleEvents(events);
}

function handleEvents(events) {
  for (const e of events) audio.play(e);
  if (game.gameOver) onGameOver();
}

function showModal(emoji, title, sub, primary, primaryAction, ghost, ghostAction) {
  modal = { show: true, emoji, title, sub, primary, primaryAction, ghost, ghostAction };
}
function hideModal() { modal = { show: false }; }

function clearTouches() {
  for (const k in activeTouches) delete activeTouches[k];
  if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
}

function startGame() {
  const events = game.start();
  if (events && events.length) handleEvents(events);
  scene = 'game';
  audio.playBgm();
  hideModal();
  clearTouches();
}

function goMenu() {
  scene = 'menu';
  if (game.started) game.paused = true;
  audio.pauseBgm();
  hideModal();
  clearTouches();
  audio.play('click');
}

function togglePause() {
  if (!game.started || game.gameOver) return;
  if (!game.paused) {
    game.paused = true;
    audio.pauseBgm();
    showModal('⏸', '已暂停', '点击继续游戏', '继续', 'resume', '重新开始', 'restart');
  } else {
    resumeGame();
  }
}

function resumeGame() {
  game.paused = false;
  game.lastDrop = Date.now();
  audio.resumeBgm();
  hideModal();
}

function onGameOver() {
  audio.pauseBgm();
  if (game.score > highscore) {
    highscore = game.score;
    try { wx.setStorageSync('tetris_high', highscore); } catch (e) {}
  }
  showModal('💥', '游戏结束', '得分 ' + game.score + ' · 最高 ' + highscore, '再来一局', 'restart', '返回菜单', 'menu');
}

function toggleBgm() {
  const on = !audio.getBgm();
  audio.setBgm(on);
  if (on) audio.playBgm(); else audio.stopBgm();
  audio.play('click');
}
function toggleSfx() {
  const on = !audio.getSfx();
  audio.setSfx(on);
  if (on) audio.play('click');
}

function dispatch(action) {
  switch (action) {
    case 'left': case 'right': case 'down': case 'rotate': case 'harddrop': case 'hold':
      runGameAction(action); break;
    case 'start': startGame(); break;
    case 'back': case 'menu': goMenu(); break;
    case 'pause': togglePause(); break;
    case 'bgm': toggleBgm(); break;
    case 'sfx': toggleSfx(); break;
    case 'resume': resumeGame(); break;
    case 'restart': startGame(); break;
  }
}

// ---------- 输入 ----------
function buttonAt(x, y) {
  const list = (modal && modal.show && layout.modalButtons.length) ? layout.modalButtons : layout.buttons;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function updateRepeat() {
  const hasRepeat = Object.keys(activeTouches).some((id) => REPEAT[activeTouches[id]]);
  if (hasRepeat && !repeatTimer) {
    repeatTimer = setInterval(function () {
      const seen = {};
      for (const id in activeTouches) {
        const a = activeTouches[id];
        if (REPEAT[a] && !seen[a]) { seen[a] = 1; runGameAction(a); }
      }
    }, 90);
  } else if (!hasRepeat && repeatTimer) {
    clearInterval(repeatTimer);
    repeatTimer = null;
  }
}

wx.onTouchStart(function (e) {
  for (const t of e.changedTouches) {
    const b = buttonAt(t.clientX, t.clientY);
    if (b) {
      activeTouches[t.identifier] = b.action;
      dispatch(b.action);
    }
  }
  updateRepeat();
});

wx.onTouchMove(function (e) {
  for (const t of e.changedTouches) {
    if (activeTouches[t.identifier] === undefined) continue;
    const b = buttonAt(t.clientX, t.clientY);
    if (b && b.action !== activeTouches[t.identifier]) {
      activeTouches[t.identifier] = b.action;
      if (REPEAT[b.action]) runGameAction(b.action);
    }
  }
  updateRepeat();
});

function onTouchEnd(e) {
  for (const t of e.changedTouches) {
    if (activeTouches[t.identifier] !== undefined) delete activeTouches[t.identifier];
  }
  updateRepeat();
}
wx.onTouchEnd(onTouchEnd);
wx.onTouchCancel(onTouchEnd);

if (wx.onWindowResize) {
  wx.onWindowResize(function () {
    sys = getSys();
    applyScale();
  });
}

// ---------- 主循环 ----------
function loop() {
  if (scene === 'game') {
    const events = game.step(Date.now());
    if (events && events.length) handleEvents(events);
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
