// Facet's sprites, authored as pixel art and rendered through `draw` and
// `draw-sheet`. Run once with `node tools/assets/sprites.ts`; the PNGs land in
// `public/assets/gems/` and are committed. The build never runs this.

import {
  type Pt,
  type RGBA,
  Pixels,
  hex,
  line,
  mixColor,
  pointInPolygon,
  renderSheet,
  renderSprite,
  rng,
} from "./pixels.ts";

const OUT = "public/assets/gems";
const S = 64;
const C: Pt = { x: 32, y: 32 };
const LIGHT = Math.atan2(-0.8, -0.6);
const BAYER = [0.2, 0.7, 0.95, 0.45];

type Style = "brilliant" | "kite" | "step" | "cabochon";

interface GemDef {
  name: string;
  outline: Pt[];
  center: Pt;
  sectors: number;
  rotation: number;
  table: number;
  style: Style;
  ramp: RGBA[];
  ink: RGBA;
  seed: number;
}

function ramp(...hexes: string[]): RGBA[] {
  return hexes.map((h) => hex(h));
}

function regular(n: number, r: number, rot: number, c = C): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function truncate(poly: Pt[], f: number): Pt[] {
  const out: Pt[] = [];
  poly.forEach((v, i) => {
    const prev = poly[(i + poly.length - 1) % poly.length];
    const next = poly[(i + 1) % poly.length];
    out.push({ x: v.x + (prev.x - v.x) * f, y: v.y + (prev.y - v.y) * f });
    out.push({ x: v.x + (next.x - v.x) * f, y: v.y + (next.y - v.y) * f });
  });
  return out;
}

// ---- The seven kinds ------------------------------------------------------

function pear(): Pt[] {
  const pts: Pt[] = [{ x: 32, y: 4.5 }];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push({ x: 32 + Math.cos(a) * 19.5, y: 38 + Math.sin(a) * 19 });
  }
  return hull(pts);
}

function marquise(): Pt[] {
  const pts: Pt[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: 32 + 18 * Math.pow(Math.sin(Math.PI * t), 0.85),
      y: 4 + 56 * t,
    });
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    pts.push({
      x: 32 - 18 * Math.pow(Math.sin(Math.PI * t), 0.85),
      y: 4 + 56 * t,
    });
  }
  return pts;
}

function heart(): Pt[] {
  const pts: Pt[] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    pts.push({ x: 32 + x * 1.62, y: 30 - y * 1.62 });
  }
  return pts;
}

const KINDS: GemDef[] = [
  {
    name: "ruby",
    outline: regular(8, 28, Math.PI / 8),
    center: C,
    sectors: 8,
    rotation: 0,
    table: 0.5,
    style: "step",
    ramp: ramp(
      "#2a0510",
      "#5c0a1e",
      "#9a1030",
      "#d11f45",
      "#f0506a",
      "#ff8fa0",
      "#ffe0e5",
    ),
    ink: hex("#1a0208"),
    seed: 11,
  },
  {
    name: "amber",
    outline: pear(),
    center: { x: 32, y: 35 },
    sectors: 8,
    rotation: -Math.PI / 2,
    table: 0.46,
    style: "brilliant",
    ramp: ramp(
      "#2e1204",
      "#6b2e06",
      "#a8520c",
      "#e07c16",
      "#f7a440",
      "#ffcf85",
      "#fff3dc",
    ),
    ink: hex("#1c0a02"),
    seed: 23,
  },
  {
    name: "citrine",
    outline: truncate(regular(3, 33, -Math.PI / 2, { x: 32, y: 36 }), 0.2),
    center: { x: 32, y: 35 },
    sectors: 6,
    rotation: -Math.PI / 2,
    table: 0.44,
    style: "kite",
    ramp: ramp(
      "#2c2304",
      "#6a5508",
      "#a88e10",
      "#dfc21e",
      "#f5e050",
      "#fff294",
      "#fffce6",
    ),
    ink: hex("#1a1502"),
    seed: 37,
  },
  {
    name: "jade",
    outline: regular(6, 28.5, 0),
    center: C,
    sectors: 6,
    rotation: 0,
    table: 0.62,
    style: "cabochon",
    ramp: ramp(
      "#04241a",
      "#0b4a33",
      "#14744c",
      "#23a065",
      "#4cc985",
      "#92e6b4",
      "#e2fff0",
    ),
    ink: hex("#021510"),
    seed: 41,
  },
  {
    name: "beryl",
    outline: marquise(),
    center: C,
    sectors: 8,
    rotation: -Math.PI / 2,
    table: 0.4,
    style: "kite",
    ramp: ramp(
      "#032630",
      "#08505e",
      "#0d8394",
      "#1bb8c8",
      "#52dbe3",
      "#9cf1f2",
      "#ecfffe",
    ),
    ink: hex("#011a20"),
    seed: 53,
  },
  {
    name: "sapphire",
    outline: regular(28, 28, 0),
    center: C,
    sectors: 8,
    rotation: -Math.PI / 2 + Math.PI / 8,
    table: 0.5,
    style: "brilliant",
    ramp: ramp(
      "#050a33",
      "#0d1c6e",
      "#1534ab",
      "#2457e0",
      "#4f86f7",
      "#95bcff",
      "#e6efff",
    ),
    ink: hex("#03061f"),
    seed: 67,
  },
  {
    name: "amethyst",
    outline: heart(),
    center: { x: 32, y: 31 },
    sectors: 10,
    rotation: -Math.PI / 2,
    table: 0.42,
    style: "kite",
    ramp: ramp(
      "#1c0730",
      "#3e0f66",
      "#651c9c",
      "#9133cf",
      "#b766ec",
      "#d9a5fa",
      "#f8eeff",
    ),
    ink: hex("#12041f"),
    seed: 79,
  },
];

// ---- Faceting -------------------------------------------------------------

function rayDistance(c: Pt, a: number, poly: Pt[]): number {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j];
    const q = poly[i];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - c.x) * ey - (p.y - c.y) * ex) / den;
    const u = ((p.x - c.x) * dy - (p.y - c.y) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

interface FacetHit {
  id: number;
  shade: number;
  lit: number;
}

/** Classifies a pixel of a gem into a facet and gives it a shade in 0..1. */
function facet(def: GemDef, px: number, py: number): FacetHit {
  const c = def.center;
  const dx = px - c.x;
  const dy = py - c.y;
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const R = rayDistance(c, a, def.outline);
  const rho = Math.min(1, r / R);
  const step = (Math.PI * 2) / def.sectors;
  let rel = (a - def.rotation) / step;
  rel = ((rel % def.sectors) + def.sectors) % def.sectors;
  const sector = Math.floor(rel);
  const u = rel - sector;
  // The table's edge is straight between sector corners, so it reads as a cut.
  const half = step / 2;
  const tableEdge = (def.table * Math.cos(half)) / Math.cos((u - 0.5) * step);
  const mid = def.rotation + (sector + 0.5) * step;
  const lit = Math.cos(mid - LIGHT);
  const slope = -(dy / 28) * 0.16 - (dx / 28) * 0.08;

  if (def.style === "cabochon") {
    if (rho < 0.8) {
      const nz = Math.sqrt(Math.max(0, 1 - (rho / 0.8) ** 2));
      const nx = (dx / R / 0.8) * 0.9;
      const ny = (dy / R / 0.8) * 0.9;
      const l = (-0.5 * nx - 0.7 * ny + 0.75 * nz) / 1.15;
      return { id: 1, shade: 0.12 + 0.72 * Math.max(0, l), lit: l };
    }
    return { id: 10 + sector, shade: 0.42 + 0.3 * lit, lit };
  }

  if (rho < tableEdge) {
    return { id: 0, shade: 0.6 + slope, lit: 0.5 };
  }

  if (def.style === "step") {
    const ring = rho < (tableEdge + 1) / 2 ? 0 : 1;
    const amp = ring === 0 ? 0.26 : 0.38;
    return {
      id: 100 + ring * 50 + sector,
      shade: 0.5 + amp * lit + (ring === 0 ? 0.06 : -0.04),
      lit,
    };
  }

  const t = (rho - tableEdge) / (1 - tableEdge);
  const w = Math.abs(2 * u - 1);
  if (def.style === "brilliant") {
    if (t >= w) return { id: 200 + sector, shade: 0.52 + 0.34 * lit, lit };
    const side = u < 0.5 ? -1 : 1;
    const subLit = Math.cos(mid + (side * step) / 3 - LIGHT);
    return {
      id: 300 + sector * 2 + (u < 0.5 ? 0 : 1),
      shade: 0.5 + 0.3 * subLit + side * 0.08,
      lit: subLit,
    };
  }
  // Kite: long facets reaching from the table's corners to the girdle midpoints.
  if (t < 1 - w) return { id: 400 + sector, shade: 0.56 + 0.3 * lit, lit };
  const side = u < 0.5 ? -1 : 1;
  const subLit = Math.cos(mid + (side * step) / 2.5 - LIGHT);
  return {
    id: 500 + sector * 2 + (u < 0.5 ? 0 : 1),
    shade: 0.46 + 0.34 * subLit - side * 0.06,
    lit: subLit,
  };
}

function quantize(
  rampLen: number,
  shade: number,
  x: number,
  y: number,
): number {
  const v = Math.max(0, Math.min(1, shade)) * (rampLen - 1);
  const base = Math.floor(v);
  const frac = v - base;
  const th = BAYER[(x & 1) + (y & 1) * 2];
  const dithered = frac > 0.3 && frac < 0.7 ? frac > th : frac >= 0.5;
  return Math.min(rampLen - 1, base + (dithered ? 1 : 0));
}

interface Painted {
  pixels: Pixels;
  mask: boolean[];
  index: number[];
}

/** Paints a gem whose colours come from `colorAt(rampIndex, facet, x, y)`. */
function paintGem(
  def: GemDef,
  colorAt: (index: number, hit: FacetHit, x: number, y: number) => RGBA,
  rampLen: number,
): Painted {
  const pixels = new Pixels(S, S);
  const mask: boolean[] = new Array(S * S).fill(false);
  const ids: number[] = new Array(S * S).fill(-1);
  const hits: (FacetHit | null)[] = new Array(S * S).fill(null);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (!pointInPolygon(p, def.outline)) continue;
      mask[y * S + x] = true;
      const h = facet(def, p.x, p.y);
      hits[y * S + x] = h;
      ids[y * S + x] = h.id;
    }
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < S && y < S && mask[y * S + x];
  const index: number[] = new Array(S * S).fill(-1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!inside(x, y)) continue;
      const h = hits[y * S + x] as FacetHit;
      const edge =
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1);
      if (edge) {
        index[y * S + x] = -2;
        continue;
      }
      let k = quantize(rampLen, h.shade, x, y);
      const id = ids[y * S + x];
      const seam =
        (inside(x + 1, y) && ids[y * S + x + 1] !== id) ||
        (inside(x, y + 1) && ids[(y + 1) * S + x] !== id);
      if (seam) k += h.lit > 0 ? 1 : -1;
      // Bevel: a bright inner rim facing the light and a dark one away from it.
      if (!inside(x - 2, y) || !inside(x, y - 2) || !inside(x - 1, y - 1))
        k += 1;
      if (!inside(x + 2, y) || !inside(x, y + 2) || !inside(x + 1, y + 1))
        k -= 1;
      index[y * S + x] = Math.max(0, Math.min(rampLen - 1, k));
    }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = index[y * S + x];
      if (k === -1) continue;
      const h = hits[y * S + x] as FacetHit;
      pixels.set(x, y, colorAt(k, h, x, y));
    }
  return { pixels, mask, index };
}

function glint(
  p: Pixels,
  x: number,
  y: number,
  big: boolean,
  mask: boolean[],
): void {
  const white = hex("#ffffff");
  const soft = hex("#ffffff", 0.55);
  const put = (px: number, py: number, c: RGBA) => {
    if (mask[py * S + px]) p.blend(px, py, c);
  };
  put(x, y, white);
  put(x - 1, y, soft);
  put(x + 1, y, soft);
  put(x, y - 1, soft);
  put(x, y + 1, soft);
  if (big) {
    put(x - 2, y, hex("#ffffff", 0.3));
    put(x + 2, y, hex("#ffffff", 0.3));
    put(x, y - 2, hex("#ffffff", 0.3));
    put(x, y + 2, hex("#ffffff", 0.3));
  }
}

function plainGem(def: GemDef): Painted {
  const painted = paintGem(
    def,
    (k) => (k === -2 ? def.ink : def.ramp[k]),
    def.ramp.length,
  );
  const c = def.center;
  glint(
    painted.pixels,
    Math.round(c.x - 7),
    Math.round(c.y - 8),
    true,
    painted.mask,
  );
  glint(
    painted.pixels,
    Math.round(c.x + 9),
    Math.round(c.y + 7),
    false,
    painted.mask,
  );
  return painted;
}

// ---- Strain ---------------------------------------------------------------

interface Crack {
  pts: Pt[];
}

function crackPath(
  rand: () => number,
  def: GemDef,
  angle: number,
  length: number,
): Pt[] {
  const c = def.center;
  const R = rayDistance(c, angle, def.outline);
  let x = c.x + Math.cos(angle) * (R - 1);
  let y = c.y + Math.sin(angle) * (R - 1);
  let dir = angle + Math.PI + (rand() - 0.5) * 0.6;
  const pts: Pt[] = [{ x, y }];
  let travelled = 0;
  while (travelled < length) {
    const seg = 2.5 + rand() * 2.5;
    dir += (rand() - 0.5) * 0.9;
    x += Math.cos(dir) * seg;
    y += Math.sin(dir) * seg;
    pts.push({ x, y });
    travelled += seg;
  }
  return pts;
}

function cracksFor(def: GemDef, strain: number): Crack[] {
  const rand = rng(def.seed * 97 + 5);
  const base = rand() * Math.PI * 2;
  const all: Crack[] = [];
  // Strain 1: a single first crack. Each further state keeps the cracks before it.
  all.push({ pts: crackPath(rand, def, base, 15) });
  if (strain >= 2) {
    all[0] = { pts: crackPath(rng(def.seed * 97 + 5), def, base, 22) };
    all.push({ pts: crackPath(rand, def, base + 2.3, 16) });
    const b = all[0].pts[Math.floor(all[0].pts.length * 0.6)];
    const branch: Pt[] = [b];
    let d = base + Math.PI + 1.1;
    let p = b;
    for (let i = 0; i < 3; i++) {
      d += (rand() - 0.5) * 0.7;
      p = { x: p.x + Math.cos(d) * 3.5, y: p.y + Math.sin(d) * 3.5 };
      branch.push(p);
    }
    all.push({ pts: branch });
  }
  if (strain >= 3) {
    all.push({ pts: crackPath(rand, def, base + 4.2, 40) });
    all.push({ pts: crackPath(rand, def, base + 1.1, 30) });
    all.push({ pts: crackPath(rand, def, base + 3.3, 24) });
  }
  return all;
}

function drawCracks(p: Painted, def: GemDef, strain: number): void {
  if (strain === 0) return;
  const cracks = cracksFor(def, strain);
  const hot = strain >= 3;
  const core = hot ? hex("#fff4c8") : def.ink;
  const edgeLight = hot
    ? hex("#ff9a3c", 0.9)
    : mixColor(def.ramp[6], hex("#ffffff"), 0.3);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < S && y < S && p.mask[y * S + x];
  for (const crack of cracks) {
    for (let i = 1; i < crack.pts.length; i++) {
      const a = crack.pts[i - 1];
      const b = crack.pts[i];
      line(a.x, a.y, b.x, b.y, (x, y) => {
        if (!inside(x, y)) return;
        if (inside(x + 1, y + 1)) p.pixels.set(x + 1, y + 1, edgeLight);
        p.pixels.set(x, y, core);
      });
    }
    if (hot) {
      const end = crack.pts[crack.pts.length - 1];
      const ex = Math.round(end.x);
      const ey = Math.round(end.y);
      if (inside(ex, ey)) p.pixels.set(ex, ey, hex("#ffffff"));
    }
  }
}

function chip(p: Painted, def: GemDef, angle: number, size: number): void {
  const c = def.center;
  const R = rayDistance(c, angle, def.outline);
  const cx = c.x + Math.cos(angle) * R;
  const cy = c.y + Math.sin(angle) * R;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!p.mask[y * S + x]) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < size) {
        p.pixels.set(x, y, [0, 0, 0, 0]);
        p.mask[y * S + x] = false;
      }
    }
  // Re-ink the broken edge.
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!p.mask[y * S + x]) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < size + 1.5) p.pixels.set(x, y, def.ink);
    }
}

function strainedGem(def: GemDef, strain: number): Pixels {
  let painted: Painted;
  if (strain >= 3) {
    // A flawed stone has gone dull and dark around its glowing fractures.
    painted = paintGem(
      def,
      (k) => {
        if (k === -2) return def.ink;
        const c = def.ramp[Math.max(0, k - 1)];
        return mixColor(c, hex("#2a1a24"), 0.18);
      },
      def.ramp.length,
    );
  } else {
    painted = plainGem(def);
  }
  const rand = rng(def.seed * 13 + 1);
  if (strain >= 2) chip(painted, def, rand() * Math.PI * 2, 2.6);
  if (strain >= 3) {
    chip(painted, def, rand() * Math.PI * 2, 3.4);
    chip(painted, def, rand() * Math.PI * 2, 2.8);
  }
  drawCracks(painted, def, strain);
  return painted.pixels;
}

// ---- The prism ------------------------------------------------------------

function hsl(h: number, s: number, l: number): RGBA {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255, 1];
}

function prismDef(rotation: number): GemDef {
  const outline: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rotation - Math.PI / 2 + (i * Math.PI) / 8;
    const r = i % 2 === 0 ? 28.5 : 17;
    outline.push({ x: 32 + Math.cos(a) * r, y: 32 + Math.sin(a) * r });
  }
  return {
    name: "prism",
    outline,
    center: C,
    sectors: 16,
    rotation: rotation - Math.PI / 2 - Math.PI / 16,
    table: 0.5,
    style: "brilliant",
    ramp: ramp(
      "#1b1830",
      "#3a3658",
      "#6a6690",
      "#9c98c0",
      "#c8c4e6",
      "#e6e4f8",
      "#ffffff",
    ),
    ink: hex("#1b1830"),
    seed: 97,
  };
}

/** A prism frame: `phase` 0..1 turns the cut one point round and back to start. */
function prismGem(phase: number, strain: number): Pixels {
  const rot = (phase * Math.PI) / 4;
  const def = prismDef(rot);
  const levels = 6;
  const painted = paintGem(
    def,
    (k, hit, x, y) => {
      if (k === -2) return def.ink;
      const a = Math.atan2(y + 0.5 - 32, x + 0.5 - 32) - rot + Math.PI / 2;
      const point = Math.round((a / (Math.PI * 2)) * 8);
      const hue = ((((point + phase) / 8) % 1) + 1) % 1;
      const l = 0.38 + (k / (levels - 1)) * 0.56;
      if (hit.id === 0) {
        // The table is clear glass carrying a faint spectrum.
        return mixColor(
          hsl(hue, 0.5, 0.86),
          hex("#ffffff"),
          0.35 + (k / levels) * 0.3,
        );
      }
      return hsl(hue, 0.72, l);
    },
    levels,
  );
  glint(painted.pixels, 25, 23, true, painted.mask);
  glint(painted.pixels, 40, 40, false, painted.mask);
  if (strain >= 2) chip(painted, def, 0.9, 2.4);
  if (strain >= 3) chip(painted, def, 3.6, 3);
  drawCracks(painted, def, strain);
  return painted.pixels;
}

// ---- Cut overlays ---------------------------------------------------------

function brilliantOverlay(): Pixels {
  const p = new Pixels(S, S);
  const cx = 32;
  const cy = 33;
  // A gold collet ring: the stone is set, and what it takes is the ring round it.
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const lit = x + y < cx + cy;
      if (d >= 9.5 && d < 10.5) p.set(x, y, hex("#3a2506"));
      else if (d >= 10.5 && d < 12.5)
        p.set(x, y, lit ? hex("#ffe08a") : hex("#b8860b"));
      else if (d >= 12.5 && d < 13.5) p.set(x, y, hex("#3a2506"));
    }
  // Eight claws standing on the ring, each catching the light.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const px = Math.round(cx + Math.cos(a) * 11.5 - 0.5);
    const py = Math.round(cy + Math.sin(a) * 11.5 - 0.5);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const m = Math.abs(dx) + Math.abs(dy);
        if (m > 2) continue;
        p.set(px + dx, py + dy, m === 2 ? hex("#3a2506") : hex("#ffd34d"));
      }
    p.set(px - 1, py, hex("#fff6c2"));
    p.set(px, py - 1, hex("#ffffff"));
  }
  // Fire sparkles in the open table the ring frames.
  const sparkle = (x: number, y: number) => {
    p.set(x, y, hex("#ffffff"));
    p.set(x - 1, y, hex("#ffffff", 0.55));
    p.set(x + 1, y, hex("#ffffff", 0.55));
    p.set(x, y - 1, hex("#ffffff", 0.55));
    p.set(x, y + 1, hex("#ffffff", 0.55));
  };
  sparkle(cx - 3, cy - 3);
  sparkle(cx + 3, cy + 2);
  return p;
}

function starOverlay(): Pixels {
  const p = new Pixels(S, S);
  const ink = hex("#10101c");
  const silver = hex("#d8e4ff");
  const white = hex("#ffffff");
  // Long rays along the row and the column the star clears.
  const ray = (len: number, horiz: boolean) => {
    for (let t = -len; t <= len; t++) {
      const w = Math.abs(t) < len * 0.35 ? 2 : Math.abs(t) < len * 0.75 ? 1 : 0;
      for (let s = -w - 1; s <= w + 1; s++) {
        const x = horiz ? 32 + t : 32 + s;
        const y = horiz ? 32 + s : 32 + t;
        const edge = Math.abs(s) === w + 1;
        if (edge) {
          if (p.alpha(x, y) === 0) p.set(x, y, ink);
        } else p.set(x, y, Math.abs(s) === 0 ? white : silver);
      }
    }
  };
  ray(27, true);
  ray(27, false);
  // A four-point star body at the centre, turned to the diagonals.
  for (let y = -8; y <= 8; y++)
    for (let x = -8; x <= 8; x++) {
      const u = (x + y) / Math.SQRT2;
      const v = (x - y) / Math.SQRT2;
      const inStar =
        Math.pow(Math.abs(u), 0.5) + Math.pow(Math.abs(v), 0.5) < 2.6;
      if (!inStar) continue;
      const rim = Math.pow(Math.abs(u), 0.5) + Math.pow(Math.abs(v), 0.5) > 2.1;
      p.set(32 + x, 32 + y, rim ? ink : x + y < 0 ? white : silver);
    }
  for (let y = -3; y <= 3; y++)
    for (let x = -3; x <= 3; x++)
      if (Math.abs(x) + Math.abs(y) <= 3)
        p.set(32 + x, 32 + y, Math.abs(x) + Math.abs(y) === 3 ? ink : white);
  p.set(31, 31, hex("#fff6c0"));
  return p;
}

// ---- Break sequences ------------------------------------------------------

const B = 96;

function breakFrames(base: Pixels, seed: number, tint: RGBA): Pixels[] {
  const rand = rng(seed);
  const seeds: { x: number; y: number; dir: number; spin: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand() * 0.6;
    const r = 6 + rand() * 14;
    seeds.push({
      x: 32 + Math.cos(a) * r,
      y: 32 + Math.sin(a) * r,
      dir: a,
      spin: (rand() - 0.5) * 0.5,
    });
  }
  const owner = (x: number, y: number) => {
    let best = 0;
    let bd = Infinity;
    seeds.forEach((s, i) => {
      const d = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const shardOf: number[] = [];
  const cent = seeds.map(() => ({ x: 0, y: 0, n: 0 }));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const o = owner(x + 0.5, y + 0.5);
      shardOf.push(o);
      if (base.alpha(x, y) > 0) {
        cent[o].x += x;
        cent[o].y += y;
        cent[o].n++;
      }
    }
  for (const c of cent) {
    if (c.n > 0) {
      c.x /= c.n;
      c.y /= c.n;
    }
  }
  const frames: Pixels[] = [];
  const dist = [0, 2, 5, 9, 13, 17, 21, 25];
  const scale = [1, 1, 0.95, 0.85, 0.72, 0.58, 0.44, 0.3];
  const off = (B - S) / 2;
  for (let f = 0; f < 8; f++) {
    const out = new Pixels(B, B);
    const fade = f < 4 ? 1 : 1 - (f - 3) / 5;
    for (let s = 0; s < seeds.length; s++) {
      const sd = seeds[s];
      const c = cent[s];
      if (c.n === 0) continue;
      const ang = sd.spin * f;
      const cos = Math.cos(-ang);
      const sin = Math.sin(-ang);
      const tx = c.x + Math.cos(sd.dir) * dist[f];
      const ty = c.y + Math.sin(sd.dir) * dist[f] + 0.35 * f * f;
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          // Inverse map from the frame back into the source sprite.
          const lx = (x - off - tx) / scale[f];
          const ly = (y - off - ty) / scale[f];
          const sx = Math.round(c.x + lx * cos - ly * sin);
          const sy = Math.round(c.y + lx * sin + ly * cos);
          if (sx < 0 || sy < 0 || sx >= S || sy >= S) continue;
          if (shardOf[sy * S + sx] !== s) continue;
          const col = base.get(sx, sy);
          if (col[3] <= 0) continue;
          let px = col;
          if (f === 0) {
            // The stone fractures: its shard seams flash white.
            const seam =
              shardOf[sy * S + Math.min(S - 1, sx + 1)] !== s ||
              shardOf[Math.min(S - 1, sy + 1) * S + sx] !== s;
            if (seam) px = hex("#ffffff");
          } else {
            px = mixColor(
              col,
              mixColor(tint, hex("#ffffff"), 0.5),
              Math.min(0.6, f * 0.09),
            );
          }
          const keep = fade >= 1 || BAYER[(x & 1) + (y & 1) * 2] < fade;
          if (keep) out.set(x, y, px);
        }
    }
    // Glints thrown clear of the shards.
    if (f >= 2) {
      const r2 = rng(seed + f);
      for (let i = 0; i < 10 - f; i++) {
        const a = r2() * Math.PI * 2;
        const d = 10 + f * 4.5 + r2() * 6;
        const x = Math.round(B / 2 + Math.cos(a) * d);
        const y = Math.round(B / 2 + Math.sin(a) * d);
        out.set(x, y, hex("#ffffff"));
        if (f < 6) out.set(x + 1, y, mixColor(tint, hex("#ffffff"), 0.6));
      }
    }
    frames.push(out);
  }
  return frames;
}

// ---- The board frame ------------------------------------------------------

function boardFrame(): Pixels {
  const M = 12;
  const W = 288 + M * 2;
  const p = new Pixels(W, W);
  const rand = rng(4242);
  // The velvet field with its 8 x 8 inset wells.
  for (let y = M; y < W - M; y++)
    for (let x = M; x < W - M; x++) {
      const cx = Math.floor((x - M) / 36);
      const cy = Math.floor((y - M) / 36);
      const lx = (x - M) % 36;
      const ly = (y - M) % 36;
      const checker = (cx + cy) % 2 === 0;
      let c = checker ? hex("#191b40") : hex("#14163a");
      const noise = rand();
      if (noise < 0.08) c = mixColor(c, hex("#2a2c5c"), 0.5);
      else if (noise > 0.94) c = mixColor(c, hex("#0a0b22"), 0.6);
      // Inset well: dark lip top-left, lit lip bottom-right.
      if (lx === 1 || ly === 1) c = hex("#0c0d26");
      else if (lx === 34 || ly === 34) c = mixColor(c, hex("#3a3d78"), 0.55);
      else if (lx === 0 || ly === 0 || lx === 35 || ly === 35)
        c = hex("#101231");
      p.set(x, y, c);
    }
  // The bench surround: dark rim, brass bevel, walnut, gold inlay, shadow lip.
  const bands: [number, RGBA, RGBA][] = [
    [0, hex("#07060c"), hex("#07060c")],
    [1, hex("#f3d27a"), hex("#6e4b14")],
    [2, hex("#d7a73e"), hex("#8a5f1a")],
    [3, hex("#a77a2c"), hex("#5e3f10")],
    [4, hex("#3b1f0c"), hex("#2a1508")],
    [5, hex("#5b3417"), hex("#3a1f0d")],
    [6, hex("#6d4120"), hex("#432410")],
    [7, hex("#7a4a25"), hex("#4b2913")],
    [8, hex("#6d4120"), hex("#3a1f0d")],
    [9, hex("#ffe08a"), hex("#a9771f")],
    [10, hex("#b8862b"), hex("#7a5216")],
    [11, hex("#08070f"), hex("#08070f")],
  ];
  for (const [d, lit, shade] of bands) {
    for (let i = d; i < W - d; i++) {
      p.set(i, d, lit);
      p.set(d, i, lit);
      p.set(i, W - 1 - d, shade);
      p.set(W - 1 - d, i, shade);
    }
  }
  // Wood grain streaks along the walnut band.
  for (let i = 0; i < 140; i++) {
    const t = Math.floor(rand() * (W - 24)) + 12;
    const d = 5 + Math.floor(rand() * 4);
    const len = 3 + Math.floor(rand() * 9);
    const side = Math.floor(rand() * 4);
    const c = side < 2 ? hex("#8b5a2e") : hex("#2e180a");
    for (let k = 0; k < len; k++) {
      if (side === 0) p.set(t + k, d, c);
      else if (side === 1) p.set(d, t + k, c);
      else if (side === 2) p.set(t + k, W - 1 - d, c);
      else p.set(W - 1 - d, t + k, c);
    }
  }
  // Gold settings at the corners and the midpoints, each holding a small stone.
  const setting = (cx: number, cy: number, stone: [string, string]) => {
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++) {
        const m = Math.abs(x) + Math.abs(y);
        if (m > 6) continue;
        const c =
          m === 6
            ? hex("#3a2506")
            : m >= 4
              ? x + y < 0
                ? hex("#ffe08a")
                : hex("#a9771f")
              : x + y < 0
                ? hex(stone[0])
                : hex(stone[1]);
        p.set(cx + x, cy + y, c);
      }
    p.set(cx - 1, cy - 1, hex("#ffffff"));
    p.set(cx - 2, cy - 1, hex("#ffffff", 0.6));
  };
  const mid = Math.floor(W / 2);
  setting(6, 6, ["#ff8fa0", "#9a1030"]);
  setting(W - 7, 6, ["#95bcff", "#1534ab"]);
  setting(6, W - 7, ["#92e6b4", "#14744c"]);
  setting(W - 7, W - 7, ["#d9a5fa", "#651c9c"]);
  setting(mid, 6, ["#fff294", "#a88e10"]);
  setting(mid, W - 7, ["#ffcf85", "#a8520c"]);
  setting(6, mid, ["#9cf1f2", "#0d8394"]);
  setting(W - 7, mid, ["#9cf1f2", "#0d8394"]);
  return p;
}

// ---- Emit -----------------------------------------------------------------

/** Every resting gem must fit within GEM_R (30) of its cell centre. */
function checkRadius(p: Pixels, name: string): void {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.alpha(x, y) === 0) continue;
      const fx = Math.max(Math.abs(x - 32), Math.abs(x + 1 - 32));
      const fy = Math.max(Math.abs(y - 32), Math.abs(y + 1 - 32));
      if (Math.hypot(fx, fy) > 30)
        throw new Error(`${name}: pixel (${x}, ${y}) lies outside GEM_R`);
    }
}

function main(): void {
  for (const def of KINDS) {
    for (let s = 0; s <= 3; s++) {
      const sprite = strainedGem(def, s);
      checkRadius(sprite, `${def.name}-${s}`);
      renderSprite(sprite, `${OUT}/${def.name}-${s}.png`);
    }
    const tint = def.ramp[4];
    renderSheet(
      breakFrames(plainGem(def).pixels, def.seed * 7, tint),
      `${OUT}/break/${def.name}`,
    );
    console.log(`kind ${def.name}`);
  }
  for (let s = 0; s <= 3; s++) {
    renderSprite(prismGem(0, s), `${OUT}/prism-${s}.png`);
    const frames: Pixels[] = [];
    for (let f = 0; f < 12; f++) frames.push(prismGem(f / 12, s));
    renderSheet(frames, `${OUT}/prism-turn/${s}`);
  }
  renderSheet(
    breakFrames(prismGem(0, 0), 991, hex("#ffffff")),
    `${OUT}/break/prism`,
  );
  console.log("prism");
  renderSprite(brilliantOverlay(), `${OUT}/brilliant.png`);
  renderSprite(starOverlay(), `${OUT}/star.png`);
  renderSprite(boardFrame(), `${OUT}/frame.png`);
  console.log("overlays and frame");
}

main();
