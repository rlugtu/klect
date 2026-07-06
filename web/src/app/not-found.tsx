import Link from "next/link";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <PixelCard className="flex flex-col items-center gap-5 text-center">
        <span className="text-6xl" aria-hidden>
          👾
        </span>
        <h1 className="text-2xl text-primary">GAME OVER</h1>
        <p className="text-muted">
          404 — this page wandered off the map.
        </p>
        <Link href="/">
          <PixelButton>Back to start</PixelButton>
        </Link>
      </PixelCard>
    </main>
  );
}
