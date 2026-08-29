const audio = require('../../utils/audio.js');
const engine = require('../../utils/engine.js');
const { COLS, ROWS, COLORS, SHAPES, CLEAR_MS } = engine;

Page({
  data: {
    score: 0,
    level: 1,
    lines: 0,
    highscore: 0,
    started: false,
    paused: false,
    gameOver: false,
    bgmOn: true,
    sfxOn: true,
    modalShow: true,
    modalTitle: '俄罗斯方块',
    modalSub: '准备好了吗？',
    modalBtn: '开始游戏',
    modalGhost: ''
  },

  onLoad() {
    this.game = new engine.Game();
    try {
      this.highscore = parseInt(wx.getStorageSync('tetris_high') || '0', 10) || 0;
    } catch (e) {
      this.highscore = 0;
    }
    this.setData({
      highscore: this.highscore,
      bgmOn: audio.getBgm(),
      sfxOn: audio.getSfx()
    });
  },

  onReady() {
    this.initCanvas();
  },

  onUnload() {
    this.stopLoop();
    this._clearRepeat();
    audio.pauseBgm();
  },

  initCanvas() {
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    const dpr = info.pixelRatio || 2;
    this.dpr = dpr;

    const query = wx.createSelectorQuery();
    query.select('#board').fields({ node: true, size: true });
    query.select('#next').fields({ node: true, size: true });
    query.select('#hold').fields({ node: true, size: true });
    query.exec((res) => {
      this._setupCanvas(res[0], 'board');
      this._setupCanvas(res[1], 'next');
      this._setupCanvas(res[2], 'hold');
      this.layout();
      this.draw();
      this.startLoop();
    });
  },

  _setupCanvas(item, key) {
    if (!item || !item.node) return;
    const canvas = item.node;
    const ctx = canvas.getContext('2d');
    canvas.width = item.width * this.dpr;
    canvas.height = item.height * this.dpr;
    ctx.scale(this.dpr, this.dpr);
    if (key === 'board') {
      this.boardCanvas = canvas;
      this.boardCtx = ctx;
      this.boardW = item.width;
      this.boardH = item.height;
    } else if (key === 'next') {
      this.nextCanvas = canvas;
      this.nextCtx = ctx;
      this.nextW = item.width;
      this.nextH = item.height;
    } else if (key === 'hold') {
      this.holdCanvas = canvas;
      this.holdCtx = ctx;
      this.holdW = item.width;
      this.holdH = item.height;
    }
  },

  layout() {
    if (!this.boardW || !this.boardH) return;
    const pad = 6;
    const cell = Math.max(8, Math.floor(Math.min((this.boardW - pad * 2) / COLS, (this.boardH - pad * 2) / ROWS)));
    this.cell = cell;
    this.offsetX = Math.floor((this.boardW - cell * COLS) / 2);
    this.offsetY = Math.floor((this.boardH - cell * ROWS) / 2);
  },

  // ---------- 渲染 ----------
  drawCell(ctx, px, py, type, size) {
    ctx.fillStyle = COLORS[type];
    ctx.fillRect(px, py, size - 1, size - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(px, py, size - 1, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px, py + size - 3, size - 1, 3);
  },

  drawMini(ctx, w, h, type) {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!type) return;
    const m = SHAPES[type];
    const size = type === 'I' || type === 'O' ? 12 : 16;
    const pw = m[0].length * size;
    const ph = m.length * size;
    const ox = (w - pw) / 2;
    const oy = (h - ph) / 2;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (m[y][x]) {
          ctx.fillStyle = COLORS[type];
          ctx.fillRect(ox + x * size, oy + y * size, size - 1, size - 1);
        }
      }
    }
  },

  draw() {
    const g = this.game;
    if (!this.boardCtx) return;
    const ctx = this.boardCtx;
    const cell = this.cell || 30;
    const ox = this.offsetX || 0;
    const oy = this.offsetY || 0;

    ctx.clearRect(0, 0, this.boardW, this.boardH);

    // 网格
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if ((x + y) % 2 === 0) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }

    // 已固定的方块
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (g.board[y][x]) this.drawCell(ctx, ox + x * cell, oy + y * cell, g.board[y][x], cell);
      }
    }

    // 消行闪烁特效
    if (g.clearing) {
      const el = Date.now() - (g.clearingDone - CLEAR_MS);
      const on = Math.floor(el / 90) % 2 === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)';
      for (const y of g.clearingRows) ctx.fillRect(ox, oy + y * cell, cell * COLS, cell);
    }

    // 当前方块 + 投影
    if (g.current && g.started && !g.gameOver) {
      const ghost = g.ghostOf();
      for (const [x, y] of engine.cellsOf(ghost)) {
        if (y < 0) continue;
        ctx.strokeStyle = COLORS[ghost.type] + '66';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + x * cell + 1, oy + y * cell + 1, cell - 3, cell - 3);
      }
      for (const [x, y] of engine.cellsOf(g.current)) {
        if (y < 0) continue;
        this.drawCell(ctx, ox + x * cell, oy + y * cell, g.current.type, cell);
      }
    }

    this.drawMini(this.nextCtx, this.nextW, this.nextH, g.queue[0]);
    this.drawMini(this.holdCtx, this.holdW, this.holdH, g.held);
  },

  // ---------- 主循环 ----------
  startLoop() {
    if (this._raf || !this.boardCanvas) return;
    const self = this;
    const loop = () => {
      self.frame();
      self._raf = self.boardCanvas.requestAnimationFrame(loop);
    };
    self._raf = self.boardCanvas.requestAnimationFrame(loop);
  },

  stopLoop() {
    if (this._raf && this.boardCanvas) this.boardCanvas.cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  frame() {
    const events = this.game.step(Date.now());
    if (events.length) this.handleEvents(events);
    this.draw();
  },

  handleEvents(events) {
    for (const e of events) audio.play(e);
    this.syncStats();
    if (this.game.gameOver) this.onGameOver();
  },

  syncStats() {
    const g = this.game;
    if (
      g.score !== this.data.score ||
      g.level !== this.data.level ||
      g.lines !== this.data.lines ||
      this.highscore !== this.data.highscore
    ) {
      this.setData({
        score: g.score,
        level: g.level,
        lines: g.lines,
        highscore: this.highscore
      });
    }
  },

  // ---------- 状态流转 ----------
  startGame() {
    const events = this.game.start();
    if (events.length) this.handleEvents(events);
    audio.playBgm();
    this.setData({ started: true, gameOver: false, paused: false });
    this.hideModal();
    this.syncStats();
    this.draw();
  },

  resume() {
    const g = this.game;
    g.paused = false;
    g.lastDrop = Date.now();
    audio.resumeBgm();
    this.hideModal();
    this.setData({ paused: false });
  },

  onGameOver() {
    const g = this.game;
    audio.pauseBgm();
    if (g.score > this.highscore) {
      this.highscore = g.score;
      try { wx.setStorageSync('tetris_high', this.highscore); } catch (e) {}
    }
    this.syncStats();
    this.showModal('游戏结束', '得分 ' + g.score + ' · 最高 ' + this.highscore, '再来一局', '返回菜单');
    this.setData({ gameOver: true });
  },

  showModal(title, sub, btn, ghost) {
    this.setData({
      modalShow: true,
      modalTitle: title,
      modalSub: sub,
      modalBtn: btn,
      modalGhost: ghost || ''
    });
  },

  hideModal() {
    this.setData({ modalShow: false });
  },

  // ---------- 输入 ----------
  runAction(action) {
    const g = this.game;
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
    if (events && events.length) this.handleEvents(events);
  },

  onControlStart(e) {
    const action = e.currentTarget.dataset.action;
    this.runAction(action);
    if (action === 'left' || action === 'right' || action === 'down') {
      this._clearRepeat();
      this._repeat = setInterval(() => this.runAction(action), 90);
    }
  },

  onControlEnd() {
    this._clearRepeat();
  },

  _clearRepeat() {
    if (this._repeat) {
      clearInterval(this._repeat);
      this._repeat = null;
    }
  },

  onTogglePause() {
    const g = this.game;
    if (!g.started || g.gameOver) return;
    if (!g.paused) {
      g.paused = true;
      audio.pauseBgm();
      this.showModal('已暂停', '点击继续游戏', '继续', '重新开始');
      this.setData({ paused: true });
    } else {
      this.resume();
    }
  },

  onToggleBgm() {
    const on = !this.data.bgmOn;
    audio.setBgm(on);
    this.setData({ bgmOn: on });
    if (on) audio.playBgm();
    else audio.stopBgm();
  },

  onToggleSfx() {
    const on = !this.data.sfxOn;
    audio.setSfx(on);
    this.setData({ sfxOn: on });
    if (on) audio.play('click');
  },

  onModalPrimary() {
    const g = this.game;
    if (g.started && g.paused) this.resume();
    else this.startGame();
  },

  onModalGhost() {
    const g = this.game;
    if (g.started && g.paused) {
      g.paused = false;
      this.startGame();
    } else {
      wx.navigateBack();
    }
  },

  onBack() {
    audio.pauseBgm();
    wx.navigateBack();
  }
});
