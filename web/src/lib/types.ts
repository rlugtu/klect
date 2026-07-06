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
};
