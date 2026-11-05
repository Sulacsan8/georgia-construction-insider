// Shared helpers for the membership functions. Files starting with "_" are not exposed as routes.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function setting(name) {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `Server setting ${name} is missing.`);
  return value;
}

export function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Wraps a handler so errors become clean JSON responses without leaking details.
export function handle(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(err);
      const message = err instanceof HttpError ? err.message : "Something went wrong. Please try again.";
      return json(status, { error: message });
    }
  };
}

export const siteOrigin = (request) => new URL(request.url).origin;

// Stripe expects form encoding with bracketed keys for nested objects and arrays.
function encode(value, prefix, out = []) {
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof item === "object") encode(item, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(item)}`);
  }
  return out;
}

export async function stripe(method, path, params) {
  const query = params && method === "GET" ? `?${encode(params).join("&")}` : "";
  const res = await fetch(`https://api.stripe.com/v1/${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${setting("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params && method !== "GET" ? encode(params).join("&") : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Stripe error", path, data.error?.message);
    throw new HttpError(502, "Payment service error. Please try again.");
  }
  return data;
}

// Sends a transactional email through Resend from the site's verified domain.
export async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${setting("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Georgia Construction Insider <noreply@georgiaconstructioninsider.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

// Works with both legacy service_role JWTs and newer sb_secret_ keys.
function adminHeaders() {
  const key = setting("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function getUser(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in first.");
  const res = await fetch(`${setting("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: setting("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new HttpError(401, "Your session has expired. Please sign in again.");
  return res.json();
}

export async function getMember(userId) {
  const res = await fetch(
    `${setting("SUPABASE_URL")}/rest/v1/members?id=eq.${encodeURIComponent(userId)}&select=*`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new HttpError(502, "We couldn't load your membership.");
  const rows = await res.json();
  return rows[0] || null;
}

export async function updateMembers(filter, fields) {
  const res = await fetch(`${setting("SUPABASE_URL")}/rest/v1/members?${filter}`, {
    method: "PATCH",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new HttpError(502, "We couldn't update your membership.");
  return res.json();
}
