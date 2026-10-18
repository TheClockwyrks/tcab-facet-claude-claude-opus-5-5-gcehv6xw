// Shared test scaffolding: the engine stood up in Node over an
// `@napi-rs/canvas` canvas, a surface of the test's own, and a constant clock,
// with the produced files served from `public/` so the game draws its real art.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { LAYOUT, STAGE_H, STAGE_W } from "../constants";
import { BACKGROUND, game, type FacetDebugApi, type FacetState } from "../game";

export const FRAME_MS = 1000 / 60;

let stubbed = false;

/**
 * The project type-checks against the DOM alone, so the Node module the test
 * reads files with is typed here by the one call it makes.
 */
interface NodeFs {
  readFile(path: string): Promise<Uint8Array>;
}
const NODE_FS = "node:fs/promises";

/** Serves `assets/...` from `public/assets/` and decodes images with napi. */
async function stubLoaders(): Promise<void> {
  if (stubbed) return;
  stubbed = true;
  const fs = (await import(/* @vite-ignore */ NODE_FS)) as NodeFs;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    try {
      const body = await fs.readFile(`public/${url}`);
      return new Response(body as Uint8Array<ArrayBuffer>, { status: 200 });
    } catch {
      return new Response("missing", { status: 404 });
    }
  }) as typeof fetch;
  (globalThis as { createImageBitmap?: unknown }).createImageBitmap = async (
    blob: Blob,
  ) => loadImage(new Uint8Array(await blob.arrayBuffer()));
}

export interface Harness {
  readonly engine: Engine<FacetState, FacetDebugApi>;
  readonly debug: FacetDebugApi;
  readonly events: EventTarget;
  readonly cues: string[];
  /** Applies a pose. */
  pose(f: (s: FacetState) => FacetState): void;
  /** Advances `n` frames. */
  frames(n: number): Promise<void>;
  /** Advances by whole frames until at least `seconds` of game time pass. */
  seconds(seconds: number): Promise<void>;
  /** Dispatches a key press and release, one frame apart. */
  key(code: string): Promise<void>;
  /** Dispatches a pointer event at a stage position. */
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    pointerType?: string,
  ): void;
}

export async function harness(): Promise<Harness> {
  await stubLoaders();
  const canvas = createCanvas(STAGE_W, STAGE_H) as unknown as HTMLCanvasElement;
  const events = new EventTarget();
  const engine = createEngine({
    canvas,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(FRAME_MS),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  // Node has no Web Audio, so the produced cues cannot decode here and the
  // game reports them; the stand-in cues keep every name playable.
  const warn = console.warn;
  console.warn = () => {};
  try {
    await engine.initialize();
  } finally {
    console.warn = warn;
  }
  const debug = engine.debug;
  const fire = (type: string, props: Record<string, unknown>) =>
    events.dispatchEvent(Object.assign(new Event(type), props));
  let pressed = false;
  return {
    engine,
    debug,
    events,
    cues,
    pose: (f) => {
      engine.apply((s) => f(s as FacetState));
    },
    frames: (n) => engine.advance(n),
    seconds: (s) => engine.advance(Math.ceil((s * 1000) / FRAME_MS - 1e-9)),
    key: async (code) => {
      fire("keydown", { code, repeat: false });
      await engine.advance(1);
      fire("keyup", { code, repeat: false });
      await engine.advance(1);
    },
    pointer: (type, x, y, pointerType = "mouse") => {
      if (type === "pointerdown") pressed = true;
      if (type === "pointerup") pressed = false;
      fire(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType,
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: pressed ? 1 : 0,
      });
    },
  };
}

/** A board with no run and no legal swap: the seven kinds on diagonals. */
export const DEAD_BOARD = [
  "R0 A0 C0 J0 B0 S0 M0 R0",
  "A0 C0 J0 B0 S0 M0 R0 A0",
  "C0 J0 B0 S0 M0 R0 A0 C0",
  "J0 B0 S0 M0 R0 A0 C0 J0",
  "B0 S0 M0 R0 A0 C0 J0 B0",
  "S0 M0 R0 A0 C0 J0 B0 S0",
  "M0 R0 A0 C0 J0 B0 S0 M0",
  "R0 A0 C0 J0 B0 S0 M0 R0",
];

/** Writes a list of edits into the dead board: `[col, row, token]`. */
export function deadWith(edits: readonly [number, number, string][]): string[] {
  const rows = DEAD_BOARD.map((r) => r.split(" "));
  for (const [col, row, token] of edits) rows[row][col] = token;
  return rows.map((r) => r.join(" "));
}
