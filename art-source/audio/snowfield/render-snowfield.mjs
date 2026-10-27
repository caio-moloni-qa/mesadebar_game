/** node art-source/audio/snowfield/render-snowfield.mjs [optional track id]
 * Uses Chromium's native OfflineAudioContext; does not start or modify the game.
 */
import {readFile,writeFile,mkdir,access,copyFile}from'node:fs/promises';
import {constants}from'node:fs';
import {resolve}from'node:path';
import {TRACKS}from'./compose-snowfield.mjs';
const{chromium}=await import('file:///C:/training-playwright/node_modules/playwright-core/index.mjs');
const folder=resolve('src/assets/audio/music/snowfield');await mkdir(folder,{recursive:true});
const source=await readFile(new URL('./compose-snowfield.mjs',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const metrics=[];
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
try{
  for(const track of TRACKS.filter(t=>!process.argv[2]||process.argv[2]==='--remaining'||t.id===process.argv[2])){
    if(process.argv[2]==='--remaining'&&await exists(resolve(folder,track.id+'-render-metrics.json')))continue;
    let v=1,suffix='';while(await exists(resolve(folder,track.id+suffix+'.wav'))||await exists(resolve(folder,track.id+'-raw'+suffix+'.wav'))){v++;suffix='_v'+v;}
    const rawName=track.id+'-raw'+suffix+'.wav',name=track.id+suffix+'.wav';
    const page=await browser.newPage({acceptDownloads:true});await page.goto('about:blank');
    page.on('console',message=>console.log(track.id+': '+message.text()));
    const downloads=[];
    const downloadsReady=new Promise(ready=>page.on('download',download=>{
      const target=download.suggestedFilename();
      if(![rawName,name].includes(target))throw Error('Unexpected audio download');
      downloads.push((async()=>copyFile(await download.path(),resolve(folder,target),constants.COPYFILE_EXCL))());
      if(downloads.length===2)ready();
    }));
    await page.addScriptTag({type:'module',content:source+'\nwindow.__scoreSuite={TRACKS,composeTrack};'});
    await page.waitForFunction(()=>window.__scoreSuite);
    console.log('Rendering '+track.id+' ('+track.seconds.toFixed(3)+' s)');
    const result=await page.evaluate(async({track,rawName,name})=>{
      const rate=44100,frames=Math.round(track.seconds*rate),tail=4*rate;
      const raw=[new Float32Array(frames+tail),new Float32Array(frames+tail)];
      const tally={noteCount:0,hitCount:0,instruments:[],percussion:[],seed:track.id};
      const chunks=track.loop?Math.ceil(track.bars/8):1;
      for(let chunk=0;chunk<chunks;chunk++){
        const start=track.loop?chunk*8*track.meter*60/track.bpm:0;
        const end=track.loop?Math.min(track.bars,(chunk+1)*8)*track.meter*60/track.bpm:track.seconds;
        const offset=Math.round(start*rate),length=Math.round(end*rate)-offset;
        const ctx=new OfflineAudioContext(2,length+tail,rate);
        const stats=window.__scoreSuite.composeTrack(ctx,ctx.destination,track,{start,end});
        const buffer=await ctx.startRendering();
        tally.noteCount+=stats.noteCount;tally.hitCount+=stats.hitCount;
        tally.instruments=[...new Set([...tally.instruments,...stats.instruments])];tally.percussion=[...new Set([...tally.percussion,...stats.percussion])];
        for(let c=0;c<2;c++){const samples=buffer.getChannelData(c);for(let i=0;i<samples.length&&offset+i<raw[c].length;i++)raw[c][offset+i]+=samples[i];}
        console.log('Section '+(chunk+1)+'/'+chunks+' rendered');
      }
      console.log('Audio rendered; preparing WAV downloads');
      const final=raw.map(ch=>{
        const out=ch.slice(0,frames);
        if(track.loop){for(let i=frames;i<ch.length;i++)out[i-frames]+=ch[i];}
        else{const fade=Math.round(rate*.25);for(let i=0;i<fade;i++)out[frames-fade+i]*=1-i/(fade-1);}
        return out;
      });
      let rawPeak=0,peak=0,square=0,clippedRaw=0;
      for(const ch of raw)for(const x of ch){if(!Number.isFinite(x))throw Error('Non-finite audio');rawPeak=Math.max(rawPeak,Math.abs(x));if(Math.abs(x)>1)clippedRaw++;}
      for(const ch of final)for(const x of ch){peak=Math.max(peak,Math.abs(x));square+=x*x;}
      if(peak<.01)throw Error('Silent render');
      const gain=.84/peak;
      for(const ch of final)for(let i=0;i<ch.length;i++)ch[i]*=gain;
      function wav(channels){
        const length=channels[0].length,buf=new ArrayBuffer(44+length*4),v=new DataView(buf);
        const str=(off,s)=>[...s].forEach((c,i)=>v.setUint8(off+i,c.charCodeAt(0)));
        str(0,'RIFF');v.setUint32(4,buf.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,length*4,true);
        for(let i=0;i<length;i++)for(let c=0;c<2;c++)v.setInt16(44+i*4+c*2,Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),true);
        return buf;
      }
      // Untouched float render is retained as float32 WAV, avoiding PCM clipping.
      function floatWav(channels){
        const length=channels[0].length,buf=new ArrayBuffer(44+length*8),v=new DataView(buf);const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
        str(0,'RIFF');v.setUint32(4,buf.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*8,true);v.setUint16(32,8,true);v.setUint16(34,32,true);str(36,'data');v.setUint32(40,length*8,true);
        for(let i=0;i<length;i++)for(let c=0;c<2;c++)v.setFloat32(44+i*8+c*4,channels[c][i],true);
        return buf;
      }
      function download(bytes,filename){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));link.download=filename;document.body.appendChild(link);link.click();}
      download(floatWav(raw),rawName);download(wav(final),name);
      return{metrics:{...track,...tally,rate,frames,rawSeconds:raw[0].length/rate,rawPeak,rawSamplesAboveOne:clippedRaw,peak:.84,rms:Math.sqrt(square/(frames*2))*gain,gain,seam:final.map(ch=>Math.abs(ch[0]-ch[ch.length-1])),end:final.map(ch=>ch[ch.length-1])}};
    },{track,rawName,name});
    await downloadsReady;await Promise.all(downloads);
    const entry={...result.metrics,file:name,rawFile:rawName};metrics.push(entry);
    await writeFile(resolve(folder,track.id+'-render-metrics'+suffix+'.json'),JSON.stringify(entry,null,2),{flag:'wx'});
    console.log(JSON.stringify(entry));await page.close();
  }
}finally{await browser.close();}
let v=1,path=resolve(folder,'procedural-suite-manifest.json');while(await exists(path)){v++;path=resolve(folder,'procedural-suite-manifest_v'+v+'.json');}
await writeFile(path,JSON.stringify({method:'Original locally composed Web Audio synthesis; no recorded instruments, external music service or voice recordings.',normalization:'Peak normalized to .84; LUFS matching deferred to integration.',tracks:metrics},null,2),{flag:'wx'});
