// The live particle layer: the produced `particle-2d` systems, played through
// `@clockwyrks/particle-runtime`'s canvas binding at the cells the state names.
//
// A particle system is simulated rather than posed, so each running effect
// carries its own simulator. That is presentation, not game state: the layer
// only ever reads the state it is drawn from, keeps each effect on the game
// clock it was started against, and lets go of an effect once it has run out.

import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";

interface Running {
  readonly player: ParticleCanvasPlayer;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly startedAt: number;
  readonly duration: number;
  readonly loop: boolean;
  t: number;
  wanted: boolean;
}

/**
 * A context whose `canvas` reports a square of `size` logical units, so the
 * player fits the system's field onto that square under whatever transform the
 * caller has set. Every draw goes straight through to the real context.
 */
function fieldContext(
  ctx: CanvasRenderingContext2D,
  size: number,
): CanvasRenderingContext2D {
  const canvas = { width: size, height: size };
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === "canvas") return canvas;
      const value: unknown = Reflect.get(target, prop);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    },
  });
}

/** The radius one unit of particle size draws at, in logical units. */
const PIXEL_RADIUS = 3.5;

export class FxLayer {
  private readonly running = new Map<string, Running>();
  private readonly contexts = new WeakMap<
    CanvasRenderingContext2D,
    Map<number, CanvasRenderingContext2D>
  >();
  private clock = 0;

  /** Opens a frame drawn at game time `now`. */
  begin(now: number): void {
    if (now < this.clock) this.running.clear();
    this.clock = now;
    for (const r of this.running.values()) if (r.loop) r.wanted = false;
  }

  private context(ctx: CanvasRenderingContext2D, size: number) {
    let bySize = this.contexts.get(ctx);
    if (!bySize) {
      bySize = new Map();
      this.contexts.set(ctx, bySize);
    }
    let field = bySize.get(size);
    if (!field) {
      field = fieldContext(ctx, size);
      bySize.set(size, field);
    }
    return field;
  }

  private start(
    ctx: CanvasRenderingContext2D,
    key: string,
    system: ParticleSystem,
    x: number,
    y: number,
    startedAt: number,
  ): Running {
    const size = Math.max(system.field.width, system.field.height);
    ctx.save();
    ctx.globalAlpha = 0;
    const player = new ParticleCanvasPlayer(system, this.context(ctx, size), {
      clear: false,
      pixelRadius: PIXEL_RADIUS,
    });
    ctx.restore();
    const r: Running = {
      player,
      x,
      y,
      size,
      startedAt,
      duration: system.durationMs / 1000,
      loop: system.loop,
      t: 0,
      wanted: true,
    };
    this.running.set(key, r);
    return r;
  }

  /** A one-shot that began at game time `startedAt`, played once through. */
  oneShot(
    ctx: CanvasRenderingContext2D,
    key: string,
    system: ParticleSystem | undefined,
    x: number,
    y: number,
    startedAt: number,
  ): void {
    if (!system || this.running.has(key)) return;
    if (this.clock - startedAt >= system.durationMs / 1000) return;
    this.start(ctx, key, system, x, y, startedAt);
  }

  /** A continuous effect, kept running for as long as it is asked for. */
  continuous(
    ctx: CanvasRenderingContext2D,
    key: string,
    system: ParticleSystem | undefined,
    x: number,
    y: number,
  ): void {
    if (!system) return;
    const held = this.running.get(key);
    if (held) {
      held.wanted = true;
      return;
    }
    // A fresh aura starts part-way into its loop so it never pops in empty.
    const r = this.start(ctx, key, system, x, y, this.clock - 1);
    r.player.simulator.step(1000);
    r.t = 1;
  }

  /** Composites every running effect and lets go of the finished ones. */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const [key, r] of this.running) {
      const local = this.clock - r.startedAt;
      if (!r.wanted || (!r.loop && local >= r.duration)) {
        this.running.delete(key);
        continue;
      }
      const dt = Math.max(0, Math.min(0.25, local - r.t));
      r.t = local;
      ctx.save();
      ctx.translate(r.x - r.size / 2, r.y - r.size / 2);
      r.player.update(dt);
      ctx.restore();
    }
  }

  /** How many effects are running, for tests and the overlay. */
  count(): number {
    return this.running.size;
  }
}
