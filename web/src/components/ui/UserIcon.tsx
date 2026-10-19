/**
 * A user's avatar is the emoji they picked (`User.icon`). Klect has no profile
 * photos: the better-auth `image` column (a Google OAuth picture URL) is never
 * rendered, on purpose. This is the one fallback for users who never picked an
 * icon, the same default the profile form preselects.
 */
export const DEFAULT_USER_ICON = "🔖";

export function userIconOf(icon: string | null | undefined): string {
  return icon || DEFAULT_USER_ICON;
}

/** Inline avatar for rows (comments, members, friends, DMs, requests). */
export function UserIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  return (
    <span aria-hidden className={className}>
      {userIconOf(icon)}
    </span>
  );
}
