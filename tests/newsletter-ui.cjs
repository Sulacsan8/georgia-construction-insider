const {chromium}=require('C:/Users/Sulacsan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:4322',out=path.resolve('test-results');fs.mkdirSync(out,{recursive:true});
const authStub=`window.supabase = {
 createClient() {
  let current = localStorage.getItem('gci-test-auth') ? {access_token:'local-reader-token',user:{id:'local-reader'}} : null;
  const listeners = [];
  return { auth: {
   async getSession() { return {data:{session:current}}; },
   onAuthStateChange(fn) { listeners.push(fn); return {}; },
   async signInWithPassword() { current={access_token:'local-reader-token',user:{id:'local-reader'}};localStorage.setItem('gci-test-auth','1');listeners.forEach(fn=>fn('SIGNED_IN',current));return {data:{session:current}}; },
   async signOut() { current=null;localStorage.removeItem('gci-test-auth');listeners.forEach(fn=>fn('SIGNED_OUT',null));return {}; }
  }};
 }
};`;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 const context=await browser.newContext();await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:authStub}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const scenario=async values=>{const r=await context.request.post(base+'/__test/scenario',{data:values});assert(r.ok());};
 await scenario({now:'2026-11-15T16:30:00Z',subscriptionStatus:'active'});await page.goto(base+'/newsletter/001');await page.locator('.nl-scheduled').waitFor();assert.equal(await page.locator('.nl-copy').count(),0);assert.equal(await page.locator('.nl-full').count(),0);await page.screenshot({path:path.join(out,'before-release.png')});
 // A waiting tab automatically changes at the release boundary using server time.
 await scenario({now:'2026-11-15T16:59:59Z'});await page.reload();await page.locator('.nl-scheduled').waitFor();await scenario({now:'2026-11-15T17:00:00Z'});await page.locator('#newsletter-subscribe-gate').waitFor({timeout:7000});
 assert.equal(await page.locator('.nl-full').count(),0);assert.equal(await page.locator('h2').filter({hasText:'Audi Plans $4 Billion'}).count(),0);
 const gateOrder=await page.locator('.nl-copy').evaluate(el=>({children:[...el.children].map(c=>c.className),lastHeading:el.querySelector('.nl-teaser').querySelectorAll('h2')[0].textContent}));assert.deepEqual(gateOrder.children,['nl-teaser','nl-gate']);assert.equal(gateOrder.lastHeading,'Today’s Brief');
 for(const width of [1440,375,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#newsletter-subscribe-gate').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`gate-${width}.png`)});results.push({view:'gate',width,ok:true});}
 await page.locator('#sub-edition').fill('local-reader@example.test');await page.locator('#newsletter-subscribe-gate button[type="submit"]').click();await page.locator('.nl-full').waitFor();assert.equal(await page.locator('#newsletter-subscribe-gate').count(),0);
 await page.reload();await page.locator('.nl-full').waitFor();assert((await context.cookies()).some(c=>c.name==='gci_newsletter_access'&&c.httpOnly&&c.secure));
 for(const width of [1440,375,320]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>[...document.querySelectorAll('.nl-copy img')].every(i=>i.complete&&i.naturalWidth>0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.nl-copy img').count(),7);await page.locator('h2').filter({hasText:'Audi Plans $4 Billion'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`full-${width}.png`)});results.push({view:'full',width,ok:true});}
 await page.goto(base+'/newsletter');await page.locator('.nl-card').waitFor();assert((await page.locator('.nl-latest').innerText()).toLowerCase().includes('latest issue'));await page.locator('.nl-card .pill').click();await page.locator('.nl-full').waitFor();
 // A signed-in free account can return from the gate to the edition.
 await context.clearCookies();await page.reload();await page.locator('#newsletter-subscribe-gate').waitFor();await page.locator('[data-newsletter-signin]').click();await page.locator('#si-email').fill('local-reader@example.test');await page.locator('#si-pass').fill('local-test-password');await page.locator('[data-auth] button[type="submit"]').click();await page.locator('.nl-full').waitFor();assert.equal(new URL(page.url()).pathname,'/newsletter/001');
 await page.evaluate(()=>signOut());await page.goto(base+'/newsletter/001');await page.locator('#newsletter-subscribe-gate').waitFor();assert.equal(await page.locator('.nl-full').count(),0);
 // Failed/inactive signup never removes the gate.
 await scenario({subscriptionStatus:'inactive'});await page.locator('#sub-edition').fill('inactive@example.test');await page.locator('#newsletter-subscribe-gate button[type="submit"]').click();await page.locator('#newsletter-subscribe-gate .sub-note').filter({hasText:'confirm your subscription'}).waitFor();assert.equal(await page.locator('.nl-full').count(),0);
 await page.goto(base+'/');await page.locator('.px-issue').waitFor();await page.locator('.px-issue').click();await page.locator('#newsletter-subscribe-gate').waitFor();
 assert.deepEqual(errors,[]);const report={results,automatic_release_transition:true,gate_after_brief:true,signup_unlock_and_refresh:true,free_account_return:true,logout_regates:true,inactive_subscription_stays_gated:true,homepage_and_latest_links:true,browser_errors:errors,upstreams:'mocked; no live subscriptions, accounts or email sends'};fs.writeFileSync(path.join(out,'newsletter-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
