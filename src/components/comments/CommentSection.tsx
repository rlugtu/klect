import { PixelCard } from "@/components/ui/PixelCard";
import { CommentForm } from "./CommentForm";
import { CommentList, type CommentItem } from "./CommentList";

/** Comments card: post box + newest-first thread. Used on lists and bookmarks. */
export function CommentSection({
  comments,
  addAction,
  currentUserId,
  canModerate,
}: {
  comments: CommentItem[];
  addAction: (formData: FormData) => void | Promise<void>;
  currentUserId: string;
  canModerate: boolean;
}) {
  return (
    <PixelCard className="flex flex-col gap-4">
      <h2 className="text-sm">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>
      <CommentForm action={addAction} />
      {comments.length === 0 ? (
        <p className="text-muted text-sm">No comments yet — say something. 💬</p>
      ) : (
        <CommentList
          comments={comments}
          currentUserId={currentUserId}
          canModerate={canModerate}
        />
      )}
    </PixelCard>
  );
}
