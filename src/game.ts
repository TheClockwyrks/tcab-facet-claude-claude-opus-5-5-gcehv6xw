// Facet — the game. `src/main.ts` binds the `game` object exported here to the
// engine; this module declares the state the game is written against
// (specs/state.md), the debug surface it returns beside that state
// (specs/instrumentation.md), and the three functions the engine drives.
//
// The rules live in `rules.ts`, the transitions in `sim.ts`, the debug surface
// in `debug.ts`, the produced files in `media.ts`, and the drawing in
// `render.ts` and `fx.ts`.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { formatToken, longestFall } from "./board";
import { ACTIONS, BINDINGS, type CueName } from "./constants";
import { createDebugApi } from "./debug";
import { FxLayer } from "./fx";
import { THEME_PLAY, THEME_TITLE, loadMedia, rungCue } from "./media";
import { STAGE_BACKGROUND, draw } from "./render";
import {
  advancePlay,
  back,
  confirm,
  initialState,
  legalSwap,
  levelTarget,
  menuMove,
  multiplier,
  pause,
  pointerEvent,
  type Outcome,
} from "./sim";

/**
 * The stage background, a CSS color string: the deep bench-room indigo the
 * board's lamp falls on, which the letterbox bars carry too.
 */
export const BACKGROUND = STAGE_BACKGROUND;

// ---- specs/state.md, verbatim ---------------------------------------------

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];

  /**
   * Facet's one added field: what the running chain remembers beyond the
   * declared figures. R5 and R8 read the chain's swap on every step, and the
   * renderer reads the most recent step's clear set to shatter it in waves.
   * `reset` returns it to `IDLE_MOTION`.
   */
  readonly motion: MotionState;
}

// ---- Facet's added state --------------------------------------------------

/** One cell of a step's clear set, as it stood when the step scored it. */
export interface ShardState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly wave: number;
}

/** What the most recent chain step did, for the renderer to play back. */
export interface StepMemo {
  /** A serial that tells one step from the next. */
  readonly id: number;
  readonly cleared: readonly ShardState[];
  /** The cells R8 placed a cut gem at. */
  readonly created: readonly CellRef[];
}

export interface MotionState {
  /** The two cells the running chain's swap exchanged, in the order named. */
  readonly swap: { readonly a: CellRef; readonly b: CellRef } | null;
  readonly step: StepMemo | null;
  readonly serial: number;
  /** Play time since a fresh board was dealt in; drives the deal-in fall. */
  readonly dealTimer: number;
  /**
   * The pointer as the engine last reported it. `pointer` follows the engine
   * whenever this changes, and otherwise keeps a position the debug surface
   * posed, so a posed press is still held when a frame passes before its move
   * or its release.
   */
  readonly input: PointerState;
}

// ---- specs/instrumentation.md ---------------------------------------------

export interface TargetRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SnapshotCell {
  col: number;
  row: number;
  x: number;
  y: number;
  kind: GemKind | null;
  cut: Cut;
  strain: number;
  fell: number;
}

export interface FacetSnapshot {
  version: number;
  screen: Screen;
  menuIndex: number;
  score: number;
  level: number;
  levelScore: number;
  levelTarget: number;
  phase: Phase;
  chainStep: number;
  multiplier: number;
  swapTimer: number;
  stepTimer: number;
  stepHold: number;
  board: { cols: number; rows: number; cells: SnapshotCell[] };
  selection: { col: number; row: number } | null;
  offer: { col: number; row: number } | null;
  refusal: {
    a: { col: number; row: number };
    b: { col: number; row: number };
  } | null;
  lastCleared: number;
  lastPoints: number;
  lastWaves: number;
  lastFall: number;
  moveScore: number;
  bestMove: number;
  bestChain: number;
  legalSwap: boolean;
  refillKinds: string[];
  pointer: { x: number; y: number; down: boolean; device: PointerDevice };
  armedTarget: string | null;
  targets: { id: string; x: number; y: number; w: number; h: number }[];
  muted: boolean;
  simTime: number;
}

type View = DeepReadonly<FacetState>;

/** The debug and automation surface, `specs/instrumentation.md`. */
export interface FacetDebugApi {
  readonly version: number;
  reset(state: View): FacetState;
  reconcile(state: View): FacetState;
  snapshot(state: View): FacetSnapshot;
  setScreen(state: View, screen: Screen): FacetState;
  setMenuIndex(state: View, index: number): FacetState;
  loadBoard(state: View, rows: readonly string[]): FacetState;
  dealBoard(state: View): FacetState;
  clearBoard(state: View): FacetState;
  setGem(state: View, col: number, row: number, token: string): FacetState;
  setRefillKinds(state: View, col: number, kinds: string): FacetState;
  clearRefillKinds(state: View): FacetState;
  setScore(state: View, points: number): FacetState;
  setLevel(state: View, level: number): FacetState;
  setLevelScore(state: View, points: number): FacetState;
  setBestChain(state: View, chainStep: number): FacetState;
  setBestMove(state: View, points: number): FacetState;
  setMoveScore(state: View, points: number): FacetState;
  setSelection(state: View, col: number, row: number): FacetState;
  clearSelection(state: View): FacetState;
  setOffer(state: View, col: number, row: number): FacetState;
  clearOffer(state: View): FacetState;
  clearRefusal(state: View): FacetState;
  clearChain(state: View): FacetState;
  requestSwap(
    state: View,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState;
  pointerDown(
    state: View,
    x: number,
    y: number,
    device?: PointerDevice,
  ): FacetState;
  pointerMove(
    state: View,
    x: number,
    y: number,
    device?: PointerDevice,
  ): FacetState;
  pointerUp(state: View, device?: PointerDevice): FacetState;
}

// ---- The game ---------------------------------------------------------------

/** The renderer's particle layer: presentation only, never read by `update`. */
const fx = new FxLayer();

function registerDiagnostics(api: InitApi<FacetState>): void {
  const cell = (c: CellRef | null) =>
    c === null ? "none" : `${c.col},${c.row}`;
  const d = api.diagnostics;
  d.register("screen", (s) => s.screen);
  d.register("phase", (s) => s.phase);
  d.register("board", (s) => `${s.board.cols}x${s.board.rows}`);
  d.register("score", (s) => s.score);
  d.register("level", (s) => s.level);
  d.register("levelScore", (s) => `${s.levelScore} / ${levelTarget(s)}`);
  d.register("chainStep", (s) => s.chainStep);
  d.register("multiplier", (s) => multiplier(s));
  d.register("lastCleared", (s) => s.lastCleared);
  d.register("lastPoints", (s) => s.lastPoints);
  d.register("lastWaves", (s) => s.lastWaves);
  d.register("lastFall", (s) => longestFall(s.board as BoardState));
  d.register("selection", (s) => cell(s.selection));
  d.register("offer", (s) => cell(s.offer));
  d.register("bestMove", (s) => s.bestMove);
  d.register("bestChain", (s) => s.bestChain);
  d.register("legalSwap", (s) => legalSwap(s));
  d.register(
    "pointer",
    (s) =>
      `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}${s.pointer.down ? " down" : ""}`,
  );
  d.register("selected gem", (s) => {
    const sel = s.selection;
    const gem = sel
      ? s.board.cells[sel.row * s.board.cols + sel.col]
      : undefined;
    return gem ? formatToken(gem) : "none";
  });
}

/** Folds one transition into a frame's running result, collecting its cues. */
function step(acc: { state: FacetState; cues: CueName[] }, out: Outcome): void {
  acc.state = out.state;
  acc.cues.push(...out.cues);
}

/**
 * The game this build's engine drives.
 */
export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(
    api: InitApi<FacetState>,
  ): Promise<[FacetState, FacetDebugApi]> {
    for (const action of ACTIONS)
      api.input.register(action, { keys: [...BINDINGS[action]] });
    registerDiagnostics(api);
    await loadMedia(api);
    return [initialState(), createDebugApi()];
  },

  update(
    state: DeepReadonly<FacetState>,
    api: UpdateApi,
    dt: number,
  ): FacetState {
    const input = api.input;
    const acc = { state: { ...(state as FacetState) }, cues: [] as CueName[] };

    if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());

    // The keyboard drives the menus. Each action is read against the screen
    // the frame opened on, so one key firing two actions acts once.
    const screen = acc.state.screen;
    const up = input.pressed("up");
    const down = input.pressed("down");
    const ok = input.pressed("confirm");
    const esc = input.pressed("back");
    const hold = input.pressed("pause");
    if (up) acc.state = menuMove(acc.state, -1);
    if (down) acc.state = menuMove(acc.state, 1);
    if (hold && (screen === "playing" || screen === "paused"))
      acc.state = pause(acc.state);
    else if (esc && (screen === "howto" || screen === "gameover"))
      acc.state = back(acc.state);
    else if (ok) step(acc, confirm(acc.state));

    // The pointer: every primary position since the last frame, in order.
    const samples = input.pointerSamples();
    for (const sample of samples) {
      if (!sample.primary) continue;
      step(
        acc,
        pointerEvent(acc.state, sample.type, sample.x, sample.y, sample.device),
      );
    }

    if (acc.state.screen === "playing") step(acc, advancePlay(acc.state, dt));

    const p = input.pointer();
    const seen: PointerState = {
      x: p.x,
      y: p.y,
      down: p.down,
      device: p.device,
    };
    const last = state.motion.input;
    const moved =
      samples.length > 0 ||
      seen.x !== last.x ||
      seen.y !== last.y ||
      seen.down !== last.down ||
      seen.device !== last.device;
    acc.state = {
      ...acc.state,
      pointer: moved ? seen : acc.state.pointer,
      simTime: state.simTime + dt,
      muted: api.audio.muted(),
      motion: { ...acc.state.motion, input: seen },
    };

    // One of the two pieces of music is always playing.
    const onTitle =
      acc.state.screen === "title" || acc.state.screen === "howto";
    api.audio.stop(onTitle ? THEME_PLAY : THEME_TITLE);
    api.audio.loop(onTitle ? THEME_TITLE : THEME_PLAY);

    // Each cue at most once a frame. `clear` sounds over its ladder rung.
    for (const cue of new Set(acc.cues)) {
      api.audio.play(cue);
      if (cue === "clear") api.audio.play(rungCue(multiplier(acc.state)));
    }
    return acc.state;
  },

  render(state: DeepReadonly<FacetState>, api: RenderApi): void {
    draw(api.ctx, state, fx);
  },
};
