import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { PixelCard } from "@/components/ui/PixelCard";
import { LoginForm } from "@/components/auth/LoginForm";

/** Only allow internal same-origin redirects (guards against open redirect). */
function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const session = await getSession();
  if (session) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl text-primary">KLECT</h1>
        <p className="mt-3 text-muted">Your bookmarks, 8-bit style.</p>
      </div>
      <PixelCard>
        <LoginForm next={next} />
      </PixelCard>
    </main>
  );
}
