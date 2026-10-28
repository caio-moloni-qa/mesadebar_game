import {chromium} from 'file:///C:/training-playwright/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
const root='art-source/rooms/portal-v2/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>(errors.push(e.message),console.error(e.message)));page.on('console',m=>{if(m.type()==='error')(errors.push(m.text()),console.error(m.text()));});
try{
 await page.goto('http://127.0.0.1:5173/mesadebar_game/art-source/rooms/portal-v2/preview.html');
 await page.waitForFunction(()=>window.review);await page.waitForTimeout(500);
 await page.screenshot({path:root+'preview_detail.png'});
 const detail=await page.evaluate(()=>({calls:review.renderer.info.render.calls,triangles:review.renderer.info.render.triangles,rotation:review.portal.rotation.y}));
 await page.goto('http://127.0.0.1:5173/mesadebar_game/play3d.html?debug=1&god=1&seed=724');
 await page.waitForFunction(()=>window.__game);
 await page.evaluate(()=>{const g=__game;g.progress={...g.progress,tutorialSeen:true,firstRunTipSeen:true};g.enterHub();g.shop.hide();});
 await page.waitForTimeout(900);await page.screenshot({path:root+'preview_hub.png'});
 const hubCalls=await page.evaluate(()=>__game.renderer.info.render.calls);
 const exitRotation=await page.evaluate(()=>__game.merchantRoom.exitPortal.rotation.y);
 await page.evaluate(()=>{
  const g=__game;g.mode='run';g.inMenu=false;g.menu.hide();g.createSession({skipStartingUpgrades:true,attract:false});
  const s=g.session;s.skeletonSpawnEnabled=false;s.variantSpawnEnabled=false;s.player.invincible=true;s.openMerchantPortal();
  s.merchant.portal.x=s.player.x+90;s.merchant.portal.y=s.player.y;g.cameraRig.cut();
 });
 await page.waitForTimeout(3500);await page.screenshot({path:root+'preview_arena.png'});
 const arena=await page.evaluate(()=>({visible:__game.merchantRoom.arenaPortal.visible,calls:__game.renderer.info.render.calls}));
 const entry=await page.evaluate(()=>{const s=__game.session;s.player.x=s.merchant.portal.x;s.player.y=s.merchant.portal.y;s.interact();__game.cameraRig.cut();return s.merchant.inside;});
 await page.waitForTimeout(800);await page.screenshot({path:root+'preview_visit.png'});
 const visitCalls=await page.evaluate(()=>__game.renderer.info.render.calls);
 const exit=await page.evaluate(async()=>{
  const {MERCHANT_ROOM}=await import('/mesadebar_game/src/core/systems/MerchantSystem.ts');
  const s=__game.session,m=s.merchant;s.player.x=m.room.x+MERCHANT_ROOM.exit.x;s.player.y=m.room.y+MERCHANT_ROOM.exit.y;
  const spot=m.roomSpot;s.interact();return {spot,inside:m.inside};
 });
 const results={errors,detail,exitRotation,hubCalls,visitCalls,arena,entry,exit};
 await writeFile(root+'browser-validation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 if(errors.length||exitRotation!==0||!entry||exit.inside||!arena.visible)process.exitCode=1;
}finally{await browser.close();}
