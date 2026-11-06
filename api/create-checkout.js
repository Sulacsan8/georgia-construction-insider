import { handle, json, stripe, getUser, getMember, updateMembers, siteOrigin, HttpError } from "./_lib.js";

const PLANS = { monthly: "gci_monthly", annual: "gci_annual_founding" };
const CURRENT = ["active", "trialing", "past_due", "canceling"];

export const POST = handle(async (request) => {
  const { plan } = await request.json().catch(() => ({}));
  const lookupKey = PLANS[plan];
  if (!lookupKey) throw new HttpError(400, "Please choose a membership plan.");

  const prices = await stripe("GET", "prices", { lookup_keys: [lookupKey], active: "true" });
  const price = prices.data[0];
  if (!price) throw new HttpError(500, "This plan isn't available right now.");

  const origin = siteOrigin(request);
  const params = {
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: "true",
    // Plain Stripe checkout, matching Texas Construction Hub (no 3.5% merchant-of-record fee).
    managed_payments: { enabled: "false" },
    cancel_url: `${origin}/membership`,
  };

  // Visitors without an account go straight to checkout; the webhook and /api/checkout-status
  // create their member account from the checkout email afterwards.
  if (!/^Bearer\s+\S/i.test(request.headers.get("authorization") || "")) {
    params.success_url = `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`;
    const session = await stripe("POST", "checkout/sessions", params);
    return json(200, { url: session.url });
  }

  const user = await getUser(request);
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

  const session = await stripe("POST", "checkout/sessions", {
    ...params,
    customer,
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id } },
    metadata: { user_id: user.id },
    success_url: `${origin}/dashboard?checkout=success`,
  });

  return json(200, { url: session.url });
});
