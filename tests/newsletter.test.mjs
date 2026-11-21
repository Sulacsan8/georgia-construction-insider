import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { GET, DELETE } from "../api/newsletter.js";
import { POST } from "../api/subscribe.js";
import { metadata, edition, editions } from "../api/_newsletter-edition.js";
import { grantNewsletterAccess } from "../api/_newsletter-access.js";

const release = Date.parse(metadata.releaseAt);
const request = (headers = {}, query = "") => new Request("https://georgiaconstructioninsider.com/api/newsletter?edition=" + metadata.id + query, { headers });
const signup = (body) => new Request("https://georgiaconstructioninsider.com/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const cookie = () => grantNewsletterAccess(new Response()).headers.get("set-cookie").split(";")[0];

test("scheduled release, subscription access, account access and private payload boundaries", async () => {
  const originalNow = Date.now, originalFetch = globalThis.fetch;
  let now = release - 1, status = "active", upstreamStatus = 200, calls = 0;
  Date.now = () => now;
  process.env.BEEHIIV_API_KEY = "local-newsletter-test-key-only";
  process.env.SUPABASE_URL = "https://gci-auth.invalid";
  process.env.SUPABASE_ANON_KEY = "local-anon-test-key";
  globalThis.fetch = async (url, options) => {
    calls++;
    if (String(url).endsWith("/auth/v1/user")) return Response.json(options.headers.Authorization === "Bearer valid-test-session" ? { id: "test-reader" } : {}, { status: options.headers.Authorization === "Bearer valid-test-session" ? 200 : 401 });
    assert(String(url).includes("api.beehiiv.com/v2/publications/"));
    return Response.json({ data: { status } }, { status: upstreamStatus });
  };
  try {
    assert.equal(metadata.id,"002");assert.equal(metadata.releaseAt,"2026-11-22T17:00:00.000Z");
    const signedCookie = cookie();
    for (const headers of [{}, {cookie:signedCookie}, {authorization:"Bearer valid-test-session"}]) {
      const res=await GET(request(headers)), data=await res.json();
      assert.equal(data.released,false);assert.equal(data.access,"scheduled");assert.equal(data.teaserHtml,undefined);assert.equal(data.bodyHtml,undefined);
    }
    assert.equal(calls,0,"Access services must not run before publication");
    now=release;
    const publicResponse=await GET(request()), publicData=await publicResponse.json();
    assert.equal(publicData.access,"subscribe");assert.equal(publicData.bodyHtml,undefined);assert.equal(publicData.teaserHtml,edition.teaserHtml);
    assert.deepEqual([...publicData.teaserHtml.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map(match=>match[1]),["Today’s Brief"]);
    assert(!publicData.teaserHtml.includes("OpenAI’s $20 Billion Project Camellia Wins Site-Plan Approval"));
    assert.equal(publicResponse.headers.get("cache-control"),"private, no-store");assert.equal(publicResponse.headers.get("vary"),"Cookie, Authorization");
    for (const headers of [{cookie:signedCookie},{authorization:"Bearer valid-test-session"}]) assert.equal((await (await GET(request(headers))).json()).bodyHtml,edition.bodyHtml);
    for (const headers of [{cookie:signedCookie+"x"},{cookie:"gci_newsletter_access=made.up"},{authorization:"Bearer expired"}]) assert.equal((await (await GET(request(headers))).json()).bodyHtml,undefined);
    const summary=await (await GET(request({cookie:signedCookie},"&summary=1"))).json();assert.equal(summary.teaserHtml,undefined);assert.equal(summary.bodyHtml,undefined);
    assert.equal((await GET(new Request("https://site.invalid/api/newsletter?edition=999"))).status,404);
    assert.equal((await POST(signup({email:"invalid"}))).status,400);
    const trap=await POST(signup({email:"reader@example.test",company:"bot"}));assert.equal(trap.headers.get("set-cookie"),null);
    for(status of ["pending","validating","inactive","invalid"]) {
      const res=await POST(signup({email:"reader@example.test"}));assert.equal(res.headers.get("set-cookie"),null);
    }
    status="active";upstreamStatus=503;
    assert.equal((await POST(signup({email:"reader@example.test"}))).status,502);
    upstreamStatus=200;
    const subscribed=await POST(signup({email:"reader@example.test"}));
    assert.equal((await subscribed.clone().json()).newsletterAccess,true);
    assert.match(subscribed.headers.get("set-cookie"),/HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await (await GET(request({cookie:subscribed.headers.get("set-cookie").split(";")[0]}))).json()).access,"full");
    now+=31*24*60*60*1000;assert.equal((await (await GET(request({cookie:signedCookie}))).json()).access,"subscribe");
    assert.match((await DELETE()).headers.get("set-cookie"),/Max-Age=0/);
  } finally { Date.now=originalNow;globalThis.fetch=originalFetch; }
});

test("static build includes metadata and route, but never the private newsletter HTML", () => {
  const marker="The campus plan includes vehicle assembly, paint and stamping facilities";
  const marker002="<b>OpenAI’s Project Camellia</b> on November 17";
  function walk(dir) { for(const entry of readdirSync(dir,{withFileTypes:true})) { const file=dir+"/"+entry.name;if(entry.isDirectory())walk(file);else if(/\.(html|js|json)$/.test(file)){const content=readFileSync(file,"utf8");assert(!content.includes(marker),file);assert(!content.includes(marker002),file);assert(!content.includes('export const edition ='),file);} } }
  walk("public");
  for(const {metadata:item,edition:copy} of editions) {
    const page=readFileSync(`public${item.url}.html`,"utf8");assert(page.includes(`rel="canonical" href="https://georgiaconstructioninsider.com${item.url}"`));assert(page.includes(item.thumbnail));
    assert(readFileSync("public/sitemap.xml","utf8").includes(item.url));assert(existsSync(`public${item.thumbnail}`));
    for(const [,src] of copy.bodyHtml.matchAll(/<img\b[^>]*src="([^"]+)"/g))assert(existsSync(`public${src}`),src);
  }
  const publicWindow={};new Function("window",readFileSync("newsletter-meta.js","utf8"))(publicWindow);
  assert.deepEqual(publicWindow.GCI_NEWSLETTER,metadata);assert.deepEqual(publicWindow.GCI_NEWSLETTERS,editions.map(item=>item.metadata));
});

test("the archive remains available independently of the newest release", async () => {
  const originalNow=Date.now;
  let now=release-1;Date.now=()=>now;process.env.BEEHIIV_API_KEY="local-newsletter-test-key-only";
  const get=(id,headers={})=>GET(new Request(`https://site.invalid/api/newsletter?edition=${id}`,{headers}));
  try {
    assert.deepEqual(editions.map(item=>item.metadata.id),["002","001"]);
    const previous=editions.find(item=>item.metadata.id==="001");
    assert.equal((await (await get("001")).json()).access,"subscribe");
    assert.equal((await (await get("001",{cookie:cookie()})).json()).bodyHtml,previous.edition.bodyHtml);
    assert.equal((await (await GET(new Request("https://site.invalid/api/newsletter"))).json()).id,"002");
    now=Date.parse(previous.metadata.releaseAt)-1;
    for(const headers of [{},{cookie:cookie()},{authorization:"Bearer local-reader-token"}]) {
      const data=await (await get("001",headers)).json();assert.equal(data.access,"scheduled");assert.equal(data.teaserHtml,undefined);assert.equal(data.bodyHtml,undefined);
    }
    now++;
    assert.equal((await (await get("001")).json()).teaserHtml,previous.edition.teaserHtml);
    assert.equal((await (await get("001",{cookie:cookie()})).json()).bodyHtml,previous.edition.bodyHtml);
  } finally {Date.now=originalNow;}
});
