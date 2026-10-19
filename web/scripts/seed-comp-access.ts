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
 * ## Why the expiry is a far-future date and not null
 *
 * A null `expiresAt` would also read as permanently active ("no known expiry", the
 * lifetime/promotional case), and that is exactly the problem. `isSuperseded` in
 * core/revenuecat.ts sorts a null `expiresAt` as infinitely far in the future, so a
 * comp row with a null expiry permanently supersedes every real webhook event for
 * that user: every INITIAL_PURCHASE, RENEWAL and EXPIRATION carries a finite
 * `expiration_at_ms`, compares as older, and is dropped. On a comped QA account that
 * silently breaks the one thing the account exists to test, because the webhook
 * answers 200 and writes nothing. See {@link COMP_EXPIRES_AT}.
 *
 * Idempotent: it upserts on `Entitlement.userId` (already `@unique`), so re-running is
 * always safe and never creates a duplicate. Two caveats, in both directions:
 *
 *  - If a comped account ever makes a real purchase, re-running this overwrites the
 *    webhook-written row with the comp values. Remove the email from the list below
 *    first in that case.
 *  - In the other direction, the comp row is deliberately *not* immune to the webhook.
 *    A genuine subscription event for the same user supersedes it (finite expiry beats
 *    the sentinel), which is what keeps webhook QA honest. Re-run the script to put
 *    the comp grant back afterwards.
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

/** Marks the row as a comp grant rather than a real App Store / Stripe purchase. */
const COMP_STORE = "comp";

/** Stands in for a product identifier (e.g. "klect_pro_annual"). No product was bought. */
const COMP_PLAN = "klect_pro_comp";

/** The one status that grants pro, mirroring ACTIVE_STATUS in core/entitlements.ts. */
const ACTIVE_STATUS = "active";

/**
 * Far-future sentinel expiry, standing in for "permanent" without being null.
 *
 * Practically permanent (nobody is QA-ing Klect in 2099) while still being a finite
 * date, which is the whole point: `isSuperseded` in core/revenuecat.ts treats a null
 * `expiresAt` as +Infinity and would let a comp row block every real RevenueCat event
 * for that user forever, so a comped account could never be used to test the webhook.
 * A real subscription event always carries a nearer, finite expiry, so it compares as
 * newer and takes over the row the way it should.
 */
const COMP_EXPIRES_AT = new Date("2099-01-01T00:00:00Z");

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
        expiresAt: COMP_EXPIRES_AT, // far-future sentinel, not null (see the header)
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
