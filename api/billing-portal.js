import { handle, json, stripe, getUser, getMember, siteOrigin, HttpError } from "./_lib.js";

export const POST = handle(async (request) => {
  const user = await getUser(request);
  const member = await getMember(user.id);
  if (!member?.stripe_customer_id) throw new HttpError(404, "You don't have any billing details yet.");

  const params = { customer: member.stripe_customer_id, return_url: `${siteOrigin(request)}/#dashboard` };
  let session;
  try {
    session = await stripe("POST", "billing_portal/sessions", params);
  } catch (err) {
    // Without a default portal setup, fall back to the first active configuration.
    const configs = await stripe("GET", "billing_portal/configurations", { active: "true", limit: 1 });
    if (!configs.data[0]) throw err;
    session = await stripe("POST", "billing_portal/sessions", { ...params, configuration: configs.data[0].id });
  }
  return json(200, { url: session.url });
});
