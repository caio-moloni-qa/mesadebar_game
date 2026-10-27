/** Original Snowfield compositions using the existing suite synthesis engine. No recordings or external service. */
export const TRACKS = [
{id:'guardian-frost-knight',title:'Cavaleiro Congelado',kind:'knight',bpm:112,bars:56,meter:4,key:'D minor',base:38},
{id:'guardian-ice-serpent',title:'Serpente do Gelo',kind:'serpent',bpm:126,bars:48,meter:6,key:'F# minor',base:42},
{id:'guardian-bellringer',title:'O Sineiro',kind:'bellringer',bpm:96,bars:64,meter:3,key:'C harmonic minor',base:36},
{id:'guardian-ancient-yeti',title:'Yeti Ancião',kind:'yeti',bpm:100,bars:56,meter:4,key:'E phrygian',base:40},
{id:'boss-winter-king',title:'Rei do Inverno',kind:'king',bpm:128,bars:80,meter:4,key:'D harmonic minor',base:38},
{id:'boss-winter-king-enraged',title:'Rei do Inverno - Coroa Partida',kind:'king',bpm:152,bars:80,meter:4,key:'D harmonic minor',base:38,intense:true},
].map(t=>({...t,loop:true,seconds:t.bars*t.meter*60/t.bpm}));
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
  // Each boss has a distinct rhythmic vocabulary and motif; both King phases share theirs.
  const themes={
    knight:[[0,1],[7,.5],[5,.5],[3,1],[2,1],[0,1],[3,.5],[2,.5],[-1,1],[0,1]],
    serpent:[[0,.5],[3,.5],[7,1],[10,.5],[9,.5],[7,1],[5,.5],[3,.5],[2,1],[0,1]],
    bellringer:[[0,1],[7,1],[11,1],[12,1],[7,1],[0,1]],
    yeti:[[0,1.5],[1,.5],[0,1],[7,1],[5,1.5],[1,.5],[0,2]],
    king:[[0,1],[7,.5],[11,.5],[12,1],[10,1],[7,1],[5,.5],[3,.5],[1,1],[-1,1]],
  };
  const progressions={
    knight:[[0,3,7],[0,3,7],[8,12,15],[5,8,12],[0,3,7],[10,14,17],[7,11,14],[7,11,14]],
    serpent:[[0,3,7],[3,7,10],[5,8,12],[10,14,17],[8,12,15],[5,8,12],[7,11,14],[0,3,7]],
    bellringer:[[0,3,7],[0,3,7],[8,12,15],[7,11,14],[5,8,12],[1,5,8],[7,11,14],[7,11,14]],
    yeti:[[0,3,7],[1,5,8],[0,3,7],[10,13,17],[5,8,12],[1,5,8],[10,13,17],[0,3,7]],
    king:[[0,3,7],[8,12,15],[5,8,12],[7,11,14],[0,3,7],[1,5,8],[8,12,15],[7,11,14]],
  };
  const beat=60/track.bpm,bar=track.meter*beat,base=track.base;
  for(let b=0;b<track.bars;b++){
    const t=b*bar,p=k=>t+k*beat,notes=progressions[track.kind][Math.floor(b/2)%8].map(n=>n+base);
    const intense=!!track.intense,answer=Math.floor(b/8)%2;
    note(notes[0]-12,t,bar-.2,.048,'drone');
    if(track.kind==='knight'){
      for(let k=0;k<8;k++)note(notes[[0,2,1,2][k%4]],p(k*.5),beat*.33,.048,'cello',k%2?.3:-.3);
      for(const k of[0,1.5,2,3.5])hit(p(k),k===0?.30:.17,'frame');
      chord(notes,t,beat*1.4,.038,'horn');
      if(b%2===1)chord(notes,p(2),beat*.7,.024,'horn');
      for(const k of[.5,2.5])note(notes[2]+24,p(k),.12,.023,'glass',-.4);
      if(b%4===3)hit(p(3),.10,'stone');
    }else if(track.kind==='serpent'){
      for(let k=0;k<12;k++){
        note(notes[[0,1,2,1,2,1][k%6]]+12+(k>=6?12:0),p(k*.5),.18,.036,'harp',Math.sin(k)*.6);
        note(notes[[0,2,1][k%3]],p(k*.5),beat*.30,.032,'cello',-.2);
      }
      chord(notes.map(n=>n+12),t,bar-.3,.018,'strings');
      for(const k of[0,3,4.5])hit(p(k),k===0?.25:.15,'timpani');
      if(b%2===1)for(const k of[2.5,5.5])bell(notes[1]+24,p(k),.026);
    }else if(track.kind==='bellringer'){
      chord(notes,t,beat*2.1,.028,'organ',.3);
      note(notes[0]-12,t,beat*1.6,.045,'cello');
      for(let k=0;k<3;k++){
        bell(base+[0,7,11][k]+(b%4===3?12:0),p(k),k===0?.047:.031);
        hit(p(k+.5),.037,'rattle');
      }
      if(answer)note(notes[1]+24,p(1.5),beat*.7,.026,'box',.4);
      if(b%4===3)hit(p(2.5),.055,'scrape');
    }else if(track.kind==='yeti'){
      for(const k of[0,.75,2,3.5])hit(p(k),k===0?.40:.24,'frame');
      for(const k of[1,3])hit(p(k),.19,'stone');
      for(let k=0;k<4;k++)note(notes[k%3]-12,p(k),beat*.65,.066,'cello',-.1);
      chord(notes,t,beat*1.3,.042,'horn',.25);
      if(answer)chord(notes,p(2.5),beat*.8,.032,'horn',.3);
      if(b%4===3)for(let k=0;k<4;k++)hit(p(3+k*.25),.07+k*.025,'timpani');
      if(b%4===1)note(base+37,p(3),beat*.6,.02,'glass',.4);
    }else{
      const steps=intense?16:8,step=intense?.25:.5;
      for(let k=0;k<steps;k++)note(notes[[0,2,1,2][k%4]],p(k*step),beat*step*.72,.05,intense?'strings':'cello',k%2?.32:-.32);
      chord(notes.map(n=>n+12),t,bar-.3,.023,'strings',.4);
      chord(notes,t,beat*1.8,.035,'horn',.25);
      for(const k of(intense?[0,.75,1.5,2,2.75,3.5]:[0,1.5,2,3.5]))hit(p(k),k===0?.32:.19,'frame');
      for(let k=0;k<8;k++)hit(p(k*.5),intense?.052:.028,'rattle');
      for(const k of[.5,2.5])bell(notes[2]+24,p(k),.024);
      if(b%8===0)hit(t,.12,'gong');
      if(intense&&b%2===1)chord(notes.map(n=>n+12),p(2),beat*.65,.028,'trumpet',.3);
    }
    if(b%2===0){
      const lead={knight:'horn',serpent:'recorder',bellringer:'box',yeti:'horn',king:'horn'}[track.kind];
      let cursor=0;
      for(const[offset,len]of themes[track.kind]){
        if(cursor>=track.meter*2)break;
        const duration=Math.min(len,track.meter*2-cursor);
        note(base+24+offset,p(cursor),duration*beat*.80,.043,lead,.12);
        if(track.kind==='king'||track.kind==='serpent')note(base+36+offset,p(cursor),duration*beat*.70,.014,'glass',-.3);
        cursor+=duration;
      }
    }
  }
  return{noteCount,hitCount,seed:track.id,instruments:[...usedVoices],percussion:[...usedHits]};
}
