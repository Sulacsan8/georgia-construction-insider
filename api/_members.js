// Links Stripe subscriptions to member accounts. Used by the webhook and /api/checkout-status.
import { stripe, updateMembers, setting, adminHeaders, HttpError } from "./_lib.js";

const PLAN_BY_LOOKUP = { gci_monthly: "monthly", gci_annual_founding: "annual" };

export async function syncSubscription(sub) {
  const item = sub.items?.data?.[0];
  const plan = PLAN_BY_LOOKUP[item?.price?.lookup_key] || null;
  const periodEnd = sub.cancel_at || item?.current_period_end || sub.current_period_end;
  let status = sub.status;
  // The billing portal may schedule a cancellation with cancel_at instead of cancel_at_period_end.
  if (status === "active" && (sub.cancel_at_period_end || sub.cancel_at)) status = "canceling";

  const fields = {
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    status,
    plan,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
  if (plan === "annual") fields.founding_member = true;

  const userId = sub.metadata?.user_id;
  const filter = userId
    ? `id=eq.${encodeURIComponent(userId)}`
    : `stripe_customer_id=eq.${encodeURIComponent(fields.stripe_customer_id)}`;
  const rows = await updateMembers(filter, fields);
  if (!rows.length) console.warn("No member matched subscription", sub.id);
  return rows[0] || null;
}

async function memberIdByEmail(email) {
  const res = await fetch(
    `${setting("SUPABASE_URL")}/rest/v1/members?email=ilike.${encodeURIComponent(email.replace(/([%_\\])/g, "\\$1"))}&select=id&limit=1`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new HttpError(502, "We couldn't look up your account.");
  return (await res.json())[0]?.id || null;
}

// Finds the member account for a checkout email, or creates one (the database trigger adds the members row).
async function ensureGuestMember(email, name) {
  const existing = await memberIdByEmail(email);
  if (existing) return { userId: existing, created: false };

  const res = await fetch(`${setting("SUPABASE_URL")}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, email_confirm: true, user_metadata: name ? { full_name: name } : {} }),
  });
  if (res.ok) return { userId: (await res.json()).id, created: true };

  // The webhook and the welcome page can race; if the other one just created the account, use it.
  const raced = await memberIdByEmail(email);
  if (raced) return { userId: raced, created: true };
  console.error("Creating guest member failed", res.status, await res.text());
  throw new HttpError(502, "We couldn't create your account.");
}

// Makes sure a completed checkout is attached to a member account. Returns null if it isn't paid yet.
export async function linkCheckout(sessionOrId) {
  const session = typeof sessionOrId === "string"
    ? await stripe("GET", `checkout/sessions/${encodeURIComponent(sessionOrId)}`)
    : sessionOrId;
  if (session.mode !== "subscription" || !session.subscription || session.status !== "complete") return null;

  const sub = await stripe("GET", `subscriptions/${session.subscription}`);
  const email = session.customer_details?.email || session.customer_email;
  let userId = sub.metadata?.user_id || session.client_reference_id;
  let created = false;

  if (!userId) {
    if (!email) throw new HttpError(502, "Checkout didn't include an email address.");
    ({ userId, created } = await ensureGuestMember(email, session.customer_details?.name));
    await stripe("POST", `subscriptions/${sub.id}`, { metadata: { user_id: userId } });
    if (session.customer) await stripe("POST", `customers/${session.customer}`, { metadata: { user_id: userId } });
  }

  sub.metadata = { ...sub.metadata, user_id: userId };
  const member = await syncSubscription(sub);
  return { email: member?.email || email, created, guest: !session.client_reference_id };
}
