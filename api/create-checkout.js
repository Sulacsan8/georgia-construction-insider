import { handle, json, stripe, getUser, getMember, updateMembers, siteOrigin, HttpError } from "./_lib.js";

const PLANS = { monthly: "gci_monthly", annual: "gci_annual_founding" };
const CURRENT = ["active", "trialing", "past_due", "canceling"];

export const POST = handle(async (request) => {
  const user = await getUser(request);
  const { plan } = await request.json().catch(() => ({}));
  const lookupKey = PLANS[plan];
  if (!lookupKey) throw new HttpError(400, "Please choose a membership plan.");

  const member = await getMember(user.id);
  if (!member) throw new HttpError(404, "We couldn't find your account. Please sign out and sign in again.");
  if (CURRENT.includes(member.status)) {
    throw new HttpError(409, "You already have a membership. You can manage it from your dashboard.");
  }

  let customer = member.stripe_customer_id;
  if (!customer) {
    const created = await stripe("POST", "customers", {
      email: user.email,
      name: member.full_name || undefined,
      metadata: { user_id: user.id },
    });
    customer = created.id;
    await updateMembers(`id=eq.${encodeURIComponent(user.id)}`, { stripe_customer_id: customer });
  }

  const prices = await stripe("GET", "prices", { lookup_keys: [lookupKey], active: "true" });
  const price = prices.data[0];
  if (!price) throw new HttpError(500, "This plan isn't available right now.");

  const origin = siteOrigin(request);
  const session = await stripe("POST", "checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    metadata: { user_id: user.id },
    allow_promotion_codes: "true",
    success_url: `${origin}/?checkout=success#dashboard`,
    cancel_url: `${origin}/#membership`,
  });

  return json(200, { url: session.url });
});
