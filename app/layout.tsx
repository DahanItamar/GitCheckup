import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { DEMO_MODE } from "@/lib/config";

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
    default: "GitCheckup — score any GitHub repo out of 100",
    template: "%s · GitCheckup",
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
        {DEMO_MODE && (
          <div
            role="status"
            className="border-b px-6 py-2 text-center text-xs"
            style={{
              borderColor: "var(--grade-c)",
              color: "var(--grade-c)",
            }}
          >
            <strong className="font-medium">Demo mode</strong> — scores are
            computed by the real rubric from bundled fixtures, not from live
            GitHub data.
          </div>
        )}
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="font-mono text-sm font-medium tracking-tight"
            >
              git<span className="text-accent">checkup</span>
            </Link>
            <nav className="flex items-center gap-5 text-xs text-muted">
              <Link
                href="/improved"
                className="transition-colors duration-150 hover:text-ink"
              >
                Most improved
              </Link>
              <span className="text-faint">Public data only</span>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-faint">
            GitCheckup reads public GitHub metadata. It never asks for
            permissions and cannot see private repositories.
          </div>
        </footer>
      </body>
    </html>
  );
}
