import Link from "next/link";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Reveal } from "./Reveal";
import { WaitlistForm } from "./WaitlistForm";

// The marketing page has its own type identity, independent of the in-app themes.
const jakarta = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

/** Klect's brand mark — the notched square from the source design. */
function Logo({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="block bg-[#15141A]"
      style={{
        width: size,
        height: size,
        clipPath: "polygon(0% 0%,100% 0%,100% 100%,50% 76%,0% 100%)",
      }}
    />
  );
}

// Each tile is a self-contained marketing panel (gradient + headline + device
// baked into the PNG), so the page just stacks them — no copy column alongside.
// Files live in `public/marketing/<name>.png`, all 1080×1350.
const TILES: { name: string; alt: string }[] = [
  { name: "hero", alt: "Organize your bookmarks in beautiful, shareable lists" },
  {
    name: "rich",
    alt: "Save anything and make it rich — photos, notes, ratings, tags and location",
  },
  {
    name: "smart",
    alt: "Save from anywhere instantly — links autofilled, summarized and organized",
  },
  { name: "nearby", alt: "Find the spots you've saved near you, right now" },
  {
    name: "collab",
    alt: "Share, collaborate and decide together with chat, comments and polls",
  },
  {
    name: "devices",
    alt: "One place, every device — your lists stay in sync across phone and web",
  },
];

export function LandingPage() {
  return (
    <div
      className={`${jakarta.className} min-h-screen w-full overflow-x-hidden bg-[#FFFEFB] text-[#15141A]`}
    >
      {/* NAV */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-[#EEEAE2] bg-[#FFFEFB]/85 px-6 py-4 backdrop-blur-md sm:px-10">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[21px] font-extrabold tracking-[-0.02em]">Klect</span>
        </div>
        <Link
          href="/login"
          className="text-[15px] font-semibold text-[#514F5C] transition-colors hover:text-[#15141A]"
        >
          Log in
        </Link>
      </div>

      {/* HERO */}
      <div className="mx-auto max-w-[720px] px-6 pb-8 pt-20 text-center sm:px-10 sm:pt-[88px]">
        <div className="mb-[22px] inline-block rounded-full bg-[#EDEBFB] px-3.5 py-[7px] text-[13px] font-bold uppercase tracking-[0.06em] text-[#6657E0]">
          Now in beta
        </div>
        <h1 className="mb-[22px] text-[clamp(40px,7vw,56px)] font-extrabold leading-[1.05] tracking-[-0.02em]">
          Your bookmarks, worth sharing.
        </h1>
        <p className="mx-auto mb-[34px] max-w-[520px] text-[19px] leading-[1.55] text-[#514F5C]">
          Most bookmarking is a lonely junk drawer of links. Klect turns saving
          into something you share — curated lists you build, chat about, and
          vote on with friends.
        </p>
        <div className="flex flex-col items-center">
          <WaitlistForm variant="hero" />
          <span className="text-sm text-[#8A8796]">iOS · Android · Web</span>
        </div>
      </div>

      {/* FEATURE TILES */}
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-12 sm:gap-10 sm:px-6 sm:py-16">
        {TILES.map((tile, i) => (
          <Reveal
            key={tile.name}
            className="overflow-hidden rounded-[28px] shadow-[0_30px_60px_-25px_rgba(21,20,26,0.3)]"
          >
            <Image
              src={`/marketing/${tile.name}.png`}
              alt={tile.alt}
              width={1080}
              height={1350}
              priority={i === 0}
              sizes="(max-width: 860px) 100vw, 860px"
              className="h-auto w-full"
            />
          </Reveal>
        ))}
      </div>

      {/* BETA CTA */}
      <div id="beta" className="relative overflow-hidden px-6 py-24 sm:px-10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#FF6B9D_0%,#FF9A56_35%,#FFD166_70%,#6657E0_100%)]" />
        <div className="relative z-10 mx-auto max-w-[560px] text-center">
          <h2 className="mb-4 text-[clamp(30px,5vw,40px)] font-extrabold tracking-[-0.02em] text-white">
            Get early access
          </h2>
          <p className="mb-9 text-[17px] leading-[1.5] text-white/90">
            Join the beta — we&apos;ll email you the moment Klect opens up.
          </p>
          <WaitlistForm variant="cta" />
        </div>
      </div>

      {/* FOOTER */}
      <div className="px-10 pb-10 pt-12 text-center">
        <div className="mb-2.5 flex items-center justify-center gap-2.5">
          <Logo size={22} />
          <span className="text-[17px] font-extrabold tracking-[-0.02em]">Klect</span>
        </div>
        <p className="mb-6 text-sm text-[#8A8796]">Save it. Klect it.</p>
        <p className="text-[13px] text-[#B0ADB8]">
          © 2026 Klect. All rights reserved.
        </p>
      </div>
    </div>
  );
}
