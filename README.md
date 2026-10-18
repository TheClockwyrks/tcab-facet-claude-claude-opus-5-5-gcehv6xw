# Facet

**Facet** is a gem-matching puzzle game that runs entirely in the browser. Swap
neighbouring gems on an 8 × 8 board to line up three or more of one kind and
shatter them. Every clear strains the stones beside it; a stone strained three
times is *flawed*, shatters with any clear that touches it, and scores double.
Lines of four, crossing lines, and lines of five cut special stones — the
brilliant, the star, and the prism — that clear a ring, a row and column, or
every gem of one kind. Each level asks for more points than the last, and the
round ends when no productive move is left.

It is built on the Simple 2D engine (`@clockwyrks/simple-2d`), with live
particle effects played through `@clockwyrks/particle-runtime`. All art, effects,
sound, and music were produced for this build and are committed under
`public/assets/`.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173/>).

## Production build

```sh
npm run build
```

This type-checks and writes a self-contained static site to `dist/`, with
`dist/index.html` as its entry point. Every asset reference is relative, so the
directory can be served from the root of any static host or from a sub-path.
`npm run preview` serves the built site locally for a final check.

## Controls

| Where | Input | Does |
| --- | --- | --- |
| Board | Press a gem, drag it onto a neighbour, release | Plays the swap (dragging back to where you started plays nothing) |
| Board | Tap a gem, then tap a neighbour | Offers the swap; releasing plays it |
| Board | Tap off the board | Clears the selection |
| Menus | Mouse, pen, or touch on an item | Highlights on hover or press, chooses on release |
| Menus | ↑ / ↓ arrows | Move the highlight |
| Menus | Enter or Space | Choose the highlighted item |
| Anywhere it applies | Escape | Pause the board / back out of How to Play and Game Over |
| Board | P (or Escape), or the **PAUSE** button | Pause and resume |
| Anywhere | M | Mute or unmute all sound |
| Anywhere | ` (backtick) | Toggle the engine's debug overlay |

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format      # Prettier, check mode
npm test            # Vitest with coverage
```

## Project layout

- `src/game.ts` — the state types, the debug-surface type, and the `game`
  object the engine drives (`initialize`, `update`, `render`).
- `src/rules.ts` — runs, the move rules, and one chain step (seed, expand,
  score, strain, remove, cut, settle).
- `src/sim.ts` — every state transition: screens, menus, the pointer, swaps,
  and the chain timeline.
- `src/debug.ts` — the debug and automation surface.
- `src/media.ts`, `src/render.ts`, `src/fx.ts` — loading the produced files,
  drawing every screen, and playing the particle systems.
- `src/board.ts` — cell geometry and the board notation.
- `tools/assets/` — the one-time scripts that produced `public/assets/` with
  the asset tools (`draw`, `draw-sheet`, `particle-2d`, `sfx-synth`,
  `sfx-sample`, `music`). The build never runs them; it only bundles the
  committed files.
- `showcase/` — the store-page description, screenshots, and a replay.
