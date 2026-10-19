/**
 * DB-free check of the move rules in src/lib/move-plan.ts (the decision half of
 * `core.moveBookmarks`). No database, no network: fixtures in, assertions out.
 *
 *   npx tsx scripts/verify-move-plan.ts
 *
 * Exits non-zero on the first failed expectation. Role checks (`assertRole`) and
 * the transaction are not covered here; they need a database.
 */
import assert from "node:assert/strict";
import {
  BULK_BOOKMARK_MAX,
  planBookmarkMove,
  type MoveCandidate,
  type MoveTarget,
} from "../src/lib/move-plan";

const ME = "me";
const FRIEND = "friend";

const bm = (id: string, listId: string, listOwnerId: string, extra: Partial<MoveCandidate> = {}): MoveCandidate => ({
  id,
  listId,
  listOwnerId,
  locked: false,
  listLocked: false,
  ...extra,
});
const list = (id: string, ownerId: string, locked = false): MoveTarget => ({ id, ownerId, locked });

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

check("own list to own list: moves, no cap cost", () => {
  const p = planBookmarkMove(ME, ["a"], [bm("a", "L1", ME)], list("L2", ME));
  assert.ok(p.ok);
  assert.deepEqual(p.moveIds, ["a"]);
  assert.equal(p.ownedIncoming, 0);
});

check("friend's list into my list: counts against my cap", () => {
  const p = planBookmarkMove(ME, ["a", "b"], [bm("a", "F1", FRIEND), bm("b", "L1", ME)], list("L2", ME));
  assert.ok(p.ok);
  assert.equal(p.ownedIncoming, 1);
  assert.deepEqual(p.bySource, { F1: ["a"], L1: ["b"] });
});

check("my list into a friend's list: never capped for me", () => {
  const p = planBookmarkMove(ME, ["a"], [bm("a", "L1", ME)], list("F1", FRIEND));
  assert.ok(p.ok);
  assert.equal(p.ownedIncoming, 0);
});

check("already in target: skipped, not an error", () => {
  const p = planBookmarkMove(ME, ["a", "b"], [bm("a", "L2", ME), bm("b", "L1", ME)], list("L2", ME));
  assert.ok(p.ok);
  assert.deepEqual(p.moveIds, ["b"]);
  assert.deepEqual(p.alreadyThere, ["a"]);
});

check("duplicate and blank ids are collapsed", () => {
  const p = planBookmarkMove(ME, ["a", "a", " ", "a "], [bm("a", "L1", ME)], list("L2", ME));
  assert.ok(p.ok);
  assert.deepEqual(p.moveIds, ["a"]);
});

check("locked target refuses", () => {
  const p = planBookmarkMove(ME, ["a"], [bm("a", "L1", ME)], list("L2", ME, true));
  assert.deepEqual(p, { ok: false, reason: "target-locked" });
});

check("locked bookmark refuses (cannot escape the downgrade selection)", () => {
  const p = planBookmarkMove(ME, ["a"], [bm("a", "L1", ME, { locked: true })], list("L2", ME));
  assert.deepEqual(p, { ok: false, reason: "bookmark-locked" });
});

check("bookmark in a locked list refuses", () => {
  const p = planBookmarkMove(ME, ["a"], [bm("a", "L1", ME, { listLocked: true })], list("L2", ME));
  assert.deepEqual(p, { ok: false, reason: "source-locked" });
});

check("one missing id refuses the whole request", () => {
  const p = planBookmarkMove(ME, ["a", "ghost"], [bm("a", "L1", ME)], list("L2", ME));
  assert.deepEqual(p, { ok: false, reason: "not-found" });
});

check("empty and oversize requests refuse", () => {
  assert.deepEqual(planBookmarkMove(ME, [], [], list("L2", ME)), { ok: false, reason: "empty" });
  const many = Array.from({ length: BULK_BOOKMARK_MAX + 1 }, (_, i) => `b${i}`);
  assert.deepEqual(planBookmarkMove(ME, many, [], list("L2", ME)), { ok: false, reason: "too-many" });
});

check("a locked bookmark already in the target does not block the rest", () => {
  const p = planBookmarkMove(
    ME,
    ["a", "b"],
    [bm("a", "L2", ME, { locked: true }), bm("b", "L1", ME)],
    list("L2", ME),
  );
  assert.ok(p.ok);
  assert.deepEqual(p.moveIds, ["b"]);
});

console.log(`\n${passed} checks passed`);
