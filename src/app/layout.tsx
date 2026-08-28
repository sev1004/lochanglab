import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glavier DPS Simulator",
  description: "로스트아크 창술사 DPS 시뮬레이터",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
