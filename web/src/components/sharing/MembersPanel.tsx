import { getListMembers, getPendingInvites } from "@/lib/sharing";
import { removeMember, revokeInvite } from "@/lib/actions/sharing";
import { InviteForm } from "./InviteForm";
import { RoleSelect } from "./RoleSelect";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { atHandle } from "@/lib/handle";

const ROLE_LABEL = { OWNER: "Owner", COLLABORATOR: "Collaborator", VIEWER: "Viewer" };

/**
 * List members roster. Visible to every member: the roster + roles are read-only
 * for everyone; when `canManage` (owner) the invite form, per-row role/remove
 * controls, and pending-request list are shown.
 */
export async function MembersPanel({
  listId,
  currentUserId,
  canManage,
}: {
  listId: string;
  currentUserId: string;
  canManage: boolean;
}) {
  const [members, invites] = await Promise.all([
    getListMembers(listId),
    canManage ? getPendingInvites(listId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-5">
      {canManage && <InviteForm listId={listId} />}

      <div className="flex flex-col gap-2">
        <h3 className="font-pixel text-muted text-sm uppercase">Members</h3>
        {members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span aria-hidden>{m.user.icon ?? "🔖"}</span>
              <span className="truncate">{atHandle(m.user.handle)}</span>
              {m.userId === currentUserId && (
                <span className="text-muted text-sm">(you)</span>
              )}
            </span>
            {canManage && m.role !== "OWNER" ? (
              <span className="flex shrink-0 items-center gap-2">
                <RoleSelect listId={listId} userId={m.userId} role={m.role} />
                <ConfirmDeleteButton
                  action={removeMember.bind(null, listId, m.userId)}
                  label="Remove"
                  confirmText="Remove?"
                />
              </span>
            ) : (
              <PixelBadge tone={m.role === "OWNER" ? "accent" : "default"}>
                {ROLE_LABEL[m.role]}
              </PixelBadge>
            )}
          </div>
        ))}
      </div>

      {canManage && invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-pixel text-muted text-sm uppercase">
            Pending requests
          </h3>
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-sm">
                {atHandle(inv.handle)} ·{" "}
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
