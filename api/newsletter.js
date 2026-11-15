import { handle, json, getUser, HttpError } from "./_lib.js";
import { hasNewsletterAccess, clearNewsletterAccess } from "./_newsletter-access.js";
import { metadata, edition } from "./_newsletter-edition.js";

const reply = (data) => {
  const response = json(200, data);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "Cookie, Authorization");
  return response;
};

export const GET = handle(async (request) => {
  const id = new URL(request.url).searchParams.get("edition") || metadata.id;
  if (id !== metadata.id) throw new HttpError(404, "This edition could not be found.");
  const now = Date.now();
  const common = { ...metadata, serverNow: now };
  // The server clock controls publication, even for subscribed or signed-in readers.
  if (now < Date.parse(metadata.releaseAt)) return reply({ ...common, released: false, access: "scheduled" });
  if (new URL(request.url).searchParams.get("summary") === "1") return reply({ ...common, released: true, access: "summary" });
  let allowed = hasNewsletterAccess(request, now);
  if (!allowed && request.headers.get("authorization")) {
    try { allowed = Boolean((await getUser(request)).id); }
    catch (error) { if (!(error instanceof HttpError) || error.status !== 401) throw error; }
  }
  return reply({ ...common, released: true, access: allowed ? "full" : "subscribe", teaserHtml: edition.teaserHtml, ...(allowed ? { bodyHtml: edition.bodyHtml } : {}) });
});

export const DELETE = handle(async () => clearNewsletterAccess(reply({ ok: true })));
