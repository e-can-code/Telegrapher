// Celestial coordinates describe ordering and membership, not simulated N-body physics.
// Every layout returns the same object model and can be animated without reordering words.
const TAU = Math.PI * 2;
const frac = x => x - Math.floor(x);
const hash = (i, j = 0) => frac(Math.sin(i * 127.1 + j * 311.7 + 17.2) * 43758.5453);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const LAYOUT_NAMES = ['Solitary Luminary', 'Binary Dance', 'Celestial Waltz', 'Fourfold Meridian', 'Little Celestial Garden', 'Growing Orbit', 'Spiral Seed', 'Double Orbit', 'Spiral Observatory', 'Celestial Archipelago', 'Deep Sky Atlas'];
export function familyFor(n) { return n <= 7 ? Math.max(0, n - 1) : n <= 12 ? 7 : n <= 35 ? 8 : n <= 100 ? 9 : 10; }
export function createCelestialLayout(words, groupsHint = []) {
  const n = words.length, family = familyFor(n);
  const groups = [];
  if (n > 35) {
    // An unconfirmed pause grouping is a navigational family, never called a sentence.
    const groupSize = n <= 100 ? 12 : 25;
    const groupCount = Math.ceil(n / groupSize);
    for (let first = 0; first < n; first += groupSize) {
      const last = Math.min(n, first + groupSize), h = groups.length;
      const angle = groupCount <= 7 ? h * TAU / groupCount - .75 : h * 2.39996322972865;
      const radius = groupCount <= 7 ? 1.12 : .4 + .58 * Math.sqrt(h);
      groups.push({ first, last, title: `Passage ${h + 1}`, start: words[first].start,
        x: Math.cos(angle) * radius, y: Math.sin(h * 1.67) * .42,
        z: Math.sin(angle) * radius * .68, phase: angle, rate: .008 });
    }
  } else groups.push({ first: 0, last: n, title: 'Recording', start: words[0]?.start || 0,
    x: 0, y: 0, z: 0, phase: 0, rate: 0 });
  const points = words.map((_, i) => {
    let x = 0, y = 0, z = 0, rate = .009;
    if (n === 1) { /* A single word opens at the focused scale. */ }
    else if (n === 2) { const a = i * Math.PI; x = Math.cos(a) * .82; z = Math.sin(a + .48) * .47; y = Math.sin(a + .3) * .19; rate = .023; }
    else if (n === 3 || n === 4) { const a = i * TAU / n - .54; x = Math.cos(a) * 1.08; y = Math.sin(a) * .39; z = Math.sin(a) * .62; rate = .018; }
    else if (n === 5) { const a = -2.1 + i * 1.19, r = .75 + i * .13; x = Math.cos(a) * r; z = Math.sin(a) * r * .58; y = Math.sin(a * 1.13) * .33; rate = .014; }
    else if (n === 6) {
      // Six words form a spacious inclined orbital family, not the spiral seed.
      const a = -.62 + i * TAU / 6;
      const radius = 1.34 + .11 * Math.cos(i * 2.3);
      x = Math.cos(a) * radius; z = Math.sin(a) * radius * .72;
      y = .58 * Math.sin(a + .35) + .10 * Math.cos(i * 1.9);
      rate = .010;
    }
    else if (n === 7) { const a = -.8 + i * .99, r = .35 + i * .23; x = Math.cos(a) * r; z = Math.sin(a) * r * .75; y = Math.sin(a * .83) * .35; rate = .012; }
    else if (n <= 12) {
      const innerCount = Math.ceil(n * .44), inner = i < innerCount, j = inner ? i : i - innerCount;
      const count = inner ? innerCount : n - innerCount;
      const a = -.4 + j / count * TAU + (inner ? .12 : -.1), r = inner ? .83 : 1.72;
      x = Math.cos(a) * r; z = Math.sin(a) * r * .73; y = Math.sin(a) * (inner ? .28 : .47);
      rate = inner ? .016 : .011;
    } else if (n <= 35) {
      const a = -.3 + i * .53, r = .29 + 2.85 * Math.pow(i / (n - 1), .83);
      x = Math.cos(a) * r; z = Math.sin(a) * r * .76; y = Math.sin(a) * .43 + Math.sin(i * .62) * .12;
      rate = .01 / (1 + r * .11);
    } else {
      const g = groups.find(group => i >= group.first && i < group.last);
      const index = i - g.first, size = g.last - g.first;
      const a = index * (size > 15 ? .54 : .73) - 1.5, r = .15 + 1.12 * (index + 1) / size;
      x = g.x * 2.1 + Math.cos(a) * r * .72;
      y = g.y * 1.8 + Math.sin(a) * .32;
      z = g.z * 2.1 + Math.sin(a) * r * .6;
      rate = .006;
    }
    return { x, y, z, rate, seed: hash(i, 2), index: i, groupIndex: groups.findIndex(g => i >= g.first && i < g.last) };
  });
  return { family, name: LAYOUT_NAMES[family], points, groups, count: n };
}
export function orbitalPosition(point, time, reduced = false) {
  const phase = reduced ? 0 : time * point.rate;
  const cos = Math.cos(phase), sin = Math.sin(phase);
  return { x: point.x * cos - point.z * sin,
    y: point.y + (reduced ? 0 : .033 * Math.sin(time * .11 + point.index)),
    z: point.x * sin + point.z * cos };
}
export function groupPosition(group, time, reduced = false) {
  const a = reduced ? 0 : time * group.rate;
  return { x: group.x * Math.cos(a) - group.z * Math.sin(a), y: group.y,
    z: group.x * Math.sin(a) + group.z * Math.cos(a) };
}
export function groupForIndex(layout, index) { return layout.groups.findIndex(g => index >= g.first && index < g.last); }
export function wordSignature(tones, word) {
  const matches = tones.filter(e => e.start < word.end && e.end > word.start);
  if (!matches.length) return { ratio: .34, density: 1, regularity: .5, elementCount: 0, ringCount: 4 };
  const lengths = matches.map(e => e.end - e.start).sort((a, b) => a - b);
  const short = lengths[Math.floor(lengths.length * .24)] || lengths[0];
  const dahs = lengths.filter(x => x > short * 1.7).length;
  const count = matches.length;
  const ringCount = count <= 3 ? 3 : count <= 6 ? 4 : count <= 10 ? 5 : count <= 15 ? 6 : count <= 22 ? 7 : 8;
  return { elementCount: count, ringCount, ratio: dahs / matches.length,
    density: clamp(matches.length / 20, 0, 1), regularity: clamp(short / (lengths[lengths.length - 1] || short), 0, 1) };
}
