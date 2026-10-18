// Drawing: every screen, the board and the motion on it, the readouts, and the
// pointer targets. Everything here reads the state and draws; nothing writes.
// The gems, their breaks, the board frame, and the particle effects are the
// produced files; the chrome around them is drawn in code (specs/assets.md).

import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  cellX,
  cellY,
  gemAt,
  hasBoard,
  sameCell,
} from "./board";
import {
  BACK_LABEL,
  BEST_CHAIN_LABEL,
  BEST_MOVE_LABEL,
  CELL_PITCH,
  FALL_SECONDS_PER_ROW,
  GAMEOVER_TITLE_TEXT,
  GEM_KINDS,
  HUD_CHAIN_LABEL,
  HUD_LEVEL_LABEL,
  HUD_SCORE_LABEL,
  LEVELCLEAR_TITLE_TEXT,
  MAX_MULTIPLIER,
  MAX_STRAIN,
  PAUSED_TITLE_TEXT,
  PAUSE_LABEL,
  REFUSAL_SECONDS,
  STAGE_CX,
  STAGE_H,
  STAGE_W,
  SWAP_SECONDS,
  TAGLINE_TEXT,
  TITLE_TEXT,
  WAVE_SECONDS,
} from "./constants";
import type { FxLayer } from "./fx";
import type { BoardState, CellRef, GemKind, GemState } from "./game";
import {
  BREAK_FRAMES,
  PRISM_TURN_FRAMES,
  gemSprite,
  media,
  type Sprite,
} from "./media";
import {
  BACK_TARGET,
  MENU_ITEMS,
  PAUSE_TARGET,
  cellAt,
  levelTarget,
  multiplier,
  targetsFor,
  type View,
} from "./sim";

type Ctx = CanvasRenderingContext2D;

export const FONT =
  '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const GOLD = "#ffd76a";
const GOLD_DEEP = "#b8862b";
const INK = "#0b0a18";
const TEXT = "#f4f1ff";
const MUTED_TEXT = "#b9b4dc";

/** How long each frame of a break sequence shows. */
const BREAK_FRAME_SECONDS = 0.04;
/** The prism's idle turn, in frames per second. */
const PRISM_FPS = 10;

// ---- Small drawing helpers ------------------------------------------------

interface TextStyle {
  size: number;
  color?: string;
  align?: CanvasTextAlign;
  weight?: string;
  spacing?: number;
  shadow?: boolean;
  baseline?: CanvasTextBaseline;
}

function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  ctx.save();
  ctx.font = `${style.weight ?? "bold"} ${style.size}px ${FONT}`;
  ctx.textAlign = style.align ?? "center";
  ctx.textBaseline = style.baseline ?? "middle";
  const spaced = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in spaced)
    spaced.letterSpacing = `${style.spacing ?? 0}px`;
  if (style.shadow !== false) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillText(str, x + 2, y + 3);
  }
  ctx.fillStyle = style.color ?? TEXT;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 14);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(34, 30, 72, 0.92)");
  g.addColorStop(1, "rgba(16, 14, 38, 0.94)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 215, 106, 0.55)";
  ctx.stroke();
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 10);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();
  ctx.restore();
}

function sprite(
  ctx: Ctx,
  img: Sprite | null | undefined,
  cx: number,
  cy: number,
  scale = 1,
): void {
  if (!img) return;
  const w = img.width * scale;
  ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - w / 2), w, w);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** A stable pseudo-random value in 0..1 for an integer seed. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---- The field behind everything -----------------------------------------

function backdrop(ctx: Ctx, s: View): void {
  const lamp = ctx.createRadialGradient(STAGE_CX, 360, 40, STAGE_CX, 360, 720);
  lamp.addColorStop(0, "rgba(92, 78, 170, 0.38)");
  lamp.addColorStop(0.45, "rgba(40, 32, 96, 0.22)");
  lamp.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  // Dust motes catching the lamp.
  for (let i = 0; i < 70; i++) {
    const x = hash(i) * STAGE_W;
    const y = hash(i + 100) * STAGE_H;
    const tw = 0.5 + 0.5 * Math.sin(s.simTime * (0.6 + hash(i + 200)) + i);
    ctx.fillStyle = `rgba(200, 190, 255, ${(0.08 + 0.22 * tw).toFixed(3)})`;
    const r = hash(i + 300) < 0.15 ? 2 : 1;
    ctx.fillRect(Math.round(x), Math.round(y), r, r);
  }
}

// ---- Gems -----------------------------------------------------------------

interface GemLook {
  readonly kind: GemKind | null;
  readonly cut: GemState["cut"];
  readonly strain: number;
}

function drawGem(
  ctx: Ctx,
  gem: GemLook,
  x: number,
  y: number,
  time: number,
): void {
  const m = media();
  if (gem.cut === "prism") {
    const turn = m.prismTurn[gem.strain];
    const frame = turn?.[Math.floor(time * PRISM_FPS) % PRISM_TURN_FRAMES];
    sprite(ctx, frame ?? gemSprite(null, gem.strain), x, y);
    return;
  }
  sprite(ctx, gemSprite(gem.kind, gem.strain), x, y);
  if (gem.cut === "brilliant") sprite(ctx, m.brilliant, x, y);
  if (gem.cut === "star") sprite(ctx, m.star, x, y);
}

/** Where a gem of the board is drawn this frame: swapping, falling, or at rest. */
function gemPosition(s: View, gem: GemState): { x: number; y: number } {
  let x = cellX(gem.col);
  let y = cellY(gem.row);
  const swap = s.motion.swap;
  if (s.phase === "swapping" && swap !== null) {
    const from = sameCell(gem, swap.a)
      ? swap.b
      : sameCell(gem, swap.b)
        ? swap.a
        : null;
    if (from !== null) {
      const p = easeInOut(clamp01(s.swapTimer / SWAP_SECONDS));
      x = cellX(from.col) + (x - cellX(from.col)) * p;
      y = cellY(from.row) + (y - cellY(from.row)) * p;
      // The two stones pass one over the other rather than through.
      const lift =
        Math.sin(p * Math.PI) * 10 * (sameCell(gem, swap.a) ? 1 : -1);
      x += from.row === gem.row ? 0 : lift;
      y += from.col === gem.col ? 0 : -lift;
    }
    return { x, y };
  }
  if (gem.fell > 0) {
    const span = gem.fell * FALL_SECONDS_PER_ROW;
    let p = 1;
    if (s.phase === "resolving")
      p = clamp01((s.stepTimer - s.lastWaves * WAVE_SECONDS) / span);
    else if (s.phase === "idle") p = clamp01(s.motion.dealTimer / span);
    // Falling stones gather speed, and arrive exactly when rules.md says.
    y -= (1 - p * p) * gem.fell * CELL_PITCH;
  }
  return { x, y };
}

function resting(s: View, gem: GemState): boolean {
  if (s.phase === "swapping") return false;
  const p = gemPosition(s, gem);
  return p.x === cellX(gem.col) && p.y === cellY(gem.row);
}

/** The exchanged look an offer gives: each of the two cells shows the other gem. */
function offeredLook(s: View, cell: CellRef): GemState | null {
  const sel = s.selection;
  const off = s.offer;
  if (sel === null || off === null || s.phase !== "idle") return null;
  if (sameCell(cell, sel))
    return gemAt(s.board as BoardState, off.col, off.row);
  if (sameCell(cell, off))
    return gemAt(s.board as BoardState, sel.col, sel.row);
  return null;
}

function corners(
  ctx: Ctx,
  cx: number,
  cy: number,
  half: number,
  len: number,
  color: string,
  width: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "square";
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const x = cx + sx * half;
    const y = cy + sy * half;
    ctx.beginPath();
    ctx.moveTo(x - sx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - sy * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoard(ctx: Ctx, s: View, fx: FxLayer): void {
  const m = media();
  if (m.frame) {
    ctx.drawImage(
      m.frame,
      BOARD_LEFT - 24,
      BOARD_TOP - 24,
      m.frame.width * 2,
      m.frame.width * 2,
    );
  } else {
    ctx.fillStyle = "#14163a";
    ctx.fillRect(
      BOARD_LEFT,
      BOARD_TOP,
      BOARD_RIGHT - BOARD_LEFT,
      BOARD_BOTTOM - BOARD_TOP,
    );
  }
  if (!hasBoard(s.board as BoardState)) return;

  const time = s.simTime;
  const resolving = s.phase === "resolving";
  const step = resolving ? s.motion.step : null;

  // Hover: a faint well under the cell a mouse is over.
  if (
    s.screen === "playing" &&
    s.pointer.device === "mouse" &&
    !s.pointer.down
  ) {
    const hover = cellAt(s.pointer.x, s.pointer.y);
    if (hover) {
      ctx.fillStyle = "rgba(180, 170, 255, 0.08)";
      ctx.fillRect(cellX(hover.col) - 34, cellY(hover.row) - 34, 68, 68);
    }
  }

  // The selected cell glows from beneath.
  const sel = s.selection;
  if (sel !== null) {
    const pulse = 0.55 + 0.25 * Math.sin(time * 6);
    const g = ctx.createRadialGradient(
      cellX(sel.col),
      cellY(sel.row),
      4,
      cellX(sel.col),
      cellY(sel.row),
      40,
    );
    g.addColorStop(0, `rgba(255, 220, 120, ${(pulse * 0.6).toFixed(3)})`);
    g.addColorStop(1, "rgba(255, 220, 120, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(cellX(sel.col) - 36, cellY(sel.row) - 36, 72, 72);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    BOARD_LEFT,
    BOARD_TOP,
    BOARD_RIGHT - BOARD_LEFT,
    BOARD_BOTTOM - BOARD_TOP,
  );
  ctx.clip();

  // The shattering set: intact until its wave, then its break sequence.
  if (step) {
    for (const shard of step.cleared) {
      const local = s.stepTimer - shard.wave * WAVE_SECONDS;
      const x = cellX(shard.col);
      const y = cellY(shard.row);
      if (local < 0) {
        drawGem(ctx, shard, x, y, time);
        continue;
      }
      const frame = Math.floor(local / BREAK_FRAME_SECONDS);
      if (frame < BREAK_FRAMES) {
        const seq = m.breaks.get(shard.kind ?? "prism");
        sprite(ctx, seq?.[frame], x, y);
      }
    }
  }

  const refusal = s.refusal;
  const shake = (c: GemState) => {
    if (
      refusal === null ||
      (!sameCell(c, refusal.a) && !sameCell(c, refusal.b))
    )
      return 0;
    const k = 1 - refusal.timer / REFUSAL_SECONDS;
    return Math.round(Math.sin(refusal.timer * 70) * 5 * k);
  };

  const created = step?.created ?? [];
  for (const gem of s.board.cells as readonly GemState[]) {
    const look = offeredLook(s, gem) ?? gem;
    let { x, y } = gemPosition(s, gem);
    x += shake(gem);
    if (look.strain >= MAX_STRAIN && resting(s, gem)) {
      // A flawed stone shivers now and then, visibly about to go.
      const seed = gem.col * 7 + gem.row * 13;
      if (Math.sin(time * 2.3 + seed) > 0.55)
        x += Math.sin(time * 55 + seed) > 0 ? 1 : -1;
    }
    if (sel !== null && sameCell(gem, sel) && s.offer === null) y -= 3;
    drawGem(ctx, look, x, y, time);
  }
  ctx.restore();

  // Marks: the selection, the offer, a refused swap.
  if (sel !== null) {
    const pulse = 0.7 + 0.3 * Math.sin(time * 6);
    corners(
      ctx,
      cellX(sel.col),
      cellY(sel.row),
      33,
      12,
      `rgba(255, 215, 106, ${pulse.toFixed(3)})`,
      4,
    );
  }
  const off = s.offer;
  if (off !== null) {
    corners(
      ctx,
      cellX(off.col),
      cellY(off.row),
      33,
      12,
      "rgba(140, 230, 255, 0.95)",
      4,
    );
    if (sel !== null) {
      ctx.save();
      ctx.strokeStyle = "rgba(140, 230, 255, 0.7)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -time * 30;
      ctx.beginPath();
      ctx.moveTo(cellX(sel.col), cellY(sel.row));
      ctx.lineTo(cellX(off.col), cellY(off.row));
      ctx.stroke();
      ctx.restore();
    }
  }
  if (refusal !== null) {
    const a = 1 - refusal.timer / REFUSAL_SECONDS;
    for (const c of [refusal.a, refusal.b]) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 60, 80, ${(0.25 * a).toFixed(3)})`;
      ctx.fillRect(cellX(c.col) - 34, cellY(c.row) - 34, 68, 68);
      ctx.restore();
      corners(
        ctx,
        cellX(c.col),
        cellY(c.row),
        33,
        12,
        `rgba(255, 80, 96, ${a.toFixed(3)})`,
        4,
      );
    }
  }

  // Particles: bursts where the set shatters, flashes where cuts are made,
  // and an aura running at every cut stone on the board.
  if (step) {
    for (const shard of step.cleared) {
      const local = s.stepTimer - shard.wave * WAVE_SECONDS;
      if (local < 0) continue;
      const flawed = shard.strain >= MAX_STRAIN;
      const system = m.fx.get(
        flawed ? "flaw" : `clear-${shard.kind ?? "prism"}`,
      );
      fx.oneShot(
        ctx,
        `${step.id}:${shard.col},${shard.row}`,
        system,
        cellX(shard.col),
        cellY(shard.row),
        time - local,
      );
    }
    for (const c of created)
      fx.oneShot(
        ctx,
        `${step.id}:cut:${c.col},${c.row}`,
        m.fx.get("cutflash"),
        cellX(c.col),
        cellY(c.row),
        time - s.stepTimer,
      );
  }
  for (const gem of s.board.cells as readonly GemState[]) {
    if (gem.cut === "plain") continue;
    const p = gemPosition(s, gem);
    if (p.y < BOARD_TOP) continue;
    fx.continuous(
      ctx,
      `aura:${gem.col},${gem.row}:${gem.cut}`,
      m.fx.get(`aura-${gem.cut}`),
      cellX(gem.col),
      cellY(gem.row),
    );
  }
  fx.draw(ctx);

  // The points a step scored rise off the set it cleared.
  if (step && step.cleared.length > 0 && s.stepTimer < 0.9) {
    let cx = 0;
    let cy = 0;
    for (const c of step.cleared) {
      cx += cellX(c.col);
      cy += cellY(c.row);
    }
    cx /= step.cleared.length;
    cy /= step.cleared.length;
    const t = s.stepTimer / 0.9;
    ctx.save();
    ctx.globalAlpha = clamp01(1.4 - t * 1.4);
    const mult = multiplier(s);
    text(ctx, `+${s.lastPoints}`, cx, cy - 10 - t * 40, {
      size: 30,
      color: "#fff4c8",
    });
    if (mult > 1)
      text(ctx, `x${mult}`, cx, cy + 20 - t * 40, { size: 18, color: GOLD });
    ctx.restore();
  }
}

// ---- Readouts -------------------------------------------------------------

function button(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  lit: boolean,
): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 12);
  if (lit) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#ffe9a8");
    g.addColorStop(0.5, GOLD);
    g.addColorStop(1, GOLD_DEEP);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = "rgba(20, 18, 46, 0.88)";
  }
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = lit ? "#fff6d6" : "rgba(255, 215, 106, 0.45)";
  ctx.stroke();
  ctx.restore();
  text(ctx, label, x + w / 2, y + h / 2 + 1, {
    size: 26,
    color: lit ? "#2a1606" : TEXT,
    spacing: 3,
    shadow: !lit,
  });
}

function hud(ctx: Ctx, s: View): void {
  // Left: the round's figures and the level meter.
  panel(ctx, 36, 108, 264, 330);
  text(ctx, HUD_SCORE_LABEL, 168, 146, { size: 18, color: GOLD, spacing: 4 });
  text(ctx, String(s.score), 168, 190, { size: 46 });
  text(ctx, HUD_LEVEL_LABEL, 168, 250, { size: 18, color: GOLD, spacing: 4 });
  text(ctx, String(s.level), 168, 290, { size: 40 });

  const target = levelTarget(s);
  const fill = clamp01(s.levelScore / target);
  const mx = 60;
  const my = 336;
  const mw = 216;
  const mh = 22;
  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 11);
  ctx.fillStyle = "#0b0a1e";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 215, 106, 0.6)";
  ctx.stroke();
  if (fill > 0) {
    ctx.save();
    roundRect(ctx, mx + 3, my + 3, mw - 6, mh - 6, 8);
    ctx.clip();
    const g = ctx.createLinearGradient(mx, 0, mx + mw, 0);
    g.addColorStop(0, "#d11f45");
    g.addColorStop(0.35, "#f7a440");
    g.addColorStop(0.65, "#4cc985");
    g.addColorStop(1, "#4f86f7");
    ctx.fillStyle = g;
    ctx.fillRect(mx + 3, my + 3, (mw - 6) * fill, mh - 6);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(mx + 3, my + 3, (mw - 6) * fill, 4);
    ctx.restore();
  }
  ctx.restore();
  text(ctx, `${s.levelScore} / ${target}`, 168, 392, {
    size: 20,
    color: MUTED_TEXT,
  });

  // Right: the pause control and the chain.
  const lit = s.armedTarget === PAUSE_TARGET.id;
  button(
    ctx,
    PAUSE_TARGET.x,
    PAUSE_TARGET.y,
    PAUSE_TARGET.w,
    PAUSE_TARGET.h,
    PAUSE_LABEL,
    lit,
  );

  panel(ctx, 980, 140, 264, 300);
  if (s.phase === "resolving") {
    const mult = multiplier(s);
    text(ctx, HUD_CHAIN_LABEL, 1112, 176, {
      size: 18,
      color: GOLD,
      spacing: 4,
    });
    const pop = 1 + 0.25 * Math.max(0, 1 - s.stepTimer / 0.2);
    text(ctx, `x${mult}`, 1112, 240, {
      size: Math.round(64 * pop),
      color: "#fff4c8",
    });
    // The ladder: one rung per step, lit as the chain climbs it.
    for (let i = 0; i < MAX_MULTIPLIER; i++) {
      const on = i < mult;
      const x = 1012 + i * 26;
      const h = 14 + i * 5;
      ctx.fillStyle = on
        ? `hsl(${45 - i * 6}, 95%, ${60 + i * 2}%)`
        : "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(x, 330 - h, 18, h);
    }
    text(ctx, `+${s.moveScore}`, 1112, 380, { size: 26, color: TEXT });
  } else {
    text(ctx, BEST_MOVE_LABEL, 1112, 196, {
      size: 16,
      color: GOLD,
      spacing: 3,
    });
    text(ctx, String(s.bestMove), 1112, 232, { size: 34 });
    text(ctx, BEST_CHAIN_LABEL, 1112, 300, {
      size: 16,
      color: GOLD,
      spacing: 3,
    });
    text(ctx, String(s.bestChain), 1112, 336, { size: 34 });
    text(ctx, "DRAG A GEM ONTO", 1112, 392, {
      size: 14,
      color: MUTED_TEXT,
      spacing: 1,
    });
    text(ctx, "ITS NEIGHBOUR", 1112, 412, {
      size: 14,
      color: MUTED_TEXT,
      spacing: 1,
    });
  }
}

function soundHint(ctx: Ctx, s: View): void {
  text(ctx, s.muted ? "M  SOUND OFF" : "M  SOUND ON", 1236, 700, {
    size: 14,
    color: MUTED_TEXT,
    align: "right",
    spacing: 2,
  });
}

function menu(ctx: Ctx, s: View): void {
  const items = MENU_ITEMS[s.screen] ?? [];
  targetsFor(s.screen).forEach((t, i) => {
    button(ctx, t.x, t.y, t.w, t.h, items[i] ?? "", i === s.menuIndex);
  });
}

function quiet(ctx: Ctx): void {
  ctx.fillStyle = "rgba(6, 5, 16, 0.68)";
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

// ---- Screens --------------------------------------------------------------

function title(ctx: Ctx, s: View): void {
  const m = media();
  const t = s.simTime;
  // The eight stones circle the name, lit by the lamp.
  const stones: GemLook[] = [
    ...GEM_KINDS.map((kind) => ({ kind, cut: "plain" as const, strain: 0 })),
    { kind: null, cut: "prism", strain: 0 },
  ];
  stones.forEach((g, i) => {
    const a = t * 0.25 + (i / stones.length) * Math.PI * 2;
    const x = STAGE_CX + Math.cos(a) * 470;
    const y = 214 + Math.sin(a) * 118;
    const bob = Math.sin(t * 2 + i) * 4;
    drawGem(ctx, g, x, y + bob, t);
  });
  if (m.star) sprite(ctx, m.star, STAGE_CX - 186, 132 + Math.sin(t * 3) * 3, 1);

  const glow = ctx.createRadialGradient(STAGE_CX, 214, 10, STAGE_CX, 214, 260);
  glow.addColorStop(0, "rgba(255, 220, 140, 0.18)");
  glow.addColorStop(1, "rgba(255, 220, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(STAGE_CX - 300, 60, 600, 320);

  ctx.save();
  ctx.font = `bold 132px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const spaced = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in spaced) spaced.letterSpacing = "18px";
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillText(TITLE_TEXT, STAGE_CX + 9 + 4, 214 + 6);
  const g = ctx.createLinearGradient(0, 150, 0, 280);
  g.addColorStop(0, "#fff8dc");
  g.addColorStop(0.45, GOLD);
  g.addColorStop(0.55, "#e0a43a");
  g.addColorStop(1, "#8a5a14");
  ctx.fillStyle = g;
  ctx.fillText(TITLE_TEXT, STAGE_CX + 9, 214);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(60, 30, 4, 0.8)";
  ctx.strokeText(TITLE_TEXT, STAGE_CX + 9, 214);
  ctx.restore();
  text(ctx, TAGLINE_TEXT, STAGE_CX, 302, {
    size: 22,
    color: "#d9d2ff",
    spacing: 6,
  });
  // Sparkles crossing the name.
  for (let i = 0; i < 5; i++) {
    const p = (t * 0.4 + i / 5) % 1;
    const x = STAGE_CX - 260 + hash(i) * 520;
    const y = 160 + hash(i + 9) * 110;
    const a = Math.sin(p * Math.PI);
    ctx.fillStyle = `rgba(255, 255, 255, ${(a * 0.9).toFixed(3)})`;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 4, 2, 8);
    ctx.fillRect(Math.round(x) - 4, Math.round(y) - 1, 8, 2);
  }
  menu(ctx, s);
  text(
    ctx,
    "Play with mouse, pen, or touch.  Menus: arrows, Enter, Esc.",
    STAGE_CX,
    640,
    {
      size: 16,
      color: MUTED_TEXT,
    },
  );
  soundHint(ctx, s);
}

const HOW_TO: readonly (readonly [string, string])[] = [
  [
    "THE MOVE",
    "The board is a grid of gems in seven kinds. Take hold of a gem, carry it onto the gem beside it, and let go: the two trade places. Carry it back to where it started and let go there, and nothing is played.",
  ],
  [
    "SHATTERING",
    "Three or more of one kind in a line shatter. A move that would shatter nothing is refused, and the board stays as it was. Gems above fall into the gap, and what falls can shatter again: each step of a chain is worth more than the one before.",
  ],
  [
    "STRAIN AND FLAWS",
    "Every gem beside a shattering line takes strain. Enough strain cracks a gem right through: it is flawed. A flawed gem shatters along with any clear that touches it, and it is worth double.",
  ],
  [
    "CUT STONES",
    "A line of four leaves a brilliant, which takes the ring of gems around it. Two lines crossing leave a star, which takes its whole row and column. A line of five or more leaves a prism: swap it with a gem to take every gem of that kind.",
  ],
  [
    "LEVELS",
    "Reach the level's target and the level is clear. The round ends when no move is left that would shatter anything.",
  ],
  [
    "CONTROLS",
    "Play the board with a mouse, a pen, or a finger. In the menus the arrows ↑ ↓ move, ↵ Enter or ␣ Space chooses, and ⎋ Esc goes back. P or ⎋ Esc pauses the board. M mutes the sound.",
  ],
];

/** Breaks a paragraph into lines no wider than `width` in the current font. */
function wrap(ctx: Ctx, paragraph: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of paragraph.split(" ")) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== "") lines.push(line);
  return lines;
}

function keycap(ctx: Ctx, x: number, y: number, label: string): void {
  ctx.save();
  roundRect(ctx, x - 22, y - 22, 44, 44, 8);
  ctx.fillStyle = "#2a2650";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.restore();
  text(ctx, label, x, y + 1, { size: 24, color: GOLD });
}

function howTo(ctx: Ctx, s: View): void {
  panel(ctx, 40, 24, STAGE_W - 80, 590);
  text(ctx, "HOW TO PLAY", STAGE_CX, 62, { size: 34, color: GOLD, spacing: 6 });
  const icons: (GemLook | null)[] = [
    { kind: "sapphire", cut: "plain", strain: 0 },
    { kind: "ruby", cut: "plain", strain: 1 },
    { kind: "jade", cut: "plain", strain: 3 },
    { kind: "amber", cut: "star", strain: 0 },
    { kind: "amethyst", cut: "brilliant", strain: 0 },
    null,
  ];
  HOW_TO.forEach(([head, body], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 80 + col * 600;
    const y = 112 + row * 168;
    const icon = icons[i];
    if (icon) {
      drawGem(ctx, icon, x + 32, y + 52, s.simTime);
      if (i === 3)
        drawGem(
          ctx,
          { kind: null, cut: "prism", strain: 0 },
          x + 32,
          y + 120,
          s.simTime,
        );
    } else {
      keycap(ctx, x + 32, y + 52, "M");
    }
    text(ctx, head, x + 80, y + 14, {
      size: 20,
      color: GOLD,
      align: "left",
      spacing: 3,
    });
    ctx.save();
    ctx.font = `normal 17px ${FONT}`;
    const lines = wrap(ctx, body, 450);
    ctx.restore();
    lines.forEach((line, k) => {
      text(ctx, line, x + 80, y + 42 + k * 24, {
        size: 17,
        align: "left",
        weight: "normal",
        color: TEXT,
      });
    });
  });
  button(
    ctx,
    BACK_TARGET.x,
    BACK_TARGET.y,
    BACK_TARGET.w,
    BACK_TARGET.h,
    BACK_LABEL,
    true,
  );
  soundHint(ctx, s);
}

function playing(ctx: Ctx, s: View, fx: FxLayer): void {
  drawBoard(ctx, s, fx);
  hud(ctx, s);
  soundHint(ctx, s);
}

function overlay(
  ctx: Ctx,
  s: View,
  heading: string,
  lines: readonly [string, string][],
): void {
  quiet(ctx);
  const top = s.screen === "paused" ? 190 : 150;
  const bottom = (targetsFor(s.screen).slice(-1)[0]?.y ?? 500) + 76 + 28;
  panel(ctx, 380, top, 520, bottom - top);
  text(ctx, heading, STAGE_CX, top + 58, { size: 46, color: GOLD, spacing: 6 });
  lines.forEach(([label, value], i) => {
    const y = top + 128 + i * 58;
    text(ctx, label, STAGE_CX - 20, y, {
      size: 18,
      color: MUTED_TEXT,
      align: "right",
      spacing: 3,
    });
    text(ctx, value, STAGE_CX + 4, y, { size: 32, align: "left" });
  });
  menu(ctx, s);
}

/** Draws the whole frame for `s`. */
export function draw(ctx: Ctx, s: View, fx: FxLayer): void {
  // The sprites are pixel art: keep their grid intact at any stage scale.
  ctx.imageSmoothingEnabled = false;
  fx.begin(s.simTime);
  backdrop(ctx, s);
  switch (s.screen) {
    case "title":
      title(ctx, s);
      break;
    case "howto":
      howTo(ctx, s);
      break;
    case "playing":
      playing(ctx, s, fx);
      break;
    case "paused":
      playing(ctx, s, fx);
      overlay(ctx, s, PAUSED_TITLE_TEXT, []);
      break;
    case "levelclear":
      playing(ctx, s, fx);
      overlay(ctx, s, LEVELCLEAR_TITLE_TEXT, [
        [HUD_LEVEL_LABEL, String(s.level)],
        [BEST_CHAIN_LABEL, String(s.bestChain)],
        [BEST_MOVE_LABEL, String(s.bestMove)],
      ]);
      break;
    case "gameover":
      playing(ctx, s, fx);
      overlay(ctx, s, GAMEOVER_TITLE_TEXT, [
        [HUD_SCORE_LABEL, String(s.score)],
        [HUD_LEVEL_LABEL, String(s.level)],
      ]);
      break;
  }
}

/** The stage colour behind the board, cleared to by the engine. */
export const STAGE_BACKGROUND = INK;
