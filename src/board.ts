// The board: cell geometry, the notation boards are written in, and the small
// helpers every other module reads cells through (specs/board.md).

import {
  BOARD_CX,
  BOARD_CY,
  CELL_PITCH,
  GEM_KINDS,
  GRID_COLS,
  GRID_ROWS,
  MAX_STRAIN,
} from "./constants";
import type { BoardState, CellRef, Cut, GemKind, GemState } from "./game";

/** The board while none is in play. */
export const EMPTY_BOARD: BoardState = { cols: 0, rows: 0, cells: [] };

/** The stage x of a cell centre. */
export function cellX(col: number): number {
  return BOARD_CX - ((GRID_COLS - 1) * CELL_PITCH) / 2 + col * CELL_PITCH;
}

/** The stage y of a cell centre. */
export function cellY(row: number): number {
  return BOARD_CY - ((GRID_ROWS - 1) * CELL_PITCH) / 2 + row * CELL_PITCH;
}

/** The board's extent: the outer edges of its outermost cells. */
export const BOARD_LEFT = cellX(0) - CELL_PITCH / 2;
export const BOARD_TOP = cellY(0) - CELL_PITCH / 2;
export const BOARD_RIGHT = cellX(GRID_COLS - 1) + CELL_PITCH / 2;
export const BOARD_BOTTOM = cellY(GRID_ROWS - 1) + CELL_PITCH / 2;

export function hasBoard(board: BoardState): boolean {
  return board.cols > 0 && board.rows > 0;
}

export function onGrid(col: number, row: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < GRID_COLS &&
    row < GRID_ROWS
  );
}

export function gemAt(
  board: BoardState,
  col: number,
  row: number,
): GemState | null {
  if (col < 0 || row < 0 || col >= board.cols || row >= board.rows) return null;
  return board.cells[row * board.cols + col] ?? null;
}

export function adjacent(a: CellRef, b: CellRef): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export function sameCell(a: CellRef | null, b: CellRef | null): boolean {
  return a !== null && b !== null && a.col === b.col && a.row === b.row;
}

export function isFlawed(gem: GemState): boolean {
  return gem.strain >= MAX_STRAIN;
}

/** The greatest `fell` on the board: the most recent step's longest fall. */
export function longestFall(board: BoardState): number {
  let fall = 0;
  for (const gem of board.cells) fall = Math.max(fall, gem.fell);
  return fall;
}

/** A uniformly random kind, as a refill and an opening deal draw it. */
export function randomKind(random: () => number = Math.random): GemKind {
  return GEM_KINDS[Math.floor(random() * GEM_KINDS.length) % GEM_KINDS.length];
}

// ---- Notation -------------------------------------------------------------

const KIND_LETTERS: Readonly<Record<string, GemKind>> = {
  R: "ruby",
  A: "amber",
  C: "citrine",
  J: "jade",
  B: "beryl",
  S: "sapphire",
  M: "amethyst",
};

const LETTER_OF: Readonly<Record<GemKind, string>> = {
  ruby: "R",
  amber: "A",
  citrine: "C",
  jade: "J",
  beryl: "B",
  sapphire: "S",
  amethyst: "M",
};

const CUT_LETTERS: Readonly<Record<string, Cut>> = {
  "": "plain",
  b: "brilliant",
  s: "star",
};

const TOKEN = /^(?:([RACJBSM])([0-3])([bs]?)|X([0-3]))$/;

/** The kind a single kind letter names, or `null` for a letter it does not. */
export function kindOfLetter(letter: string): GemKind | null {
  return KIND_LETTERS[letter] ?? null;
}

/** Reads one cell token into a gem at `(col, row)` with a `fell` of 0. */
export function parseToken(token: string, col: number, row: number): GemState {
  const m = TOKEN.exec(token);
  if (m === null)
    throw new RangeError(
      `Facet: "${token}" is not a cell token (a kind letter RACJBSM, a strain 0-3, an optional cut b or s; or X and a strain for a prism)`,
    );
  if (m[4] !== undefined)
    return {
      col,
      row,
      kind: null,
      cut: "prism",
      strain: Number(m[4]),
      fell: 0,
    };
  return {
    col,
    row,
    kind: KIND_LETTERS[m[1]],
    cut: CUT_LETTERS[m[3]],
    strain: Number(m[2]),
    fell: 0,
  };
}

/** Writes one gem as a cell token. */
export function formatToken(gem: GemState): string {
  if (gem.cut === "prism" || gem.kind === null) return `X${gem.strain}`;
  const cut = gem.cut === "brilliant" ? "b" : gem.cut === "star" ? "s" : "";
  return `${LETTER_OF[gem.kind]}${gem.strain}${cut}`;
}

/** Reads a whole board from `GRID_ROWS` lines of `GRID_COLS` tokens. */
export function parseBoard(rows: readonly string[]): BoardState {
  if (!Array.isArray(rows) || rows.length !== GRID_ROWS)
    throw new RangeError(
      `Facet: a board is ${GRID_ROWS} rows of notation, not ${Array.isArray(rows) ? rows.length : typeof rows}`,
    );
  const cells: GemState[] = [];
  rows.forEach((line, row) => {
    if (typeof line !== "string")
      throw new TypeError(`Facet: board row ${row} is not a string`);
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== GRID_COLS)
      throw new RangeError(
        `Facet: board row ${row} holds ${tokens.length} tokens, not ${GRID_COLS}`,
      );
    tokens.forEach((token, col) => cells.push(parseToken(token, col, row)));
  });
  return { cols: GRID_COLS, rows: GRID_ROWS, cells };
}

/** Writes a board as notation, one string per row. */
export function formatBoard(board: BoardState): string[] {
  const out: string[] = [];
  for (let row = 0; row < board.rows; row++) {
    const tokens: string[] = [];
    for (let col = 0; col < board.cols; col++) {
      const gem = gemAt(board, col, row);
      if (gem) tokens.push(formatToken(gem));
    }
    out.push(tokens.join(" "));
  }
  return out;
}
