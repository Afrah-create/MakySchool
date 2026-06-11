import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant/server";
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
    default: "MakySchool",
    template: "%s | MakySchool",
  },
  description: "Multi-tenant school management platform for Uganda",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased selection:bg-slate-900 selection:text-white`}
        data-school-slug={tenant?.schoolSlug ?? ""}
      >
        {children}
      </body>
    </html>
  );
}
