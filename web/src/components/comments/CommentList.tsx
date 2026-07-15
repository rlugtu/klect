import { deleteComment } from "@/lib/actions/comments";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { timeAgo } from "@/lib/utils";
import { atHandle } from "@/lib/handle";

export type CommentItem = {
  id: string;
  value: string;
  createdAt: Date;
  author: {
    id: string;
    handle: string | null;
    icon: string | null;
  };
};

/** Newest-first comment thread. Author or list owner can delete. */
export function CommentList({
  comments,
  currentUserId,
  canModerate,
}: {
  comments: CommentItem[];
  currentUserId: string;
  canModerate: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((c) => {
        const canDelete = canModerate || c.author.id === currentUserId;
        return (
          <li key={c.id} className="pixel-box-sm bg-bg flex flex-col gap-1.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden>{c.author.icon ?? "🔖"}</span>
                <span className="truncate text-sm">
                  {atHandle(c.author.handle)}
                </span>
                <span className="text-muted text-sm">{timeAgo(c.createdAt)}</span>
              </span>
              {canDelete && (
                <ConfirmDeleteButton
                  action={deleteComment.bind(null, c.id)}
                  label="Delete"
                  confirmText="Delete?"
                />
              )}
            </div>
            <p className="whitespace-pre-wrap break-words">{c.value}</p>
          </li>
        );
      })}
    </ul>
  );
}
