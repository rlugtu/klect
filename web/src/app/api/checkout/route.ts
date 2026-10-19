import { redirect } from "next/navigation";
import { createWebCheckoutSession } from "@/lib/checkout";
import { isPlanId, planFor } from "@/lib/revenuecat-web";

/**
 * Checkout initiation: GET /api/checkout?plan=monthly|annual
 *
 * The upgrade page's buy buttons are ordinary links to this handler, so
 * starting a purchase needs no JavaScript and no client-side SDK. All it does
 * is resolve who is asking, build the RevenueCat Web Billing URL for them, and
 * redirect.
 *
 * ## Why a GET is the right verb here
 *
 * Nothing in Klect changes. No row is written, no money moves, and the user
 * lands on RevenueCat's hosted checkout where they still have to confirm. The
 * entitlement is only ever created by the Stage 5 webhook, after Stripe says a
 * payment actually happened.
 *
 * ## The App User ID
 *
 * Supplied by the session inside `createWebCheckoutSession`, never read off the
 * query string. It is Klect's own `User.id`, which is what the webhook resolves
 * `event.app_user_id` against, and the only thing connecting the payment to the
 * account. An unrecognised `plan` falls back to the default plan rather than
 * erroring, since a bad query param should not strand someone trying to pay.
 */
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("plan");
  const plan = isPlanId(requested) ? requested : planFor(undefined).id;

  // Redirects to /login itself when there is no session.
  const session = await createWebCheckoutSession(plan);

  // Not startable (unconfigured, or already subscribed): hand the user back to
  // the paywall, which renders the reason. Better than a bare error page when
  // the most likely cause is "Stripe isn't connected yet".
  if (!session.ok) redirect(`/upgrade?checkout=${session.reason}`);

  redirect(session.url);
}
