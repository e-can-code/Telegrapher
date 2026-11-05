// Input boundaries are final after the style-specific deadline; no silent reopening.
export const INPUT = {
  meandering: {dah: 210, letter: 900, word: 3500},
  comfortable: {dah: 155, letter: 650, word: 2900},
  flowing: {dah: 115, letter: 450, word: 2000},
  swift: {dah: 85, letter: 300, word: 1400}
};
export function classifyMark(duration, band='comfortable') {
  return duration >= (INPUT[band] || INPUT.comfortable).dah ? '-' : '.';
}
export function classifyGap(duration, band='comfortable') {
  const b=INPUT[band] || INPUT.comfortable;
  return duration>=b.word?'word':duration>=b.letter?'letter':'inside';
}
// The live state machine and the next press use this same elapsed-time rule.
export function boundaryState(duration, band='comfortable', explicit=null) {
  return explicit || classifyGap(duration,band);
}
// Compatibility for callers: inferred boundaries are never reopened.
export function interpretGap(duration,band,previous,explicit=false) {
  return {gap:classifyGap(duration,band),reconsidered:false};
}
