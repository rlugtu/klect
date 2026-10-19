import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { applyRevenueCatEvent, revenueCatWebhookSchema } from "@/lib/core/revenuecat";

/**
 * RevenueCat subscription webhook: POST /api/webhooks/revenuecat
 *
 * RevenueCat calls this on every subscription lifecycle change so the local
 * `Entitlement` row stays in sync and a cap check never has to make a network call.
 * This file owns only the HTTP contract: read the body exactly as sent, prove the
 * request came from RevenueCat, hand the event to core, and turn the result into a
 * status code. Every decision about what the entitlement row becomes lives in
 * `lib/core/revenuecat.ts`, the same way a server action or tRPC procedure would
 * delegate to core instead of holding business logic at the transport edge.
 *
 * ## Not yet exercised against a live delivery
 *
 * The RevenueCat project does not exist yet (Stage 2 in IMPLEMENTATION_PLAN.md), so
 * `REVENUECAT_WEBHOOK_SECRET` is blank and nothing has ever sent a real event here.
 * The code is complete, not stubbed: the moment that secret has a value this endpoint
 * is live with no further changes.
 *
 * ## Status codes
 *
 *  - 200: the event was applied, or deliberately ignored (wrong entitlement, an
 *    event type we do not act on, a duplicate, an unknown user, a TRANSFER naming no
 *    ids). Ignored is still a 200 because retrying would not change the answer.
 *  - 400: the body is not JSON, or not a RevenueCat event envelope.
 *  - 401: the request did not prove it came from RevenueCat.
 *  - 500: the server has no webhook secret configured, or the write failed. Both are
 *    worth a retry, and RevenueCat retries a 5xx at 5, 10, 20, 40 and 80 minutes.
 */

export const runtime = "nodejs";

/**
 * Accept a signature up to six hours old. RevenueCat's own guidance suggests a few
 * minutes for clock skew, but it also warns that the tolerance has to clear the
 * retry schedule, which runs out to roughly 155 minutes in total. Six hours leaves
 * headroom for that without leaving a captured request replayable indefinitely, and
 * the event-id dedupe in core means a replay inside the window is a no-op anyway.
 */
const SIGNATURE_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/** Length-safe constant-time compare. Hashing first keeps unequal lengths legal. */
function secureEquals(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/**
 * Verify RevenueCat's HMAC header: `X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex>`,
 * where the signed string is `"<t>.<raw body>"` under HMAC-SHA256 with the signing
 * secret. The body must be the bytes as received: re-serialising a parsed object
 * changes them and fails every valid request.
 */
function hmacMatches(header: string, rawBody: string, secret: string): boolean {
  const parts = new Map<string, string>();
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    parts.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }

  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const sentAtMs = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAtMs)) return false;
  if (Math.abs(Date.now() - sentAtMs) > SIGNATURE_TOLERANCE_MS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return secureEquals(expected, signature);
}

type AuthResult = { ok: true; via: string } | { ok: false; reason: string };

/**
 * Authenticate the delivery. RevenueCat offers two mechanisms and the dashboard
 * chooses between them, so both are supported against the same secret: whichever
 * Ryan turns on in Stage 2 works with no code change.
 *
 *  - HMAC signing (the stronger one), when `X-RevenueCat-Webhook-Signature` is present.
 *  - A fixed `Authorization` header value typed into the dashboard, compared in full
 *    against the secret. If the dashboard value is `Bearer abc123`, the env var is
 *    the whole string `Bearer abc123`, not just the token.
 *
 * There is no downgrade hole in accepting either: both paths require knowing the
 * secret, and a request presenting neither header is rejected.
 */
function authenticate(req: Request, rawBody: string, secret: string): AuthResult {
  const signature = req.headers.get("x-revenuecat-webhook-signature");
  if (signature) {
    return hmacMatches(signature, rawBody, secret)
      ? { ok: true, via: "hmac" }
      : { ok: false, reason: "hmac signature mismatch" };
  }

  const authorization = req.headers.get("authorization");
  if (authorization) {
    return secureEquals(authorization, secret)
      ? { ok: true, via: "authorization header" }
      : { ok: false, reason: "authorization header mismatch" };
  }

  return { ok: false, reason: "no signature or authorization header" };
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed. Until Stage 2 produces a secret there is no way to tell a real
    // RevenueCat delivery from anyone who found the URL, so nothing is processed.
    console.error("[revenuecat] REVENUECAT_WEBHOOK_SECRET is not set, rejecting webhook.");
    return Response.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();

  const auth = authenticate(req, rawBody, secret);
  if (!auth.ok) {
    console.warn(`[revenuecat] rejected webhook: ${auth.reason}`);
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[revenuecat] rejected webhook: body is not valid JSON");
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = revenueCatWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn("[revenuecat] rejected webhook: unrecognised payload shape");
    return Response.json({ error: "Unrecognised payload." }, { status: 400 });
  }

  const event = parsed.data.event;

  // TEST events come from the dashboard's "send test webhook" button and carry no
  // subscriber. Answering 200 is what makes that button report success.
  if (event.type === "TEST") {
    console.log(`[revenuecat] test event ${event.id} received (verified via ${auth.via}).`);
    return Response.json({ ok: true, outcome: "test" });
  }

  // TRANSFER is the one type that legitimately arrives with no `app_user_id`: it
  // names `transferred_from` / `transferred_to` instead and core resolves users from
  // those. Every other type needs one, because it identifies whose row this is.
  const userId = event.app_user_id;
  if (!userId && event.type !== "TRANSFER") {
    console.warn(`[revenuecat] event ${event.id} (${event.type}) has no app_user_id, ignored.`);
    return Response.json({ ok: true, outcome: "ignored_missing_app_user_id" });
  }

  try {
    // Empty string only on the TRANSFER-without-an-id path, whose branch in core
    // never reads this argument. Every other type is guaranteed a real id above.
    const result = await applyRevenueCatEvent(userId ?? "", event);

    // An unknown user almost always means the Stage 6/7 SDK integration is not
    // calling Purchases.logIn() with our User.id, which would otherwise look like
    // purchases that simply never grant pro. Log it at error level so it surfaces.
    if (result.outcome === "ignored_unknown_user") {
      console.error(`[revenuecat] ${result.outcome}: ${result.detail}`);
    } else {
      console.log(`[revenuecat] ${event.type} ${event.id}: ${result.outcome} (${result.detail})`);
    }

    return Response.json({ ok: true, outcome: result.outcome });
  } catch (err) {
    // Let RevenueCat retry: a failed write here means the user paid and is not pro.
    console.error(`[revenuecat] failed to apply event ${event.id} (${event.type}):`, err);
    return Response.json({ error: "Failed to process event." }, { status: 500 });
  }
}
