import { createHmac, timingSafeEqual } from "node:crypto";
import { setting } from "./_lib.js";

const NAME = "gci_newsletter_access";
const MAX_AGE = 60 * 60 * 24 * 30;
const sign = (value) => createHmac("sha256", process.env.NEWSLETTER_COOKIE_SECRET || setting("BEEHIIV_API_KEY")).update("gci-newsletter:" + value).digest("base64url");

export function hasNewsletterAccess(request, now = Date.now()) {
  const value = (request.headers.get("cookie") || "").split(";").map(s => s.trim()).find(s => s.startsWith(NAME + "="))?.slice(NAME.length + 1);
  if (!value || value.length > 512) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !/^[\w-]+$/.test(payload + signature)) return false;
  try {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.v === 1 && Number.isFinite(data.exp) && data.exp > now && data.exp <= now + MAX_AGE * 1000;
  } catch { return false; }
}

export function grantNewsletterAccess(response, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: now + MAX_AGE * 1000 })).toString("base64url");
  response.headers.append("set-cookie", `${NAME}=${payload}.${sign(payload)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

export function clearNewsletterAccess(response) {
  response.headers.append("set-cookie", `${NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
