// The simulation: every transition the game's state goes through, as pure
// functions from one state to the next. `update` and the debug surface both
// drive the game through these, so a scenario posed from code runs exactly the
// path a player's input runs. Each transition reports the cues its events raise
// rather than playing them, so only a frame ever makes a sound.

import {
  EMPTY_BOARD,
  adjacent,
  cellX,
  cellY,
  hasBoard,
  longestFall,
  sameCell,
} from "./board";
import {
  CUES,
  FALL_SECONDS_PER_ROW,
  GAMEOVER_ITEMS,
  GEM_HIT_R,
  GRID_COLS,
  GRID_ROWS,
  LAND_MIN_ROWS,
  LEVELCLEAR_ITEMS,
  LEVEL_TARGET_STEP,
  MAX_MULTIPLIER,
  PAUSED_ITEMS,
  REFUSAL_SECONDS,
  STAGE_W,
  STEP_SECONDS,
  SWAP_SECONDS,
  TITLE_ITEMS,
  WAVE_SECONDS,
  type CueName,
} from "./constants";
import type {
  CellRef,
  FacetState,
  MotionState,
  PointerDevice,
  Screen,
  TargetRect,
} from "./game";
import {
  dealOpeningBoard,
  hasLegalSwap,
  resolveStep,
  swapAccepted,
  swapCells,
  type StepResult,
} from "./rules";
import type { DeepReadonly } from "ts-essentials";

export type View = DeepReadonly<FacetState>;

/** A transition's result: the next state and the cues its events raise. */
export interface Outcome {
  readonly state: FacetState;
  readonly cues: readonly CueName[];
}

/** A deal-in timer far past any fall, for a board that is no longer arriving. */
const SETTLED = 99;

export const IDLE_MOTION: MotionState = {
  swap: null,
  step: null,
  serial: 0,
  dealTimer: SETTLED,
  input: { x: 0, y: 0, down: false, device: "mouse" },
};

/**
 * The state handed back as writable. `DeepReadonly` is a compile-time view and
 * the value underneath is the same plain data, so a transition that spreads it
 * builds a new state without copying what it does not change.
 */
export function own(state: View): FacetState {
  return state as FacetState;
}

export function initialState(): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: EMPTY_BOARD,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted: false,
    refillKinds: new Array<string>(GRID_COLS).fill(""),
    motion: IDLE_MOTION,
  };
}

// ---- Derived figures ------------------------------------------------------

export function levelTarget(state: View): number {
  return LEVEL_TARGET_STEP * state.level;
}

export function multiplier(state: View): number {
  return Math.min(state.chainStep, MAX_MULTIPLIER);
}

/** When the step in progress lands: `lastWaves` shattering, then the fall. */
export function landAt(state: View): number {
  return (
    state.lastWaves * WAVE_SECONDS +
    longestFall(own(state).board) * FALL_SECONDS_PER_ROW
  );
}

export function stepHold(state: View): number {
  return landAt(state) + STEP_SECONDS;
}

// ---- Pointer targets ------------------------------------------------------

export const MENU_W = 320;
export const MENU_H = 76;
const MENU_GAP = 16;
const MENU_X = (STAGE_W - MENU_W) / 2;

/** Where each screen's menu starts, top edge of its first item. */
export const MENU_TOP: Readonly<Partial<Record<Screen, number>>> = {
  title: 404,
  paused: 330,
  levelclear: 452,
  gameover: 452,
};

export const MENU_ITEMS: Readonly<Partial<Record<Screen, readonly string[]>>> =
  {
    title: TITLE_ITEMS,
    paused: PAUSED_ITEMS,
    levelclear: LEVELCLEAR_ITEMS,
    gameover: GAMEOVER_ITEMS,
  };

export const PAUSE_TARGET: TargetRect = {
  id: "pause",
  x: 1076,
  y: 28,
  w: 168,
  h: 76,
};

export const BACK_TARGET: TargetRect = {
  id: "back",
  x: (STAGE_W - 200) / 2,
  y: 630,
  w: 200,
  h: 76,
};

/** The current screen's pointer targets, in the order controls.md fixes. */
export function targetsFor(screen: Screen): TargetRect[] {
  if (screen === "playing") return [PAUSE_TARGET];
  if (screen === "howto") return [BACK_TARGET];
  const items = MENU_ITEMS[screen] ?? [];
  const top = MENU_TOP[screen] ?? 0;
  return items.map((_, i) => ({
    id: `menu-${i}`,
    x: MENU_X,
    y: top + i * (MENU_H + MENU_GAP),
    w: MENU_W,
    h: MENU_H,
  }));
}

function within(t: TargetRect, x: number, y: number): boolean {
  return x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h;
}

export function targetAt(
  screen: Screen,
  x: number,
  y: number,
): TargetRect | null {
  return targetsFor(screen).find((t) => within(t, x, y)) ?? null;
}

/**
 * The cell a pointer position targets: the nearest centre within GEM_HIT_R,
 * a tie going to the lower row and then the lower column.
 */
export function cellAt(x: number, y: number): CellRef | null {
  const col0 = Math.round((x - cellX(0)) / (cellX(1) - cellX(0)));
  const row0 = Math.round((y - cellY(0)) / (cellY(1) - cellY(0)));
  let best: CellRef | null = null;
  let bestD = Infinity;
  for (let row = row0 - 1; row <= row0 + 1; row++)
    for (let col = col0 - 1; col <= col0 + 1; col++) {
      if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) continue;
      const d = Math.hypot(x - cellX(col), y - cellY(row));
      if (d > GEM_HIT_R) continue;
      // Rows and columns are visited in increasing order, so a strict
      // comparison keeps the lower row, then the lower column, on a tie.
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  return best;
}

// ---- Screens --------------------------------------------------------------

function go(state: FacetState, screen: Screen, menuIndex = 0): FacetState {
  return { ...state, screen, menuIndex, armedTarget: null };
}

function dealt(state: FacetState): FacetState {
  return {
    ...state,
    board: dealOpeningBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: {
      ...IDLE_MOTION,
      serial: state.motion.serial,
      input: state.motion.input,
      dealTimer: 0,
    },
  };
}

/** PLAY and PLAY AGAIN: a fresh round, carrying nothing over. */
export function startRound(state: View): FacetState {
  return go(
    dealt({
      ...own(state),
      score: 0,
      level: 1,
      levelScore: 0,
      lastCleared: 0,
      lastPoints: 0,
      lastWaves: 0,
      moveScore: 0,
      bestMove: 0,
      bestChain: 0,
    }),
    "playing",
  );
}

/** CONTINUE: the next level, on a fresh board, with the score carried. */
export function nextLevel(state: View): FacetState {
  return go(
    dealt({
      ...own(state),
      level: state.level + 1,
      levelScore: 0,
      moveScore: 0,
      bestMove: 0,
      bestChain: 0,
    }),
    "playing",
  );
}

/** QUIT: the round is put down, and the title shows over no board. */
export function quit(state: View): FacetState {
  return go(
    {
      ...own(state),
      board: EMPTY_BOARD,
      phase: "idle",
      chainStep: 0,
      swapTimer: 0,
      stepTimer: 0,
      selection: null,
      offer: null,
      refusal: null,
      motion: {
        ...IDLE_MOTION,
        serial: state.motion.serial,
        input: state.motion.input,
      },
    },
    "title",
  );
}

export function menuMove(state: View, delta: number): FacetState {
  const n = MENU_ITEMS[state.screen]?.length ?? 0;
  if (n === 0) return own(state);
  return {
    ...own(state),
    menuIndex: (((state.menuIndex + delta) % n) + n) % n,
  };
}

export function confirm(state: View): Outcome {
  const i = state.menuIndex;
  switch (state.screen) {
    case "title":
      if (i === 0) return { state: startRound(state), cues: [] };
      if (i === 1) return { state: go(own(state), "howto"), cues: [] };
      break;
    case "paused":
      if (i === 0) return { state: go(own(state), "playing"), cues: [] };
      if (i === 1) return { state: quit(state), cues: [] };
      break;
    case "levelclear":
      if (i === 0) return { state: nextLevel(state), cues: [] };
      if (i === 1) return { state: quit(state), cues: [] };
      break;
    case "gameover":
      if (i === 0) return { state: startRound(state), cues: [] };
      if (i === 1) return { state: quit(state), cues: [] };
      break;
  }
  return { state: own(state), cues: [] };
}

export function back(state: View): FacetState {
  if (state.screen === "howto") return go(own(state), "title", 1);
  if (state.screen === "gameover") return go(own(state), "title", 0);
  return own(state);
}

export function pause(state: View): FacetState {
  if (state.screen === "playing") return go(own(state), "paused");
  if (state.screen === "paused") return go(own(state), "playing");
  return own(state);
}

// ---- Swaps and chains -----------------------------------------------------

/** Every requested swap's one acceptance path: R2, then R1 and R3. */
export function requestSwap(state: View, a: CellRef, b: CellRef): Outcome {
  const s = own(state);
  if (s.phase === "idle" && swapAccepted(s.board, a, b)) {
    return {
      state: {
        ...s,
        board: swapCells(s.board, a, b),
        phase: "swapping",
        swapTimer: 0,
        chainStep: 0,
        stepTimer: 0,
        moveScore: 0,
        motion: {
          ...s.motion,
          swap: { a: { ...a }, b: { ...b } },
          dealTimer: SETTLED,
        },
      },
      cues: [CUES.swap],
    };
  }
  return {
    state: { ...s, refusal: { a: { ...a }, b: { ...b }, timer: 0 } },
    cues: [CUES.refuse],
  };
}

function applyStep(state: FacetState, step: number, r: StepResult): Outcome {
  const cues: CueName[] = [CUES.clear];
  if (r.flawed) cues.push(CUES.flaw);
  if (r.created.length > 0) cues.push(CUES.cut);
  return {
    state: {
      ...state,
      board: r.board,
      phase: "resolving",
      chainStep: step,
      swapTimer: 0,
      stepTimer: 0,
      score: state.score + r.points,
      levelScore: state.levelScore + r.points,
      moveScore: state.moveScore + r.points,
      lastCleared: r.cleared.length,
      lastPoints: r.points,
      lastWaves: r.waves,
      bestChain: Math.max(state.bestChain, step),
      motion: {
        ...state.motion,
        step: {
          id: state.motion.serial + 1,
          cleared: r.cleared,
          created: r.created,
        },
        serial: state.motion.serial + 1,
      },
    },
    cues,
  };
}

/** The chain has nothing more to clear: settle, then read the level and end. */
function finishChain(state: FacetState): Outcome {
  const settled: FacetState = {
    ...state,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    bestMove: Math.max(state.bestMove, state.moveScore),
    motion: { ...state.motion, swap: null },
  };
  if (settled.levelScore >= levelTarget(settled))
    return { state: go(settled, "levelclear"), cues: [CUES.levelUp] };
  if (!hasLegalSwap(settled.board))
    return { state: go(settled, "gameover"), cues: [CUES.gameOver] };
  return { state: settled, cues: [] };
}

function runStep(
  state: FacetState,
  step: number,
  random: () => number,
): Outcome {
  const r = resolveStep(
    state.board,
    step,
    state.motion.swap,
    state.refillKinds,
    random,
  );
  return r === null ? finishChain(state) : applyStep(state, step, r);
}

/**
 * Advances everything that moves on `playing` by `dt` seconds of game time:
 * the refusal mark, the swap in motion, and the chain step in progress.
 */
export function advancePlay(
  state: View,
  dt: number,
  random: () => number = Math.random,
): Outcome {
  let s = own(state);
  const cues: CueName[] = [];
  if (s.refusal !== null) {
    const timer = s.refusal.timer + dt;
    s = {
      ...s,
      refusal: timer >= REFUSAL_SECONDS ? null : { ...s.refusal, timer },
    };
  }
  if (s.motion.dealTimer < SETTLED)
    s = {
      ...s,
      motion: {
        ...s.motion,
        dealTimer: Math.min(SETTLED, s.motion.dealTimer + dt),
      },
    };

  if (s.phase === "swapping") {
    const t = s.swapTimer + dt;
    if (t < SWAP_SECONDS) return { state: { ...s, swapTimer: t }, cues };
    const out = runStep({ ...s, swapTimer: 0 }, 1, random);
    return { state: out.state, cues: [...cues, ...out.cues] };
  }

  if (s.phase === "resolving") {
    const prev = s.stepTimer;
    const t = prev + dt;
    const land = landAt(s);
    if (longestFall(s.board) > LAND_MIN_ROWS && prev < land && t >= land)
      cues.push(CUES.land);
    if (t < land + STEP_SECONDS) return { state: { ...s, stepTimer: t }, cues };
    const out = runStep({ ...s, stepTimer: 0 }, s.chainStep + 1, random);
    return { state: out.state, cues: [...cues, ...out.cues] };
  }
  return { state: s, cues };
}

// ---- The pointer ----------------------------------------------------------

export type PointerKind = "down" | "move" | "up";

function take(state: FacetState, id: string): Outcome {
  if (id === "pause") return { state: pause(state), cues: [] };
  if (id === "back") return { state: back(state), cues: [] };
  const i = Number(id.slice("menu-".length));
  return confirm({ ...state, menuIndex: i });
}

function boardPress(state: FacetState, x: number, y: number): Outcome {
  const cell = cellAt(x, y);
  if (cell === null)
    return { state: { ...state, selection: null, offer: null }, cues: [] };
  const sel = state.selection;
  if (sel === null || (!sameCell(sel, cell) && !adjacent(sel, cell)))
    return {
      state: { ...state, selection: cell, offer: null },
      cues: [CUES.select],
    };
  if (sameCell(sel, cell))
    return { state: { ...state, offer: null }, cues: [] };
  return { state: { ...state, offer: cell }, cues: [] };
}

function boardDrag(state: FacetState, x: number, y: number): FacetState {
  const sel = state.selection;
  if (sel === null) return state;
  if (Math.hypot(x - cellX(sel.col), y - cellY(sel.row)) <= GEM_HIT_R)
    return state.offer === null ? state : { ...state, offer: null };
  const cell = cellAt(x, y);
  if (cell !== null && adjacent(sel, cell) && !sameCell(cell, state.offer))
    return { ...state, offer: cell };
  return state;
}

function boardRelease(state: FacetState): Outcome {
  if (state.offer === null) return { state, cues: [] };
  if (state.selection === null)
    return { state: { ...state, offer: null }, cues: [] };
  const out = requestSwap(state, state.selection, state.offer);
  return {
    state: { ...out.state, selection: null, offer: null },
    cues: out.cues,
  };
}

/**
 * One pointer position, resolved on its own: a press, a move, or a release
 * from `device`, operating the screen's targets or, on `playing`, the board.
 */
export function pointerEvent(
  state: View,
  kind: PointerKind,
  x: number,
  y: number,
  device: PointerDevice,
): Outcome {
  const down =
    kind === "down" ? true : kind === "up" ? false : state.pointer.down;
  let s: FacetState = { ...own(state), pointer: { x, y, down, device } };
  const hit = targetAt(s.screen, x, y);
  const menuHit = hit !== null && hit.id.startsWith("menu-");

  if (kind === "move") {
    if (s.armedTarget === null && menuHit)
      s = { ...s, menuIndex: Number(hit.id.slice(5)) };
    if (s.screen === "playing" && down && s.armedTarget === null)
      s = boardDrag(s, x, y);
    return { state: s, cues: [] };
  }

  if (kind === "down") {
    if (hit !== null) {
      if (menuHit) s = { ...s, menuIndex: Number(hit.id.slice(5)) };
      return { state: { ...s, armedTarget: hit.id }, cues: [] };
    }
    s = { ...s, armedTarget: null };
    if (s.screen === "playing") return boardPress(s, x, y);
    return { state: s, cues: [] };
  }

  const armed = s.armedTarget;
  s = { ...s, armedTarget: null };
  if (armed !== null) {
    if (hit !== null && hit.id === armed) return take(s, armed);
    return { state: s, cues: [] };
  }
  if (s.screen === "playing") return boardRelease(s);
  return { state: s, cues: [] };
}

/** Whether the board leaves any legal swap, for the snapshot and the overlay. */
export function legalSwap(state: View): boolean {
  return hasBoard(own(state).board) && hasLegalSwap(own(state).board);
}
