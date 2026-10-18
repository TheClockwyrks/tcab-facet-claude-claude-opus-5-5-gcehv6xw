import { describe, expect, it } from "vitest";
import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  cellX,
  cellY,
  formatBoard,
  formatToken,
  gemAt,
  kindOfLetter,
  onGrid,
  parseBoard,
  parseToken,
} from "./board";

const SAMPLE = [
  "R0 A0 C0 J0 B0 S0 M0 R0",
  "C0 J1 B0 S0 M0 R0 A0 C0",
  "B0 S0 M2 R1 A0 C0 J0 B0",
  "M0 R0 A0 C0 J0 B0b S0 M0",
  "A0 C0 J0 B0 S1 M0 R3 A0",
  "J0 B0 S2s M0 R0 A0 C0 J0",
  "S0 M0 R0 A0 X0 J0 B0 S0",
  "R0 A0 C0 J0 B0 S0 M0 R0",
];

describe("geometry", () => {
  it("places cell centres on the pitch the spec fixes", () => {
    expect(cellX(0)).toBe(388);
    expect(cellX(7)).toBe(892);
    expect(cellY(0)).toBe(144);
    expect(cellY(7)).toBe(648);
    expect([BOARD_LEFT, BOARD_TOP, BOARD_RIGHT, BOARD_BOTTOM]).toEqual([
      352, 108, 928, 684,
    ]);
  });

  it("knows which cells are on the grid", () => {
    expect(onGrid(0, 0)).toBe(true);
    expect(onGrid(7, 7)).toBe(true);
    expect(onGrid(8, 0)).toBe(false);
    expect(onGrid(-1, 2)).toBe(false);
    expect(onGrid(1.5, 2)).toBe(false);
  });
});

describe("notation", () => {
  it("reads every kind, strain, and cut", () => {
    expect(parseToken("R0", 1, 2)).toEqual({
      col: 1,
      row: 2,
      kind: "ruby",
      cut: "plain",
      strain: 0,
      fell: 0,
    });
    expect(parseToken("J3", 0, 0)).toMatchObject({ kind: "jade", strain: 3 });
    expect(parseToken("S1b", 0, 0)).toMatchObject({
      kind: "sapphire",
      cut: "brilliant",
    });
    expect(parseToken("C0s", 0, 0)).toMatchObject({
      kind: "citrine",
      cut: "star",
    });
    expect(parseToken("X2", 0, 0)).toMatchObject({
      kind: null,
      cut: "prism",
      strain: 2,
    });
    expect(kindOfLetter("M")).toBe("amethyst");
    expect(kindOfLetter("X")).toBeNull();
  });

  it("refuses tokens it does not read", () => {
    for (const bad of ["", "R", "R4", "Q0", "X0b", "r0", "R0x", "A0 "])
      expect(() => parseToken(bad, 0, 0)).toThrow(RangeError);
  });

  it("round-trips a board", () => {
    const board = parseBoard(SAMPLE);
    expect(board.cols).toBe(8);
    expect(board.cells).toHaveLength(64);
    expect(gemAt(board, 5, 3)).toMatchObject({
      kind: "beryl",
      cut: "brilliant",
    });
    expect(gemAt(board, 4, 6)).toMatchObject({ cut: "prism", kind: null });
    expect(gemAt(board, 9, 9)).toBeNull();
    expect(formatBoard(board)).toEqual(SAMPLE);
    expect(
      formatToken({
        col: 0,
        row: 0,
        kind: "ruby",
        cut: "star",
        strain: 1,
        fell: 0,
      }),
    ).toBe("R1s");
  });

  it("refuses a board of the wrong shape", () => {
    expect(() => parseBoard(SAMPLE.slice(1))).toThrow(RangeError);
    expect(() => parseBoard([...SAMPLE.slice(1), "R0 A0"])).toThrow(RangeError);
    expect(() =>
      parseBoard([...SAMPLE.slice(1), 7 as unknown as string]),
    ).toThrow(TypeError);
    expect(() => parseBoard("R0" as unknown as string[])).toThrow(RangeError);
  });
});
