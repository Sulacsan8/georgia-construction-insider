import crypto from "node:crypto";
import { handle, json, stripe, updateMembers, sendEmail } from "./_lib.js";
import { cancellationScheduled, membershipEnded } from "./_emails.js";

const PLAN_BY_LOOKUP = { gci_monthly: "monthly", gci_annual_founding: "annual" };

// Checks Stripe's signature so only genuine Stripe events can change memberships.
function verifySignature(payload, header, secret) {
  if (!secret) return false;
  const parts = (header || "").split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex"),
  );
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

async function syncSubscription(sub) {
  const item = sub.items?.data?.[0];
  const plan = PLAN_BY_LOOKUP[item?.price?.lookup_key] || null;
  const periodEnd = sub.cancel_at || item?.current_period_end || sub.current_period_end;
  let status = sub.status;
  // The billing portal may schedule a cancellation with cancel_at instead of cancel_at_period_end.
  if (status === "active" && (sub.cancel_at_period_end || sub.cancel_at)) status = "canceling";

  const fields = {
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status,
    plan,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
  if (plan === "annual") fields.founding_member = true;

  const userId = sub.metadata?.user_id;
  const filter = userId
    ? `id=eq.${encodeURIComponent(userId)}`
    : `stripe_customer_id=eq.${encodeURIComponent(sub.customer)}`;
  const rows = await updateMembers(filter, fields);
  if (!rows.length) console.warn("No member matched subscription", sub.id);
  return rows[0] || null;
}

// True when this update is the moment a cancellation was scheduled (not a later, unrelated update).
function justScheduledCancel(event) {
  const sub = event.data.object;
  const prev = event.data.previous_attributes || {};
  const nowCanceling = sub.status === "active" && (sub.cancel_at_period_end || sub.cancel_at);
  const wasCanceling = ("cancel_at" in prev ? prev.cancel_at : sub.cancel_at) ||
    ("cancel_at_period_end" in prev ? prev.cancel_at_period_end : sub.cancel_at_period_end);
  return Boolean(nowCanceling && !wasCanceling);
}

// Email failures are logged but never fail the webhook, so Stripe doesn't retry the membership update.
async function notify(member, message) {
  if (!member?.email) return;
  try {
    await sendEmail({ to: member.email, ...message });
  } catch (err) {
    console.error("Membership email failed", member.id, err.message);
  }
}

export const POST = handle(async (request) => {
  const payload = await request.text();
  if (!verifySignature(payload, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return json(400, { error: "Invalid signature" });
  }

  const event = JSON.parse(payload);
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe("GET", `subscriptions/${session.subscription}`);
        if (!sub.metadata?.user_id && session.client_reference_id) {
          sub.metadata = { ...sub.metadata, user_id: session.client_reference_id };
        }
        await syncSubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
      await syncSubscription(event.data.object);
      break;
    case "customer.subscription.updated": {
      const member = await syncSubscription(event.data.object);
      if (justScheduledCancel(event) && member?.current_period_end) {
        await notify(member, cancellationScheduled({ name: member.full_name, endsAt: member.current_period_end }));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const member = await syncSubscription(event.data.object);
      await notify(member, membershipEnded({ name: member?.full_name }));
      break;
    }
  }
  return json(200, { received: true });
});
