(function () {
  'use strict';

  const SIZE = 4;
  const STORAGE_STATE   = '2048-state';
  const STORAGE_BEST    = '2048-best';
  const STORAGE_LEADERS = '2048-leaders';
  const ANIM_MS = 170;

  // ---------- State ----------
  let board = [];
  let score = 0;
  let best = 0;
  let history = [];
  let gameOver = false;
  let animating = false;
  let recordSaved = false;
  let tileIdCounter = 0;
  const viewTiles = {};

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const gridBg = $('grid-bg');
  const tilesLayer = $('tiles-layer');
  const scoreEl = $('score');
  const bestEl = $('best');
  const gameOverEl = $('game-over');
  const finalScoreEl = $('final-score');
  const saveFormEl = $('save-form');
  const playerNameEl = $('player-name');
  const savedMessageEl = $('saved-message');
  const leadersModalEl = $('leaders-modal');
  const leadersBodyEl = $('leaders-body');
  const emptyMessageEl = $('empty-message');
  const mobileControlsEl = $('mobile-controls');
  const gameContainer = $('game-container');

  // ---------- Layout ----------
  function computeLayout() {
    const parentEl = gameContainer.parentElement;
    if (!parentEl) return;
    
    // Берем ширину родителя (чтобы не зависеть от уже заданной фикс. ширины)
    const W = Math.round(parentEl.clientWidth);
    if (!W) return;

    const pad  = Math.max(6, Math.round(W * 0.02));
    const gap  = Math.max(6, Math.round(W * 0.02));
    // Округляем вниз до целого, чтобы избежать субпикселей
    const cell = Math.max(1, Math.floor((W - 2 * pad - 3 * gap) / 4));

    // Точная ширина поля с учетом всех отступов
    const boardW = 2 * pad + 4 * cell + 3 * gap;

    // Фиксируем размеры контейнера
    gameContainer.style.width = boardW + 'px';
    gameContainer.style.height = boardW + 'px';

    gameContainer.style.setProperty('--pad',  pad  + 'px');
    gameContainer.style.setProperty('--gap',  gap  + 'px');
    gameContainer.style.setProperty('--cell', cell + 'px');
  }

  function positionTileElement(el, row, col) {
    el.style.left = `calc(var(--pad, 10px) + (var(--cell, 60px) + var(--gap, 10px)) * ${col})`;
    el.style.top  = `calc(var(--pad, 10px) + (var(--cell, 60px) + var(--gap, 10px)) * ${row})`;
  }

  // ---------- Tiles ----------
  function initEmptyBoard() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function renderGridBg() {
    gridBg.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = document.createElement('div');
      c.className = 'grid-cell';
      frag.appendChild(c);
    }
    gridBg.appendChild(frag);
  }

  function createTile(row, col, value, opts) {
    opts = opts || {};
    const id = ++tileIdCounter;
    const el = document.createElement('div');
    el.className = 'tile';
    if (opts.isNew)    el.classList.add('tile-new');
    if (opts.isMerged) el.classList.add('tile-merged');
    el.textContent = value;
    el.setAttribute('data-value', value);
    el.setAttribute('data-id', id);
    positionTileElement(el, row, col);
    tilesLayer.appendChild(el);

    const tile = { id, value, row, col, el };
    viewTiles[id] = tile;
    board[row][col] = value;
    return tile;
  }

  function removeTile(tile) {
    if (!tile) return;
    if (tile.el && tile.el.parentNode) tile.el.parentNode.removeChild(tile.el);
    delete viewTiles[tile.id];
  }

  function clearAllTiles() {
    Object.keys(viewTiles).forEach((id) => removeTile(viewTiles[id]));
  }

  function renderBoardFromState() {
    clearAllTiles();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== 0) createTile(r, c, board[r][c]);
      }
    }
  }

  // ---------- Move computation ----------
  function getLines(direction) {
    const lines = [];
    if (direction === 'left' || direction === 'right') {
      for (let r = 0; r < SIZE; r++) {
        const cells = [];
        for (let c = 0; c < SIZE; c++) cells.push([r, c]);
        if (direction === 'right') cells.reverse();
        lines.push(cells);
      }
    } else {
      for (let c = 0; c < SIZE; c++) {
        const cells = [];
        for (let r = 0; r < SIZE; r++) cells.push([r, c]);
        if (direction === 'down') cells.reverse();
        lines.push(cells);
      }
    }
    return lines;
  }

  function computeMove(srcBoard, direction) {
    const newBoard = srcBoard.map((row) => row.slice());
    const moves = [];
    const merges = [];
    let scoreGained = 0;

    const lines = getLines(direction);

    for (const cells of lines) {
      const items = [];
      for (const [r, c] of cells) {
        if (srcBoard[r][c] !== 0) items.push({ r, c, v: srcBoard[r][c] });
      }

      const stack = [];
      for (const it of items) {
        stack.push({ value: it.v, sources: [{ r: it.r, c: it.c }] });
        while (
          stack.length >= 2 &&
          stack[stack.length - 1].value === stack[stack.length - 2].value
        ) {
          const b = stack.pop();
          const a = stack.pop();
          const mergedValue = a.value * 2;
          scoreGained += mergedValue;
          stack.push({ value: mergedValue, sources: a.sources.concat(b.sources) });
        }
      }

      for (let i = 0; i < cells.length; i++) {
        const [r, c] = cells[i];
        if (i < stack.length) {
          newBoard[r][c] = stack[i].value;
          for (const src of stack[i].sources) {
            if (src.r !== r || src.c !== c) {
              moves.push({ fromR: src.r, fromC: src.c, toR: r, toC: c });
            }
          }
          if (stack[i].sources.length > 1) {
            merges.push({
              toR: r, toC: c,
              value: stack[i].value,
              sources: stack[i].sources.slice(),
            });
          }
        } else {
          newBoard[r][c] = 0;
        }
      }
    }

    return { newBoard, moves, merges, scoreGained };
  }

  // ---------- Game actions ----------
  function doMove(direction) {
    if (gameOver || animating) return;

    const result = computeMove(board, direction);
    if (result.moves.length === 0) return;

    history.push({ board: board.map((r) => r.slice()), score });
    if (history.length > 50) history.shift();

    animating = true;

    const tileByPos = {};
    Object.values(viewTiles).forEach((t) => {
      tileByPos[t.row + ',' + t.col] = t;
    });

    for (const mv of result.moves) {
      const t = tileByPos[mv.fromR + ',' + mv.fromC];
      if (t) {
        t.row = mv.toR;
        t.col = mv.toC;
        positionTileElement(t.el, mv.toR, mv.toC);
      }
    }

    setTimeout(() => {
      const toRemove = new Set();
      for (const mg of result.merges) {
        for (const src of mg.sources) {
          const t = tileByPos[src.r + ',' + src.c];
          if (t) toRemove.add(t);
        }
      }
      toRemove.forEach(removeTile);

      board = result.newBoard.map((r) => r.slice());

      for (const mg of result.merges) {
        createTile(mg.toR, mg.toC, mg.value, { isMerged: true });
      }

      score += result.scoreGained;
      updateScoreUI();

      spawnTiles();

      if (!canMove(board)) {
        gameOver = true;
        showGameOver();
      }

      saveState();
      animating = false;
    }, ANIM_MS);
  }

  function spawnOneTile(opts) {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c] === 0) empty.push([r, c]);
    if (empty.length === 0) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    return createTile(r, c, value, opts);
  }

  function spawnTiles() {
    const count = Math.random() < 0.9 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      if (!spawnOneTile({ isNew: true })) break;
    }
  }

  function canMove(b) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (b[r][c] === 0) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (r < SIZE - 1 && b[r][c] === b[r + 1][c]) return true;
        if (c < SIZE - 1 && b[r][c] === b[r][c + 1]) return true;
      }
    }
    return false;
  }

  function undoMove() {
    if (animating || history.length === 0 || gameOver) return;
    const prev = history.pop();
    board = prev.board.map((r) => r.slice());
    score = prev.score;
    updateScoreUI();
    renderBoardFromState();
    hideGameOver();
    saveState();
  }

  function newGame() {
    if (animating) return;
    clearAllTiles();
    initEmptyBoard();
    score = 0;
    history = [];
    gameOver = false;
    recordSaved = false;
    updateScoreUI();
    hideGameOver();

    const initialCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < initialCount; i++) {
      spawnOneTile({ isNew: true });
    }
    saveState();
  }

  // ---------- Game over UI ----------
  function showGameOver() {
    finalScoreEl.textContent = score;
    if (recordSaved) {
      saveFormEl.hidden = true;
      savedMessageEl.hidden = false;
    } else {
      saveFormEl.hidden = false;
      savedMessageEl.hidden = true;
      playerNameEl.value = '';
    }
    gameOverEl.hidden = false;
    updateMobileControlsVisibility();
  }

  function hideGameOver() {
    gameOverEl.hidden = true;
    gameOver = false;
    updateMobileControlsVisibility();
  }

  function updateMobileControlsVisibility() {
    const hide = gameOver || !leadersModalEl.hidden;
    mobileControlsEl.style.display = hide ? 'none' : '';
  }

  // ---------- Score ----------
  function updateScoreUI() {
    if (score > best) best = score;
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  // ---------- Persistence ----------
  function saveState() {
    try {
      localStorage.setItem(STORAGE_STATE, JSON.stringify({
        board, score, gameOver, best, recordSaved,
      }));
      localStorage.setItem(STORAGE_BEST, String(best));
    } catch (e) {}
  }

  function loadState() {
    try {
      const bv = localStorage.getItem(STORAGE_BEST);
      if (bv) best = parseInt(bv, 10) || 0;

      const raw = localStorage.getItem(STORAGE_STATE);
      if (!raw) return false;
      const st = JSON.parse(raw);
      if (!st || !Array.isArray(st.board)) return false;

      board = st.board;
      score = st.score || 0;
      gameOver = !!st.gameOver;
      recordSaved = !!st.recordSaved;
      best = Math.max(best, st.best || 0, score);
      return true;
    } catch (e) { return false; }
  }

  // ---------- Leaders ----------
  function loadLeaders() {
    try {
      const raw = localStorage.getItem(STORAGE_LEADERS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveRecord(name, val) {
    const leaders = loadLeaders();
    leaders.push({ name: name || 'Аноним', score: val, date: new Date().toISOString() });
    leaders.sort((a, b) => b.score - a.score);
    const top = leaders.slice(0, 10);
    try { localStorage.setItem(STORAGE_LEADERS, JSON.stringify(top)); } catch (e) {}
    return top;
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function renderLeaders() {
    const leaders = loadLeaders();
    leadersBodyEl.innerHTML = '';
    emptyMessageEl.hidden = leaders.length > 0;
    leaders.forEach((l, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(l.name)}</td>
        <td>${l.score}</td>
        <td>${escapeHtml(formatDate(l.date))}</td>
      `;
      leadersBodyEl.appendChild(tr);
    });
  }

  function openLeaders() {
    renderLeaders();
    leadersModalEl.hidden = false;
    updateMobileControlsVisibility();
  }

  function closeLeaders() {
    leadersModalEl.hidden = true;
    updateMobileControlsVisibility();
  }

  // ---------- Input ----------
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if (!leadersModalEl.hidden) return;
    if (isTypingTarget(e.target)) return;

    let dir = null;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': case 'ф': case 'Ф': dir = 'left';  break;
      case 'ArrowRight': case 'd': case 'D': case 'в': case 'В': dir = 'right'; break;
      case 'ArrowUp':    case 'w': case 'W': case 'ц': case 'Ц': dir = 'up';    break;
      case 'ArrowDown':  case 's': case 'S': case 'ы': case 'Ы': dir = 'down';  break;
    }
    if (dir) {
      e.preventDefault();
      doMove(dir);
    }
  });

  // Virtual buttons
  document.querySelectorAll('.ctrl-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      doMove(btn.dataset.dir);
    });
  });

  // Swipe on board
  let tStartX = 0, tStartY = 0, tStartTime = 0;
  gameContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    tStartX = e.touches[0].clientX;
    tStartY = e.touches[0].clientY;
    tStartTime = Date.now();
  }, { passive: true });

  gameContainer.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - tStartX;
    const dy = e.changedTouches[0].clientY - tStartY;
    const dt = Date.now() - tStartTime;
    if (dt > 800) return;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 30) return;
    const dir = ax > ay
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    doMove(dir);
  }, { passive: true });

  // ---------- UI handlers ----------
  $('new-game').addEventListener('click', () => {
    if (score > 0 && !gameOver) {
      if (!confirm('Начать новую игру? Текущий прогресс будет потерян.')) return;
    }
    newGame();
  });

  $('undo').addEventListener('click', undoMove);

  $('leaders').addEventListener('click', openLeaders);
  $('close-leaders').addEventListener('click', closeLeaders);
  leadersModalEl.addEventListener('click', (e) => {
    if (e.target === leadersModalEl) closeLeaders();
  });

  $('save-record').addEventListener('click', () => {
    if (recordSaved) return;
    const name = playerNameEl.value.trim();
    if (!name) { playerNameEl.focus(); return; }
    saveRecord(name, score);
    recordSaved = true;
    saveFormEl.hidden = true;
    savedMessageEl.hidden = false;
    saveState();
  });

  playerNameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('save-record').click();
  });

  $('restart-overlay').addEventListener('click', () => {
    newGame();
  });

  // ---------- Init ----------
  function init() {
    renderGridBg();
    computeLayout();

    if (!loadState()) {
      initEmptyBoard();
      const initialCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < initialCount; i++) spawnOneTile({ isNew: true });
      saveState();
    } else {
      renderBoardFromState();
    }

    updateScoreUI();
    updateMobileControlsVisibility();

    if (gameOver) showGameOver();

    let rafId = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        computeLayout();
        Object.values(viewTiles).forEach((t) =>
          positionTileElement(t.el, t.row, t.col));
      });
    });

    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        computeLayout();
        Object.values(viewTiles).forEach((t) =>
          positionTileElement(t.el, t.row, t.col));
      }).observe(gameContainer.parentElement);
    }
  }

  init();
})();
