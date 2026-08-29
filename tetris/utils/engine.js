// 俄罗斯方块核心逻辑（与 UI 无关，渲染由页面 Canvas 完成）
const COLS = 10, ROWS = 20;

const COLORS = {
  I: '#00d7f0',
  O: '#f7d51d',
  T: '#a86ef2',
  S: '#4fd06b',
  Z: '#f0524f',
  J: '#4d8dff',
  L: '#ff9f1c'
};

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
};

const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const LINE_SCORE = [0, 100, 300, 500, 800]; // 0/1/2/3/4 行
const CLEAR_MS = 280; // 消行动画时长

// 重力：随等级下降，单位 ms/格
function gravityFor(level) {
  return Math.max(50, 800 * Math.pow(0.85, level - 1));
}

function rotateMatrix(m, dir) {
  const n = m.length;
  const r = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dir > 0) r[x][n - 1 - y] = m[y][x];
      else r[n - 1 - x][y] = m[y][x];
    }
  }
  return r;
}

function makePiece(type) {
  const matrix = SHAPES[type].map((r) => r.slice());
  return { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: type === 'I' ? -1 : 0 };
}

function cellsOf(piece) {
  const out = [];
  for (let y = 0; y < piece.matrix.length; y++) {
    for (let x = 0; x < piece.matrix[y].length; x++) {
      if (piece.matrix[y][x]) out.push([piece.x + x, piece.y + y]);
    }
  }
  return out;
}

class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.current = null;
    this.queue = [];
    this.held = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.started = false;
    this.paused = false;
    this.gameOver = false;
    this.clearing = false;
    this.clearingRows = [];
    this.clearingDone = 0;
    this.lastDrop = 0;
    this._queue = []; // 单次调用产生的事件（供页面播放音效）
    this._refillQueue();
  }

  // 7-bag 随机，保证均匀
  _refillQueue() {
    const bag = TYPES.slice();
    while (bag.length) this.queue.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }

  nextFromQueue() {
    while (this.queue.length < 7) this._refillQueue();
    return makePiece(this.queue.shift());
  }

  collides(piece) {
    for (const [x, y] of cellsOf(piece)) {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  _active() {
    return this.started && !this.paused && !this.gameOver && !!this.current && !this.clearing;
  }

  spawn() {
    this.current = this.nextFromQueue();
    this.canHold = true;
    if (this.collides(this.current)) {
      this.gameOver = true;
      this.started = false;
      this._queue.push('over');
    }
  }

  start() {
    this.reset();
    this.started = true;
    this.lastDrop = Date.now();
    this.spawn();
    return this._flush();
  }

  move(dx) {
    if (!this._active()) return [];
    this.current.x += dx;
    if (this.collides(this.current)) this.current.x -= dx;
    return [];
  }

  softDrop() {
    if (!this._active()) return [];
    if (this.moveDown()) this.score += 1;
    return this._flush();
  }

  moveDown() {
    if (!this._active()) return true;
    this.current.y += 1;
    if (this.collides(this.current)) {
      this.current.y -= 1;
      this.lock();
      return false;
    }
    return true;
  }

  hardDrop() {
    if (!this._active()) return [];
    let dist = 0;
    while (!this.collides({ ...this.current, y: this.current.y + 1 })) {
      this.current.y += 1;
      dist++;
    }
    this.score += dist * 2;
    this._queue.push('drop');
    this.lock();
    return this._flush();
  }

  rotate(dir) {
    if (!this._active()) return [];
    if (this.current.type === 'O') return [];
    const rotated = rotateMatrix(this.current.matrix, dir);
    const prev = this.current.matrix;
    this.current.matrix = rotated;
    // 简单 wall kick：尝试左右平移各 1-2 格
    const kicks = [1, -1, 2, -2];
    let ok = true;
    if (this.collides(this.current)) {
      ok = false;
      for (const k of kicks) {
        this.current.x += k;
        if (!this.collides(this.current)) { ok = true; break; }
        this.current.x -= k;
      }
    }
    if (!ok) this.current.matrix = prev;
    else this._queue.push('rotate');
    return this._flush();
  }

  hold() {
    if (!this._active() || !this.canHold) return [];
    this.canHold = false;
    const t = this.current.type;
    if (this.held) this.current = makePiece(this.held);
    else this.current = this.nextFromQueue();
    this.held = t;
    this.current.x = Math.floor((COLS - this.current.matrix[0].length) / 2);
    this.current.y = this.current.type === 'I' ? -1 : 0;
    if (this.collides(this.current)) this.current = makePiece(t);
    this._queue.push('hold');
    return this._flush();
  }

  lock() {
    for (const [x, y] of cellsOf(this.current)) {
      if (y < 0) {
        this.current = null;
        this.gameOver = true;
        this.started = false;
        this._queue.push('over');
        return;
      }
      this.board[y][x] = this.current.type;
    }
    this.current = null;
    const full = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y].every((c) => c)) full.push(y);
    if (full.length) {
      this.clearing = true;
      this.clearingRows = full;
      this.clearingDone = Date.now() + CLEAR_MS;
      this._queue.push('clear');
    } else {
      this.spawn();
    }
  }

  finishClear() {
    // 一次性移除所有满行：先筛出非满行，再在顶部补齐空行，避免逐行 splice 造成的索引错位。
    const rowSet = new Set(this.clearingRows);
    const kept = this.board.filter((_, y) => !rowSet.has(y));
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    for (let y = 0; y < ROWS; y++) this.board[y] = kept[y];

    const n = this.clearingRows.length;
    this.score += LINE_SCORE[n] * this.level;
    this.lines += n;
    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      this._queue.push('level');
    }
    this.clearing = false;
    this.clearingRows = [];
    this.spawn();
  }

  // 每帧推进一档：处理消行完成 / 重力下落
  step(now) {
    if (!this.started || this.paused || this.gameOver) return [];
    if (this.clearing) {
      if (now >= this.clearingDone) this.finishClear();
    } else if (now - this.lastDrop >= gravityFor(this.level)) {
      this.lastDrop = now;
      this.moveDown();
    }
    return this._flush();
  }

  ghostOf() {
    if (!this.current) return null;
    const g = { ...this.current, y: this.current.y };
    while (!this.collides({ ...g, y: g.y + 1 })) g.y++;
    return g;
  }

  _flush() {
    const q = this._queue;
    this._queue = [];
    return q;
  }
}

module.exports = {
  COLS, ROWS, COLORS, SHAPES, TYPES, LINE_SCORE, CLEAR_MS,
  gravityFor, rotateMatrix, makePiece, cellsOf, Game
};
