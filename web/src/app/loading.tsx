import { Skeleton } from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </main>
  );
}
