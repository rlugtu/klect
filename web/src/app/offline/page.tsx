import type { Metadata } from "next";
import { PixelCard } from "@/components/ui/PixelCard";

export const metadata: Metadata = {
  title: "Offline — Saive",
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <PixelCard className="flex flex-col items-center gap-5 text-center">
        <span className="text-6xl" aria-hidden>
          📡
        </span>
        <h1 className="text-2xl text-primary">You&apos;re offline</h1>
        <p className="text-muted">
          Saive needs a connection for this. Reconnect and try again.
        </p>
      </PixelCard>
    </main>
  );
}
