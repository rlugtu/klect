-- A comment targets EITHER a bookmark OR a list — exactly one must be set.
ALTER TABLE "Comment"
  ADD CONSTRAINT "comment_target_exactly_one"
  CHECK (
    (("bookmarkId" IS NOT NULL)::int + ("listId" IS NOT NULL)::int) = 1
  );
