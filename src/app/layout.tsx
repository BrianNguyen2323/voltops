import "~/styles/globals.css";

import { type Metadata } from "next";
import { Archivo } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
import { cn } from "~/lib/utils";

import { isAuthDisabled } from "~/lib/auth";

// Banner reads env at request time.
export const dynamic = "force-dynamic";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "VoltOps",
  description: "VoltOps",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark", archivo.variable, "font-sans")}>
      <body>
        {isAuthDisabled() && (
          <div
            role="alert"
            className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white"
          >
            Authentication is disabled — anyone on your network can access
            VoltOps.
          </div>
        )}
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
