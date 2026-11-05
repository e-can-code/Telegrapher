// The tactile vocabulary mirrors the key's physical state, not audio duration.
// Native Android vibration is preferred; web vibration is best-effort.
export const HAPTIC_MODES = Object.freeze(['off', 'gentle', 'crafted', 'expressive']);
export function hapticPattern(mode, event) {
  if (!HAPTIC_MODES.includes(mode) || mode === 'off') return 0;
  const patterns = {
    gentle: {contact: 9, threshold: 0, release: 0},
    crafted: {contact: 12, threshold: 23, release: 0},
    expressive: {contact: 17, threshold: 32, release: 9}
  };
  return patterns[mode]?.[event] ?? 0;
}
export function tactileEvent(mode, event) {
  const duration = hapticPattern(mode, event);
  if (!duration) return;
  try {
    if (window.AndroidHaptics?.pulse) {
      window.AndroidHaptics.pulse(event, mode);
    } else if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration);
    }
  } catch { /* Unsupported devices must never interrupt Morse input. */ }
}
