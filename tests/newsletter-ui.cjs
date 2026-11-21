const {chromium}=require('C:/Users/Sulacsan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:4322',out=path.resolve('test-results');fs.mkdirSync(out,{recursive:true});
const authStub=`window.supabase = {
 createClient() {
  let current = localStorage.getItem('gci-test-auth') ? {access_token:'local-reader-token',user:{id:'local-reader'}} : null;
  const listeners = [];
  return { from() { return {select(){return {eq(){return {async maybeSingle(){return {data:{id:'local-reader',full_name:'Local Reader',status:localStorage.getItem('gci-test-tier')==='paid'?'active':'none',plan:localStorage.getItem('gci-test-tier')==='paid'?'annual':null}}}}}}}};}, auth: {
   async getSession() { const delay=Number(localStorage.getItem('gci-test-auth-delay')||0);if(delay)await new Promise(r=>setTimeout(r,delay));return {data:{session:current}}; },
   onAuthStateChange(fn) { listeners.push(fn); return {}; },
   async signInWithPassword() { current={access_token:'local-reader-token',user:{id:'local-reader'}};localStorage.setItem('gci-test-auth','1');listeners.forEach(fn=>fn('SIGNED_IN',current));return {data:{session:current}}; },
   async signOut() { current=null;localStorage.removeItem('gci-test-auth');listeners.forEach(fn=>fn('SIGNED_OUT',null));return {}; }
  }};
 }
};`;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 const context=await browser.newContext();await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:authStub}));
 const page=await context.newPage(),errors=[];await page.clock.setFixedTime(new Date('2026-11-22T16:30:00Z'));page.on('pageerror',e=>errors.push(e.message));
 const scenario=async values=>{const r=await context.request.post(base+'/__test/scenario',{data:values});assert(r.ok());};
 await scenario({now:'2026-11-22T16:30:00Z',subscriptionStatus:'active'});await page.goto(base+'/newsletter/002');await page.locator('.nl-scheduled').waitFor();assert.equal(await page.locator('.nl-copy').count(),0);assert.equal(await page.locator('.nl-full').count(),0);await page.screenshot({path:path.join(out,'before-release.png')});
 // A waiting tab automatically changes at the release boundary using server time.
 await scenario({now:'2026-11-22T16:59:59Z'});await page.reload();await page.locator('.nl-scheduled').waitFor();await scenario({now:'2026-11-22T17:00:00Z'});await page.locator('#newsletter-subscribe-gate').waitFor({timeout:7000});
 assert.equal(await page.locator('.nl-full').count(),0);assert.equal(await page.locator('h2').filter({hasText:'OpenAI’s $20 Billion Project Camellia'}).count(),0);
 const gateOrder=await page.locator('.nl-copy').evaluate(el=>({children:[...el.children].map(c=>c.className),lastHeading:el.querySelector('.nl-teaser').querySelectorAll('h2')[0].textContent}));assert.deepEqual(gateOrder.children,['nl-teaser','nl-gate']);assert.equal(gateOrder.lastHeading,'Today’s Brief');
 for(const width of [1440,375,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#newsletter-subscribe-gate').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`gate-${width}.png`)});results.push({view:'gate',width,ok:true});}
 await page.locator('#sub-edition').fill('local-reader@example.test');await page.locator('#newsletter-subscribe-gate button[type="submit"]').click();await page.locator('.nl-full').waitFor();assert.equal(await page.locator('#newsletter-subscribe-gate').count(),0);
 await page.reload();await page.locator('.nl-full').waitFor();assert((await context.cookies()).some(c=>c.name==='gci_newsletter_access'&&c.httpOnly&&c.secure));
 for(const width of [1440,375,320]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>[...document.querySelectorAll('.nl-copy img')].every(i=>i.complete&&i.naturalWidth>0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.nl-copy img').count(),7);await page.locator('h2').filter({hasText:'OpenAI’s $20 Billion Project Camellia'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`full-${width}.png`)});results.push({view:'full',width,ok:true});}
 await page.goto(base+'/newsletter');await page.locator('.nl-card').first().waitFor();assert((await page.locator('.nl-latest').first().innerText()).toLowerCase().includes('latest issue'));await page.locator('.nl-card .pill').first().click();await page.locator('.nl-full').waitFor();
 // A signed-in free account can return from the gate to the edition.
 await context.clearCookies();await page.reload();await page.locator('#newsletter-subscribe-gate').waitFor();await page.locator('[data-newsletter-signin]').click();await page.locator('#si-email').fill('local-reader@example.test');await page.locator('#si-pass').fill('local-test-password');await page.locator('[data-auth] button[type="submit"]').click();await page.locator('.nl-full').waitFor();assert.equal(new URL(page.url()).pathname,'/newsletter/002');

 // Restored free/paid account states and actual dashboard sign-out control.
 await page.evaluate(()=>localStorage.setItem('gci-test-auth-delay','700'));await page.reload({waitUntil:'domcontentloaded'});await page.locator('.nl-loading').waitFor();assert.equal(await page.locator('.nl-full').count(),0);await page.locator('.nl-full').waitFor();
 await page.evaluate(()=>{localStorage.removeItem('gci-test-auth-delay');localStorage.setItem('gci-test-tier','paid')});await page.reload();await page.locator('.nl-full').waitFor();
 await page.goto(base+'/dashboard');await page.locator('[data-signout]').waitFor();assert((await page.locator('.db-stats').innerText()).includes('Nov 22'));await page.locator('[data-signout]').click();
await page.goto(base+'/newsletter/002');await page.locator('#newsletter-subscribe-gate').waitFor();assert.equal(await page.locator('.nl-full').count(),0);
 // Failed/inactive signup never removes the gate.
 await scenario({subscriptionStatus:'inactive'});await page.locator('#sub-edition').fill('inactive@example.test');await page.locator('#newsletter-subscribe-gate button[type="submit"]').click();await page.locator('#newsletter-subscribe-gate .sub-note').filter({hasText:'confirm your subscription'}).waitFor();assert.equal(await page.locator('.nl-full').count(),0);
 await page.goto(base+'/');await page.locator('.px-issue').waitFor();await page.locator('.px-issue').click();await page.locator('#newsletter-subscribe-gate').waitFor();

 // The earlier issue remains listed and protected after the new issue is added.
 await page.goto(base+'/newsletter');await page.locator('.nl-card').first().waitFor();assert.equal(await page.locator('.nl-card').count(),2);assert(/previous issue.*#001/i.test(await page.locator('.nl-latest').nth(1).innerText()));
 await page.locator('.nl-card .pill').nth(1).click();await page.locator('#newsletter-subscribe-gate').waitFor();assert.equal(new URL(page.url()).pathname,'/newsletter/001');assert((await page.locator('.nl-teaser').innerText()).includes('THE FIRST EDITION'));
 await scenario({now:'2026-11-22T16:30:00Z'});await page.goto(base+'/newsletter');await page.locator('.nl-card').first().waitFor();assert(/upcoming issue.*#002/i.test(await page.locator('.nl-latest').first().innerText()));await page.locator('.nl-card .pill').first().click();await page.locator('.nl-scheduled').waitFor();assert((await page.locator('.nl-scheduled').innerText()).includes('12:00 PM EST'));await page.screenshot({path:path.join(out,'002-scheduled.png')});
assert.deepEqual(errors,[]);const report={results,automatic_release_transition:true,gate_after_brief:true,signup_unlock_and_refresh:true,free_account_return:true,logout_regates:true,inactive_subscription_stays_gated:true,homepage_and_latest_links:true,archive_001_preserved:true,restored_free_account:true,restored_paid_account:true,auth_loading_protected:true,dashboard_signout:true,browser_errors:errors,upstreams:'mocked; no live subscriptions, accounts or email sends'};fs.writeFileSync(path.join(out,'newsletter-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
