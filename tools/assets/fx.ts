// Facet's particle systems, authored through `particle-2d`. Run once with
// `node tools/assets/fx.ts`; each `system.json` lands in `public/assets/fx/`
// and is committed. The build never runs this.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "public/assets/fx";
const PREVIEW = process.env.FX_PREVIEW;

type Op = [string, Record<string, string | number | boolean>];

function author(
  name: string,
  field: number,
  durationMs: number,
  ops: Op[],
): void {
  const dir = mkdtempSync(join(tmpdir(), `fx-${name}-`));
  const config = join(dir, "particle-2d.config.json");
  writeFileSync(
    config,
    JSON.stringify({
      width: field,
      height: field,
      duration_ms: durationMs,
      fps: 30,
    }),
  );
  const run = (args: string[]) => {
    const r = spawnSync("particle-2d", [...args, "--config", config], {
      cwd: dir,
      encoding: "utf8",
    });
    if (r.status !== 0)
      throw new Error(`particle-2d ${args.join(" ")}:\n${r.stderr}`);
  };
  run(["init"]);
  for (const [op, flags] of ops) {
    const args = [op];
    for (const [k, v] of Object.entries(flags)) args.push(`--${k}`, String(v));
    run(args);
  }
  run(["render"]);
  mkdirSync(OUT, { recursive: true });
  copyFileSync(join(dir, "system.json"), join(OUT, `${name}.json`));
  if (PREVIEW)
    copyFileSync(join(dir, "effect.gif"), join(PREVIEW, `${name}.gif`));
  console.log(`fx ${name}`);
}

// The clear burst, tinted per kind: light, body, and shadow of each stone.
const KIND_TINTS: Record<string, [string, string, string]> = {
  ruby: ["#ffd6dd", "#f0506a", "#9a1030"],
  amber: ["#fff0d0", "#f7a440", "#a8520c"],
  citrine: ["#fffbe0", "#f5e050", "#a88e10"],
  jade: ["#dcffea", "#4cc985", "#14744c"],
  beryl: ["#e6fffe", "#52dbe3", "#0d8394"],
  sapphire: ["#e0ecff", "#4f86f7", "#1534ab"],
  amethyst: ["#f5e6ff", "#b766ec", "#651c9c"],
  prism: ["#ffffff", "#c8f0ff", "#ff9ad5"],
};

for (const [kind, [light, body, shadow]] of Object.entries(KIND_TINTS)) {
  author(`clear-${kind}`, 128, 700, [
    [
      "add-emitter",
      {
        name: "chips",
        shape: "disc",
        radius: 6,
        x: 64,
        y: 64,
        burst: 16,
        lifetime: 440,
        "lifetime-spread": 140,
        speed: 115,
        "speed-spread": 45,
        "dir-y": 1,
        "cone-angle": 180,
      },
    ],
    [
      "set-particle",
      {
        emitter: "chips",
        "size-curve": "ease-out",
        "size-from": 1.9,
        "size-to": 0.3,
        "opacity-curve": "ease-in",
        "opacity-from": 1,
        "opacity-to": 0,
        "color-gradient": `#ffffff@0,${light}@0.3,${body}@0.75,${shadow}@1`,
      },
    ],
    [
      "add-emitter",
      {
        name: "glow",
        shape: "point",
        x: 64,
        y: 64,
        burst: 1,
        lifetime: 200,
        speed: 0,
      },
    ],
    [
      "set-particle",
      {
        emitter: "glow",
        "size-curve": "ease-out",
        "size-from": 7,
        "size-to": 1,
        "opacity-from": 0.9,
        "opacity-to": 0,
        "color-gradient": `#ffffff@0,${light}@1`,
      },
    ],
    ["set-forces", { gravity: -170, drag: 1.8 }],
    ["set-timeline", { loop: false }],
  ]);
}

// The flawed detonation: a white-hot core, a shock ring, and shrapnel that
// sheds embers as it burns out.
author("flaw", 192, 1100, [
  [
    "add-emitter",
    {
      name: "core",
      shape: "point",
      x: 96,
      y: 96,
      burst: 1,
      lifetime: 280,
      speed: 0,
    },
  ],
  [
    "set-particle",
    {
      emitter: "core",
      "size-curve": "ease-out",
      "size-from": 14,
      "size-to": 2,
      "opacity-from": 1,
      "opacity-to": 0,
      "color-gradient": "#ffffff@0,#ffd27a@0.5,#ff6a1f@1",
    },
  ],
  [
    "add-emitter",
    {
      name: "ring",
      shape: "disc",
      radius: 4,
      x: 96,
      y: 96,
      burst: 26,
      lifetime: 260,
      "lifetime-spread": 30,
      speed: 230,
      "speed-spread": 12,
      "dir-y": 1,
      "cone-angle": 180,
    },
  ],
  [
    "set-particle",
    {
      emitter: "ring",
      "size-from": 2,
      "size-to": 0.4,
      "opacity-from": 1,
      "opacity-to": 0,
      "color-gradient": "#ffffff@0,#ffcf85@1",
    },
  ],
  [
    "add-emitter",
    {
      name: "shrapnel",
      shape: "disc",
      radius: 8,
      x: 96,
      y: 96,
      burst: 42,
      lifetime: 620,
      "lifetime-spread": 220,
      speed: 200,
      "speed-spread": 80,
      "dir-y": 1,
      "cone-angle": 180,
    },
  ],
  [
    "set-particle",
    {
      emitter: "shrapnel",
      "size-curve": "ease-out",
      "size-from": 2.3,
      "size-to": 0.3,
      "opacity-curve": "ease-in",
      "opacity-from": 1,
      "opacity-to": 0,
      "color-gradient": "#ffffff@0,#fff0b0@0.25,#ffb060@0.6,#ff5a2a@1",
    },
  ],
  [
    "add-emitter",
    {
      name: "embers",
      shape: "point",
      x: 96,
      y: 96,
      burst: 3,
      lifetime: 380,
      "lifetime-spread": 120,
      speed: 26,
      "speed-spread": 14,
      "dir-y": 1,
      "cone-angle": 180,
    },
  ],
  [
    "set-particle",
    {
      emitter: "embers",
      "size-from": 0.9,
      "size-to": 0,
      "opacity-from": 0.9,
      "opacity-to": 0,
      "color-gradient": "#ffe9b0@0,#ff8a3a@1",
    },
  ],
  ["add-subemitter", { parent: "shrapnel", on: "death", emitter: "embers" }],
  ["set-forces", { gravity: -150, drag: 1.4 }],
  ["set-forces", { emitter: "ring", drag: 6 }],
  ["set-timeline", { loop: false }],
]);

// The cut-gem flash: a gold ring blooming out of a bright core, with a few
// slow sparkles hanging after it.
author("cutflash", 192, 1000, [
  [
    "add-emitter",
    {
      name: "core",
      shape: "point",
      x: 96,
      y: 96,
      burst: 1,
      lifetime: 340,
      speed: 0,
    },
  ],
  [
    "set-particle",
    {
      emitter: "core",
      "size-curve": "ease-out",
      "size-from": 3,
      "size-to": 15,
      "opacity-curve": "ease-in",
      "opacity-from": 0.95,
      "opacity-to": 0,
      "color-gradient": "#ffffff@0,#ffe08a@1",
    },
  ],
  [
    "add-emitter",
    {
      name: "ring",
      shape: "disc",
      radius: 3,
      x: 96,
      y: 96,
      burst: 32,
      lifetime: 400,
      "lifetime-spread": 40,
      speed: 150,
      "speed-spread": 8,
      "dir-y": 1,
      "cone-angle": 180,
    },
  ],
  [
    "set-particle",
    {
      emitter: "ring",
      "size-from": 1.8,
      "size-to": 0.3,
      "opacity-from": 1,
      "opacity-to": 0,
      "color-gradient": "#ffffff@0,#fff0b0@0.5,#ffcc40@1",
    },
  ],
  [
    "add-emitter",
    {
      name: "sparkles",
      shape: "disc",
      radius: 14,
      x: 96,
      y: 96,
      burst: 12,
      lifetime: 800,
      "lifetime-spread": 250,
      speed: 30,
      "speed-spread": 20,
      "dir-y": 1,
      "cone-angle": 180,
    },
  ],
  [
    "set-particle",
    {
      emitter: "sparkles",
      "size-curve": "ease-in-out",
      "size-from": 1,
      "size-to": 0,
      "opacity-from": 1,
      "opacity-to": 0,
      "color-gradient": "#ffffff@0,#fff3b0@1",
    },
  ],
  ["set-forces", { drag: 2.6, gravity: 12 }],
  ["set-timeline", { loop: false }],
]);

// The cut aura, one per cut: a quiet, rising drift of motes that never stops.
const AURAS: Record<string, string> = {
  brilliant: "#ffffff@0,#fff3b0@0.5,#ffd34d@1",
  star: "#ffffff@0,#e6efff@0.5,#a9c2ff@1",
  prism: "#ffffff@0,#ffc2e6@0.3,#c2ecff@0.6,#d8ffc2@1",
};
for (const [cut, gradient] of Object.entries(AURAS)) {
  author(`aura-${cut}`, 96, 2000, [
    [
      "add-emitter",
      {
        name: "motes",
        shape: "disc",
        radius: 22,
        x: 48,
        y: 44,
        rate: 7,
        lifetime: 1100,
        "lifetime-spread": 300,
        speed: 10,
        "speed-spread": 5,
        "dir-y": 1,
        "cone-angle": 35,
      },
    ],
    [
      "set-particle",
      {
        emitter: "motes",
        "size-curve": "ease-in-out",
        "size-from": 1,
        "size-to": 0,
        "opacity-curve": "ease-out",
        "opacity-from": 0.85,
        "opacity-to": 0,
        "color-gradient": gradient,
      },
    ],
    ["set-forces", { gravity: 8, turbulence: "6,0.06" }],
    ["set-timeline", { loop: true }],
  ]);
}
