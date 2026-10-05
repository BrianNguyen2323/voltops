import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Figtree } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
import { cn } from "~/lib/utils";

import { isAuthDisabled } from "~/lib/auth";

// Banner reads env at request time.
export const dynamic = "force-dynamic";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "VoltOps",
  description: "VoltOps",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("dark", geist.variable, "font-sans", figtree.variable)}
    >
      <body>
        {isAuthDisabled() && (
          <div role="alert" className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
            Authentication is disabled — anyone on your network can access
            VoltOps.
          </div>
        )}
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
