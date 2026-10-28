/** Verify actual browser decoding, playback and wraparound of every staged Snowfield loop. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import('file:///C:/training-playwright/node_modules/playwright-core/index.mjs');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve('art-source/audio/snowfield/preview.html')).href);
  const records=[];
  for(let i=0;i<6;i++){
    const result=await page.evaluate(async i=>{
      const audio=document.querySelectorAll('audio')[i];
      if(!audio)throw Error('Missing player '+i);
      if(audio.readyState<1)await new Promise((yes,no)=>{audio.addEventListener('loadedmetadata',yes,{once:true});audio.addEventListener('error',()=>no(Error('WAV failed to load')),{once:true});setTimeout(()=>no(Error('Metadata timeout')),10000);});
      audio.currentTime=audio.duration-.2;
      await audio.play();await new Promise(r=>setTimeout(r,700));
      const result={title:audio.closest('article').querySelector('h2').textContent,duration:audio.duration,currentTime:audio.currentTime,paused:audio.paused,ended:audio.ended,error:audio.error?.message??null};
      audio.pause();return result;
    },i);
    if(result.error||result.paused||result.ended||result.currentTime>2)throw Error(JSON.stringify(result));
    records.push(result);
  }
  if(errors.length)throw Error(JSON.stringify(errors));
  await writeFile('art-source/audio/snowfield/browser-validation.json',JSON.stringify({status:'six_wavs_play_and_loop',errors,records},null,2),{flag:'wx'});
  console.log(JSON.stringify({status:'six_wavs_play_and_loop',records},null,2));
} finally {await browser.close();}
