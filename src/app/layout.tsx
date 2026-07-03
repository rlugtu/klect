import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323, Inter } from "next/font/google";
import { getSession } from "@/lib/session";
import { themeDataAttr } from "@/lib/theme";
import { PWARegister } from "@/components/PWARegister";
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

// Clean sans for the modern theme.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Saive — retro bookmarks",
  description: "Bookmarks organized into shareable lists. 8-bit style.",
  applicationName: "Saive",
  appleWebApp: {
    capable: true,
    title: "Saive",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#14142b",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  // Authed users get their saved theme; the login screen defaults to pixel dark.
  const theme = session ? themeDataAttr(session.user.theme) : "pixel-dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${pressStart.variable} ${vt323.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
