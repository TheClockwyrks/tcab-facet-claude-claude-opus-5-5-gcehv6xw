// The produced files the game draws and plays (specs/assets.md), loaded once
// during `initialize` through the engine's asset and audio APIs.
//
// Loaded images, parsed particle systems, and decoded audio are not game state:
// they never change once loaded and nothing about play depends on them, so they
// are held here rather than in `FacetState`, which stays plain data.

import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import { CUES, GEM_KINDS, MAX_MULTIPLIER, MAX_STRAIN } from "./constants";
import type { FacetState, GemKind } from "./game";

export type Sprite = CanvasImageSource & { readonly width: number };

export interface Media {
  /** `${kind}-${strain}` and `prism-${strain}`. */
  readonly gems: ReadonlyMap<string, Sprite>;
  /** Break sequences by kind, and `prism`. */
  readonly breaks: ReadonlyMap<string, readonly Sprite[]>;
  /** The prism's idle turn at each strain. */
  readonly prismTurn: readonly (readonly Sprite[])[];
  readonly brilliant: Sprite | null;
  readonly star: Sprite | null;
  readonly frame: Sprite | null;
  readonly fx: ReadonlyMap<string, ParticleSystem>;
}

export const BREAK_FRAMES = 8;
export const PRISM_TURN_FRAMES = 12;

/** The loop cues for the two pieces of music, beside the nine event cues. */
export const THEME_TITLE = "theme-title";
export const THEME_PLAY = "theme-play";

/** The chain ladder's rung `n` (1..MAX_MULTIPLIER), a source of `clear`. */
export function rungCue(n: number): string {
  return `${CUES.clear}-${Math.max(1, Math.min(MAX_MULTIPLIER, n))}`;
}

const EMPTY_MEDIA: Media = {
  gems: new Map(),
  breaks: new Map(),
  prismTurn: [],
  brilliant: null,
  star: null,
  frame: null,
  fx: new Map(),
};

let loaded: Media = EMPTY_MEDIA;

/** The produced files, once `loadMedia` has settled. */
export function media(): Media {
  return loaded;
}

const FX_NAMES = [
  ...GEM_KINDS.map((k) => `clear-${k}`),
  "clear-prism",
  "flaw",
  "cutflash",
  "aura-brilliant",
  "aura-star",
  "aura-prism",
];

/**
 * Each cue is declared first as a small synthesized stand-in and then rebound
 * to its produced file, so the name is always playable: the stand-in is only
 * ever heard where the file could not be fetched at all.
 */
const CUE_FILES: readonly [string, string, CueSpec][] = [
  [CUES.select, "audio/select.wav", { freq: 1400, durationMs: 40 }],
  [CUES.swap, "audio/swap.wav", { freq: 600, freqTo: 900, durationMs: 90 }],
  [
    CUES.refuse,
    "audio/refuse.wav",
    { wave: "square", freq: 140, durationMs: 140 },
  ],
  [
    CUES.clear,
    "audio/shatter.wav",
    { freq: 900, freqTo: 300, durationMs: 120 },
  ],
  [CUES.land, "audio/land.wav", { freq: 110, freqTo: 50, durationMs: 160 }],
  [
    CUES.flaw,
    "audio/flaw.wav",
    { wave: "sawtooth", freq: 300, durationMs: 60 },
  ],
  [CUES.cut, "audio/cut.wav", { freq: 1320, durationMs: 300 }],
  [
    CUES.levelUp,
    "audio/levelup.wav",
    { freq: 520, freqTo: 1040, durationMs: 500 },
  ],
  [
    CUES.gameOver,
    "audio/gameover.wav",
    { freq: 400, freqTo: 150, durationMs: 700 },
  ],
  ...Array.from(
    { length: MAX_MULTIPLIER },
    (_, i): [string, string, CueSpec] => [
      rungCue(i + 1),
      `audio/ladder-${i + 1}.wav`,
      { freq: 520 * Math.pow(2, i / 8), durationMs: 200, gain: 0.12 },
    ],
  ),
  [THEME_TITLE, "audio/title.wav", { freq: 220, durationMs: 1000, gain: 0 }],
  [THEME_PLAY, "audio/play.wav", { freq: 220, durationMs: 1000, gain: 0 }],
];

/** Loads every produced file; resolves once every load has settled. */
export async function loadMedia(api: InitApi<FacetState>): Promise<Media> {
  const failures: string[] = [];
  const image = (path: string): Promise<Sprite | null> =>
    api.assets.loadImage(path).catch(() => {
      failures.push(path);
      return null;
    });
  const sequence = async (dir: string, n: number): Promise<Sprite[]> => {
    const frames = await Promise.all(
      Array.from({ length: n }, (_, i) => image(`${dir}/${i}.png`)),
    );
    return frames.filter((f): f is Sprite => f !== null);
  };

  const gemNames: string[] = [];
  for (const kind of [...GEM_KINDS, "prism"])
    for (let s = 0; s <= MAX_STRAIN; s++) gemNames.push(`${kind}-${s}`);

  const audio = Promise.all(
    CUE_FILES.map(([cue, path, spec]) => {
      api.audio.define(cue, spec);
      return api.audio.load(cue, path).catch(() => {
        failures.push(path);
      });
    }),
  );

  const [gemImages, breaks, turns, brilliant, star, frame, systems] =
    await Promise.all([
      Promise.all(gemNames.map((n) => image(`gems/${n}.png`))),
      Promise.all(
        [...GEM_KINDS, "prism"].map((k) =>
          sequence(`gems/break/${k}`, BREAK_FRAMES),
        ),
      ),
      Promise.all(
        Array.from({ length: MAX_STRAIN + 1 }, (_, s) =>
          sequence(`gems/prism-turn/${s}`, PRISM_TURN_FRAMES),
        ),
      ),
      image("gems/brilliant.png"),
      image("gems/star.png"),
      image("gems/frame.png"),
      Promise.all(
        FX_NAMES.map((name) =>
          api.assets
            .load(`fx/${name}.json`)
            .then(
              async (blob) => JSON.parse(await blob.text()) as ParticleSystem,
            )
            .catch(() => {
              failures.push(`fx/${name}.json`);
              return null;
            }),
        ),
      ),
      audio,
    ]);

  const gems = new Map<string, Sprite>();
  gemNames.forEach((n, i) => {
    const img = gemImages[i];
    if (img) gems.set(n, img);
  });
  const breakMap = new Map<string, Sprite[]>();
  [...GEM_KINDS, "prism"].forEach((k, i) => breakMap.set(k, breaks[i]));
  const fx = new Map<string, ParticleSystem>();
  FX_NAMES.forEach((n, i) => {
    const sys = systems[i];
    if (sys) fx.set(n, sys);
  });

  if (failures.length > 0)
    console.warn(
      `Facet: ${failures.length} produced files did not load`,
      failures,
    );

  loaded = {
    gems,
    breaks: breakMap,
    prismTurn: turns,
    brilliant,
    star,
    frame,
    fx,
  };
  return loaded;
}

/** The sprite a resting gem of this kind and strain draws with. */
export function gemSprite(kind: GemKind | null, strain: number): Sprite | null {
  return loaded.gems.get(`${kind ?? "prism"}-${strain}`) ?? null;
}
