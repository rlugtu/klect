import { getListMembers, getPendingInvites } from "@/lib/sharing";
import { removeMember, revokeInvite } from "@/lib/actions/sharing";
import { InviteForm } from "./InviteForm";
import { RoleSelect } from "./RoleSelect";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelBadge } from "@/components/ui/PixelBadge";

/** Owner-only sharing controls: invite, list members, manage roles, pending invites. */
export async function MembersPanel({
  listId,
  currentUserId,
}: {
  listId: string;
  currentUserId: string;
}) {
  const [members, invites] = await Promise.all([
    getListMembers(listId),
    getPendingInvites(listId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <InviteForm listId={listId} />

      <div className="flex flex-col gap-2">
        <h3 className="font-pixel text-muted text-sm uppercase">Members</h3>
        {members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden>{m.user.icon ?? "🔖"}</span>
              <span className="truncate">
                {m.user.displayName ?? m.user.name ?? m.user.email}
              </span>
              {m.userId === currentUserId && (
                <span className="text-muted text-sm">(you)</span>
              )}
            </span>
            {m.role === "OWNER" ? (
              <PixelBadge tone="accent">Owner</PixelBadge>
            ) : (
              <span className="flex shrink-0 items-center gap-2">
                <RoleSelect
                  listId={listId}
                  userId={m.userId}
                  role={m.role}
                />
                <ConfirmDeleteButton
                  action={removeMember.bind(null, listId, m.userId)}
                  label="Remove"
                  confirmText="Remove?"
                />
              </span>
            )}
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-pixel text-muted text-sm uppercase">
            Pending invites
          </h3>
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-sm">
                {inv.email} ·{" "}
                {inv.role === "COLLABORATOR" ? "Collaborator" : "Viewer"}
              </span>
              <ConfirmDeleteButton
                action={revokeInvite.bind(null, inv.id)}
                label="Revoke"
                confirmText="Revoke?"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
