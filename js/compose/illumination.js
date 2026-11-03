// Visual-only light engine. Input recognition and sound never depend on animation.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

export const GATHER = Object.freeze({
  initialDiameterPx: 6,
  maximumDiameterPx: 54,
  gatherMs: 7000,       // Preserve the seven-second gathering animation users preferred.
  releaseMs: 180,      // A brief outward wave follows actuation without delaying sound.
  fadeMs: 260,         // One wave fades before it can obscure the central light.
  hoverBreathMs: 2400, // At full size, brightness shimmers but diameter stays fixed.
});

// Pure frame calculation supports deterministic testing and tuning.
export function lightFrame(kind, elapsedMs, unitMs) {
  const ms = Math.max(0, elapsedMs);
  const units = ms / Math.max(1, unitMs);
  if (kind === 'press') {
    const travel = smooth(ms / GATHER.releaseMs);
    const fade = 1 - smooth(Math.max(0, ms - 35) / GATHER.fadeMs);
    return {
      expansion: travel,
      centerScale: 1 - 0.24 * travel,
      centerGlow: 0.85 - 0.18 * travel,
      opacity: 0.72 * fade,
      halo: fade,
      units,
    };
  }
  const gathered = smooth(ms / GATHER.gatherMs);
  const settled = Math.max(0, ms - GATHER.gatherMs);
  const shimmer = settled ? Math.sin(2 * Math.PI * settled / GATHER.hoverBreathMs) : 0;
  return {
    expansion: 0,
    centerScale: 1 + (GATHER.maximumDiameterPx / GATHER.initialDiameterPx - 1) * gathered,
    centerGlow: 0.50 + 0.38 * gathered + 0.055 * shimmer * gathered,
    opacity: 0,
    halo: 0,
    units,
  };
}

export class Illumination {
  constructor(key) {
    this.key = key;
    this.press = key.querySelector('.press-light');
    this.core = key.querySelector('.key-disc-core');
    this.ambient = key.querySelector('.key-face-ambient');
    this.rings = key.querySelector('.gather-rings');
    this.active = { kind: 'pause', start: performance.now(), unit: 120 };
    this.coreScale = 1;
    this.fromScale = 1;
    this.lastPressScale = 1;
    this.seen = new Set();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
  }
  begin(unit) {
    // Capture the current size: pressing never snaps a gathered core to a tiny dot.
    this.fromScale = this.coreScale;
    this.active = { kind: 'press', start: performance.now(), unit };
    this.seen.clear();
  }
  release(unit) {
    // Start gathering from the current size, rather than restarting at zero.
    this.fromScale = this.coreScale;
    this.active = { kind: 'pause', start: performance.now(), unit };
    this.seen.clear();
  }
  reset() {
    this.fromScale = 1;
    this.coreScale = 1;
    this.active = { kind: 'pause', start: performance.now(), unit: 120 };
    this.seen.clear();
  }
  loop(now) {
    const { kind, start, unit } = this.active;
    const elapsed = Math.max(0, now - start);
    const frame = lightFrame(kind, elapsed, unit);
    const guidance = this.key.dataset.guidance || 'gentle';
    const reduced = this.reduced.matches;
    // Only the central core and one borderless radial wave are rendered.
    if (guidance === 'off' || reduced) {
      this.press.style.opacity = '0';
      this.coreScale = reduced ? 3 : 1;
      this.core.style.transform = `scale(${this.coreScale})`;
      this.core.style.boxShadow = reduced ? '0 0 14px #e9d4a566' : 'none';
      this.ambient.style.setProperty('--ambient-strength', reduced ? '.55' : '.25');
    } else {
      const strength = guidance === 'minimal' ? 0.4 : 1;
      if (kind === 'press') {
        // A single outward wave starts at the existing core and fades naturally.
        const travel = smooth(elapsed / GATHER.releaseMs);
        this.coreScale = this.fromScale * (1 - 0.24 * travel);
        this.press.style.opacity = String(frame.opacity * strength);
        this.press.style.transform = `scale(${0.20 + 0.90 * travel})`;
      } else {
        // Retain the original seven-second gather curve after a smooth handoff.
        const gathered = smooth(elapsed / GATHER.gatherMs);
        const maximumScale = GATHER.maximumDiameterPx / GATHER.initialDiameterPx;
        this.coreScale = this.fromScale + (maximumScale - this.fromScale) * gathered;
        this.press.style.opacity = '0';
      }
      this.core.style.transform = `scale(${this.coreScale})`;
      // Fixed rings awaken sequentially as the core gathers toward its resting size.
      const progress = clamp((this.coreScale - 1) / (GATHER.maximumDiameterPx / GATHER.initialDiameterPx - 1), 0, 1);
      this.rings?.style.setProperty('--ring-one', String(smooth(progress / .38)));
      this.rings?.style.setProperty('--ring-two', String(smooth((progress - .25) / .48)));
      this.rings?.style.setProperty('--ring-three', String(smooth((progress - .58) / .42)));
      // The interior glow follows the same energy as the center, without adding new motion.
      this.ambient.style.setProperty('--ambient-strength', String((0.38 + frame.centerGlow * 0.52) * strength));
      this.core.style.setProperty('--core-glow', String(frame.centerGlow * strength));
      this.core.style.boxShadow = `0 0 ${Math.round(5 + frame.centerGlow * 12)}px ${Math.round(1 + frame.centerGlow * 3)}px #e9d5a777`;
    }
    this.frame = requestAnimationFrame(this.loop);
  }
  destroy() { cancelAnimationFrame(this.frame); }
}
