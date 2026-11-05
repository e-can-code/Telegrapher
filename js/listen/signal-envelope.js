// Evaluate the actual measured tone intervals at the authoritative audio position.
// The short ramps prevent clicks in the light while keeping silence unilluminated.
export function signalEnvelope(position, tones, playing, attack=.018, release=.035) {
  if (!playing || !Number.isFinite(position) || !tones?.length) return 0;
  let low=0,high=tones.length-1;
  while(low<=high){
    const mid=(low+high)>>1, tone=tones[mid];
    if(position<tone.start) high=mid-1;
    else if(position>=tone.end) low=mid+1;
    else return Math.max(0,Math.min(1,(position-tone.start)/attack,(tone.end-position)/release));
  }
  return 0;
}

// The transport already reports output-timeline-adjusted position. Applying a
// second fixed delay causes false timing near short dits.
export const VISUAL_AUDIO_LAG_SECONDS = 0;
export function audiblePosition(outputTime){return Math.max(0,outputTime);}
