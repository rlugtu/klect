import type { Metadata, Viewport } from "next";
import {
  Press_Start_2P,
  VT323,
  Geist,
  Newsreader,
  Work_Sans,
} from "next/font/google";
import { getSession } from "@/lib/session";
import { themeDataAttr } from "@/lib/theme";
import { PWARegister } from "@/components/PWARegister";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

// Chunky display font for headings/buttons — the signature 8-bit look.
const pressStart = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

// Readable pixel font for body copy (Press Start 2P is too dense at small sizes).
const vt323 = VT323({
  weight: "400",
  variable: "--font-retro",
  subsets: ["latin"],
});

// Sleek modern sans for the modern theme (Vercel's Geist).
const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Journal theme fonts (ported from mobile): Newsreader serif titles (incl. the
// italic weight used for headings) + Work Sans body.
const newsreader = Newsreader({
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  subsets: ["latin"],
});

const workSans = Work_Sans({
  weight: ["400", "500", "600"],
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klect — more than links",
  description: "More than links. Everything in one place.",
  applicationName: "Klect",
  appleWebApp: {
    capable: true,
    title: "Klect",
    statusBarStyle: "black-translucent",
  },
  icons: {
    // Tab favicon comes from the app/icon.png convention file.
    apple: "/apple-icon.png",
  },
};

// Matches the modern-light background (the default theme + login screen).
export const viewport: Viewport = {
  themeColor: "#f7f7fb",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  // Authed users get their saved theme; the login screen defaults to modern light.
  const theme = session ? themeDataAttr(session.user.theme) : "modern-light";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${pressStart.variable} ${vt323.variable} ${geist.variable} ${newsreader.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <PWARegister />
      </body>
    </html>
  );
}
