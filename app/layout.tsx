import type { Metadata } from "next";
import { Archivo, Atkinson_Hyperlegible, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

// Self-hosted at build time by next/font, so pages never call Google Fonts at runtime.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${atkinson.variable} ${plexMono.variable}`}>
      <body className="min-h-screen">
        {/* Sign-in URLs are set in code (not env) so redirects always stay on this origin. */}
        <ClerkProvider
          // Reads the per-request CSP nonce, so Clerk's own script tag may run under 'strict-dynamic'.
          dynamic
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/tools"
          signUpFallbackRedirectUrl="/tools"
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
