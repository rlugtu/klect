import { cn } from "@/lib/utils";
import { userIconOf } from "@/components/ui/UserIcon";

/** The slice of the session user the shell renders. */
export type ShellUser = {
  id: string;
  handle: string;
  icon: string | null;
};

/** Small square avatar: the user's emoji icon (Klect has no profile photos). */
export function UserAvatar({
  user,
  className,
}: {
  user: Pick<ShellUser, "icon">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pixel-box-sm bg-panel flex size-8 shrink-0 items-center justify-center overflow-hidden text-base",
        className,
      )}
      aria-hidden
    >
      {userIconOf(user.icon)}
    </span>
  );
}
