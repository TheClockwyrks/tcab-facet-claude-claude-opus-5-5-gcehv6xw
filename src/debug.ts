// The debug and automation surface (specs/instrumentation.md). Every pose is a
// transition in the shape of `update`; every reading is a pure function of the
// state it is handed. Input it cannot place on a domain the specification fixes
// is refused loudly rather than guessed at.

import {
  EMPTY_BOARD,
  cellX,
  cellY,
  hasBoard,
  kindOfLetter,
  longestFall,
  onGrid,
  parseBoard,
  parseToken,
} from "./board";
import { FACET_DEBUG_VERSION, GRID_COLS } from "./constants";
import type {
  CellRef,
  FacetDebugApi,
  FacetSnapshot,
  PointerDevice,
  Screen,
} from "./game";
import { dealOpeningBoard } from "./rules";
import {
  IDLE_MOTION,
  initialState,
  legalSwap,
  levelTarget,
  multiplier,
  own,
  pointerEvent,
  requestSwap,
  stepHold,
  targetsFor,
  type View,
} from "./sim";

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "playing",
  "paused",
  "levelclear",
  "gameover",
];
const DEVICES: readonly PointerDevice[] = ["mouse", "pen", "touch"];

function fail(message: string): never {
  throw new RangeError(`Facet debug: ${message}`);
}

function cell(op: string, col: number, row: number): CellRef {
  if (!onGrid(col, row))
    fail(`${op}: (${String(col)}, ${String(row)}) is not a cell of the board`);
  return { col, row };
}

function whole(op: string, value: number, least: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < least)
    fail(`${op}: ${String(value)} is not a whole number of at least ${least}`);
  return value;
}

function finite(op: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`${op}: ${String(value)} is not a finite number`);
  return value;
}

function device(op: string, value: PointerDevice | undefined): PointerDevice {
  const d = value ?? "mouse";
  if (!DEVICES.includes(d))
    fail(`${op}: "${String(value)}" is not one of ${DEVICES.join(", ")}`);
  return d;
}

/** The plain-object reading of a state, `specs/instrumentation.md`'s shape. */
export function snapshot(state: View): FacetSnapshot {
  const board = own(state).board;
  const ref = (c: CellRef | null) =>
    c === null ? null : { col: c.col, row: c.row };
  return {
    version: FACET_DEBUG_VERSION,
    screen: state.screen,
    menuIndex: state.menuIndex,
    score: state.score,
    level: state.level,
    levelScore: state.levelScore,
    levelTarget: levelTarget(state),
    phase: state.phase,
    chainStep: state.chainStep,
    multiplier: multiplier(state),
    swapTimer: state.swapTimer,
    stepTimer: state.stepTimer,
    stepHold: stepHold(state),
    board: {
      cols: board.cols,
      rows: board.rows,
      cells: board.cells.map((g) => ({
        col: g.col,
        row: g.row,
        x: cellX(g.col),
        y: cellY(g.row),
        kind: g.kind,
        cut: g.cut,
        strain: g.strain,
        fell: g.fell,
      })),
    },
    selection: ref(state.selection),
    offer: ref(state.offer),
    refusal:
      state.refusal === null
        ? null
        : {
            a: { col: state.refusal.a.col, row: state.refusal.a.row },
            b: { col: state.refusal.b.col, row: state.refusal.b.row },
          },
    lastCleared: state.lastCleared,
    lastPoints: state.lastPoints,
    lastWaves: state.lastWaves,
    lastFall: longestFall(board),
    moveScore: state.moveScore,
    bestMove: state.bestMove,
    bestChain: state.bestChain,
    legalSwap: legalSwap(state),
    refillKinds: [...state.refillKinds],
    pointer: {
      x: state.pointer.x,
      y: state.pointer.y,
      down: state.pointer.down,
      device: state.pointer.device,
    },
    armedTarget: state.armedTarget,
    targets: targetsFor(state.screen).map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
    })),
    muted: state.muted,
    simTime: state.simTime,
  };
}

/** Builds the surface `initialize` returns beside the state. */
export function createDebugApi(): FacetDebugApi {
  return {
    version: FACET_DEBUG_VERSION,

    reset: (s) => ({ ...initialState(), muted: s.muted }),

    // Every derived reading is worked out at the read, so there is no stored
    // copy to bring back into agreement.
    reconcile: (s) => own(s),

    snapshot,

    setScreen: (s, screen) => {
      if (!SCREENS.includes(screen))
        fail(
          `setScreen: "${String(screen)}" is not one of ${SCREENS.join(", ")}`,
        );
      return { ...own(s), screen };
    },

    setMenuIndex: (s, index) => ({
      ...own(s),
      menuIndex: whole("setMenuIndex", index, 0),
    }),

    loadBoard: (s, rows) => ({
      ...own(s),
      board: parseBoard(rows),
      motion: { ...s.motion, step: null, dealTimer: IDLE_MOTION.dealTimer },
    }),

    dealBoard: (s) => ({
      ...own(s),
      board: dealOpeningBoard(),
      motion: { ...s.motion, step: null, dealTimer: 0 },
    }),

    clearBoard: (s) => ({
      ...own(s),
      board: EMPTY_BOARD,
      motion: { ...s.motion, step: null },
    }),

    setGem: (s, col, row, token) => {
      const at = cell("setGem", col, row);
      if (!hasBoard(own(s).board))
        fail("setGem: no board is in play to write a cell of");
      if (typeof token !== "string") fail("setGem: the token is not a string");
      const gem = parseToken(token, at.col, at.row);
      const cells = own(s).board.cells.slice();
      cells[at.row * s.board.cols + at.col] = gem;
      return { ...own(s), board: { ...own(s).board, cells } };
    },

    setRefillKinds: (s, col, kinds) => {
      if (!Number.isInteger(col) || col < 0 || col >= GRID_COLS)
        fail(`setRefillKinds: ${String(col)} is not a column of the board`);
      if (typeof kinds !== "string")
        fail("setRefillKinds: kinds is not a string");
      for (const letter of kinds)
        if (kindOfLetter(letter) === null)
          fail(`setRefillKinds: "${letter}" is not a kind letter (RACJBSM)`);
      const refillKinds = [...s.refillKinds];
      refillKinds[col] = kinds;
      return { ...own(s), refillKinds };
    },

    clearRefillKinds: (s) => ({
      ...own(s),
      refillKinds: new Array<string>(GRID_COLS).fill(""),
    }),

    setScore: (s, points) => ({
      ...own(s),
      score: whole("setScore", points, 0),
    }),

    setLevel: (s, level) => ({ ...own(s), level: whole("setLevel", level, 1) }),

    setLevelScore: (s, points) => ({
      ...own(s),
      levelScore: whole("setLevelScore", points, 0),
    }),

    setBestChain: (s, chainStep) => ({
      ...own(s),
      bestChain: whole("setBestChain", chainStep, 0),
    }),

    setBestMove: (s, points) => ({
      ...own(s),
      bestMove: whole("setBestMove", points, 0),
    }),

    setMoveScore: (s, points) => ({
      ...own(s),
      moveScore: whole("setMoveScore", points, 0),
    }),

    setSelection: (s, col, row) => ({
      ...own(s),
      selection: cell("setSelection", col, row),
    }),

    clearSelection: (s) => ({ ...own(s), selection: null }),

    setOffer: (s, col, row) => ({
      ...own(s),
      offer: cell("setOffer", col, row),
    }),

    clearOffer: (s) => ({ ...own(s), offer: null }),

    clearRefusal: (s) => ({ ...own(s), refusal: null }),

    clearChain: (s) => ({
      ...own(s),
      phase: "idle",
      chainStep: 0,
      swapTimer: 0,
      stepTimer: 0,
      motion: { ...s.motion, swap: null },
    }),

    requestSwap: (s, colA, rowA, colB, rowB) =>
      requestSwap(
        s,
        cell("requestSwap", colA, rowA),
        cell("requestSwap", colB, rowB),
      ).state,

    pointerDown: (s, x, y, d) =>
      pointerEvent(
        s,
        "down",
        finite("pointerDown", x),
        finite("pointerDown", y),
        device("pointerDown", d),
      ).state,

    pointerMove: (s, x, y, d) =>
      pointerEvent(
        s,
        "move",
        finite("pointerMove", x),
        finite("pointerMove", y),
        device("pointerMove", d),
      ).state,

    pointerUp: (s, d) =>
      pointerEvent(s, "up", s.pointer.x, s.pointer.y, device("pointerUp", d))
        .state,
  };
}
