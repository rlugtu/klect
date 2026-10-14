import "server-only";

/**
 * Transactional email (waitlist welcome + password reset). Sent through EmailJS's
 * REST API server-side (non-browser), so mail goes out via a connected mailbox (Gmail /
 * Workspace) with no domain/DNS setup required. Modeled on the push module
 * ({@link ./push.ts}): best-effort and unconfigured-safe. Every send is wrapped so a mail
 * failure never blocks (or throws out of) the write that triggered it, and the whole
 * module no-ops cleanly when the EmailJS env is unset (local / CI / preview).
 *
 * Setup (one-time, in the EmailJS dashboard):
 *  - Connect an email service (Gmail/Outlook/SMTP) → `EMAILJS_SERVICE_ID`.
 *  - Create a template → `EMAILJS_TEMPLATE_ID`; set its "To Email" field to `{{to_email}}`.
 *  - Create a second template for password reset → `EMAILJS_RESET_PASSWORD_TEMPLATE_ID`; same
 *    `{{to_email}}` "To Email" field, and use `{{reset_url}}` as the link the user clicks.
 *  - Account → API Keys: copy the public key (`EMAILJS_PUBLIC_KEY`) and private key
 *    (`EMAILJS_PRIVATE_KEY`), and enable "Allow EmailJS API for non-browser applications".
 *
 * The service id and both keys are account-level, so only the template id differs per mail.
 */

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

/**
 * One EmailJS send. `label` only names the mail in logs. Warns and returns when the env
 * (or this mail's template id) is unset, and swallows every transport/API failure, so no
 * caller is ever blocked by mail.
 */
async function send(
  label: string,
  templateId: string | undefined,
  templateParams: Record<string, string>,
): Promise<void> {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.warn(`[email] EmailJS env not set: ${label} email skipped.`);
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
        template_params: templateParams,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] ${label} failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.error(`[email] ${label} threw:`, err);
  }
}

/**
 * Send the "you're on the waitlist" confirmation. Fire-and-forget: called from
 * `addWaitlistSignup` only on a first-time signup. No-ops (and logs) when EmailJS is
 * unconfigured, and swallows any send error so the signup itself always succeeds.
 *
 * Template params: `{{to_email}}`.
 */
export async function sendWaitlistWelcome(email: string): Promise<void> {
  return send("waitlist welcome", process.env.EMAILJS_TEMPLATE_ID, { to_email: email });
}

/**
 * Send the password-reset link. Called from better-auth's `sendResetPassword` hook
 * ({@link ../auth.ts}), which hands us the one-time verification URL; `resetUrl` already
 * carries the reset token, so it goes into the mail verbatim. Same no-op-and-swallow
 * contract as above: a mail failure must not 500 the reset request (which deliberately
 * answers identically whether or not the address has an account).
 *
 * Template params: `{{to_email}}`, `{{reset_url}}`.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  return send("password reset", process.env.EMAILJS_RESET_PASSWORD_TEMPLATE_ID, {
    to_email: email,
    reset_url: resetUrl,
  });
}
