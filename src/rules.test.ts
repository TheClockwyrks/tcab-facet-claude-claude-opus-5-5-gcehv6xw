import { describe, expect, it } from "vitest";
import { formatBoard, gemAt, longestFall, parseBoard } from "./board";
import { GRID_COLS, GRID_ROWS } from "./constants";
import {
  dealOpeningBoard,
  findRuns,
  hasLegalSwap,
  resolveStep,
  swapAccepted,
  swapCells,
} from "./rules";
import { DEAD_BOARD, deadWith } from "./testing/harness";

const NO_REFILL = new Array<string>(GRID_COLS).fill("");
/** A refill that always deals amethyst, so tests know what drops in. */
const always = () => 6 / 7;

describe("R4 runs", () => {
  it("finds no run on the dead board", () => {
    expect(findRuns(parseBoard(DEAD_BOARD))).toEqual([]);
  });

  it("finds maximal horizontal and vertical runs, ordered from their low end", () => {
    const board = parseBoard(
      deadWith([
        [1, 0, "J0"],
        [2, 0, "J2"],
        [3, 0, "J0s"],
        [5, 3, "M0"],
        [5, 4, "M0"],
        [5, 5, "M0"],
      ]),
    );
    const runs = findRuns(board);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ kind: "jade", horizontal: true });
    expect(runs[0].cells).toEqual([
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ]);
    expect(runs[1]).toMatchObject({ kind: "amethyst", horizontal: false });
    expect(runs[1].cells.map((c) => c.row)).toEqual([3, 4, 5]);
  });

  it("lets no prism join a run", () => {
    const board = parseBoard(
      deadWith([
        [0, 0, "J0"],
        [1, 0, "X0"],
        [2, 0, "J0"],
        [3, 0, "J0"],
      ]),
    );
    expect(findRuns(board)).toEqual([]);
  });
});

describe("move rules", () => {
  const board = parseBoard(deadWith([[2, 1, "R0"]]));
  const productive = parseBoard(
    deadWith([
      [0, 0, "S0"],
      [1, 0, "S0"],
      [2, 1, "S0"],
    ]),
  );

  it("R1 refuses cells that are not orthogonal neighbours", () => {
    expect(
      swapAccepted(productive, { col: 2, row: 1 }, { col: 3, row: 0 }),
    ).toBe(false);
    expect(
      swapAccepted(productive, { col: 2, row: 1 }, { col: 2, row: 3 }),
    ).toBe(false);
  });

  it("R3 accepts a swap that makes a run and refuses one that does not", () => {
    expect(
      swapAccepted(productive, { col: 2, row: 1 }, { col: 2, row: 0 }),
    ).toBe(true);
    expect(swapAccepted(board, { col: 0, row: 0 }, { col: 1, row: 0 })).toBe(
      false,
    );
  });

  it("R3 accepts any swap that moves a prism", () => {
    const prism = parseBoard(deadWith([[4, 4, "X1"]]));
    expect(swapAccepted(prism, { col: 4, row: 4 }, { col: 4, row: 5 })).toBe(
      true,
    );
  });

  it("reads whether any legal swap is left", () => {
    expect(hasLegalSwap(parseBoard(DEAD_BOARD))).toBe(false);
    expect(hasLegalSwap(productive)).toBe(true);
    expect(hasLegalSwap({ cols: 0, rows: 0, cells: [] })).toBe(false);
  });

  it("swapping carries each gem across and zeroes its fall", () => {
    const fallen = {
      ...productive,
      cells: productive.cells.map((g) => ({ ...g, fell: 2 })),
    };
    const swapped = swapCells(fallen, { col: 2, row: 1 }, { col: 2, row: 0 });
    expect(gemAt(swapped, 2, 0)).toMatchObject({
      kind: "sapphire",
      fell: 0,
      col: 2,
      row: 0,
    });
    expect(gemAt(swapped, 2, 1)).toMatchObject({
      kind: "citrine",
      fell: 0,
      col: 2,
      row: 1,
    });
    expect(gemAt(swapped, 3, 3)?.fell).toBe(2);
  });
});

describe("a chain step", () => {
  it("clears a run, scores it, strains its neighbours, and settles", () => {
    // Sapphires at (0..2, 0) after the swap.
    const board = parseBoard(
      deadWith([
        [0, 0, "S0"],
        [1, 0, "S0"],
        [2, 0, "S0"],
        [0, 1, "A2"],
      ]),
    );
    const r = resolveStep(
      board,
      1,
      null,
      ["J", "C", "B", "", "", "", "", ""],
      always,
    );
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.cleared.map((c) => [c.col, c.row, c.wave])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(r.points).toBe(30);
    expect(r.waves).toBe(0);
    // Neighbours below the run took one strain; the amber reached its flaw.
    expect(gemAt(r.board, 0, 1)).toMatchObject({
      kind: "amber",
      strain: 3,
      fell: 0,
    });
    expect(gemAt(r.board, 1, 1)?.strain).toBe(1);
    expect(gemAt(r.board, 3, 0)?.strain).toBe(1);
    expect(gemAt(r.board, 3, 1)?.strain).toBe(0);
    expect(r.flawed).toBe(true);
    // The posed refill drops in from above, one row each.
    expect(gemAt(r.board, 0, 0)).toMatchObject({
      kind: "jade",
      cut: "plain",
      strain: 0,
      fell: 1,
    });
    expect(gemAt(r.board, 1, 0)?.kind).toBe("citrine");
    expect(gemAt(r.board, 2, 0)?.kind).toBe("beryl");
    expect(longestFall(r.board)).toBe(1);
  });

  it("drops survivors down a column, keeping order and carrying strain and cut", () => {
    const board = parseBoard(
      deadWith([
        [4, 0, "R1b"],
        [4, 1, "A2"],
        [4, 3, "M0"],
        [4, 4, "M0"],
        [4, 5, "M0"],
        [4, 2, "J0"],
      ]),
    );
    const r = resolveStep(board, 1, null, NO_REFILL, always);
    if (!r) throw new Error("no step");
    expect(gemAt(r.board, 4, 3)).toMatchObject({
      kind: "ruby",
      cut: "brilliant",
      strain: 1,
      fell: 3,
    });
    expect(gemAt(r.board, 4, 4)).toMatchObject({
      kind: "amber",
      strain: 2,
      fell: 3,
    });
    expect(gemAt(r.board, 4, 5)).toMatchObject({
      kind: "jade",
      strain: 1,
      fell: 3,
    });
    for (let row = 0; row < 3; row++)
      expect(gemAt(r.board, 4, row)).toMatchObject({
        kind: "amethyst",
        fell: 3,
      });
    expect(gemAt(r.board, 4, 6)?.fell).toBe(0);
  });

  it("multiplies by the chain step, capped at the largest multiplier", () => {
    const board = parseBoard(
      deadWith([
        [0, 7, "J3"],
        [1, 7, "J0"],
        [2, 7, "J0"],
      ]),
    );
    expect(resolveStep(board, 2, null, NO_REFILL, always)?.points).toBe(2 * 50);
    expect(resolveStep(board, 12, null, NO_REFILL, always)?.points).toBe(
      8 * 50,
    );
  });

  it("returns null when nothing seeds", () => {
    expect(resolveStep(parseBoard(DEAD_BOARD), 1, null, NO_REFILL)).toBeNull();
    expect(
      resolveStep({ cols: 0, rows: 0, cells: [] }, 1, null, NO_REFILL),
    ).toBeNull();
  });
});

describe("R6 expansion", () => {
  it("a brilliant takes the ring round it, one wave on", () => {
    const board = parseBoard(
      deadWith([
        [2, 3, "S0b"],
        [3, 3, "S0"],
        [4, 3, "S0"],
      ]),
    );
    const r = resolveStep(board, 1, null, NO_REFILL, always);
    if (!r) throw new Error("no step");
    expect(r.cleared).toHaveLength(3 + 7);
    expect(r.waves).toBe(1);
    const ring = r.cleared
      .filter((c) => c.wave === 1)
      .map((c) => `${c.col},${c.row}`);
    expect(ring.sort()).toEqual(
      ["1,2", "1,3", "1,4", "2,2", "2,4", "3,2", "3,4"].sort(),
    );
  });

  it("a star takes its row and column, and flaws chain on in waves", () => {
    const board = parseBoard(
      deadWith([
        [0, 0, "C0s"],
        [1, 0, "C0"],
        [2, 0, "C0"],
        [5, 7, "S3"],
        [6, 7, "M3"],
      ]),
    );
    const r = resolveStep(board, 1, null, NO_REFILL, always);
    if (!r) throw new Error("no step");
    const at = (col: number, row: number) =>
      r.cleared.find((c) => c.col === col && c.row === row);
    expect(at(7, 0)?.wave).toBe(1);
    expect(at(0, 7)?.wave).toBe(1);
    // The star's column does not reach (5,7); only the row 0 and column 0 do.
    expect(at(5, 7)).toBeUndefined();
    expect(r.cleared).toHaveLength(15);
  });

  it("brings in flawed neighbours, each a wave after the cell that reached it", () => {
    const board = parseBoard(
      deadWith([
        [0, 0, "R0"],
        [1, 0, "R0"],
        [2, 0, "R0"],
        [3, 0, "A3"],
        [3, 1, "C3"],
        [3, 2, "J3"],
      ]),
    );
    const r = resolveStep(board, 1, null, NO_REFILL, always);
    if (!r) throw new Error("no step");
    expect(r.waves).toBe(3);
    expect(r.points).toBe(30 + 60);
    expect(r.cleared.map((c) => c.wave)).toEqual([0, 0, 0, 1, 2, 3]);
  });
});

describe("R8 cuts", () => {
  it("a run of four leaves a brilliant at the swapped cell", () => {
    const board = parseBoard(
      deadWith([
        [0, 2, "S0"],
        [1, 2, "S0"],
        [2, 2, "S0"],
        [3, 2, "S0"],
      ]),
    );
    const swap = { a: { col: 2, row: 2 }, b: { col: 2, row: 1 } };
    const r = resolveStep(board, 1, swap, NO_REFILL, always);
    if (!r) throw new Error("no step");
    expect(r.created).toEqual([{ col: 2, row: 2 }]);
    expect(gemAt(r.board, 2, 2)).toMatchObject({
      kind: "sapphire",
      cut: "brilliant",
      strain: 0,
    });
  });

  it("with neither swapped cell in the run, places at the middle index", () => {
    const board = parseBoard(
      deadWith([
        [3, 1, "R0"],
        [3, 2, "R0"],
        [3, 3, "R0"],
        [3, 4, "R0"],
        [3, 5, "R0"],
      ]),
    );
    const r = resolveStep(
      board,
      2,
      { a: { col: 0, row: 0 }, b: { col: 1, row: 0 } },
      NO_REFILL,
      always,
    );
    if (!r) throw new Error("no step");
    // A run of five makes a prism at index floor(4 / 2) = 2, row 3, which then
    // stands on the column below it.
    expect(r.created).toEqual([{ col: 3, row: 3 }]);
    expect(gemAt(r.board, 3, 5)).toMatchObject({
      kind: null,
      cut: "prism",
      fell: 2,
    });
  });

  it("two crossing runs leave a star where they cross", () => {
    const board = parseBoard(
      deadWith([
        [4, 4, "R0"],
        [5, 4, "R0"],
        [6, 4, "R0"],
        [4, 5, "R0"],
        [4, 6, "R0"],
      ]),
    );
    const r = resolveStep(board, 1, null, NO_REFILL, always);
    if (!r) throw new Error("no step");
    expect(r.created).toEqual([{ col: 4, row: 4 }]);
    const star = r.board.cells.find((g) => g.cut === "star");
    expect(star).toMatchObject({ kind: "ruby", col: 4, row: 6 });
  });

  it("the lower index wins when both swapped cells lie in the run", () => {
    const board = parseBoard(
      deadWith([
        [1, 6, "M0"],
        [2, 6, "M0"],
        [3, 6, "M0"],
        [4, 6, "M0"],
      ]),
    );
    const r = resolveStep(
      board,
      1,
      { a: { col: 3, row: 6 }, b: { col: 2, row: 6 } },
      NO_REFILL,
      always,
    );
    expect(r?.created).toEqual([{ col: 2, row: 6 }]);
  });
});

describe("R5 prism swaps", () => {
  it("a prism traded against a gem takes every gem of that kind", () => {
    const board = parseBoard(deadWith([[3, 3, "X2"]]));
    const swap = { a: { col: 3, row: 3 }, b: { col: 4, row: 3 } };
    const swapped = swapCells(board, swap.a, swap.b);
    const kind = gemAt(swapped, 3, 3)?.kind;
    const r = resolveStep(swapped, 1, swap, NO_REFILL, always);
    if (!r) throw new Error("no step");
    const count = swapped.cells.filter((g) => g.kind === kind).length;
    expect(r.cleared).toHaveLength(count + 1);
    expect(r.created).toEqual([]);
  });

  it("a prism traded against a prism takes every cell", () => {
    const board = parseBoard(
      deadWith([
        [3, 3, "X0"],
        [3, 4, "X0"],
      ]),
    );
    const r = resolveStep(
      board,
      1,
      { a: { col: 3, row: 3 }, b: { col: 3, row: 4 } },
      NO_REFILL,
      always,
    );
    expect(r?.cleared).toHaveLength(GRID_COLS * GRID_ROWS);
    expect(r?.points).toBe(64 * 10);
  });

  it("only seeds the first step that way", () => {
    const board = parseBoard(deadWith([[3, 3, "X0"]]));
    expect(
      resolveStep(
        board,
        2,
        { a: { col: 3, row: 3 }, b: { col: 3, row: 4 } },
        NO_REFILL,
      ),
    ).toBeNull();
  });
});

describe("the opening board", () => {
  it("holds no run, leaves a legal swap, and is dealt in from above", () => {
    for (let i = 0; i < 20; i++) {
      const board = dealOpeningBoard();
      expect(findRuns(board)).toEqual([]);
      expect(hasLegalSwap(board)).toBe(true);
      for (const g of board.cells) {
        expect(g.cut).toBe("plain");
        expect(g.strain).toBe(0);
        expect(g.fell).toBeGreaterThanOrEqual(g.row + 1);
      }
      expect(formatBoard(board)).toHaveLength(GRID_ROWS);
    }
  });
});
