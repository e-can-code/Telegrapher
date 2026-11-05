// Deterministic envelope analysis. Silence boundaries are hypotheses for imported WAVs,
// not decoded text. Generated-message metadata can supersede them in a later release.
export function detectSignal(samples, sampleRate, duration) {
  if (!samples?.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return {words:[],tones:[]};
  const hop = Math.max(1, Math.round(sampleRate * .012));
  const energies = [];
  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0, count = 0;
    for (let j = i; j < Math.min(samples.length, i + hop); j++) { sum += samples[j] * samples[j]; count++; }
    energies.push(Math.sqrt(sum / Math.max(1, count)));
  }
  let peak = 0; for (const value of energies) if (value > peak) peak = value;
  if (peak < .0003) return {words:[],tones:[]};
  const threshold = Math.max(.0006, peak * .14);
  const active = energies.map(e => e >= threshold);
  // Bridge small envelope dips caused by waveform envelopes, not real Morse gaps.
  for (let i = 1; i < active.length - 1; i++) if (!active[i] && active[i-1] && active[i+1]) active[i] = true;
  const runs = []; let start = -1;
  for (let i = 0; i <= active.length; i++) {
    if (i < active.length && active[i] && start < 0) start = i;
    if ((i === active.length || !active[i]) && start >= 0) {
      const end = i; if (end - start >= 2) runs.push({start: start * hop / sampleRate, end: Math.min(duration, end * hop / sampleRate)});
      start = -1;
    }
  }
  if (!runs.length) return {words:[],tones:[]};
  const gaps = runs.slice(1).map((r,i) => r.start - runs[i].end).filter(g => g > .015).sort((a,b)=>a-b);
  // Estimate Morse dot length from shorter measured tone durations and gaps.
  const durations = runs.map(r=>r.end-r.start).filter(n=>n>.025).sort((a,b)=>a-b);
  const dot = durations.length ? durations[Math.min(durations.length-1, Math.floor(durations.length*.28))] : .08;
  // Morse word spacing is seven units. Do not inflate this threshold from the
  // shortest *observed* gap: a recording of single-element words may contain
  // no intra-letter or inter-letter gaps at all.
  const wordThreshold = Math.max(.15, Math.min(1.5, dot * 4.6));
  const words = []; let first = runs[0].start;
  for (let i=1;i<runs.length;i++) {
    if (runs[i].start-runs[i-1].end >= wordThreshold) {
      words.push({start:first,end:runs[i-1].end}); first=runs[i].start;
    }
  }
  words.push({start:first,end:runs[runs.length-1].end});
  return {tones:runs,words:words.filter(r=>r.end-r.start>.025).map((r,i)=>({...r,id:`word-${i+1}`,label:`Passage ${i+1}`,confidence:'inferred'}))};
}
export function detectWordRegions(samples,sampleRate,duration){return detectSignal(samples,sampleRate,duration).words;}
export async function analyzeAudio(blob) {
  const bytes = await blob.arrayBuffer();
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return [];
  const context = new AudioContextType();
  try {
    const buffer = await context.decodeAudioData(bytes);
    const channels = buffer.numberOfChannels, length=buffer.length;
    const samples = new Float32Array(length);
    for (let c=0;c<channels;c++) {
      const data=buffer.getChannelData(c);
      for(let i=0;i<length;i++) samples[i]+=data[i]/channels;
    }
    return detectSignal(samples,buffer.sampleRate,buffer.duration);
  } finally { await context.close().catch(()=>{}); }
}
