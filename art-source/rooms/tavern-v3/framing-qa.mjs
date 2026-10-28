import {chromium} from 'file:///C:/training-playwright/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
const root='art-source/rooms/tavern-v3/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:5173/mesadebar_game/play3d.html?debug=1&god=1&seed=724');
 await page.waitForFunction(()=>window.__game);
 await page.evaluate(()=>{const g=__game;g.progress={...g.progress,tutorialSeen:true,firstRunTipSeen:true};g.enterHub();g.shop.hide();});
 await page.waitForTimeout(1200);
 await page.screenshot({path:root+'preview_framing_hub.png'});
 const samples=[];
 for(const [name,x,y] of [['arrival',0,-185],['northwest',-250,-250],['southeast',250,250],['southwest',-250,250],['northeast',250,-250]]) {
  await page.evaluate(({x,y})=>{const g=__game,s=g.session;s.player.x=s.merchant.room.x+x;s.player.y=s.merchant.room.y+y;g.cameraRig.cut();},{x,y});
  await page.waitForTimeout(700);
  samples.push(await page.evaluate(name=>({name,zoom:__game.cameraRig.roomZoom,background:__game.scene.background.getHexString(),width:__game.cameraRig.camera.right*2}),name));
  await page.screenshot({path:root+`preview_framing_${name}.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);
 await page.screenshot({path:root+'preview_framing_mobile.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{const g=__game;g.mode='run';g.inMenu=false;g.menu.hide();g.createSession({skipStartingUpgrades:true,attract:false});const s=g.session;s.skeletonSpawnEnabled=false;s.variantSpawnEnabled=false;s.player.invincible=true;s.openMerchantPortal();s.player.x=s.merchant.portal.x;s.player.y=s.merchant.portal.y;s.interact();g.cameraRig.cut();});
 await page.waitForTimeout(700);
 const entered=await page.evaluate(()=>({inside:__game.session.merchant.inside,zoom:__game.cameraRig.roomZoom}));
 await page.screenshot({path:root+'preview_framing_visit.png'});
 await page.evaluate(async()=>{const {MERCHANT_ROOM}=await import('/mesadebar_game/src/core/systems/MerchantSystem.ts');const s=__game.session;s.player.x=s.merchant.room.x+MERCHANT_ROOM.exit.x;s.player.y=s.merchant.room.y+MERCHANT_ROOM.exit.y;s.interact();});
 await page.waitForTimeout(700);
 const left=await page.evaluate(()=>({inside:__game.session.merchant.inside,zoom:__game.cameraRig.roomZoom,background:__game.scene.background.getHexString()}));
 const results={errors,samples,entered,left};
 await writeFile(root+'framing-validation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 if(errors.length||samples.some(s=>s.zoom!==1.65||s.background!=='352c24')||!entered.inside||entered.zoom!==1.65||left.inside||left.zoom!==1)process.exitCode=1;
} finally {await browser.close();}
