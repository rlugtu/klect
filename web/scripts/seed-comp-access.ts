/**
 * Comp ("complimentary") pro access for a short, named list of internal accounts.
 *
 * Some accounts need the paid tier without a real purchase: Ryan's own account, and
 * QA/test accounts used to exercise pro-only paths without burning an App Store
 * sandbox or Stripe test-mode purchase on every run. This script is the one place
 * that grants it, so the grant is explicit, reviewable in version control, and
 * self-documenting, rather than a hand-edited database row nobody can explain later.
 *
 * It changes no business logic. `isPro()` in src/lib/core/entitlements.ts already
 * treats an `Entitlement` row with `status: "active"` and an `expiresAt` in the future
 * as active, so this script only creates that kind of row; the check a comped account
 * hits is byte-for-byte the check a real subscriber hits.
 *
 * `store` is set to "comp" so these rows are unmistakable in the table: the column is
 * a plain String (RevenueCat owns that vocabulary, see the model in schema.prisma), and
 * "comp" is deliberately outside the `EntitlementStore` union in entitlements.ts, which
 * enumerates only the stores RevenueCat can send. No purchase, no store, no receipt.
 *
 * ## What keeps a comp row from blocking the webhook (and what does not)
 *
 * `isSuperseded` in core/revenuecat.ts drops any incoming event whose period end is
 * earlier than the stored row's, because within a real subscription the period end only
 * moves forward and therefore doubles as a version number. A comp row breaks that
 * premise: its expiry is a hand-picked far-future date, not a period end. So *whatever*
 * date is used here (a null expiry read as +Infinity, 2099, or the 2036 below), every
 * real event for that user (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, all
 * carrying a nearer finite `expiration_at_ms`) would compare as older and be dropped,
 * while the webhook still answered 200 and wrote nothing. On a comped QA or owner
 * account that silently breaks the one thing the account exists to exercise.
 *
 * Picking a finite date does *not* solve that, and an earlier version of this comment
 * claimed it did. What actually solves it is the explicit `store === "comp"` exception
 * in `isSuperseded` ("The comp exception" in its doc comment): a comp row is never
 * treated as newer than a real event, so real events always apply. The expiry's only
 * job is the access check and the UI. See {@link COMP_EXPIRES_AT}.
 *
 * Idempotent: it upserts on `Entitlement.userId` (already `@unique`), so re-running is
 * always safe and never creates a duplicate. Two caveats, in both directions:
 *
 *  - If a comped account ever makes a real purchase, re-running this overwrites the
 *    webhook-written row with the comp values. Remove the email from the list below
 *    first in that case.
 *  - In the other direction, the comp row is deliberately *not* immune to the webhook.
 *    A genuine subscription event for the same user takes the row over (by the comp
 *    exception above, not by any expiry comparison), which is what keeps webhook QA
 *    honest. Re-run the script to put the comp grant back afterwards.
 *
 * Run from web/:
 *
 *   npx tsx scripts/seed-comp-access.ts
 *
 * tsx is the TypeScript loader, and it is a real devDependency in web/package.json. Node's
 * own type stripping is not enough here: the generated Prisma client imports its own
 * modules without file extensions (it expects a bundler), which Node's ESM resolver will
 * not resolve, and tsx does. (This used to run through `jiti`, which only worked by
 * accident: jiti was never declared as a dependency, it was just hoisted into node_modules
 * by eslint and @tailwindcss/node, so any unrelated dependency change could have removed
 * it.) There is deliberately no `npm run` entry for this, matching scripts/gen-icons.mjs,
 * the repo's other one-off script, which is likewise documented by its run command only.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * The allowlist. One line per comped account, with a comment saying who it is and
 * why. Adding a QA account later is adding a line here and re-running the script.
 * Emails are not secrets, so they live in the repo on purpose: the record of who has
 * free pro access, and why, is the entire point of this file.
 */
const COMP_ACCESS_EMAILS: readonly string[] = [
  "ryanlugtu@gmail.com", // Ryan Lugtu, owner
];

/**
 * Marks the row as a comp grant rather than a real App Store / Stripe purchase.
 *
 * Must stay identical to `COMP_STORE` in src/lib/core/revenuecat.ts, which is the exception
 * that keeps these rows from swallowing real webhook events. It is re-declared rather than
 * imported on purpose: that module is `server-only` and pulls in `@/lib/db`, and this script
 * runs under `tsx` with relative imports and no path aliases (see the header's run note).
 */
const COMP_STORE = "comp";

/** Stands in for a product identifier (e.g. "klect_pro_annual"). No product was bought. */
const COMP_PLAN = "klect_pro_comp";

/** The one status that grants pro, mirroring ACTIVE_STATUS in core/entitlements.ts. */
const ACTIVE_STATUS = "active";

/**
 * Far-future expiry, standing in for "permanent" without being null.
 *
 * Only two things read it, and both are satisfied by any sufficiently distant date:
 * `isEntitlementActive` (status "active" plus an expiry in the future) and the Membership
 * section's "Renews <date>" line, which a real date renders honestly where a null would
 * fall back to a bare "Active". The webhook-ordering problem is *not* among them. See the
 * header: that is handled by the `store === "comp"` exception in `isSuperseded`, not by the
 * choice of date.
 *
 * 2036 rather than 2099: it is equally permanent in practice (a decade out, and the grant is
 * re-run from version control whenever it needs refreshing) while sitting clear of the 2038
 * 32-bit `time_t` boundary. That is precautionary only (no overflow was found anywhere in
 * this stack, which is all 64-bit), but a sentinel that is deliberately plausible costs
 * nothing and reads better in the UI than a date in the next century.
 */
const COMP_EXPIRES_AT = new Date("2036-01-01T00:00:00Z");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Returns the process exit code: 0 if every listed email resolved, 1 if any did not. */
async function main(): Promise<number> {
  let missing = 0;

  for (const email of COMP_ACCESS_EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      // Not fatal for the rest of the list, but never guessed at either: an account that
      // does not exist gets reported, not invented.
      console.error(`SKIP  ${email} - no User row with this email`);
      missing += 1;
      continue;
    }

    const entitlement = await prisma.entitlement.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        store: COMP_STORE,
        plan: COMP_PLAN,
        status: ACTIVE_STATUS,
        expiresAt: COMP_EXPIRES_AT, // far-future, not null (see COMP_EXPIRES_AT)
      },
      update: {
        store: COMP_STORE,
        plan: COMP_PLAN,
        status: ACTIVE_STATUS,
        expiresAt: COMP_EXPIRES_AT, // re-running repairs a row that drifted (an expired status, or a real event that took over)
      },
    });

    console.log(
      `OK    ${email} -> user ${user.id} | entitlement ${entitlement.id} ` +
        `(${entitlement.store}/${entitlement.plan}/${entitlement.status}, expiresAt=${entitlement.expiresAt})`,
    );
  }

  if (missing > 0) {
    console.error(`\n${missing} of ${COMP_ACCESS_EMAILS.length} email(s) did not resolve to a user.`);
    return 1;
  }

  console.log(`\nDone. ${COMP_ACCESS_EMAILS.length} comp entitlement(s) in place.`);
  return 0;
}

/**
 * The work lives in `main()` rather than at the top level on purpose. `web/` has no
 * `"type": "module"` in its package.json, so it is a CommonJS package, and tsx therefore
 * compiles a `.ts` file here to CJS, where a top-level `await` is a hard syntax error.
 * Wrapping it keeps the script runnable regardless of how the surrounding package is
 * configured, and matches the shape Prisma's own seed-script docs use. The disconnect runs
 * on both the success and failure paths so a thrown error never leaks a live connection.
 */
main()
  .catch((error: unknown) => {
    console.error(error);
    return 1;
  })
  .then(async (exitCode) => {
    await prisma.$disconnect();
    process.exit(exitCode);
  });
