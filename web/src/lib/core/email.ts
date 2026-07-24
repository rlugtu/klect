import "server-only";

/**
 * Transactional email — currently just the waitlist welcome. Sent through EmailJS's
 * REST API server-side (non-browser), so mail goes out via a connected mailbox (Gmail /
 * Workspace) with no domain/DNS setup required. Modeled on the push module
 * ({@link ./push.ts}): best-effort and unconfigured-safe. Every send is wrapped so a mail
 * failure never blocks (or throws out of) the write that triggered it, and the whole
 * module no-ops cleanly when the EmailJS env is unset (local / CI / preview).
 *
 * Setup (one-time, in the EmailJS dashboard):
 *  - Connect an email service (Gmail/Outlook/SMTP) → `EMAILJS_SERVICE_ID`.
 *  - Create a template → `EMAILJS_TEMPLATE_ID`; set its "To Email" field to `{{to_email}}`.
 *  - Account → API Keys: copy the public key (`EMAILJS_PUBLIC_KEY`) and private key
 *    (`EMAILJS_PRIVATE_KEY`), and enable "Allow EmailJS API for non-browser applications".
 */

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

/**
 * Send the "you're on the waitlist" confirmation. Fire-and-forget: called from
 * `addWaitlistSignup` only on a first-time signup. No-ops (and logs) when EmailJS is
 * unconfigured, and swallows any send error so the signup itself always succeeds.
 */
export async function sendWaitlistWelcome(email: string): Promise<void> {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.warn("[email] EmailJS env not set — waitlist welcome email skipped.");
    return;
  }

  try {
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        // Required for server-side (non-browser) sends; must be enabled in the dashboard.
        accessToken: privateKey,
        // Values the EmailJS template can reference as {{to_email}} etc.
        template_params: { to_email: email },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] waitlist welcome failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.error("[email] waitlist welcome threw:", err);
  }
}
