import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Fallback for app pages without their own loading UI. Below lg it is the
 * original home skeleton; at lg+ it sits inside the desktop shell (which stays
 * mounted, since this boundary is below the (app) layout) as a wide card grid.
 */
export default function HomeLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8 lg:max-w-[1400px] lg:px-8 lg:py-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-12 w-full lg:hidden" />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] lg:gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full lg:h-36" />
        ))}
      </div>
    </main>
  );
}
