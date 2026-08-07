import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "RepoGauge — score any GitHub repo out of 100",
    template: "%s · RepoGauge",
  },
  description:
    "Paste a GitHub repo and get a 0–100 score, a five-category breakdown, and a list of concrete fixes. Public data only, no permissions asked.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="font-mono text-sm font-medium tracking-tight"
            >
              repo<span className="text-accent">gauge</span>
            </Link>
            <nav className="flex items-center gap-5 text-xs text-muted">
              <Link
                href="/trending"
                className="transition-colors duration-150 hover:text-ink"
              >
                Trending
              </Link>
              <span className="text-faint">Public data only</span>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-faint">
            RepoGauge reads public GitHub metadata. It never asks for
            permissions and cannot see private repositories.
          </div>
        </footer>
      </body>
    </html>
  );
}
