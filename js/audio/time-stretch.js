// Pitch-preserving, buffered WSOLA for original imported recordings.
// Correlation searches for a phase-compatible grain; a normalization buffer
// prevents level jumps at overlaps. Processing happens before playback.
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export function stretchPCM(channels,sampleRate,speed) {
  if(!channels?.length||!channels[0]?.length)throw new Error('Empty audio');
  if(!(speed>=.5&&speed<=2))throw new RangeError('Unsupported speed');
  if(Math.abs(speed-1)<1e-6)return channels.map(ch=>new Float32Array(ch));
  const length=channels[0].length,outputLength=Math.max(1,Math.ceil(length/speed));
  const size=Math.max(256,Math.min(2048,2**Math.round(Math.log2(sampleRate*.043))));
  const hop=Math.floor(size/4),search=Math.max(8,Math.round(sampleRate*.007));
  const window=new Float32Array(size);
  for(let i=0;i<size;i++)window[i]=.5-.5*Math.cos(2*Math.PI*(i+.5)/size);
  const mono=new Float32Array(length);
  for(let c=0;c<channels.length;c++)for(let i=0;i<length;i++)mono[i]+=channels[c][i]/channels.length;
  const outs=channels.map(()=>new Float32Array(outputLength+size));
  const weights=new Float32Array(outputLength+size);
  let previous=0;
  for(let out=0,frame=0;out<outputLength;out+=hop,frame++){
    const nominal=Math.round(out*speed);
    const center=clamp(nominal,0,Math.max(0,length-size));
    let source=center;
    if(frame && length>size){
      let bestScore=-Infinity;
      const previousOverlap=previous+hop,upper=length-size;
      for(let candidate=Math.max(0,center-search);candidate<=Math.min(upper,center+search);candidate+=4){
        let cross=0,left=0,right=0;
        // Matching the existing input grain reduces pitch/phase discontinuities.
        for(let j=0;j<size-hop;j+=9){
          const a=mono[previousOverlap+j],b=mono[candidate+j];
          if(a===undefined||b===undefined)break;
          cross+=a*b;left+=a*a;right+=b*b;
        }
        const score=cross/Math.sqrt(Math.max(1e-9,left*right));
        if(score>bestScore){bestScore=score;source=candidate;}
      }
    }
    previous=source;
    const usable=Math.min(size,length-source,outputLength-out);
    for(let i=0;i<usable;i++){
      const weight=window[i];weights[out+i]+=weight;
      for(let c=0;c<channels.length;c++)outs[c][out+i]+=channels[c][source+i]*weight;
    }
  }
  return outs.map(out=>{
    const result=new Float32Array(outputLength);
    for(let i=0;i<outputLength;i++)result[i]=weights[i]>1e-5?clamp(out[i]/weights[i],-1,1):0;
    return result;
  });
}
