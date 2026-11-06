// Runs on Vercel at each deploy. Writes the site into public/ with one HTML file per clean address,
// each carrying its own title, description and social-preview tags, plus sitemap.xml and robots.txt.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from "node:fs";

const SITE = "https://georgiaconstructioninsider.com";
const OUT = "public";
const html = readFileSync("index.html", "utf8");

// Pull a JS literal (array or object) out of index.html by its declaration, e.g. "const STORIES=".
function literal(decl, close) {
  const start = html.indexOf(decl);
  if (start < 0) throw new Error(`${decl} not found in index.html`);
  const from = start + decl.length;
  const end = html.indexOf(close, from);
  return new Function(`return ${html.slice(from, end + close.length - 1)}`)();
}
const STORIES = literal("const STORIES=", "\n];");
const AUTHOR_BEATS = literal("const AUTHOR_BEATS=", "\n};");
const authorOf = (s) => s.author || Object.keys(AUTHOR_BEATS).find((a) => AUTHOR_BEATS[a].includes(s.sector)) || "GCI Staff";

const esc = (t) => String(t ?? "").replace(/<[^>]+>/g, "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const abs = (p) => (/^https?:/.test(p) ? p : SITE + (p.startsWith("/") ? p : "/" + p));

function page({ path, title, description, image, type = "website", jsonLd, noindex }) {
  const url = SITE + path;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    noindex ? `<meta name="robots" content="noindex">` : "",
    `<meta property="og:site_name" content="Georgia Construction Insider">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${abs(image || "/images/og-default.jpg")}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ].filter(Boolean).join("\n");
  const out = html.replace(/<!--SEO-->[\s\S]*?<!--\/SEO-->/, `<!--SEO-->${tags}<!--/SEO-->`);
  if (out === html && path !== "/") throw new Error("SEO block not found in index.html");
  return out;
}

const write = (file, content) => {
  mkdirSync(file.slice(0, file.lastIndexOf("/")) || OUT, { recursive: true });
  writeFileSync(file, content);
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync("images", `${OUT}/images`, { recursive: true });
for (const f of ["favicon.ico", "site.webmanifest"]) cpSync(f, `${OUT}/${f}`);

const DESC = "Georgia construction news, major projects and industry updates, from Metro Atlanta to the coast.";
const SECTIONS = [
  ["/", "Georgia Construction Insider | Georgia Construction News and Projects", DESC],
  ["/news", "Latest Georgia Construction News | Georgia Construction Insider", "The latest Georgia construction news, project announcements and industry updates."],
  ["/project-tracker", "Project Tracker | Georgia Construction Insider", "Track Georgia's biggest construction projects, from announcement to completion."],
  ["/newsletter", "The Georgia Build Newsletter | Georgia Construction Insider", "Get The Georgia Build, our free weekly newsletter on Georgia construction news and projects."],
  ["/sponsors", "Sponsors and Advertising | Georgia Construction Insider", "Reach Georgia's construction industry with Georgia Construction Insider."],
  ["/membership", "Membership | Georgia Construction Insider", "Unlock premium Georgia construction news, project insights and the Project Tracker."],
  ["/contact", "Contact Us | Georgia Construction Insider", "Get in touch with the Georgia Construction Insider team."],
  ["/privacy", "Privacy Policy | Georgia Construction Insider", DESC],
  ["/terms", "Terms and Conditions | Georgia Construction Insider", DESC],
  ["/refunds", "Refund Policy | Georgia Construction Insider", DESC],
];
// One page per industry at /industry/<slug>, matching INDUSTRIES and indSlug in index.html.
const INDUSTRIES = ["Civil", "Commercial", "Data Center", "Energy & Solar", "Federal & Government", "Healthcare", "Industrial", "Market Intelligence", "Semi-Conductor & Manufacturing", "Transportation", "Water"];
const indSlug = (t) => t.toLowerCase().replace(/&/g, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
for (const t of INDUSTRIES) {
  SECTIONS.push([`/industry/${indSlug(t)}`, `${t} Construction News | Georgia Construction Insider`, `The latest Georgia ${t.toLowerCase()} construction news, projects and industry updates.`]);
}
const PRIVATE = [["/sign-in", "Sign In"], ["/dashboard", "Dashboard"], ["/reset-password", "Reset Password"], ["/welcome", "Welcome"]];

for (const [path, title, description] of SECTIONS) {
  write(path === "/" ? `${OUT}/index.html` : `${OUT}${path}.html`, page({ path, title, description }));
}
for (const [path, name] of PRIVATE) {
  write(`${OUT}${path}.html`, page({ path, title: `${name} | Georgia Construction Insider`, description: DESC, noindex: true }));
}

for (const s of STORIES) {
  const path = "/news/" + s.id.replace(/^story-/, "");
  const title = s.title.replace(/<[^>]+>/g, "");
  write(`${OUT}${path}.html`, page({
    path,
    title: `${title} | Georgia Construction Insider`,
    description: s.dek,
    image: s.img,
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: title,
      description: s.dek.replace(/<[^>]+>/g, ""),
      image: [abs(s.img || "/images/og-default.jpg")],
      datePublished: s.iso,
      author: [{ "@type": "Person", name: authorOf(s) }],
      publisher: { "@type": "Organization", name: "Georgia Construction Insider", url: SITE },
      mainEntityOfPage: SITE + path,
    },
  }));
}

// Project Insights: each insights/<slug>.js pushes one profile onto INSIGHTS. They are joined into
// public/insights.js (loaded by every page) and each profile gets its own page at /project-insights/<slug>.
const insightFiles = readdirSync("insights").filter((f) => f.endsWith(".js")).sort();
const insightJs = "var INSIGHTS=window.INSIGHTS=[];\n" + insightFiles.map((f) => readFileSync(`insights/${f}`, "utf8")).join("\n");
write(`${OUT}/insights.js`, insightJs);
const INSIGHTS = new Function("window", insightJs + "\nreturn INSIGHTS;")({});
write(`${OUT}/project-insights.html`, page({
  path: "/project-insights",
  title: "Project Insights | Georgia Construction Insider",
  description: "In-depth profiles of Georgia's biggest construction projects: investment, timelines, the companies behind each build, incentives and status.",
}));
for (const p of INSIGHTS) {
  const path = `/project-insights/${p.slug}`;
  write(`${OUT}${path}.html`, page({
    path,
    title: `${p.title} | Project Insights | Georgia Construction Insider`,
    description: p.dek,
    image: p.img || undefined,
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: p.title,
      description: p.dek,
      image: [abs(p.img || "/images/og-default.jpg")],
      dateModified: p.updated,
      author: [{ "@type": "Person", name: authorOf(p) }],
      publisher: { "@type": "Organization", name: "Georgia Construction Insider", url: SITE },
      mainEntityOfPage: SITE + path,
      isAccessibleForFree: p.access === "free",
    },
  }));
}

const today = new Date().toISOString().slice(0, 10);
const urls = [
  ...SECTIONS.map(([path]) => `<url><loc>${SITE}${path}</loc><lastmod>${today}</lastmod></url>`),
  `<url><loc>${SITE}/project-insights</loc><lastmod>${today}</lastmod></url>`,
  ...INSIGHTS.map((p) => `<url><loc>${SITE}/project-insights/${p.slug}</loc><lastmod>${p.updated}</lastmod></url>`),
  ...STORIES.map((s) => `<url><loc>${SITE}/news/${s.id.replace(/^story-/, "")}</loc><lastmod>${s.iso}</lastmod></url>`),
];
write(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
write(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /sign-in\nDisallow: /reset-password\nDisallow: /welcome\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${SECTIONS.length + PRIVATE.length} section pages, ${STORIES.length} article pages and ${INSIGHTS.length + 1} Project Insights pages.`);
