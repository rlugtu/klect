import Link from "next/link";
import { getSession } from "@/lib/session";
import { getInviteByToken } from "@/lib/sharing";
import { getMembership } from "@/lib/permissions";
import { acceptInvite } from "@/lib/actions/sharing";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <PixelCard className="flex flex-col gap-5 text-center">{children}</PixelCard>
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <Shell>
        <h1 className="text-lg text-primary">Invite not found</h1>
        <p className="text-muted">This invite link is invalid or was revoked.</p>
        <Link href="/">
          <PixelButton variant="secondary">Go home</PixelButton>
        </Link>
      </Shell>
    );
  }

  const roleLabel = invite.role === "COLLABORATOR" ? "Collaborator" : "Viewer";
  const inviter = invite.invitedBy.displayName ?? invite.invitedBy.name ?? "Someone";
  const session = await getSession();

  const details = (
    <>
      <span className="text-5xl" aria-hidden>
        {invite.list.icon}
      </span>
      <h1 className="text-lg text-primary break-words">{invite.list.name}</h1>
      <p className="text-muted">
        {inviter} invited you to join as
      </p>
      <div className="flex justify-center">
        <PixelBadge tone="primary">{roleLabel}</PixelBadge>
      </div>
    </>
  );

  // Not signed in → send them to log in, returning here afterward.
  if (!session) {
    return (
      <Shell>
        {details}
        <Link href={`/login?next=/invite/${token}`}>
          <PixelButton className="w-full">Sign in to accept</PixelButton>
        </Link>
      </Shell>
    );
  }

  // Already a member → nothing to do.
  const existing = await getMembership(session.user.id, invite.list.id);
  if (existing) {
    return (
      <Shell>
        {details}
        <p className="text-success">You&apos;re already a member.</p>
        <Link href={`/lists/${invite.list.id}`}>
          <PixelButton className="w-full">Open list</PixelButton>
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {details}
      <form action={acceptInvite.bind(null, token)}>
        <SubmitButton
          label="Accept invite"
          pendingLabel="Joining…"
          className="w-full"
        />
      </form>
    </Shell>
  );
}
