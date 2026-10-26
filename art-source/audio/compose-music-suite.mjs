/** Mesa de Bar original procedural score suite.
 * Acoustic-inspired synthesis, not recordings or AI-service downloads.
 * Kept outside game code; rendered by render-music-suite.mjs.
 */
export const TRACKS = [
  {id:'tavern',bpm:104,bars:64,meter:4,key:'D dorian',kind:'tavern',loop:true},
  {id:'arena',bpm:128,bars:80,meter:4,key:'E minor',kind:'arena',loop:true},
  {id:'arena-intense',bpm:140,bars:80,meter:4,key:'E minor',kind:'arena',intense:true,loop:true},
  {id:'guardian-gravedigger',bpm:96,bars:64,meter:3,key:'C minor',kind:'grave',loop:true},
  {id:'guardian-temple',bpm:110,bars:56,meter:4,key:'D phrygian',kind:'temple',loop:true},
  {id:'guardian-lake',bpm:120,bars:64,meter:4,key:'F# minor',kind:'lake',loop:true},
  {id:'boss-necromancer',bpm:132,bars:80,meter:4,key:'D minor',kind:'boss',loop:true},
  {id:'boss-necromancer-enraged',bpm:150,bars:80,meter:4,key:'D minor',kind:'boss',intense:true,loop:true},
  {id:'sting-guardian',seconds:4,kind:'warning',loop:false},
  {id:'sting-boss',seconds:6,kind:'bossWarning',loop:false},
  {id:'sting-victory',seconds:8,kind:'victory',loop:false},
  {id:'sting-defeat',seconds:6,kind:'defeat',loop:false},
].map(t=>({...t,seconds:t.seconds??t.bars*t.meter*60/t.bpm}));

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
  const roots={tavern:50,arena:40,grave:48,temple:38,lake:42,boss:38};
  const harmonies={
    tavern:[[0,3,7],[5,9,12],[10,14,17],[0,3,7],[3,7,10],[5,9,12],[7,10,14],[0,3,7]],
    arena:[[0,3,7],[8,12,15],[3,7,10],[10,14,17],[0,3,7],[5,8,12],[8,12,15],[7,11,14]],
    grave:[[0,3,7],[10,14,17],[8,12,15],[7,11,14],[0,3,7],[5,8,12],[8,12,15],[7,11,14]],
    temple:[[0,3,7],[1,5,8],[10,13,17],[0,3,7],[6,10,13],[1,5,8],[10,13,17],[0,3,7]],
    lake:[[0,3,7],[8,12,15],[3,7,10],[10,14,17],[0,3,7],[5,8,12],[7,11,14],[0,3,7]],
    boss:[[0,3,7],[8,12,15],[5,8,12],[7,11,14],[0,3,7],[1,5,8],[8,12,15],[7,11,14]],
  };
  const themes={
    tavern:[[0,.5],[3,.5],[7,1],[9,.5],[7,.5],[5,1],[3,.5],[2,.5],[0,1],[10,.5],[7,.5],[0,1]],
    arena:[[0,.5],[7,.5],[3,.5],[5,.5],[3,1],[0,1],[-1,.5],[2,.5],[7,1],[3,1],[2,1],[0,1]],
    grave:[[0,1],[3,.5],[2,.5],[7,1],[6,1],[3,1],[2,1],[0,1],[10,1],[7,1]],
    temple:[[0,1],[1,1],[3,1],[7,1],[6,1],[3,1],[1,1],[0,1]],
    lake:[[7,1.5],[10,.5],[12,1],[14,1],[10,1.5],[7,.5],[5,1],[3,1]],
    boss:[[0,.5],[0,.5],[1,1],[7,1],[11,1],[12,1],[15,1],[14,.5],[12,.5],[11,1],[7,1]],
  };
  if(track.loop){
    const beat=60/track.bpm,bar=beat*track.meter,base=roots[track.kind],progression=harmonies[track.kind];
    for(let b=0;b<track.bars;b++){
      const t=b*bar,harm=progression[Math.floor(b/2)%8],notes=harm.map(n=>base+n),pulse=1+.045*Math.sin(b*Math.PI/8),p=(k)=>t+k*beat;
      const isIntense=!!track.intense;
      if(track.kind==='tavern'){
        note(notes[0]-12,t,beat*1.6,.075,'lute',-.10);
        for(const off of[0,1.5,2,3.5])chord(notes.map(n=>n+12),p(off),.12,.026*pulse,'lute',.25);
        if(b%2===0)note(base-12,t,bar*2-.3,.022,'hurdy',-.4);
        hit(t,.085,'frame');hit(p(2),.06,'frame');for(const off of[.5,1.5,2.5,3.5])hit(p(off),.065,'tambourine');
        if(b%4===2)note(notes[2]+24,p(1),beat*1.1,.024,'recorder',.35);
      }else if(track.kind==='arena'){
        for(let k=0;k<(isIntense?16:8);k++){const step=isIntense?.25:.5;note(notes[[0,1,2,1,0,2,1,2][k%8]]+(k%4===3?12:0),p(k*step),beat*step*.72,.052*pulse,'cello',k%2?-.28:.2);}
        note(notes[0]-12,t,bar-.15,.055,'drone');
        hit(t,.26,'frame');hit(p(2),.21,'frame');hit(p(1.5),.09,'stone');hit(p(3.5),.11,'frame');
        for(let k=0;k<(isIntense?8:4);k++)hit(p(k*(isIntense?.5:1)+.25),isIntense?.065:.04,'rattle');
        if(b%4===0)chord(notes,p(0),beat*2.1,isIntense?.045:.031,'horn',.24);
        if(isIntense&&b%2===0)chord(notes.map(n=>n+12),t,bar*1.65,.018,'choir',.5);
      }else if(track.kind==='grave'){
        chord(notes,t,beat*1.0,.031,'organ',.25);note(notes[0]-12,t,beat*.9,.07,'cello',-.1);
        for(const off of[1,2])chord(notes.map(n=>n+12),p(off),beat*.30,.025,'lute',.2);
        for(let k=0;k<3;k++){hit(p(k),k===0?.09:.05,'rattle');if(k)note(notes[k%3]+24,p(k+.3),.12,.025,'box',.35,(b%2?7:-7));}
        if(b%8===0)bell(base-12,t,.045);if(b%4===3)hit(p(2.5),.09,'scrape');
      }else if(track.kind==='temple'){
        note(base-12,t,bar-.15,.05,'drone');
        for(const off of[0,2,3.5])hit(p(off),off===0?.38:.25,'frame');for(const off of[1,2.75])hit(p(off),.19,'stone');
        chord(notes,p(0),beat*1.6,.055,'horn',.22);if(b%2)chord(notes,p(2),beat*1.3,.04,'horn',.25);
        if(b%8===0)hit(t,.16,'gong');
      }else if(track.kind==='lake'){
        for(let k=0;k<8;k++)note(notes[[0,1,2,1,0,2,1,2][k]]+12+(k>=4?12:0),p(k*.5),.18,.035*pulse,'harp',Math.sin(k)*.55);
        if(b%2===0){chord(notes.map(n=>n+12),t,bar*1.75,.017,'choir',.48);chord(notes,t,bar*1.8,.020,'strings',.3);}
        for(const off of[0,2])hit(p(off),.14,'timpani');
        if(b%2===1)bell(notes[1]+24,p(1.5),.03);
        if(b%4===3)for(let k=0;k<8;k++)hit(p(3+k*.125),.025+k*.008,'timpani');
      }else if(track.kind==='boss'){
        const count=isIntense?16:8,step=isIntense?.25:.5;
        for(let k=0;k<count;k++)note(notes[[0,2,1,2][k%4]]+12,p(k*step),beat*step*.72,.037*pulse,isIntense?'strings':'cello',k%2?.34:-.34);
        chord(notes,t,bar*.85,.033,'organ',.23);note(notes[0]-12,t,bar-.2,.06,'drone');
        for(const off of(isIntense?[0,.75,1.5,2,2.75,3.5]:[0,1.5,2,3.5]))hit(p(off),off===0?.34:.20,'frame');
        for(let k=0;k<8;k++)hit(p(k*.5),isIntense?.055:.032,'rattle');
        if(b%2===0)chord(notes.map(n=>n+12),t,bar*1.75,isIntense?.033:.024,'choir',.5);
        if(b%4===0)chord(notes,t,beat*1.5,.06,'horn',.28);
        if(b%8===0)hit(t,.11,'gong');
        if(isIntense&&b%4===3){chord([base+13,base+19],p(3),beat*.4,.035,'trumpet',.2);for(let k=0;k<4;k++)note(base+24+[0,1,3,7][k],p(3+k*.25),beat*.18,.025,'strings',-.3);}
      }
      // Two-bar motifs recur across variants; alternate phrases create continuity without a build-up.
      if(b%2===0){
        const theme=themes[track.kind],lead=track.kind==='tavern'?(Math.floor(b/2)%2?'fiddle':'lute'):track.kind==='arena'?'hurdy':track.kind==='grave'?'box':track.kind==='temple'?'horn':track.kind==='lake'?'glass':'horn';
        let cursor=0;
        for(const [offset,len]of theme){if(cursor>=track.meter*2)break;const allowed=Math.min(len,track.meter*2-cursor);note(base+24+offset,t+cursor*beat,allowed*beat*.82,track.kind==='temple'?.045:track.kind==='grave'?.042:track.kind==='boss'?.048:.055,lead,.1,track.kind==='grave'?(cursor%2?6:-5):0);cursor+=len;}
      }
    }
  }else if(track.kind==='warning'){
    hit(.05,.3,'frame');note(38,.03,.85,.085,'horn',-.15);note(45,1,.8,.065,'horn',.15);
    for(let i=0;i<4;i++)note(62+i,1+i*.28,.6,.03+i*.007,'strings',i%2?.25:-.25);
    chord([50,57,60],2.45,.6,.04,'strings',.3);
  }else if(track.kind==='bossWarning'){
    bell(38,.02,.09);chord([38,45,50],.15,3.1,.048,'choir',.5);
    for(let i=0;i<18;i++)hit(1.6+i*.12,.025+i*.006,'timpani');
    chord([26,38,45,51],3.8,1.1,.07,'horn',.24);hit(3.8,.22,'gong');
  }else if(track.kind==='victory'){
    const melody=[[62,0,.35],[66,.4,.35],[69,.8,.65],[74,1.55,1.1],[73,2.8,.35],[74,3.25,1.3]];
    for(const[n,t,d]of melody){note(n,t,d,.075,'trumpet',-.12);note(n-12,t,d,.035,'horn',.2);}
    for(let i=0;i<12;i++)hit(i*.12,.035+i*.004,'timpani');
    [62,66,69,74,78,81].forEach((n,i)=>note(n,4+i*.16,.16,.055,'lute',i%2?.4:-.4));
    chord([50,57,62,66,69],5.2,1.5,.034,'strings',.30);hit(5.2,.15,'gong');
  }else{
    [[50,0,1.2],[48,1.3,.7],[46,2.1,.8],[45,3,.8],[38,4,1]].forEach(([n,t,d])=>note(n,t,d,.075,'cello',-.16));
    chord([38,45,53],.1,3.4,.023,'choir',.4);bell(62,4.2,.035);
  }
  return{noteCount,hitCount,seed:track.id,instruments:[...usedVoices],percussion:[...usedHits]};
}
