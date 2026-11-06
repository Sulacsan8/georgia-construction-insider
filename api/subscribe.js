import { handle, json, HttpError, setting } from "./_lib.js";

// The Georgia Build signup boxes post here. Adds the email to the Beehiiv publication
// and asks Beehiiv to send its welcome email. The API key lives only in Vercel (BEEHIIV_API_KEY).
const PUBLICATION = process.env.BEEHIIV_PUBLICATION_ID || "pub_94f5fb45-308a-4856-b825-4d0c5d07844b";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST = handle(async (request) => {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Please enter a valid email address.");
  }
  if (body.company) return json(200, { ok: true }); // hidden field only bots fill in
  const email = String(body.email || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  const page = String(body.page || "").slice(0, 120);

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${PUBLICATION}/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${setting("BEEHIIV_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      reactivate_existing: false,
      send_welcome_email: true,
      utm_source: "georgiaconstructioninsider.com",
      utm_medium: "website",
      utm_campaign: page || undefined,
      referring_site: "https://georgiaconstructioninsider.com" + (page.startsWith("/") ? page : ""),
    }),
  });
  if (!res.ok) {
    console.error("Beehiiv subscribe failed", res.status, (await res.text()).slice(0, 300));
    throw new HttpError(502, "Sorry, we couldn't subscribe you just now. Please try again in a few minutes.");
  }
  const data = (await res.json()).data || {};
  if (data.status === "invalid") throw new HttpError(400, "That email address doesn't look right. Please check it and try again.");
  return json(200, { ok: true });
});
