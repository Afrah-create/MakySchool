import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { AppProviders } from "@/providers/AppProviders";
import { getTenantFromHeaders } from "@/lib/tenant/server";
import "@makyschool/ui/styles/globals.css";

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
  icons: {
    icon: "/makyschool-logo.jpeg",
    apple: "/makyschool-logo.jpeg",
  },
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('makyschool-theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', stored || system);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
        data-school-slug={tenant?.schoolSlug ?? ""}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
