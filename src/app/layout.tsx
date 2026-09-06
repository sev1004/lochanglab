import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로아 창술사 DPS 시뮬레이터",
  description: "로스트아크 창술사 세팅과 전투 사이클을 분석하는 DPS 시뮬레이터",
  openGraph: {
    title: "로아 창술사 DPS 시뮬레이터",
    description: "로스트아크 창술사 세팅과 전투 사이클을 분석하는 DPS 시뮬레이터",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary",
    title: "로아 창술사 DPS 시뮬레이터",
    description: "로스트아크 창술사 세팅과 전투 사이클을 분석하는 DPS 시뮬레이터",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
