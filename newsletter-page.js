// Public presentation only. Edition copy is served by /api/newsletter after release/access checks.
let gciNewsletterRequest = 0, gciNewsletterTimer = null, gciNewsletterUser;
const gciNewsletterRoute = () => currentRoute === "newsletters" || /^nl-\d{3}$/.test(currentRoute);
function cancelNewsletterLoad() { gciNewsletterRequest++; clearTimeout(gciNewsletterTimer); }
function newsletterPage(detail = false) {
  return `<div class="wrap nl-page">${detail ? '<a class="nl-back" href="/newsletter" data-go="newsletters">← All editions</a>' : pourBand("sub-page")}<div id="gci-newsletter-root" aria-live="polite"><p class="nl-loading">Loading The Georgia Build…</p></div></div>`;
}
function newsletterGate() {
  return `<section class="nl-gate" id="newsletter-subscribe-gate" aria-labelledby="newsletter-gate-title"><span class="mono">The Georgia Build · Free newsletter</span><h2 id="newsletter-gate-title">Subscribe for free to keep reading</h2><p>Get the full edition and Georgia’s construction news in your inbox. No payment required.</p>${subForm("sub-edition","Subscribe & continue reading","Free to join. Unsubscribe anytime.")}<p class="nl-signin">Already have a GCI account? <a href="/sign-in" data-newsletter-signin>Sign in</a></p></section>`;
}
function newsletterReleaseTime(value) {
  return new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", weekday:"long", month:"long", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short" }).format(new Date(value));
}
function newsletterCard(data, previous = false) {
  return `<section class="nl-latest"><span class="mono">${previous ? "Previous issue" : data.released ? "Latest issue" : "Upcoming issue"} · #${esc(data.id)}</span><article class="nl-card"><a href="${esc(data.url)}" data-go="nl-${esc(data.id)}"><img src="${esc(data.thumbnail)}" alt="${esc(data.title)}: ${esc(data.headline)}" width="800" height="450"></a><div><h2><a href="${esc(data.url)}" data-go="nl-${esc(data.id)}">${esc(data.title)}</a></h2><h3>${esc(data.headline)}</h3><p>${esc(data.description)}</p><p class="nl-release">${data.released ? "Released" : "Releases"} ${esc(newsletterReleaseTime(data.releaseAt))}</p><a class="pill" href="${esc(data.url)}" data-go="nl-${esc(data.id)}">${previous ? "Read this issue" : data.released ? "Read the latest issue" : "View scheduled edition"} →</a></div></article></section>`;
}
async function loadNewsletter(options = {}) {
  if (!gciNewsletterRoute()) return;
  clearTimeout(gciNewsletterTimer);
  const requestId = ++gciNewsletterRequest, route = currentRoute, detail = route.startsWith("nl-");
  const id = detail ? route.slice(3) : window.GCI_NEWSLETTER.id;
  const root = document.getElementById("gci-newsletter-root");
  if (!root) return;
  try {
    if (detail) await authInit;
    if (requestId !== gciNewsletterRequest || currentRoute !== route) return;
    const token = detail && session && sb ? await freshToken() : null;
    const ids = detail ? [id] : (window.GCI_NEWSLETTERS || [window.GCI_NEWSLETTER]).map(item => item.id);
    const [data, ...previous] = await Promise.all(ids.map(async editionId => {
      const res = await fetch(`/api/newsletter?edition=${encodeURIComponent(editionId)}${detail ? "" : "&summary=1"}`, { cache:"no-store", credentials:"same-origin", headers:token ? {Authorization:"Bearer "+token} : {} });
      const item = await res.json();
      if (!res.ok) throw new Error(item.error || "This edition could not be loaded.");
      return item;
    }));
    if (requestId !== gciNewsletterRequest || currentRoute !== route || !root.isConnected) return;
    if (!detail) root.innerHTML = newsletterCard(data) + previous.map(item => newsletterCard(item, true)).join("");
    else if (!data.released) {
      root.innerHTML = `<section class="nl-scheduled"><span class="mono">Scheduled edition · #${esc(data.id)}</span><h1>${esc(data.title)}</h1><img class="nl-cover" src="${esc(data.thumbnail)}" alt="${esc(data.title)} thumbnail" width="800" height="450"><h2>${esc(data.headline)}</h2><p>${esc(data.description)}</p><p>This edition releases ${esc(newsletterReleaseTime(data.releaseAt))}.</p>${countdownHTML().replace("data-countdown",`data-countdown data-target="${esc(data.releaseAt)}" data-server-offset="${data.serverNow-Date.now()}"`).replace("Next edition:","Release:")}${subForm("sub-scheduled")}</section>`;
      tickCountdown();
    } else {
      root.innerHTML = `<article class="nl-copy" aria-label="${esc(data.title)}"><div class="nl-teaser">${data.teaserHtml}</div>${data.access === "full" ? `<div class="nl-full">${data.bodyHtml}</div>` : newsletterGate()}</article>`;
      if (options.afterSubscribe && data.access === "full") root.querySelector(".nl-full").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if (!data.released) {
      const remaining = Date.parse(data.releaseAt)-data.serverNow;
      gciNewsletterTimer = setTimeout(()=>loadNewsletter(), Math.max(250,Math.min(60000,remaining+100)));
    }
  } catch (error) {
    if (requestId !== gciNewsletterRequest || currentRoute !== route || !root.isConnected) return;
    root.innerHTML = `<section class="nl-error"><h1>The Georgia Build</h1><p>${esc(error.message || "We couldn’t load this edition. Please try again.")}</p><button class="pill" type="button" data-newsletter-retry>Try again</button></section>`;
  }
}
function newsletterAuthChanged() {
  const userId = session?.user?.id || null;
  if (userId === gciNewsletterUser) return;
  gciNewsletterUser = userId;
  if (!gciNewsletterRoute()) return;
  cancelNewsletterLoad();
  const root = document.getElementById("gci-newsletter-root");
  if (root) root.innerHTML = '<p class="nl-loading">Loading The Georgia Build…</p>';
  // Supabase callbacks must return before another auth operation starts.
  setTimeout(()=>loadNewsletter(),0);
}
function newsletterReturnRoute() {
  try { const route=sessionStorage.getItem("gci_return_newsletter");sessionStorage.removeItem("gci_return_newsletter");return /^nl-\d{3}$/.test(route||"")?route:null; } catch { return null; }
}
document.addEventListener("click", event => {
  const signin = event.target.closest("[data-newsletter-signin]");
  if (signin) { event.preventDefault();try{sessionStorage.setItem("gci_return_newsletter",currentRoute)}catch{} state.authMode="signin";go("signin",false,"push"); }
  if (event.target.closest("[data-newsletter-retry]")) loadNewsletter();
});
