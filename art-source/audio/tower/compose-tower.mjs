/** Original tower/menu/snowfield arrangements using the existing Web Audio suite engine.
 * Same oscillator/IR/percussion approach, new themes; no sampled instruments or spoken voice.
 */
export const TRACKS = [
['tower-taverna-battle',118,60,55,'G mixolydian','brawl'],
['duel-brom',100,40,50,'D major','brom'],
['duel-lyra',124,48,52,'E aeolian','lyra'],
['duel-grimbo',112,48,57,'A harmonic minor','grimbo'],
['duel-zora',92,40,50,'D phrygian dominant','zora'],
['tower-taverna-champion',132,68,48,'C minor / Eb major','sergio'],
['tower-taverna-rest',84,32,50,'D major','rest'],
['tower-select',104,40,55,'G major','lobby'],
['menu',96,40,50,'D dorian','menu'],
['arena-snowfield',120,64,50,'D harmonic minor','snow'],
['arena-snowfield-intense',136,72,50,'D harmonic minor','snowIntense'],
['tower-igloo-battle',116,60,50,'D minor','ice'],
['tower-igloo-rest',72,28,50,'D major','iceRest'],
['tower-igloo-champion',128,64,50,'D harmonic minor','king'],
].map(([id,bpm,bars,base,key,kind])=>({id,bpm,bars,base,key,kind,meter:4,loop:true,seconds:bars*240/bpm})).concat([
{id:'sting-duel-start',seconds:2.5,kind:'start'},
{id:'sting-floor-cleared',seconds:3.5,kind:'floor'},
{id:'sting-champion',seconds:4.5,kind:'champion'},
{id:'sting-tower-victory',seconds:8,kind:'win'},
{id:'sting-tower-defeat',seconds:5,kind:'lose'},
{id:'sting-cashout',seconds:2.5,kind:'cash'},
].map(t=>({...t,loop:false})));
const hz=m=>440*2**((m-69)/12);
const VOICES={
  lute:{partials:[1,.45,.28,.12,.07,.035],attack:.004,release:1.25,cutoff:3800,pluck:true},
  harp:{partials:[1,.36,.17,.09,.045],attack:.006,release:2.1,cutoff:4200,pluck:true},
  box:{partials:[1,.06,.34,.015,.14,.008,.07],attack:.003,release:1.8,cutoff:6200,pluck:true},
  glass:{partials:[1,.018,.11,.007,.06],attack:.06,release:2.7,cutoff:6500,pluck:true},
  cello:{partials:[1,.63,.29,.24,.14,.1,.075,.045],attack:.07,release:.28,cutoff:1550,bow:true},
  strings:{partials:[1,.53,.32,.21,.14,.09,.06,.04],attack:.16,release:.45,cutoff:2500,bow:true},
  fiddle:{partials:[1,.72,.4,.28,.16,.1,.06],attack:.065,release:.17,cutoff:3300,bow:true},
  hurdy:{partials:[1,.4,.33,.19,.16,.075,.07],attack:.05,release:.18,cutoff:2100,bow:true},
  recorder:{partials:[1,.12,.055,.023,.006],attack:.045,release:.14,cutoff:2900,vibrato:4.7},
  horn:{partials:[1,.48,.30,.15,.065,.03],attack:.12,release:.40,cutoff:1700},
  trumpet:{partials:[1,.65,.4,.31,.20,.11,.06],attack:.035,release:.25,cutoff:3000},
  organ:{partials:[1,.52,.65,.19,.28,.13,.1,.06],attack:.02,release:.55,cutoff:2800},
  drone:{partials:[1,.28,.13,.18,.07],attack:.25,release:.5,cutoff:600},
  choir:{partials:[1,.12,.14,.3,.43,.20,.08,.13,.19,.10],attack:.30,release:.7,cutoff:3400,bow:true,vibrato:5.1},
};

export function composeTrack(ctx,destination,track,renderWindow=null){
  let state=2166136261;
  for(const c of track.id)state=Math.imul(state^c.charCodeAt(0),16777619);
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
  const dry=ctx.createGain();dry.gain.value=.72;dry.connect(destination);
  const reverb=ctx.createConvolver(),ir=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*2.7),ctx.sampleRate);
  for(let c=0;c<2;c++){const data=ir.getChannelData(c);let smooth=0;for(let i=0;i<data.length;i++){smooth=.58*smooth+.42*(random()*2-1);data[i]=smooth*(1-i/data.length)**3*.24;}}
  reverb.buffer=ir;const wet=ctx.createGain();wet.gain.value=track.kind==='lake'?.29:.18;reverb.connect(wet).connect(destination);
  const waves=new Map(),usedVoices=new Set(),usedHits=new Set();let noteCount=0,hitCount=0;
  const noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
  {const d=noise.getChannelData(0);let pink=0;for(let i=0;i<d.length;i++){pink=.78*pink+(random()*2-1)*.22;d[i]=pink;}}
  function note(midi,time,duration,volume,type='strings',pan=0,detune=0){
    if(volume<=0)return;
    if(renderWindow){if(time<renderWindow.start-1e-7||time>=renderWindow.end-1e-7)return;time-=renderWindow.start;}
    usedVoices.add(type);
    const v=VOICES[type],start=Math.max(0,time),end=start+duration+v.release;noteCount++;
    const amp=ctx.createGain(),filter=ctx.createBiquadFilter(),stereo=ctx.createStereoPanner();
    amp.connect(filter).connect(stereo);stereo.pan.value=pan;stereo.connect(dry);stereo.connect(reverb);
    filter.type='lowpass';filter.Q.value=.5;
    filter.frequency.setValueAtTime(v.cutoff*(v.pluck?1.25:1),start);
    if(v.pluck)filter.frequency.exponentialRampToValueAtTime(v.cutoff*.30,end);
    const level=volume*(.96+random()*.08);
    amp.gain.setValueAtTime(0,start);amp.gain.linearRampToValueAtTime(level,start+v.attack);
    if(v.pluck)amp.gain.exponentialRampToValueAtTime(.00001,end);
    else{amp.gain.linearRampToValueAtTime(level*.76,start+Math.min(duration,v.attack+.15));amp.gain.setValueAtTime(level*.70,start+Math.max(v.attack+.16,duration));amp.gain.linearRampToValueAtTime(0,end);}
    if(!waves.has(type)){
      const real=new Float32Array(32),imag=new Float32Array(32);
      v.partials.forEach((a,i)=>imag[i+1]=a);
      waves.set(type,ctx.createPeriodicWave(real,imag));
    }
    for(let voice=0;voice<(v.bow?2:1);voice++){
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.setPeriodicWave(waves.get(type));osc.frequency.value=hz(midi);
      osc.detune.value=detune+(v.bow?(voice?4.5:-4.5):0);gain.gain.value=v.bow?.55:1;
      if(v.vibrato||v.bow){const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=v.vibrato??(4.2+random()*.5);depth.gain.value=type==='choir'?5:3;lfo.connect(depth).connect(osc.detune);lfo.start(start);lfo.stop(end+.01);}
      osc.connect(gain).connect(amp);osc.start(start);osc.stop(end+.02);
    }
  }
  function hit(time,volume,type='frame'){
    if(renderWindow){if(time<renderWindow.start-1e-7||time>=renderWindow.end-1e-7)return;time-=renderWindow.start;}
    usedHits.add(type);
    hitCount++;const start=Math.max(0,time),amp=ctx.createGain(),filter=ctx.createBiquadFilter(),stereo=ctx.createStereoPanner();
    stereo.pan.value=type==='rattle'?-.45:type==='tambourine'?.42:0;
    amp.connect(filter).connect(stereo);stereo.connect(dry);stereo.connect(reverb);
    const length=type==='gong'?2.7:type==='scrape'?.35:type==='rattle'?.07:type==='tambourine'?.13:type==='stone'?.17:.48;
    amp.gain.setValueAtTime(volume,start);amp.gain.exponentialRampToValueAtTime(.00001,start+length);
    filter.type=type==='tambourine'?'highpass':type==='scrape'?'bandpass':'lowpass';filter.frequency.value=type==='tambourine'?4600:type==='scrape'?900:type==='rattle'?2500:type==='stone'?1400:650;
    const source=ctx.createBufferSource();source.buffer=noise;source.playbackRate.value=.7+random()*.5;source.connect(amp);source.start(start,random()*.7);source.stop(start+length);
    if(!['rattle','tambourine','scrape'].includes(type)){
      const freq=type==='gong'?73.42:type==='stone'?178:type==='timpani'?110:85;
      for(const ratio of(type==='gong'?[1,1.414,2.12,2.9]:[1,1.59])){
        const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.setValueAtTime(freq*ratio*(type==='frame'?1.4:1),start);osc.frequency.exponentialRampToValueAtTime(freq*ratio*.75,start+.12);gain.gain.value=ratio===1?.7:.18;osc.connect(gain).connect(amp);osc.start(start);osc.stop(start+length);
      }
    }
  }
  const chord=(notes,t,len,vol,type,spread=.45)=>notes.forEach((n,i)=>note(n,t+i*.006,len,vol,type,(i-(notes.length-1)/2)*spread));
  const bell=(m,t,vol=.045)=>{note(m,t,.08,vol,'glass',-.22);note(m+19,t,.05,vol*.20,'box',.2,7);};
  if (track.loop) {
    const k=track.kind, base=track.base, beat=60/track.bpm, bar=beat*4;
    const cold=['snow','snowIntense','ice','iceRest','king'].includes(k);
    const calm=['rest','iceRest'].includes(k), intense=['sergio','snowIntense','king'].includes(k);
    const scale=k==='zora'?[0,1,4,5,7,8,10]:(track.key.includes('major')&&k!=='sergio')||k==='brawl'?[0,2,4,5,7,9,k==='brawl'?10:11]:k==='menu'?[0,2,3,5,7,9,10]:track.key.includes('harmonic')?[0,2,3,5,7,8,11]:[0,2,3,5,7,8,10];
    const degree=d=>scale[((d%7)+7)%7]+Math.floor(d/7)*12;
    const progression=k==='grimbo'?[0,5,1,4,0,3,1,4]:k==='zora'?[0,1,0,4,5,1,4,0]:[0,3,5,4,0,5,3,4];
    const motifs={
      brawl:[0,2,4,5,4,2,1,0,2,4,6,5,4,2,1,0],
      brom:[0,0,2,4,4,2,1,0,4,5,4,2,1,2,1,0],
      lyra:[4,5,7,6,4,2,3,4,5,4,2,1,2,3,1,0],
      grimbo:[0,2,3,4,6,5,3,2,1,3,4,2,1,0,-1,0],
      zora:[0,1,2,4,5,4,2,1,0,-1,0,2,1,0,1,0],
      sergio:[0,0,4,4,5,6,7,4,2,3,4,2,1,0,-1,0],
      rest:[4,2,1,0,2,3,4,2],lobby:[0,2,4,7,6,4,2,1],menu:[0,2,4,5,4,3,2,0],
      snow:[4,6,7,6,4,2,1,0],snowIntense:[4,6,7,6,4,2,1,0],ice:[0,4,2,1,0,6,4,3],iceRest:[4,2,0,1,2,4,5,4],
      king:[0,0,1,4,6,7,9,8,7,6,4,2,1,0,-1,0]
    };
    const leads={brawl:'fiddle',brom:'hurdy',lyra:'recorder',grimbo:'recorder',zora:'glass',sergio:'trumpet',rest:'lute',lobby:'lute',menu:'fiddle',snow:'recorder',snowIntense:'horn',ice:'box',iceRest:'recorder',king:'horn'};
    for(let b=0;b<track.bars;b++){
      const t=b*bar,p=n=>t+n*beat,d=progression[Math.floor(b/2)%8];
      const chordNotes=[d,d+2,d+4].map(n=>base+degree(n));
      const hush=k==='zora'&&b%8===7;
      note(chordNotes[0]-24,t,beat*(calm?3.5:1.3),calm?.035:.065,cold?'cello':k==='brom'?'horn':'lute',-.2);
      if(!hush){
        const steps=calm?4:intense?16:8;
        for(let j=0;j<steps;j++){
          const off=j*4/steps+(k==='brom'&&j%2?.08:0);
          const n=chordNotes[[0,1,2,1][j%4]]+(j%4===3?12:0);
          note(n,p(off),beat*(calm?.7:.22),calm?.024:intense?.037:.03,cold?'harp':'lute',j%2?.35:-.35);
        }
        if(!calm){
          for(const off of(intense?[0,1,1.5,2,3,3.5]:[0,1.5,2,3.5]))hit(p(off),off===0?.16:.085,'frame');
          for(const off of[.5,1.5,2.5,3.5])hit(p(off),cold?.028:.05,cold?'rattle':'tambourine');
          if(k==='grimbo')for(let j=0;j<3;j++)hit(p(3+j*.15),.055,'stone');
        }
        if(k==='brom')for(const off of[1,3])chord(chordNotes,p(off),beat*.35,.025,'hurdy',.2);
        if(k==='zora')chord(chordNotes,p(0),bar*.6,.018,'glass',.4);
        if(['menu','sergio','king','snowIntense'].includes(k)&&b%2===0)chord(chordNotes,t,bar*1.6,.018,'choir',.4);
        if(intense&&b%2===0)chord(chordNotes.map(n=>n-12),t,beat*1.2,.04,'horn',.3);
        if(k==='king')chord(chordNotes.map(n=>n-12),t,bar*.75,.025,'organ',.2);
      }
      if(b%2===0){
        const motif=motifs[k],step=8/motif.length;
        motif.forEach((n,j)=>{
          const variation=Math.floor(b/8)%4===2&&j<4?2:0;
          note(base+12+degree(n+variation),p(j*step),beat*step*(k==='grimbo'?.55:.8),calm?.037:.05,leads[k],.16);
          if(k==='snowIntense')note(base+24+degree(n),p(j*step),beat*.25,.015,'glass',-.2);
        });
      }
      if(cold&&b%4===0)bell(base+24+degree(4),t,.022);
      if(k==='lobby'&&b%8===6)chord(chordNotes,p(2),beat,.035,'trumpet',.3);
    }
  } else {
    const k=track.kind, end=track.seconds-1.1;
    const notes=k==='lose'?[62,60,58,57,50]:k==='champion'?[38,45,50,51]:k==='cash'?[74,78,81,86]:[62,66,69,74];
    notes.forEach((n,i)=>{
      const t=.015+i*(end-.25)/notes.length;
      note(n,t,k==='champion'?.55:.22,.07,k==='lose'?'hurdy':k==='champion'?'horn':k==='cash'?'lute':'trumpet',i%2?.2:-.2,k==='lose'?i*-8:0);
      hit(t,.06,i%2?'tambourine':'frame');
    });
    chord(k==='champion'?[38,45,51]:k==='lose'?[38,45,53]:[50,57,62,66],Math.max(.2,end-.65),.4,.035,'strings',.3);
    if(k==='win')for(let i=0;i<12;i++)note(62+[0,4,7,12][i%4],3+i*.18,.1,.045,'lute',i%2?.4:-.4);
    if(k==='cash'||k==='floor')for(let i=0;i<9;i++)bell(80+i%3*3,.1+i*.12,.025);
  }
  return {noteCount,hitCount,seed:track.id,instruments:[...usedVoices],percussion:[...usedHits]};
}
