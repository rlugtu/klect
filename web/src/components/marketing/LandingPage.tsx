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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 text-[13px] font-bold uppercase tracking-[0.06em] text-[#6657E0]">
      {children}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-[9px] h-[7px] w-[7px] shrink-0 rounded-full bg-[#6657E0]" />
      <span className="text-[16.5px] leading-relaxed text-[#33313C]">{children}</span>
    </li>
  );
}

type Feature = {
  /** Maps to `public/marketing/<image>.png` — a bare phone screenshot. */
  image: string;
  alt: string;
  eyebrow: string;
  title: React.ReactNode;
  /** Image sits on the left (reversed) or right of the copy. */
  reverse: boolean;
  body?: React.ReactNode;
  bullets?: React.ReactNode[];
  /** Extra bottom padding on the final section, per the source design. */
  last?: boolean;
};

const FEATURES: Feature[] = [
  {
    image: "rich",
    alt: "Rich bookmark detail screen",
    eyebrow: "More than a link",
    reverse: true,
    title: (
      <>
        Save anything.
        <br />
        Make it rich.
      </>
    ),
    bullets: [
      "A name, description, notes, and a 0–5 star rating",
      'A location, tags, and a "visited" checkmark',
      "Paste a link and Klect fills in the rest — title, photos, even playable video",
    ],
  },
  {
    image: "smart",
    alt: "Share sheet autofill screen",
    eyebrow: "Paste and go",
    reverse: false,
    title: <>It fills itself in.</>,
    body: (
      <>
        <p className="mb-5 max-w-[440px] text-[16.5px] leading-relaxed text-[#33313C]">
          Drop in a URL and Klect pulls the title, photos, and description
          automatically — and detects video from YouTube, TikTok, Instagram and
          more so it plays right inside the app.
        </p>
        <p className="max-w-[440px] text-[16.5px] leading-relaxed text-[#33313C]">
          Deep in a scroll and see something good? Share it straight into Klect
          from any app on your phone.
        </p>
      </>
    ),
  },
  {
    image: "nearby",
    alt: "Near me map screen",
    eyebrow: "Right place, right time",
    reverse: true,
    title: (
      <>
        Near you.
        <br />
        Right now.
      </>
    ),
    body: (
      <p className="max-w-[440px] text-[16.5px] leading-relaxed text-[#33313C]">
        Klect surfaces your saved spots within any radius of wherever you&apos;re
        standing — so that taco place you bookmarked months ago turns up exactly
        when you need it.
      </p>
    ),
  },
  {
    image: "collab",
    alt: "List poll and voting screen",
    eyebrow: "Better together",
    reverse: false,
    title: (
      <>
        Share it.
        <br />
        Decide together.
      </>
    ),
    bullets: [
      "Invite friends as viewers or collaborators — they opt in before joining",
      "Every list gets its own group chatroom",
      "Comment on any list or bookmark to plan together",
      "Can't decide? Turn a list into a poll and vote",
    ],
  },
  {
    image: "devices",
    alt: "Klect on phone and tablet",
    eyebrow: "Everywhere you are",
    reverse: true,
    last: true,
    title: (
      <>
        One place.
        <br />
        Every device.
      </>
    ),
    body: (
      <p className="max-w-[440px] text-[16.5px] leading-relaxed text-[#33313C]">
        Install Klect to your home screen on the web, or grab the native app —
        your lists stay perfectly in sync, and you can share into Klect from
        anywhere else on your phone.
      </p>
    ),
  },
];

function PhoneFrame({ image, alt }: { image: string; alt: string }) {
  return (
    <div className="flex min-w-[280px] flex-[1_1_320px] justify-center">
      <div className="w-full max-w-[320px] overflow-hidden rounded-[28px] shadow-[0_30px_60px_-20px_rgba(21,20,26,0.25)]">
        <Image
          src={`/marketing/${image}.png`}
          alt={alt}
          width={1080}
          height={1350}
          sizes="(max-width: 900px) 90vw, 320px"
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

function FeatureSection({ feature }: { feature: Feature }) {
  const copy = (
    <div className="min-w-[320px] flex-[1_1_420px]">
      <Eyebrow>{feature.eyebrow}</Eyebrow>
      <h2 className="mb-5 text-4xl font-extrabold leading-[1.1] tracking-[-0.02em]">
        {feature.title}
      </h2>
      {feature.bullets ? (
        <ul className="flex max-w-[440px] list-none flex-col gap-4 p-0">
          {feature.bullets.map((b, i) => (
            <Bullet key={i}>{b}</Bullet>
          ))}
        </ul>
      ) : (
        feature.body
      )}
    </div>
  );

  const art = <PhoneFrame image={feature.image} alt={feature.alt} />;

  return (
    <Reveal
      className={`mx-auto flex max-w-[1180px] flex-wrap items-center gap-16 px-10 py-16 ${
        feature.last ? "pb-24" : ""
      }`}
    >
      {feature.reverse ? (
        <>
          {art}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {art}
        </>
      )}
    </Reveal>
  );
}

export function LandingPage() {
  return (
    <div
      className={`${jakarta.className} min-h-screen w-full overflow-x-hidden bg-[#FFFEFB] text-[#15141A]`}
    >
      {/* NAV — the source design shows only the mark; we keep a Log in link so
          returning users have an entry point from the marketing page. */}
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
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-14 px-6 pb-16 pt-20 sm:px-10 sm:pt-[88px]">
        <div className="min-w-[320px] flex-[1_1_440px]">
          <div className="mb-[22px] inline-block rounded-full bg-[#EDEBFB] px-3.5 py-[7px] text-[13px] font-bold uppercase tracking-[0.06em] text-[#6657E0]">
            Now in beta
          </div>
          <h1 className="mb-[22px] text-[clamp(40px,7vw,56px)] font-extrabold leading-[1.05] tracking-[-0.02em]">
            Your bookmarks, worth sharing.
          </h1>
          <p className="mb-[34px] max-w-[480px] text-[19px] leading-[1.55] text-[#514F5C]">
            Most bookmarking is a lonely junk drawer of links. Klect turns saving
            into something you share — curated lists you build, chat about, and
            vote on with friends.
          </p>
          <WaitlistForm variant="hero" />
          <span className="text-sm text-[#8A8796]">iOS · Android · Web</span>
        </div>
        <div className="flex min-w-[280px] flex-[1_1_340px] justify-center">
          <div className="w-full max-w-[340px] -rotate-3 overflow-hidden rounded-[32px] shadow-[0_40px_80px_-20px_rgba(21,20,26,0.35)]">
            <Image
              src="/marketing/hero.png"
              alt="Klect lists screen"
              width={1080}
              height={1350}
              priority
              sizes="(max-width: 900px) 90vw, 340px"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>

      {/* FEATURES */}
      {FEATURES.map((f) => (
        <FeatureSection key={f.image} feature={f} />
      ))}

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
