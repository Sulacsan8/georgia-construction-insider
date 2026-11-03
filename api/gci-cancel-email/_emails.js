// Branded membership emails, matching the Supabase account email templates.

const SITE = "https://georgiaconstructioninsider.com";

const escape = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function layout({ heading, paragraphs, button }) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#000000;">${p}</p>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d4d4d4;">
      <tr><td style="padding:24px 32px;border-bottom:4px solid #cc050d;">
        <div style="font-family:'Arial Black',Arial,sans-serif;font-size:20px;line-height:1.2;color:#000000;letter-spacing:.5px;">GEORGIA <span style="color:#cc050d;">CONSTRUCTION</span> INSIDER</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#000000;">${heading}</h1>
        ${body}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td style="background:#cc050d;border-radius:4px;">
          <a href="${button.url}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${button.label}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #d4d4d4;font-size:12px;line-height:1.6;color:#6b6b6b;">
        © 2026 Georgia Construction Insider · <a href="${SITE}" style="color:#6b6b6b;">georgiaconstructioninsider.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const greeting = (name) => (name ? `Hi ${escape(name.split(" ")[0])},` : "Hi there,");

// Sent when a member schedules a cancellation; access continues until the period ends.
export function cancellationScheduled({ name, endsAt }) {
  const date = formatDate(endsAt);
  return {
    subject: "Your Georgia Construction Insider membership has been cancelled",
    html: layout({
      heading: "Your membership has been cancelled",
      paragraphs: [
        greeting(name),
        `We've cancelled your membership as requested. You won't be charged again, and you'll keep full access until <strong>${date}</strong>.`,
        "Changed your mind? You can restart your membership any time before then from the Billing tab in your dashboard.",
      ],
      button: { label: "Go to Dashboard", url: `${SITE}/#dashboard` },
    }),
  };
}

// Sent when a membership actually ends.
export function membershipEnded({ name }) {
  return {
    subject: "Your Georgia Construction Insider membership has ended",
    html: layout({
      heading: "Your membership has ended",
      paragraphs: [
        greeting(name),
        "Your Georgia Construction Insider membership has now ended, and premium access has been switched off.",
        "Thanks for being a member. You can rejoin any time to get full access to Georgia construction news and the Project Tracker.",
      ],
      button: { label: "Rejoin", url: `${SITE}/#membership` },
    }),
  };
}
