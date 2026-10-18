// Shared helpers for the one-time asset generation step.
//
// The sprite scripts author pixel art into an RGBA buffer, then hand it to the
// `draw` / `draw-sheet` tools as an action log of `fill_rect` runs, so the
// committed PNG is the tool's own render of that log. Nothing here runs at
// build time: `npm run build` only bundles the files under `public/assets/`.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type RGBA = [number, number, number, number];

export interface Pt {
  x: number;
  y: number;
}

export class Pixels {
  readonly w: number;
  readonly h: number;
  readonly data: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Float32Array(w * h * 4);
  }

  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  /** Source-over blend of `c` onto the pixel. */
  blend(x: number, y: number, c: RGBA): void {
    const d = this.get(x, y);
    const a = c[3] + d[3] * (1 - c[3]);
    if (a <= 0) return;
    const mix = (k: number) => (c[k] * c[3] + d[k] * d[3] * (1 - c[3])) / a;
    this.set(x, y, [mix(0), mix(1), mix(2), a]);
  }

  alpha(x: number, y: number): number {
    return this.get(x, y)[3];
  }

  clone(): Pixels {
    const p = new Pixels(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  /** Copies `src` into this buffer with its top-left at (ox, oy). */
  stamp(src: Pixels, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c[3] > 0) this.blend(x + ox, y + oy, c);
      }
  }
}

export function hex(s: string, a = 1): RGBA {
  const v = s.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
    a,
  ];
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function toHex(c: RGBA): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}${h(c[3] * 255)}`;
}

/** The buffer as a `draw` action log: one `fill_rect` per horizontal run. */
export function toActions(p: Pixels): object[] {
  const ops: object[] = [];
  for (let y = 0; y < p.h; y++) {
    let x = 0;
    while (x < p.w) {
      const c = p.get(x, y);
      const key = c[3] <= 0.002 ? "" : toHex(c);
      let end = x + 1;
      while (end < p.w) {
        const n = p.get(end, y);
        const nk = n[3] <= 0.002 ? "" : toHex(n);
        if (nk !== key) break;
        end++;
      }
      if (key !== "")
        ops.push({
          op: "fill_rect",
          x,
          y,
          width: end - x,
          height: 1,
          color: key,
        });
      x = end;
    }
  }
  return ops;
}

const scratch = mkdtempSync(join(tmpdir(), "facet-assets-"));
let serial = 0;

function run(tool: string, args: string[]): void {
  const r = spawnSync(tool, args, { encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(`${tool} ${args.join(" ")} failed:\n${r.stderr}`);
}

/** Renders `p` to `out` through `draw render`. */
export function renderSprite(p: Pixels, out: string): void {
  const log = join(scratch, `sprite-${serial++}.json`);
  writeFileSync(log, JSON.stringify(toActions(p)));
  mkdirSync(dirname(out), { recursive: true });
  run("draw", [
    "render",
    "--actions",
    log,
    "--out",
    out,
    "--width",
    String(p.w),
    "--height",
    String(p.h),
    "--no-layers",
  ]);
}

/**
 * Renders a sequence through `draw-sheet`: each frame is its own action log and
 * its own PNG, `<dir>/<index>.png`.
 */
export function renderSheet(frames: Pixels[], dir: string): void {
  mkdirSync(dir, { recursive: true });
  frames.forEach((p, i) => {
    const log = join(scratch, `frame-${serial++}.json`);
    writeFileSync(log, JSON.stringify(toActions(p)));
    run("draw-sheet", [
      "render",
      "--actions",
      log,
      "--out",
      join(dir, `${i}.png`),
      "--width",
      String(p.w),
      "--height",
      String(p.h),
      "--no-layers",
    ]);
  });
}

/** A small seeded PRNG (mulberry32), so every generated sprite is repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Bresenham line, calling `plot` for every pixel on it. */
export function line(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void,
): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
