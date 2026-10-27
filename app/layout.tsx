import type { Metadata, Viewport } from "next";
import { Gabarito, Martian_Mono } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import PageShell from "@/components/layout/PageShell";
import { app } from "@/lib/app-config";
import "./globals.css";

const gabaritoFont = Gabarito({
  variable: "--font-gabarito",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const martianMonoFont = Martian_Mono({
  variable: "--font-martian",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: {
    title: `${app.name} — ${app.tagline}`,
    description: app.tagline,
    type: "website",
    url: app.url,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EBD9B4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${gabaritoFont.variable} ${martianMonoFont.variable} h-full`}
      style={{ ["--accent" as string]: app.accent }}
    >
      <body className="min-h-full antialiased bg-[#EBD9B4] text-[#2B2118]">
        <EvmProvider>
          <ToastProvider>
            <PageShell>{children}</PageShell>
          </ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
