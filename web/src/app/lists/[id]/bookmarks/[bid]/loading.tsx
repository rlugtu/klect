import { Skeleton } from "@/components/ui/Skeleton";

export default function BookmarkLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-24 w-full" />
    </main>
  );
}
