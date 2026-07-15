import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hjemleveringordre",
  description: "Ordrearkiv for hjemleveringer"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
