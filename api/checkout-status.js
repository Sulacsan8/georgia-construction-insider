import { handle, json, HttpError } from "./_lib.js";
import { linkCheckout } from "./_members.js";

// Called by the /welcome page after checkout. Links the payment to a member account
// (creating one for visitors who weren't signed in) and returns the email for the set-password link.
export const GET = handle(async (request) => {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Missing checkout reference.");
  const result = await linkCheckout(id);
  if (!result) return json(202, { pending: true });
  return json(200, result);
});
