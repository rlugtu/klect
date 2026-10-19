import { type Role } from "@/generated/prisma/enums";

/** Minimal, serializable list shape passed to client components. */
export type ListCardData = {
  id: string;
  name: string;
  description: string;
  icon: string;
  role: Role;
  bookmarkCount: number;
  memberCount: number;
  /**
   * `lockedAt` is set: the list is preserved but read-only (free-tier downgrade).
   * A boolean rather than the timestamp because no card shows a "locked since"
   * date, and required rather than optional so every place that builds a card has
   * to answer the question instead of silently rendering a lock as active.
   */
  locked: boolean;
};

/** Minimal bookmark shape for list/grid cards. */
export type BookmarkCardData = {
  id: string;
  name: string;
  description: string;
  image: string | null; // first extracted photo, if any
  rating: number;
  visited: boolean;
  tags: { id: string; name: string; color: string }[];
  commentCount: number;
  /**
   * Read-only: this bookmark is locked, or the list holding it is. Both cases are
   * refused by `core.updateBookmark` identically, so the card cannot distinguish
   * them either. Required for the same reason as {@link ListCardData.locked}.
   */
  locked: boolean;
};
