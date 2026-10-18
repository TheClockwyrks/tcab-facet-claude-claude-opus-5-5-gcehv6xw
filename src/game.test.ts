import { beforeEach, describe, expect, it } from "vitest";
import { cellX, cellY } from "./board";
import {
  FALL_SECONDS_PER_ROW,
  GRID_COLS,
  REFUSAL_SECONDS,
  STEP_SECONDS,
  SWAP_SECONDS,
} from "./constants";
import { DEAD_BOARD, deadWith, harness, type Harness } from "./testing/harness";

let h: Harness;
const snap = () => h.debug.snapshot(h.engine.state);

beforeEach(async () => {
  h = await harness();
});

/** Centre of a target by id on the current screen. */
function centre(id: string): [number, number] {
  const t = snap().targets.find((x) => x.id === id);
  if (!t) throw new Error(`no target ${id}`);
  return [t.x + t.w / 2, t.y + t.h / 2];
}

async function click(x: number, y: number, device = "mouse"): Promise<void> {
  h.pointer("pointerdown", x, y, device);
  await h.frames(1);
  h.pointer("pointerup", x, y, device);
  await h.frames(1);
}

async function playOn(rows: readonly string[]): Promise<void> {
  h.pose((s) => h.debug.setScreen(s, "playing"));
  h.pose((s) => h.debug.loadBoard(s, rows));
}

describe("the opening state", () => {
  it("opens on the title over no board, every field at rest", () => {
    const s = snap();
    expect(s).toMatchObject({
      version: 1,
      screen: "title",
      menuIndex: 0,
      score: 0,
      level: 1,
      levelScore: 0,
      levelTarget: 2000,
      phase: "idle",
      chainStep: 0,
      multiplier: 0,
      swapTimer: 0,
      stepTimer: 0,
      stepHold: STEP_SECONDS,
      board: { cols: 0, rows: 0, cells: [] },
      selection: null,
      offer: null,
      refusal: null,
      lastFall: 0,
      legalSwap: false,
      armedTarget: null,
      muted: false,
    });
    expect(s.refillKinds).toEqual(new Array(GRID_COLS).fill(""));
    expect(s.targets.map((t) => t.id)).toEqual(["menu-0", "menu-1"]);
  });

  it("keeps every pointer target fingertip-sized, on stage, and apart", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      h.pose((s) => h.debug.setScreen(s, screen));
      const targets = snap().targets;
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) {
        expect(t.w).toBeGreaterThanOrEqual(96);
        expect(t.h).toBeGreaterThanOrEqual(72);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w).toBeLessThanOrEqual(1280);
        expect(t.y + t.h).toBeLessThanOrEqual(720);
      }
      for (let i = 0; i < targets.length; i++)
        for (let j = i + 1; j < targets.length; j++) {
          const a = targets[i];
          const b = targets[j];
          const apart =
            a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y;
          expect(apart).toBe(true);
        }
    }
    h.pose((s) => h.debug.setScreen(s, "playing"));
    const pause = snap().targets[0];
    expect(pause.x).toBeGreaterThanOrEqual(928);
  });

  it("registers the diagnostics the overlay shows", () => {
    const names = h.engine.diagnostics().map((d) => d.name);
    for (const n of [
      "screen",
      "phase",
      "board",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "multiplier",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "lastFall",
      "selection",
      "offer",
      "bestMove",
      "bestChain",
      "legalSwap",
      "pointer",
    ])
      expect(names).toContain(n);
    expect(h.engine.diagnostics().every((d) => d.error === undefined)).toBe(
      true,
    );
  });
});

describe("menus from the keyboard", () => {
  it("moves and wraps the highlight, and reaches how to play and back", async () => {
    await h.key("ArrowDown");
    expect(snap().menuIndex).toBe(1);
    await h.key("ArrowDown");
    expect(snap().menuIndex).toBe(0);
    await h.key("ArrowUp");
    expect(snap().menuIndex).toBe(1);
    await h.key("Enter");
    expect(snap()).toMatchObject({ screen: "howto", menuIndex: 0 });
    await h.key("Escape");
    expect(snap()).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("starts a fresh round on PLAY", async () => {
    h.pose((s) => h.debug.setScore(s, 900));
    h.pose((s) => h.debug.setLevel(s, 4));
    await h.key("Space");
    const s = snap();
    expect(s).toMatchObject({
      screen: "playing",
      score: 0,
      level: 1,
      phase: "idle",
      legalSwap: true,
    });
    expect(s.board.cells).toHaveLength(64);
    expect(s.board.cells.every((c) => c.fell >= c.row + 1)).toBe(true);
    expect(s.targets.map((t) => t.id)).toEqual(["pause"]);
  });

  it("pauses and resumes from P and Escape, and QUIT puts the round down", async () => {
    await h.key("Enter");
    await h.key("KeyP");
    expect(snap()).toMatchObject({ screen: "paused", menuIndex: 0 });
    await h.key("Escape");
    expect(snap().screen).toBe("playing");
    await h.key("Escape");
    expect(snap().screen).toBe("paused");
    h.pose((s) => h.debug.setScore(s, 120));
    await h.key("ArrowDown");
    await h.key("Enter");
    expect(snap()).toMatchObject({
      screen: "title",
      menuIndex: 0,
      score: 120,
      phase: "idle",
    });
    expect(snap().board.cols).toBe(0);
  });

  it("toggles the mute bit and mirrors it", async () => {
    await h.key("KeyM");
    expect(snap().muted).toBe(true);
    await h.key("KeyM");
    expect(snap().muted).toBe(false);
  });
});

describe("menus from the pointer", () => {
  it("highlights on hover, arms on press, and takes on release inside", async () => {
    const [x1, y1] = centre("menu-1");
    h.pointer("pointermove", x1, y1);
    await h.frames(1);
    expect(snap().menuIndex).toBe(1);
    h.pointer("pointerdown", x1, y1, "touch");
    await h.frames(1);
    expect(snap().armedTarget).toBe("menu-1");
    expect(snap().pointer).toMatchObject({ down: true, device: "touch" });
    h.pointer("pointerup", x1, y1 + 200, "touch");
    await h.frames(1);
    expect(snap()).toMatchObject({ screen: "title", armedTarget: null });
    await click(x1, y1);
    expect(snap().screen).toBe("howto");
    const [bx, by] = centre("back");
    await click(bx, by);
    expect(snap()).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("pauses from the pause control", async () => {
    await h.key("Enter");
    const [px, py] = centre("pause");
    await click(px, py);
    expect(snap().screen).toBe("paused");
    const [rx, ry] = centre("menu-0");
    await click(rx, ry);
    expect(snap().screen).toBe("playing");
  });

  it("drives the same path through the debug surface's pointer", () => {
    const [x, y] = centre("menu-1");
    h.pose((s) => h.debug.pointerMove(s, x, y, "pen"));
    expect(snap()).toMatchObject({ menuIndex: 1, pointer: { device: "pen" } });
    h.pose((s) => h.debug.pointerDown(s, x, y));
    h.pose((s) => h.debug.pointerUp(s));
    expect(snap().screen).toBe("howto");
    expect(h.cues).toEqual([]);
  });
});

// Sapphires at (0,0) and (1,0); the sapphire at (2,1) completes the row.
const PRODUCTIVE = deadWith([
  [0, 0, "S0"],
  [1, 0, "S0"],
  [2, 1, "S0"],
]);

describe("playing the board", () => {
  it("selects, offers, withdraws, and plays only on a release with an offer", async () => {
    await playOn(PRODUCTIVE);
    h.pointer("pointerdown", cellX(2), cellY(1));
    await h.frames(1);
    expect(snap().selection).toEqual({ col: 2, row: 1 });
    expect(h.cues).toContain("select");
    h.pointer("pointermove", cellX(2), cellY(0));
    await h.frames(1);
    expect(snap().offer).toEqual({ col: 2, row: 0 });
    h.pointer("pointermove", cellX(2) + 5, cellY(1) - 5);
    await h.frames(1);
    expect(snap().offer).toBeNull();
    h.pointer("pointerup", cellX(2), cellY(1));
    await h.frames(1);
    expect(snap()).toMatchObject({
      phase: "idle",
      selection: { col: 2, row: 1 },
    });

    // Press the neighbour to offer, then release to play.
    h.pointer("pointerdown", cellX(2), cellY(0));
    await h.frames(1);
    expect(snap().offer).toEqual({ col: 2, row: 0 });
    h.pointer("pointerup", cellX(2), cellY(0));
    await h.frames(1);
    expect(snap()).toMatchObject({
      phase: "swapping",
      selection: null,
      offer: null,
    });
    expect(h.cues).toContain("swap");
  });

  it("moves the selection to a far cell and clears it on a press off the board", async () => {
    await playOn(PRODUCTIVE);
    await click(cellX(0), cellY(0));
    await click(cellX(5), cellY(5));
    expect(snap().selection).toEqual({ col: 5, row: 5 });
    await click(cellX(5), cellY(5));
    expect(snap().selection).toEqual({ col: 5, row: 5 });
    await click(200, 600);
    expect(snap().selection).toBeNull();
  });

  it("refuses an unproductive swap and lets the mark age out", async () => {
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.pointerDown(s, cellX(4), cellY(4)));
    h.pose((s) => h.debug.pointerMove(s, cellX(5), cellY(4)));
    h.pose((s) => h.debug.pointerUp(s));
    expect(snap()).toMatchObject({
      phase: "idle",
      refusal: { a: { col: 4, row: 4 }, b: { col: 5, row: 4 } },
      selection: null,
    });
    expect(snap().board.cells[36].kind).toBe("amber");
    await h.seconds(REFUSAL_SECONDS - 0.05);
    expect(snap().refusal).not.toBeNull();
    await h.seconds(0.1);
    expect(snap().refusal).toBeNull();
  });

  it("refuses a swap requested while a chain is running", async () => {
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.requestSwap(s, 2, 1, 2, 0));
    h.pose((s) => h.debug.requestSwap(s, 4, 4, 4, 5));
    expect(snap()).toMatchObject({
      phase: "swapping",
      refusal: { a: { col: 4, row: 4 } },
    });
    await h.frames(1);
    expect(h.cues).toEqual([]);
  });
});

describe("a chain in time", () => {
  it("swaps for SWAP_SECONDS, then resolves each step against its own hold", async () => {
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.setRefillKinds(s, 0, "R"));
    h.pose((s) => h.debug.setRefillKinds(s, 1, "A"));
    h.pose((s) => h.debug.setRefillKinds(s, 2, "C"));
    h.pose((s) => h.debug.requestSwap(s, 2, 1, 2, 0));
    expect(snap()).toMatchObject({
      phase: "swapping",
      swapTimer: 0,
      chainStep: 0,
      moveScore: 0,
    });
    await h.frames(10);
    expect(snap().phase).toBe("swapping");
    expect(snap().swapTimer).toBeCloseTo(10 / 60, 6);
    await h.frames(1);
    const s = snap();
    expect(s).toMatchObject({
      phase: "resolving",
      chainStep: 1,
      multiplier: 1,
      swapTimer: 0,
      stepTimer: 0,
      lastCleared: 3,
      lastPoints: 30,
      lastWaves: 0,
      lastFall: 1,
      score: 30,
      levelScore: 30,
      moveScore: 30,
      bestChain: 1,
    });
    expect(s.stepHold).toBeCloseTo(FALL_SECONDS_PER_ROW + STEP_SECONDS, 9);
    expect(h.cues).toEqual(["clear", "clear-1"]);
    await h.seconds(s.stepHold);
    expect(snap()).toMatchObject({
      phase: "idle",
      chainStep: 0,
      stepTimer: 0,
      bestMove: 30,
    });
    expect(
      snap()
        .board.cells.slice(0, 3)
        .map((c) => c.kind),
    ).toEqual(["ruby", "amber", "citrine"]);
    expect(snap().board.cells[0].fell).toBe(1);
    expect(SWAP_SECONDS).toBeLessThan(11 / 60);
  });

  it("plays land, flaw, and cut on the frames their events happen", async () => {
    // Four rubies down column 3 (rows 1..4), completed by the swap at (3,4).
    const rows = deadWith([
      [3, 1, "R0"],
      [3, 2, "R0"],
      [3, 3, "R0"],
      [4, 4, "R0"],
      [3, 4, "A0"],
      [2, 2, "S2"],
    ]);
    await playOn(rows);
    h.pose((s) => h.debug.requestSwap(s, 4, 4, 3, 4));
    await h.seconds(SWAP_SECONDS);
    expect(h.cues).toEqual(expect.arrayContaining(["clear", "flaw", "cut"]));
    expect(snap().board.cells.find((c) => c.cut === "brilliant")).toMatchObject(
      { kind: "ruby", col: 3, row: 4 },
    );
    const s = snap();
    expect(s.lastFall).toBe(3);
    h.cues.length = 0;
    await h.seconds(s.lastFall * FALL_SECONDS_PER_ROW + 1 / 60);
    expect(h.cues).toContain("land");
  });

  it("ends the level when the score reaches the target, then continues", async () => {
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.setLevelScore(s, 1990));
    h.pose((s) => h.debug.setBestChain(s, 0));
    h.pose((s) => h.debug.requestSwap(s, 2, 1, 2, 0));
    await h.seconds(3);
    expect(snap()).toMatchObject({
      screen: "levelclear",
      menuIndex: 0,
      level: 1,
    });
    expect(snap().levelScore).toBeGreaterThanOrEqual(2000);
    expect(snap().bestChain).toBeGreaterThanOrEqual(1);
    expect(h.cues).toContain("levelup");
    const score = snap().score;
    await h.key("Enter");
    expect(snap()).toMatchObject({
      screen: "playing",
      level: 2,
      levelScore: 0,
      bestChain: 0,
      bestMove: 0,
      score,
      levelTarget: 4000,
    });
  });

  it("ends the round when the settled board leaves no legal swap", async () => {
    await playOn(
      deadWith([
        [0, 0, "S0"],
        [0, 1, "C0"],
        [0, 2, "S0"],
        [1, 1, "S0"],
      ]),
    );
    h.pose((s) => h.debug.setRefillKinds(s, 0, "RAC"));
    h.pose((s) => h.debug.requestSwap(s, 0, 1, 1, 1));
    await h.seconds(2);
    expect(snap()).toMatchObject({
      screen: "gameover",
      legalSwap: false,
      phase: "idle",
    });
    expect(h.cues).toContain("gameover");
    await h.key("Escape");
    expect(snap()).toMatchObject({ screen: "title", menuIndex: 0 });
    expect(snap().board.cols).toBe(8);
  });

  it("holds the board still on every screen but playing", async () => {
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.requestSwap(s, 2, 1, 2, 0));
    h.pose((s) => h.debug.setScreen(s, "paused"));
    const t0 = snap().simTime;
    await h.frames(30);
    expect(snap()).toMatchObject({ phase: "swapping", swapTimer: 0 });
    expect(snap().simTime).toBeCloseTo(t0 + 0.5, 6);
  });
});

describe("posed pointer across frames", () => {
  it("keeps a posed press held while frames pass, then plays the move", async () => {
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.pointerDown(s, cellX(2), cellY(1), "touch"));
    await h.frames(3);
    expect(snap().pointer).toMatchObject({ down: true, device: "touch" });
    h.pose((s) => h.debug.pointerMove(s, cellX(2), cellY(0), "touch"));
    await h.frames(3);
    expect(snap().offer).toEqual({ col: 2, row: 0 });
    h.pose((s) => h.debug.pointerUp(s, "touch"));
    expect(snap().phase).toBe("swapping");
  });

  it("takes a menu target released after frames have passed", async () => {
    const [x, y] = centre("menu-1");
    h.pose((s) => h.debug.pointerDown(s, x, y));
    await h.frames(2);
    h.pose((s) => h.debug.pointerUp(s));
    expect(snap().screen).toBe("howto");
  });
});

describe("the debug surface", () => {
  it("resets every declared field but the mute bit", async () => {
    await h.key("KeyM");
    await playOn(PRODUCTIVE);
    h.pose((s) => h.debug.setScore(s, 50));
    h.pose((s) => h.debug.setRefillKinds(s, 3, "RR"));
    h.pose((s) => h.debug.reset(s));
    expect(snap()).toMatchObject({
      screen: "title",
      score: 0,
      board: { cols: 0 },
      muted: true,
      simTime: 0,
    });
    expect(snap().refillKinds[3]).toBe("");
  });

  it("reconciles without moving anything", async () => {
    await playOn(DEAD_BOARD);
    const before = h.engine.state;
    h.pose((s) => h.debug.reconcile(s));
    expect(h.engine.state).toEqual(before);
    expect(snap().legalSwap).toBe(false);
  });

  it("writes exactly the element each pose names", () => {
    const d = h.debug;
    h.pose((s) => d.setScreen(s, "gameover"));
    h.pose((s) => d.setMenuIndex(s, 5));
    expect(snap()).toMatchObject({ screen: "gameover", menuIndex: 5 });
    h.pose((s) => d.dealBoard(s));
    expect(snap()).toMatchObject({ screen: "gameover", legalSwap: true });
    h.pose((s) => d.setGem(s, 3, 3, "X3"));
    expect(snap().board.cells[27]).toMatchObject({
      kind: null,
      cut: "prism",
      strain: 3,
      fell: 0,
    });
    h.pose((s) => d.setSelection(s, 1, 1));
    h.pose((s) => d.setOffer(s, 6, 6));
    expect(snap()).toMatchObject({
      selection: { col: 1, row: 1 },
      offer: { col: 6, row: 6 },
    });
    h.pose((s) => d.clearOffer(s));
    h.pose((s) => d.clearSelection(s));
    h.pose((s) => d.setBestMove(s, 70));
    h.pose((s) => d.setMoveScore(s, 30));
    h.pose((s) => d.clearRefusal(s));
    h.pose((s) => d.clearRefillKinds(s));
    h.pose((s) => d.clearChain(s));
    expect(snap()).toMatchObject({
      selection: null,
      offer: null,
      bestMove: 70,
      moveScore: 30,
      phase: "idle",
    });
    h.pose((s) => d.clearBoard(s));
    expect(snap().board).toEqual({ cols: 0, rows: 0, cells: [] });
  });

  it("refuses arguments outside the domains the spec fixes", () => {
    const d = h.debug;
    const s = h.engine.state;
    expect(() => d.setScreen(s, "menu" as never)).toThrow();
    expect(() => d.setMenuIndex(s, -1)).toThrow();
    expect(() => d.setLevel(s, 0)).toThrow();
    expect(() => d.setScore(s, 1.5)).toThrow();
    expect(() => d.setSelection(s, 8, 0)).toThrow();
    expect(() => d.setOffer(s, 0, -1)).toThrow();
    expect(() => d.requestSwap(s, 0, 0, 0, 9)).toThrow();
    expect(() => d.setGem(s, 0, 0, "R0")).toThrow();
    expect(() => d.setRefillKinds(s, 8, "R")).toThrow();
    expect(() => d.setRefillKinds(s, 0, "RX")).toThrow();
    expect(() => d.loadBoard(s, ["R0"])).toThrow();
    expect(() => d.pointerDown(s, Number.NaN, 0)).toThrow();
    expect(() => d.pointerUp(s, "finger" as never)).toThrow();
    expect(() => d.setBestChain(s, -2)).toThrow();
  });

  it("decides a requested swap by the move rules, with no board refusing", () => {
    h.pose((s) => h.debug.requestSwap(s, 0, 0, 1, 0));
    expect(snap().refusal).toMatchObject({
      a: { col: 0, row: 0 },
      b: { col: 1, row: 0 },
    });
  });
});

describe("rendering", () => {
  it("draws every screen, the motion of a chain, and records it", async () => {
    await playOn(
      deadWith([
        [0, 0, "S0"],
        [1, 0, "S0"],
        [2, 1, "S0"],
        [3, 0, "S3"],
        [5, 5, "B0b"],
        [6, 6, "C1s"],
        [4, 4, "X2"],
      ]),
    );
    h.pose((s) => h.debug.setSelection(s, 5, 5));
    h.pose((s) => h.debug.setOffer(s, 5, 6));
    await h.frames(2);
    h.pose((s) => h.debug.clearOffer(s));
    h.engine.startRecording();
    h.pose((s) => h.debug.requestSwap(s, 2, 1, 2, 0));
    h.pose((s) => h.debug.requestSwap(s, 7, 7, 6, 6));
    await h.frames(40);
    const rec = h.engine.stopRecording();
    expect(rec.frames).toHaveLength(40);
    expect(rec.ops.length).toBeGreaterThan(100);
    for (const screen of [
      "title",
      "howto",
      "paused",
      "levelclear",
      "gameover",
      "playing",
    ] as const) {
      h.pose((s) => h.debug.setScreen(s, screen));
      await h.frames(2);
    }
    h.pose((s) => h.debug.dealBoard(s));
    await h.frames(5);
    h.pose((s) => h.debug.clearBoard(s));
    await h.frames(1);
  });
});
