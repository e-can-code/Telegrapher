import {alphabet} from './morse.js';

const codes = new Set(Object.values(alphabet));
const prefixes = new Set([...codes].flatMap(code => [...code].map((_, i) => code.slice(0, i + 1))));
const LOG2PI = Math.log(2 * Math.PI);

// Log-normal timing accommodates positive durations and occasional long tails.
function logDensity(ms, median, spread) {
  const x = Math.max(1, ms), z = Math.log(x / median) / spread;
  return -Math.log(x * spread) - (LOG2PI + z * z) / 2;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function timingProfile(style = 'comfortable') {
  const units = {meandering: 225, comfortable: 145, flowing: 92, swift: 59};
  return {unit: units[style] || units.comfortable, markSpread: 0.52, gapSpread: 0.78, hesitationWeight: 0.12};
}

// A broad hesitation component prevents a long thinking pause from becoming certainty.
function gapScore(duration, kind, profile) {
  const factor = {inside: 1, letter: 3, word: 7}[kind];
  const ordinary = Math.log(1 - profile.hesitationWeight) + logDensity(duration, profile.unit * factor, profile.gapSpread);
  const hesitation = Math.log(profile.hesitationWeight) + logDensity(duration, profile.unit * 13, 1.15);
  const high = Math.max(ordinary, hesitation);
  return high + Math.log(Math.exp(ordinary - high) + Math.exp(hesitation - high));
}
function markScore(duration, kind, profile) {
  return logDensity(duration, profile.unit * (kind === '-' ? 3 : 1), profile.markSpread);
}

// Beam search scores whole sequences, not individual gaps in isolation.
// Explicit boundaries are constraints; inferred boundaries remain alternatives.
export function decodeEvents(events, profile = timingProfile(), limit = 4) {
  if (!events.length) return [];
  let beam = [{chars: [], current: '', score: 0, decisions: []}];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const choices = [];
    for (const hypothesis of beam) {
      const markKinds = event.forcedMark ? [event.forcedMark] : ['.', '-'];
      const gapKinds = i === 0 ? ['letter'] : event.explicitGap ? [event.explicitGap] : ['inside', 'letter', 'word'];
      for (const mark of markKinds) for (const gap of gapKinds) {
        if (gap === 'inside' && !hypothesis.current) continue;
        if (gap !== 'inside' && hypothesis.current && !codes.has(hypothesis.current)) continue;
        const current = gap === 'inside' ? hypothesis.current + mark : mark;
        if (!prefixes.has(current)) continue;
        const chars = gap === 'inside' ? hypothesis.chars : hypothesis.current ? [...hypothesis.chars, {marks: hypothesis.current, wordBefore: false}] : hypothesis.chars;
        const nextChars = chars.map(c => ({...c}));
        // A word boundary applies to the newly started character, not the preceding one.
        const boundaries = [...hypothesis.decisions, {mark, gap}];
        const score = hypothesis.score + markScore(event.durationMs, mark, profile)
          + (i ? gapScore(event.gapMs, gap, profile) : 0)
          + (gap === 'word' ? -0.65 : 0);
        choices.push({chars: nextChars, current, score, decisions: boundaries});
      }
    }
    // Keep multiple hypotheses with distinct paths; do not collapse uncertainty early.
    beam = choices.sort((a,b) => b.score-a.score).slice(0, Math.max(24, limit * 16));
    if (!beam.length) return [];
  }
  const completed = beam.filter(h => codes.has(h.current)).map(h => {
    const chars = [...h.chars, {marks: h.current, wordBefore: false}];
    let idx = 0;
    for (let i = 0; i < h.decisions.length; i++) {
      if (i && h.decisions[i].gap !== 'inside') idx++;
      if (h.decisions[i].gap === 'word' && idx < chars.length) chars[idx].wordBefore = true;
    }
    return {chars, score: h.score, decisions: h.decisions};
  });
  const unique = new Map();
  for (const h of completed.sort((a,b) => b.score-a.score)) {
    const key = JSON.stringify(h.chars);
    if (!unique.has(key)) unique.set(key,h);
    if (unique.size >= limit) break;
  }
  return [...unique.values()].map((h, i, all) => ({...h, relativeScore: Math.exp(clamp(h.score - all[0].score, -50, 0))}));
}

// Profiles only learn from explicit, aligned labels, never from decoder guesses.
export function updateProfile(profile, labeledEvents) {
  const normalizedMarks = labeledEvents.filter(e => e.confirmedMark === '.' || e.confirmedMark === '-')
    .map(e => e.durationMs / (e.confirmedMark === '-' ? 3 : 1)).filter(x => x >= 35 && x <= 650);
  if (normalizedMarks.length < 12) return {...profile};
  normalizedMarks.sort((a,b) => a-b);
  const median = normalizedMarks[Math.floor(normalizedMarks.length / 2)];
  return {...profile, unit: clamp(profile.unit * 0.85 + median * 0.15, 45, 300)};
}
