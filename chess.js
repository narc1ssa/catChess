// Движок классических шахмат и простой ИИ (минимакс с альфа-бета отсечением).
// Доска: массив из 64 клеток, индекс = ранг*8 + файл (a1 = 0, h8 = 63).
// Клетка: null или {c: 'w'|'b', t: 'p'|'n'|'b'|'r'|'q'|'k'}.
const Chess = (() => {
  const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const onb = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
  const other = c => (c === 'w' ? 'b' : 'w');

  function initialState() {
    const board = new Array(64).fill(null);
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let f = 0; f < 8; f++) {
      board[f] = { c: 'w', t: back[f] };
      board[8 + f] = { c: 'w', t: 'p' };
      board[48 + f] = { c: 'b', t: 'p' };
      board[56 + f] = { c: 'b', t: back[f] };
    }
    return { board, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1 };
  }

  function key(s) {
    const b = s.board.map(p => (p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.')).join('');
    const c = s.castle;
    return b + s.turn + (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') + s.ep;
  }

  function kingSquare(board, c) {
    for (let i = 0; i < 64; i++) if (board[i] && board[i].c === c && board[i].t === 'k') return i;
    return -1;
  }

  // Атакована ли клетка sq фигурами стороны by
  function attacked(board, sq, by) {
    const f = sq & 7, r = sq >> 3;
    const pr = by === 'w' ? r - 1 : r + 1;
    for (const df of [-1, 1]) {
      if (onb(f + df, pr)) {
        const p = board[pr * 8 + f + df];
        if (p && p.c === by && p.t === 'p') return true;
      }
    }
    for (const [df, dr] of KN) {
      const nf = f + df, nr = r + dr;
      if (onb(nf, nr)) { const p = board[nr * 8 + nf]; if (p && p.c === by && p.t === 'n') return true; }
    }
    for (const [df, dr] of KG) {
      const nf = f + df, nr = r + dr;
      if (onb(nf, nr)) { const p = board[nr * 8 + nf]; if (p && p.c === by && p.t === 'k') return true; }
    }
    for (const [dirs, types] of [[DIAG, 'bq'], [ORTH, 'rq']]) {
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (onb(nf, nr)) {
          const p = board[nr * 8 + nf];
          if (p) { if (p.c === by && types.includes(p.t)) return true; break; }
          nf += df; nr += dr;
        }
      }
    }
    return false;
  }

  // Псевдолегальные ходы (без проверки на шах своего короля)
  function pseudoMoves(s) {
    const moves = [], b = s.board, side = s.turn, opp = other(side);
    const add = (from, to, extra) => moves.push(Object.assign({ from, to, promo: null, ep: false, castle: false }, extra));
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p || p.c !== side) continue;
      const f = sq & 7, r = sq >> 3;
      if (p.t === 'p') {
        const dir = side === 'w' ? 1 : -1;
        const startRank = side === 'w' ? 1 : 6;
        const promoRank = side === 'w' ? 7 : 0;
        const nr = r + dir;
        const pushTo = (t, extra) => {
          if (nr === promoRank) ['q', 'r', 'b', 'n'].forEach(pt => add(sq, t, Object.assign({ promo: pt }, extra)));
          else add(sq, t, extra);
        };
        if (onb(f, nr) && !b[nr * 8 + f]) {
          pushTo(nr * 8 + f, {});
          const t2 = (r + 2 * dir) * 8 + f;
          if (r === startRank && !b[t2]) add(sq, t2, {});
        }
        for (const df of [-1, 1]) {
          const nf = f + df;
          if (!onb(nf, nr)) continue;
          const t = nr * 8 + nf;
          if (b[t] && b[t].c === opp) pushTo(t, {});
          else if (t === s.ep) add(sq, t, { ep: true });
        }
      } else if (p.t === 'n' || p.t === 'k') {
        const offs = p.t === 'n' ? KN : KG;
        for (const [df, dr] of offs) {
          const nf = f + df, nr = r + dr;
          if (!onb(nf, nr)) continue;
          const t = nr * 8 + nf;
          if (!b[t] || b[t].c === opp) add(sq, t, {});
        }
      } else {
        const dirs = p.t === 'b' ? DIAG : p.t === 'r' ? ORTH : KG;
        const slide = p.t !== 'k';
        for (const [df, dr] of dirs) {
          let nf = f + df, nr = r + dr;
          while (onb(nf, nr)) {
            const t = nr * 8 + nf;
            if (b[t]) { if (b[t].c === opp) add(sq, t, {}); break; }
            add(sq, t, {});
            if (!slide) break;
            nf += df; nr += dr;
          }
        }
      }
    }
    // Рокировка (клетки короля не должны находиться под боем)
    if (side === 'w' && b[4] && b[4].t === 'k' && b[4].c === 'w' && !attacked(b, 4, opp)) {
      if (s.castle.K && !b[5] && !b[6] && b[7] && b[7].t === 'r' && b[7].c === 'w' &&
          !attacked(b, 5, opp) && !attacked(b, 6, opp)) add(4, 6, { castle: true });
      if (s.castle.Q && !b[3] && !b[2] && !b[1] && b[0] && b[0].t === 'r' && b[0].c === 'w' &&
          !attacked(b, 3, opp) && !attacked(b, 2, opp)) add(4, 2, { castle: true });
    }
    if (side === 'b' && b[60] && b[60].t === 'k' && b[60].c === 'b' && !attacked(b, 60, opp)) {
      if (s.castle.k && !b[61] && !b[62] && b[63] && b[63].t === 'r' && b[63].c === 'b' &&
          !attacked(b, 61, opp) && !attacked(b, 62, opp)) add(60, 62, { castle: true });
      if (s.castle.q && !b[59] && !b[58] && !b[57] && b[56] && b[56].t === 'r' && b[56].c === 'b' &&
          !attacked(b, 59, opp) && !attacked(b, 58, opp)) add(60, 58, { castle: true });
    }
    return moves;
  }

  function makeMove(s, m) {
    const b = s.board.slice();
    const p = b[m.from];
    const cap = b[m.to];
    b[m.to] = p;
    b[m.from] = null;
    if (m.ep) b[m.to + (p.c === 'w' ? -8 : 8)] = null;
    if (m.castle) {
      if (m.to === m.from + 2) { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
      else { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
    }
    if (m.promo) b[m.to] = { c: p.c, t: m.promo };
    const c = Object.assign({}, s.castle);
    if (p.t === 'k') { if (p.c === 'w') { c.K = false; c.Q = false; } else { c.k = false; c.q = false; } }
    for (const sq of [m.from, m.to]) {
      if (sq === 0) c.Q = false;
      else if (sq === 7) c.K = false;
      else if (sq === 56) c.q = false;
      else if (sq === 63) c.k = false;
    }
    return {
      board: b,
      turn: other(s.turn),
      castle: c,
      ep: (p.t === 'p' && Math.abs(m.to - m.from) === 16) ? (m.from + m.to) / 2 : -1,
      half: (p.t === 'p' || cap || m.ep) ? 0 : s.half + 1,
      full: s.full + (s.turn === 'b' ? 1 : 0),
    };
  }

  function legalMoves(s) {
    return pseudoMoves(s).filter(m => {
      const ns = makeMove(s, m);
      return !attacked(ns.board, kingSquare(ns.board, s.turn), other(s.turn));
    });
  }

  function inCheck(s) {
    return attacked(s.board, kingSquare(s.board, s.turn), other(s.turn));
  }

  function insufficientMaterial(board) {
    const minors = [];
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p || p.t === 'k') continue;
      if (p.t === 'n' || p.t === 'b') minors.push(p);
      else return false;
    }
    return minors.length === 0 || minors.length === 1;
  }

  // Статус позиции: 'playing' | 'mate' | 'stalemate' | 'draw'
  function status(s, history) {
    const moves = legalMoves(s);
    const check = inCheck(s);
    if (moves.length === 0) return { state: check ? 'mate' : 'stalemate', check, moves };
    if (s.half >= 100) return { state: 'draw', reason: '50 ходов без взятий и ходов пешек', check, moves };
    if (history) {
      const k = key(s);
      if (history.filter(h => h === k).length >= 3) return { state: 'draw', reason: 'троекратное повторение позиции', check, moves };
    }
    if (insufficientMaterial(s.board)) return { state: 'draw', reason: 'недостаточно материала для мата', check, moves };
    return { state: 'playing', check, moves };
  }

  // ----- Оценка и поиск -----
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
        0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  };

  // Оценка с точки зрения белых
  function evaluate(board) {
    let e = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p) continue;
      const f = sq & 7, r = sq >> 3;
      if (p.c === 'w') e += VAL[p.t] + PST[p.t][(7 - r) * 8 + f];
      else e -= VAL[p.t] + PST[p.t][r * 8 + f];
    }
    return e;
  }

  const MATE = 100000;
  const sideEval = s => (s.turn === 'w' ? evaluate(s.board) : -evaluate(s.board));
  const isNoisy = (s, m) => s.board[m.to] || m.ep || m.promo;
  const orderMoves = (s, moves) => moves.sort((a, b) => {
    const va = s.board[a.to] ? VAL[s.board[a.to].t] * 10 - VAL[s.board[a.from].t] : 0;
    const vb = s.board[b.to] ? VAL[s.board[b.to].t] * 10 - VAL[s.board[b.from].t] : 0;
    return vb - va;
  });

  function qsearch(s, alpha, beta, depth) {
    const stand = sideEval(s);
    if (depth > 6 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = orderMoves(s, legalMoves(s).filter(m => isNoisy(s, m)));
    for (const m of moves) {
      const v = -qsearch(makeMove(s, m), -beta, -alpha, depth + 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function negamax(s, depth, alpha, beta, ply) {
    if (depth === 0) return qsearch(s, alpha, beta, 0);
    const moves = legalMoves(s);
    if (moves.length === 0) return inCheck(s) ? -(MATE - ply) : 0;
    if (s.half >= 100) return 0;
    let best = -Infinity;
    for (const m of orderMoves(s, moves)) {
      const v = -negamax(makeMove(s, m), depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Выбор хода для текущей стороны; среди равноценных — случайный
  function chooseMove(s, depth) {
    const moves = orderMoves(s, legalMoves(s));
    let bestV = -Infinity, best = [];
    let alpha = -Infinity;
    for (const m of moves) {
      const v = -negamax(makeMove(s, m), depth - 1, -Infinity, -alpha, 1);
      if (v > bestV) { bestV = v; best = [m]; if (v > alpha) alpha = v; }
      else if (v === bestV) best.push(m);
    }
    return best[Math.floor(Math.random() * best.length)] || null;
  }

  return { initialState, key, legalMoves, makeMove, status, inCheck, kingSquare, chooseMove };
})();
