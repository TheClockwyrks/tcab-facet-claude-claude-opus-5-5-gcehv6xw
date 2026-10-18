// The ruleset (specs/rules.md): runs, the move rules a swap is decided by, and
// the resolution rules one chain step applies to the board. Everything here is
// a pure function of the board it is handed.

import { adjacent, gemAt, hasBoard, kindOfLetter, randomKind } from "./board";
import {
  BASE_SCORE,
  FLAWED_SCORE,
  GRID_COLS,
  GRID_ROWS,
  MATCH_MIN,
  MAX_MULTIPLIER,
  MAX_STRAIN,
} from "./constants";
import type {
  BoardState,
  CellRef,
  Cut,
  GemKind,
  GemState,
  ShardState,
} from "./game";

/** A maximal run of one kind (R4), its cells ordered from its lowest end. */
export interface Run {
  readonly kind: GemKind;
  readonly horizontal: boolean;
  readonly cells: readonly CellRef[];
}

export interface SwapPair {
  readonly a: CellRef;
  readonly b: CellRef;
}

/** Every maximal run on the board (R4). A prism joins none. */
export function findRuns(board: BoardState): Run[] {
  const runs: Run[] = [];
  const scan = (horizontal: boolean) => {
    const outer = horizontal ? board.rows : board.cols;
    const inner = horizontal ? board.cols : board.rows;
    for (let o = 0; o < outer; o++) {
      let start = 0;
      for (let i = 1; i <= inner; i++) {
        const at = (k: number) =>
          horizontal ? gemAt(board, k, o) : gemAt(board, o, k);
        const kind = at(start)?.kind ?? null;
        if (i < inner && kind !== null && at(i)?.kind === kind) continue;
        if (kind !== null && i - start >= MATCH_MIN) {
          const cells: CellRef[] = [];
          for (let k = start; k < i; k++)
            cells.push(horizontal ? { col: k, row: o } : { col: o, row: k });
          runs.push({ kind, horizontal, cells });
        }
        start = i;
      }
    }
  };
  scan(true);
  scan(false);
  return runs;
}

/** The board with two cells exchanged; both swapped gems carry a `fell` of 0. */
export function swapCells(
  board: BoardState,
  a: CellRef,
  b: CellRef,
): BoardState {
  const ia = a.row * board.cols + a.col;
  const ib = b.row * board.cols + b.col;
  const ga = board.cells[ia];
  const gb = board.cells[ib];
  const cells = board.cells.slice();
  cells[ia] = { ...gb, col: a.col, row: a.row, fell: 0 };
  cells[ib] = { ...ga, col: b.col, row: b.row, fell: 0 };
  return { ...board, cells };
}

/** Whether R1 and R3 accept exchanging `a` and `b` on this board. */
export function swapAccepted(
  board: BoardState,
  a: CellRef,
  b: CellRef,
): boolean {
  if (!hasBoard(board) || !adjacent(a, b)) return false;
  const ga = gemAt(board, a.col, a.row);
  const gb = gemAt(board, b.col, b.row);
  if (ga === null || gb === null) return false;
  if (ga.cut === "prism" || gb.cut === "prism") return true;
  return findRuns(swapCells(board, a, b)).length > 0;
}

/** Whether any pair of neighbours makes a legal swap (R1 and R3). */
export function hasLegalSwap(board: BoardState): boolean {
  if (!hasBoard(board)) return false;
  // A board already carrying a run makes every adjacent exchange productive.
  if (findRuns(board).length > 0) return true;
  for (let row = 0; row < board.rows; row++)
    for (let col = 0; col < board.cols; col++) {
      const here = { col, row };
      if (
        col + 1 < board.cols &&
        swapAccepted(board, here, { col: col + 1, row })
      )
        return true;
      if (
        row + 1 < board.rows &&
        swapAccepted(board, here, { col, row: row + 1 })
      )
        return true;
    }
  return false;
}

// ---- A chain step ---------------------------------------------------------

export interface StepResult {
  readonly board: BoardState;
  readonly cleared: readonly ShardState[];
  readonly created: readonly CellRef[];
  readonly points: number;
  readonly waves: number;
  /** Whether R7 brought any gem to MAX_STRAIN. */
  readonly flawed: boolean;
}

function isPrismSwap(board: BoardState, swap: SwapPair | null): boolean {
  if (swap === null) return false;
  return (
    gemAt(board, swap.a.col, swap.a.row)?.cut === "prism" ||
    gemAt(board, swap.b.col, swap.b.row)?.cut === "prism"
  );
}

/** R5: the seed, and the runs it came from (none for a prism swap). */
function seed(
  board: BoardState,
  chainStep: number,
  swap: SwapPair | null,
): { cells: Set<number>; runs: Run[] } {
  const cells = new Set<number>();
  if (chainStep === 1 && swap !== null && isPrismSwap(board, swap)) {
    const ga = gemAt(board, swap.a.col, swap.a.row) as GemState;
    const gb = gemAt(board, swap.b.col, swap.b.row) as GemState;
    if (ga.cut === "prism" && gb.cut === "prism") {
      board.cells.forEach((_, i) => cells.add(i));
    } else {
      const prism = ga.cut === "prism" ? ga : gb;
      const other = ga.cut === "prism" ? gb : ga;
      cells.add(prism.row * board.cols + prism.col);
      board.cells.forEach((g, i) => {
        if (g.kind !== null && g.kind === other.kind) cells.add(i);
      });
    }
    return { cells, runs: [] };
  }
  const runs = findRuns(board);
  for (const run of runs)
    for (const c of run.cells) cells.add(c.row * board.cols + c.col);
  return { cells, runs };
}

/** R6: grows the seed to the clear set, giving each cell its lowest wave. */
function expand(board: BoardState, seeds: Set<number>): Map<number, number> {
  const wave = new Map<number, number>();
  const queue: number[] = [];
  for (const i of seeds) {
    wave.set(i, 0);
    queue.push(i);
  }
  const { cols, rows } = board;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const k = wave.get(i) as number;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const gem = board.cells[i];
    const reach: number[] = [];
    if (gem.cut === "brilliant") {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = col + dx;
          const r = row + dy;
          if ((dx || dy) && c >= 0 && r >= 0 && c < cols && r < rows)
            reach.push(r * cols + c);
        }
    }
    if (gem.cut === "star") {
      for (let c = 0; c < cols; c++) reach.push(row * cols + c);
      for (let r = 0; r < rows; r++) reach.push(r * cols + col);
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = col + dx;
      const r = row + dy;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      if (board.cells[r * cols + c].strain >= MAX_STRAIN)
        reach.push(r * cols + c);
    }
    for (const j of reach) {
      if (wave.has(j)) continue;
      wave.set(j, k + 1);
      queue.push(j);
    }
  }
  return wave;
}

const CUT_RANK: Readonly<Record<Cut, number>> = {
  plain: 0,
  brilliant: 1,
  star: 2,
  prism: 3,
};

/** R8: where a run places the gem it creates. */
function placement(run: Run, swap: SwapPair | null): CellRef {
  const index = (c: CellRef | undefined) =>
    c === undefined
      ? -1
      : run.cells.findIndex((r) => r.col === c.col && r.row === c.row);
  const ia = index(swap?.a);
  const ib = index(swap?.b);
  if (ia >= 0 && ib >= 0) return run.cells[Math.min(ia, ib)];
  if (ia >= 0) return run.cells[ia];
  if (ib >= 0) return run.cells[ib];
  return run.cells[Math.floor((run.cells.length - 1) / 2)];
}

/** R8: the cut gems the seeding runs create, keyed by cell index. */
function createCuts(
  board: BoardState,
  runs: readonly Run[],
  swap: SwapPair | null,
): Map<number, { cut: Cut; kind: GemKind | null }> {
  const made = new Map<number, { cut: Cut; kind: GemKind | null }>();
  const offer = (cell: CellRef, cut: Cut, kind: GemKind | null) => {
    const i = cell.row * board.cols + cell.col;
    const held = made.get(i);
    if (held === undefined || CUT_RANK[cut] > CUT_RANK[held.cut])
      made.set(i, { cut, kind: cut === "prism" ? null : kind });
  };
  for (const run of runs) {
    if (run.cells.length === 4)
      offer(placement(run, swap), "brilliant", run.kind);
    else if (run.cells.length >= 5) offer(placement(run, swap), "prism", null);
  }
  for (const h of runs) {
    if (!h.horizontal) continue;
    for (const v of runs) {
      if (v.horizontal) continue;
      const cross = h.cells.find((c) =>
        v.cells.some((d) => d.col === c.col && d.row === c.row),
      );
      if (cross) offer(cross, "star", h.kind);
    }
  }
  return made;
}

/** R9: settles every column and refills it from the top. */
function settle(
  cols: number,
  rows: number,
  slots: (GemState | null)[],
  refillKinds: readonly string[],
  random: () => number,
): GemState[] {
  const out: GemState[] = new Array(cols * rows);
  for (let col = 0; col < cols; col++) {
    let target = rows - 1;
    for (let row = rows - 1; row >= 0; row--) {
      const gem = slots[row * cols + col];
      if (gem === null) continue;
      out[target * cols + col] = {
        ...gem,
        col,
        row: target,
        fell: target - row,
      };
      target--;
    }
    // `target + 1` cells stand empty at the top: the refill drops in as one
    // stack from above, so each refilled gem has fallen that far.
    const empty = target + 1;
    const posed = refillKinds[col] ?? "";
    for (let row = 0; row < empty; row++) {
      const kind = kindOfLetter(posed.charAt(row)) ?? randomKind(random);
      out[row * cols + col] = {
        col,
        row,
        kind,
        cut: "plain",
        strain: 0,
        fell: empty,
      };
    }
  }
  return out;
}

/**
 * Resolves one chain step in the order specs/rules.md gives: seed, expand,
 * score, strain, remove, create, settle. Returns `null` when R5 seeds nothing.
 */
export function resolveStep(
  board: BoardState,
  chainStep: number,
  swap: SwapPair | null,
  refillKinds: readonly string[],
  random: () => number = Math.random,
): StepResult | null {
  if (!hasBoard(board)) return null;
  const { cells: seeds, runs } = seed(board, chainStep, swap);
  if (seeds.size === 0) return null;
  const wave = expand(board, seeds);

  const multiplier = Math.min(chainStep, MAX_MULTIPLIER);
  let points = 0;
  let waves = 0;
  const cleared: ShardState[] = [];
  for (const [i, w] of wave) {
    const gem = board.cells[i];
    points +=
      (gem.strain >= MAX_STRAIN ? FLAWED_SCORE : BASE_SCORE) * multiplier;
    waves = Math.max(waves, w);
    cleared.push({
      col: gem.col,
      row: gem.row,
      kind: gem.kind,
      cut: gem.cut,
      strain: gem.strain,
      wave: w,
    });
  }
  cleared.sort((p, q) => p.wave - q.wave || p.row - q.row || p.col - q.col);

  const { cols, rows } = board;
  let flawed = false;
  const slots: (GemState | null)[] = board.cells.map((gem, i) => {
    if (wave.has(i)) return null;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const touched = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const c = col + dx;
      const r = row + dy;
      return c >= 0 && r >= 0 && c < cols && r < rows && wave.has(r * cols + c);
    });
    if (!touched || gem.strain >= MAX_STRAIN) return gem;
    const strain = gem.strain + 1;
    if (strain >= MAX_STRAIN) flawed = true;
    return { ...gem, strain };
  });

  const created: CellRef[] = [];
  for (const [i, made] of createCuts(board, runs, swap)) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots[i] = { col, row, kind: made.kind, cut: made.cut, strain: 0, fell: 0 };
    created.push({ col, row });
  }

  return {
    board: {
      cols,
      rows,
      cells: settle(cols, rows, slots, refillKinds, random),
    },
    cleared,
    created,
    points,
    waves,
    flawed,
  };
}

// ---- The opening board ----------------------------------------------------

/**
 * Deals an opening board: no run under R4, at least one legal swap, every gem
 * plain at strain 0, dealt in from above so row `r` falls at least `r + 1`.
 */
export function dealOpeningBoard(
  random: () => number = Math.random,
): BoardState {
  for (;;) {
    const kinds: GemKind[] = [];
    for (let row = 0; row < GRID_ROWS; row++)
      for (let col = 0; col < GRID_COLS; col++) {
        const at = (c: number, r: number) => kinds[r * GRID_COLS + c];
        let kind = randomKind(random);
        for (let tries = 0; tries < 32; tries++) {
          const rowRun =
            col >= 2 && at(col - 1, row) === kind && at(col - 2, row) === kind;
          const colRun =
            row >= 2 && at(col, row - 1) === kind && at(col, row - 2) === kind;
          if (!rowRun && !colRun) break;
          kind = randomKind(random);
        }
        kinds.push(kind);
      }
    const board: BoardState = {
      cols: GRID_COLS,
      rows: GRID_ROWS,
      cells: kinds.map((kind, i) => {
        const col = i % GRID_COLS;
        const row = Math.floor(i / GRID_COLS);
        // Each column drops in as a stack, the later columns from higher up.
        return {
          col,
          row,
          kind,
          cut: "plain",
          strain: 0,
          fell: GRID_ROWS + col,
        };
      }),
    };
    if (findRuns(board).length === 0 && hasLegalSwap(board)) return board;
  }
}
