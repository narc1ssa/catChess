// Интерфейс: доска — изображение board.png, поверх которого наложена сетка 8x8
// (перспективное преобразование по углам внутреннего поля), фигуры — спрайты из assets/pieces.
(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const depthEl = document.getElementById('depth');
  const SIZE = 1254;
  // Углы внутреннего поля на изображении доски: a8, h8, h1, a1
  const CORNERS = [[100, 86], [1162, 86], [1196, 1172], [40, 1172]];

  // Решение системы для гомографии (единичный квадрат -> четырёхугольник)
  function homography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [X, Y] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
    }
    const n = 8;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const k = A[r][c] / A[c][c];
        for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j];
      }
    }
    const h = A.map((row, i) => row[n] / row[i]);
    return h;
  }
  const H = homography([[0, 0], [8, 0], [8, 8], [0, 8]], CORNERS);
  // u = файл (0..8), v = строка сверху (0..8)
  function P(u, v) {
    const d = H[6] * u + H[7] * v + 1;
    return [(H[0] * u + H[1] * v + H[2]) / d, (H[3] * u + H[4] * v + H[5]) / d];
  }
  function cellGeom(f, r) {
    const row = 7 - r; // верхняя строка изображения — ранг 8
    const c = P(f + 0.5, row + 0.5);
    const top = P(f + 0.5, row), bot = P(f + 0.5, row + 1);
    const sqH = bot[1] - top[1];
    return { cx: c[0], cy: c[1], sqH, corners: [P(f, row), P(f + 1, row), P(f + 1, row + 1), P(f, row + 1)] };
  }
  const poly = pts => pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');

  // Фигуры: белые — игрок, чёрные — компьютер
  const NAMES = { r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king', p: 'pawn' };
  const PIECE_RATIO = 100 / 157;

  let game;
  let thinking = false;
  let timer = null;

  function newGame() {
    if (timer) clearTimeout(timer);
    thinking = false;
    game = {
      s: Chess.initialState(),
      history: [],
      selected: null,
      legal: [],
      last: null,
      over: false,
    };
    game.history.push(Chess.key(game.s));
    render();
  }

  function setStatus(text) { statusEl.textContent = text; }

  function applyMove(m) {
    game.s = Chess.makeMove(game.s, m);
    game.history.push(Chess.key(game.s));
    game.last = { from: m.from, to: m.to };
    game.selected = null;
    game.legal = [];
    const st = Chess.status(game.s, game.history);
    game.status = st;
    if (st.state !== 'playing') game.over = true;
    render();
    if (!game.over && game.s.turn === 'b') {
      thinking = true;
      setStatus('Компьютер думает…');
      const depth = parseInt(depthEl.value, 10);
      timer = setTimeout(() => {
        const cm = Chess.chooseMove(game.s, depth);
        thinking = false;
        if (cm) applyMove(cm);
      }, 60);
    }
  }

  function onSquareClick(sq) {
    if (game.over || thinking || game.s.turn !== 'w') return;
    if (game.selected !== null) {
      const cands = game.legal.filter(m => m.to === sq);
      if (cands.length) {
        // превращение пешки: автоматически в ферзя
        const m = cands.find(x => x.promo === 'q') || cands[0];
        applyMove(m);
        return;
      }
    }
    const p = game.s.board[sq];
    if (p && p.c === 'w') {
      game.selected = sq;
      game.legal = Chess.legalMoves(game.s).filter(m => m.from === sq);
    } else {
      game.selected = null;
      game.legal = [];
    }
    render();
  }

  function render() {
    const s = game.s;
    const st = game.status || Chess.status(s, game.history);
    game.status = st;
    const parts = [];
    const kingSq = st.check ? Chess.kingSquare(s.board, s.turn) : -1;

    const geoms = [];
    for (let sq = 0; sq < 64; sq++) geoms[sq] = cellGeom(sq & 7, sq >> 3);

    // подсветка клеток
    const hl = [];
    if (game.last) { hl.push(['last', game.last.from]); hl.push(['last', game.last.to]); }
    if (game.selected !== null) hl.push(['sel', game.selected]);
    if (kingSq >= 0) hl.push(['check', kingSq]);
    for (const [cls, sq] of hl) {
      parts.push(`<polygon class="${cls}" points="${poly(geoms[sq].corners)}"/>`);
    }
    // точки допустимых ходов
    for (const m of game.legal) {
      const g = geoms[m.to];
      const target = s.board[m.to] || m.ep;
      if (target) {
        parts.push(`<circle class="ring" cx="${g.cx}" cy="${g.cy}" r="${g.sqH * 0.46}"/>`);
      } else {
        parts.push(`<circle class="dot" cx="${g.cx}" cy="${g.cy}" r="${g.sqH * 0.14}"/>`);
      }
    }
    // фигуры
    for (let sq = 0; sq < 64; sq++) {
      const p = s.board[sq];
      if (!p) continue;
      const g = geoms[sq];
      const ph = g.sqH * 1.05;
      const pw = ph * PIECE_RATIO;
      const bottom = g.cy + g.sqH * 0.45;
      const x = g.cx - pw / 2, y = bottom - ph;
      const href = `assets/pieces/${p.c}-${NAMES[p.t]}.png`;
      parts.push(`<image class="piece" href="${href}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}"/>`);
    }
    // клики по клеткам — сверху
    for (let sq = 0; sq < 64; sq++) {
      parts.push(`<polygon class="sq" data-sq="${sq}" points="${poly(geoms[sq].corners)}"/>`);
    }
    svg.innerHTML =
      `<image href="assets/board.png" x="0" y="0" width="${SIZE}" height="${SIZE}"/>` + parts.join('');
    svg.querySelectorAll('polygon.sq').forEach(el => {
      el.addEventListener('click', () => onSquareClick(parseInt(el.dataset.sq, 10)));
    });

    // статус
    if (st.state === 'mate') {
      setStatus(s.turn === 'b' ? 'Мат! Вы победили 🎉' : 'Мат. Компьютер победил.');
    } else if (st.state === 'stalemate') {
      setStatus('Пат. Ничья.');
    } else if (st.state === 'draw') {
      setStatus('Ничья: ' + st.reason + '.');
    } else if (s.turn === 'w') {
      setStatus(st.check ? 'Шах! Ваш ход (белые)' : 'Ваш ход (белые)');
    } else {
      setStatus('Компьютер думает…');
    }
  }

  document.getElementById('new-game').addEventListener('click', newGame);
  newGame();
})();
