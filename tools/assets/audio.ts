// Facet's sounds and music, authored through `sfx-synth`, `sfx-sample`, and
// `music`. Run once with `node tools/assets/audio.ts`; every `.wav` lands in
// `public/assets/audio/` and is committed. The build never runs this.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "public/assets/audio";
mkdirSync(OUT, { recursive: true });

type Flags = Record<string, string | number | boolean>;
type Op = [string, Flags];

function author(
  tool: "sfx-synth" | "sfx-sample" | "music",
  name: string,
  ops: Op[],
  maxMs = 4000,
): string {
  const dir = mkdtempSync(join(tmpdir(), `audio-${name}-`));
  const config = join(dir, `${tool}.config.json`);
  writeFileSync(
    config,
    JSON.stringify({
      sample_rate: 44100,
      channels: "stereo",
      max_duration_ms: maxMs,
    }),
  );
  const run = (args: string[]) => {
    const r = spawnSync(tool, [...args, "--config", config], {
      cwd: dir,
      encoding: "utf8",
    });
    if (r.status !== 0)
      throw new Error(`${tool} ${args.join(" ")}:\n${r.stderr}${r.stdout}`);
    return r.stdout;
  };
  run(["init"]);
  for (const [op, flags] of ops) {
    const args = [op];
    for (const [k, v] of Object.entries(flags)) {
      if (v === true) args.push(`--${k}`);
      else args.push(`--${k}`, String(v));
    }
    run(args);
  }
  const out = run(["render"]);
  const wav = ["clip.wav", "music.wav", "out.wav"]
    .map((f) => join(dir, f))
    .find((f) => existsSync(f));
  if (!wav) throw new Error(`${tool} ${name}: no wav found (${out})`);
  copyFileSync(wav, join(OUT, `${name}.wav`));
  const mid = join(dir, "clip.mid");
  if (existsSync(mid)) copyFileSync(mid, join(OUT, `${name}.mid`));
  console.log(`audio ${name} (${readFileSync(wav).length} bytes)`);
  return dir;
}

const voice = (
  name: string,
  wave: string,
  freq: number,
  dur: number,
  extra: Flags = {},
): Op => ["add-voice", { name, wave, freq, dur, ...extra }];
const env = (v: string, e: string): Op => [
  "set-envelope",
  { voice: v, env: e },
];
const adsr = (v: string, a: number, d: number, s: number, r: number): Op => [
  "set-envelope",
  { voice: v, attack: a, decay: d, sustain: s, release: r },
];

// select: a light, dry tick, the stone lifted in the tweezers.
author("sfx-synth", "select", [
  voice("tick", "triangle", 1650, 45, { gain: -6 }),
  env("tick", "pluck"),
  voice("body", "sine", 820, 60, { gain: -11 }),
  env("body", "pluck"),
  ["set-pitch", { voice: "body", "slide-to": 980, over: 50 }],
  voice("click", "noise", 0, 12, { gain: -14 }),
  env("click", "pluck"),
  ["add-filter", { voice: "click", type: "highpass", cutoff: 4000 }],
]);

// swap: two quick mechanical slides crossing past each other.
author("sfx-synth", "swap", [
  voice("up", "triangle", 520, 110, { gain: -8, pan: -0.3 }),
  env("up", "gate"),
  ["set-pitch", { voice: "up", "slide-to": 900, over: 110 }],
  voice("down", "triangle", 900, 110, { gain: -10, pan: 0.3 }),
  env("down", "gate"),
  ["set-pitch", { voice: "down", "slide-to": 560, over: 110 }],
  voice("tap", "noise", 0, 20, { gain: -12, start: 110 }),
  env("tap", "pluck"),
  [
    "add-filter",
    { voice: "tap", type: "bandpass", cutoff: 2600, resonance: 2 },
  ],
]);

// refuse: a flat, dead stop.
author("sfx-synth", "refuse", [
  voice("buzz", "square", 150, 150, { gain: -8 }),
  adsr("buzz", 2, 30, 0.6, 50),
  ["set-pitch", { voice: "buzz", "slide-to": 118, over: 150 }],
  ["add-filter", { voice: "buzz", type: "lowpass", cutoff: 900 }],
  voice("thud", "sine", 95, 120, { gain: -2 }),
  env("thud", "punch"),
  voice("buzz2", "square", 150, 110, { gain: -10, start: 170 }),
  adsr("buzz2", 2, 30, 0.5, 40),
  ["set-pitch", { voice: "buzz2", "slide-to": 110, over: 110 }],
  ["add-filter", { voice: "buzz2", type: "lowpass", cutoff: 800 }],
]);

// land: a low settling knock, a column of stone arriving at the bottom.
author("sfx-synth", "land", [
  voice("knock", "sine", 120, 260),
  env("knock", "punch"),
  ["set-pitch", { voice: "knock", "slide-to": 48, over: 220 }],
  voice("wood", "triangle", 240, 90, { gain: -8 }),
  env("wood", "pluck"),
  voice("grit", "noise", 0, 140, { gain: -14 }),
  env("grit", "pluck"),
  ["add-filter", { voice: "grit", type: "lowpass", cutoff: 700 }],
  voice("knock2", "sine", 90, 160, { gain: -9, start: 70 }),
  env("knock2", "pluck"),
  ["add-compressor", { threshold: 10, ratio: 3 }],
]);

// flaw: a dry crack, a stone giving way inside.
author("sfx-synth", "flaw", [
  voice("crack", "noise", 0, 70),
  env("crack", "pluck"),
  [
    "add-filter",
    { voice: "crack", type: "bandpass", cutoff: 3200, resonance: 1.4 },
  ],
  voice("snap", "square", 2200, 18, { gain: -8 }),
  env("snap", "pluck"),
  ["set-pitch", { voice: "snap", "slide-to": 700, over: 18 }],
  voice("split", "noise", 0, 50, { gain: -6, start: 38 }),
  env("split", "pluck"),
  ["add-filter", { voice: "split", type: "highpass", cutoff: 2400 }],
  voice("groan", "saw", 180, 140, { gain: -16, start: 10 }),
  env("groan", "linear"),
  ["set-pitch", { voice: "groan", "slide-to": 90, over: 140 }],
  ["add-filter", { voice: "groan", type: "lowpass", cutoff: 600 }],
]);

// cut: bright and metallic, a new stone struck on the bench.
author("sfx-synth", "cut", [
  voice("bell", "sine", 1320, 700),
  env("bell", "pluck"),
  ["add-fm", { voice: "bell", modulator: 3.5, index: 3.2 }],
  voice("shine", "sine", 2640, 500, { gain: -9, start: 30 }),
  env("shine", "pluck"),
  ["add-fm", { voice: "shine", modulator: 1.41, index: 1.5 }],
  voice("ting", "triangle", 3960, 200, { gain: -14, start: 60 }),
  env("ting", "pluck"),
  ["add-reverb", { size: 0.55, mix: 0.3 }],
]);

// levelup: a rising run of bells.
{
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  const ops: Op[] = [];
  notes.forEach((f, i) => {
    const n = `n${i}`;
    ops.push(
      voice(n, "sine", f, i === notes.length - 1 ? 900 : 360, {
        start: i * 85,
        gain: -3,
      }),
    );
    ops.push(env(n, "pluck"));
    ops.push(["add-fm", { voice: n, modulator: 2, index: 0.8 }]);
  });
  ops.push(voice("pad", "triangle", 523.25, 900, { start: 340, gain: -12 }));
  ops.push(env("pad", "swell"));
  ops.push(["add-reverb", { size: 0.7, mix: 0.35 }]);
  author("sfx-synth", "levelup", ops);
}

// gameover: a falling, dimming phrase.
{
  const notes = [783.99, 622.25, 523.25, 392.0];
  const ops: Op[] = [];
  notes.forEach((f, i) => {
    const n = `n${i}`;
    ops.push(
      voice(n, "triangle", f, i === notes.length - 1 ? 1100 : 300, {
        start: i * 210,
        gain: -4,
      }),
    );
    ops.push(env(n, i === notes.length - 1 ? "linear" : "pluck"));
  });
  ops.push(["set-pitch", { voice: "n3", "slide-to": 330, over: 1000 }]);
  ops.push(voice("low", "sine", 98, 1300, { start: 630, gain: -8 }));
  ops.push(env("low", "swell"));
  ops.push([
    "add-filter",
    { type: "lowpass", cutoff: 3000, "sweep-to": 900, over: 1600 },
  ]);
  ops.push(["add-reverb", { size: 0.75, mix: 0.35 }]);
  author("sfx-synth", "gameover", ops);
}

// The chain ladder: eight glass-bell tones of one timbre, rising up a
// pentatonic scale so a long chain climbs and then holds on the top rung.
{
  const ladder = [
    523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51,
  ];
  ladder.forEach((f, i) => {
    author("sfx-synth", `ladder-${i + 1}`, [
      voice("tone", "sine", f, 520, { gain: -2 }),
      env("tone", "pluck"),
      ["add-fm", { voice: "tone", modulator: 2.76, index: 1.1 }],
      voice("octave", "sine", f * 2, 300, { gain: -12 }),
      env("octave", "pluck"),
      voice("sub", "triangle", f / 2, 200, { gain: -14 }),
      env("sub", "pluck"),
      ["add-reverb", { size: 0.45, mix: 0.22 }],
    ]);
  });
}

// The shatter body under the clear cue: glass and debris from the sample pack.
author("sfx-sample", "shatter", [
  [
    "add-sample",
    { name: "debris_glass", t: 0, gain: 4, trim: "0,620", "fade-out": 220 },
  ],
  ["add-sample", { name: "snap_transient", t: 0, gain: 2 }],
  ["add-sample", { name: "impact_metal_dry", t: 4, gain: -8, pitch: 7 }],
  [
    "add-sample",
    {
      name: "debris_glass",
      t: 30,
      gain: -5,
      pitch: 5,
      trim: "0,400",
      "fade-out": 200,
    },
  ],
  ["add-compressor", { threshold: 12, ratio: 3 }],
]);

// ---- Music ----------------------------------------------------------------

type Note = [string, number, number, number?];

function piece(
  name: string,
  bpm: number,
  tracks: { name: string; instrument: string; fx: Flags; notes: Note[] }[],
  maxMs: number,
): void {
  const ops: Op[] = [
    ["set-tempo", { bpm }],
    ["set-time-signature", { num: 4, den: 4 }],
  ];
  for (const t of tracks) {
    ops.push(["define-track", { name: t.name, instrument: t.instrument }]);
    ops.push(["set-track-fx", { track: t.name, ...t.fx }]);
    for (const [pitch, at, dur, vel] of t.notes)
      ops.push([
        "add-note",
        { track: t.name, pitch, t: at, dur, velocity: vel ?? 90 },
      ]);
  }
  author("music", name, ops, maxMs);
}

// Title theme, 112 bpm, 8 bars in A minor, music box hook over vibraphone.
{
  const hookA: Note[] = [
    ["E5", 0, 0.5],
    ["A5", 0.5, 0.5],
    ["C6", 1, 0.5],
    ["B5", 1.5, 0.5],
    ["A5", 2, 1],
    ["E5", 3, 0.5],
    ["G5", 3.5, 0.5],
    ["F5", 4, 0.5],
    ["A5", 4.5, 0.5],
    ["C6", 5, 0.5],
    ["D6", 5.5, 0.5],
    ["E6", 6, 1.5],
    ["D6", 7.5, 0.5],
  ];
  const hookB: Note[] = [
    ["C6", 8, 0.5],
    ["B5", 8.5, 0.5],
    ["G5", 9, 0.5],
    ["E5", 9.5, 0.5],
    ["D5", 10, 1],
    ["G5", 11, 0.5],
    ["B5", 11.5, 0.5],
    ["A5", 12, 0.5],
    ["E5", 12.5, 0.5],
    ["C5", 13, 0.5],
    ["E5", 13.5, 0.5],
    ["A5", 14, 1.75],
  ];
  const melody: Note[] = [];
  for (const rep of [0, 16]) {
    for (const [p, t, d] of [...hookA, ...hookB])
      melody.push([p, t + rep, d, rep ? 96 : 88]);
  }
  // Answer phrase an octave up on the glockenspiel in the second half.
  const glock: Note[] = [
    ["E6", 22, 0.5, 60],
    ["D6", 22.5, 0.5, 60],
    ["C6", 23, 0.5, 60],
    ["B5", 23.5, 0.5, 60],
    ["A6", 30, 0.5, 64],
    ["E6", 30.5, 0.5, 60],
    ["C6", 31, 0.75, 56],
  ];
  const chords: [string[], number][] = [
    [["A3", "C4", "E4"], 0],
    [["F3", "A3", "C4"], 4],
    [["G3", "B3", "D4"], 8],
    [["A3", "C4", "E4"], 12],
    [["A3", "C4", "E4"], 16],
    [["F3", "A3", "C4"], 20],
    [["G3", "B3", "E4"], 24],
    [["A3", "C4", "E4"], 28],
  ];
  const vib: Note[] = [];
  for (const [notes, t] of chords) {
    for (const n of notes) {
      vib.push([n, t, 1.75, 62]);
      vib.push([n, t + 2, 1.75, 54]);
    }
  }
  const bassLine = ["A2", "F2", "G2", "A2", "A2", "F2", "G2", "A2"];
  const bass: Note[] = [];
  bassLine.forEach((n, i) => {
    bass.push([n, i * 4, 1.5, 80]);
    bass.push([n, i * 4 + 2, 0.5, 64]);
    bass.push([n.replace("2", "3"), i * 4 + 3, 0.75, 60]);
  });
  piece(
    "title",
    112,
    [
      {
        name: "hook",
        instrument: "music_box",
        fx: { gain: 7, reverb: 0.3 },
        notes: melody,
      },
      {
        name: "glock",
        instrument: "glockenspiel",
        fx: { gain: 0, reverb: 0.4, pan: 0.3 },
        notes: glock,
      },
      {
        name: "chords",
        instrument: "vibraphone",
        fx: { gain: 1, reverb: 0.35, pan: -0.2 },
        notes: vib,
      },
      {
        name: "bass",
        instrument: "marimba",
        fx: { gain: 4, reverb: 0.15 },
        notes: bass,
      },
    ],
    20000,
  );
}

// Play bed, 76 bpm, 16 bars: sparse marimba and vibraphone that stays out of
// the way of the board.
{
  const prog: [string[], string][] = [
    [["D4", "F4", "A4"], "D3"],
    [["Bb3", "D4", "F4"], "Bb2"],
    [["C4", "E4", "G4"], "C3"],
    [["A3", "C4", "E4"], "A2"],
  ];
  const pads: Note[] = [];
  const pulse: Note[] = [];
  const bass: Note[] = [];
  const bells: Note[] = [];
  for (let bar = 0; bar < 16; bar++) {
    const [chord, root] = prog[bar % 4];
    const t = bar * 4;
    for (const n of chord) pads.push([n, t, 3.75, 46]);
    // A soft arpeggio pulse on the marimba.
    const arp = [chord[0], chord[1], chord[2], chord[1]];
    arp.forEach((n, i) =>
      pulse.push([
        n.replace(/\d/, (d) => String(Number(d) + 1)),
        t + i,
        0.5,
        50 + (i === 0 ? 10 : 0),
      ]),
    );
    bass.push([root, t, 2.5, 66]);
    bass.push([root, t + 3, 0.75, 50]);
  }
  const motif: Note[] = [
    ["A5", 4, 1],
    ["F5", 5, 0.5],
    ["G5", 5.5, 0.5],
    ["E5", 6, 1.5],
    ["D5", 20, 1],
    ["E5", 21, 0.5],
    ["F5", 21.5, 0.5],
    ["A5", 22, 1.5],
    ["C6", 36, 1],
    ["Bb5", 37, 0.5],
    ["A5", 37.5, 0.5],
    ["G5", 38, 1.5],
    ["F5", 52, 1],
    ["E5", 53, 0.5],
    ["D5", 53.5, 0.5],
    ["E5", 54, 2],
  ];
  for (const [p, t, d] of motif) bells.push([p, t, d, 52]);
  piece(
    "play",
    76,
    [
      {
        name: "pads",
        instrument: "vibraphone",
        fx: { gain: 1, reverb: 0.45 },
        notes: pads,
      },
      {
        name: "pulse",
        instrument: "marimba",
        fx: { gain: 2, reverb: 0.3, pan: 0.25 },
        notes: pulse,
      },
      {
        name: "bass",
        instrument: "marimba",
        fx: { gain: 5, reverb: 0.15, pan: -0.15 },
        notes: bass,
      },
      {
        name: "bells",
        instrument: "music_box",
        fx: { gain: 3, reverb: 0.5, pan: -0.3 },
        notes: bells,
      },
    ],
    60000,
  );
}
