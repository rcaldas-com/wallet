import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ImpersonateBanner from "./dashboard/impersonate-banner";
import { getCurrentUser } from "@/app/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Base para resolver URLs absolutas das imagens de OG/Twitter (opengraph-image).
// Em prod WALLET_URL é o domínio (https://wallet.rcaldas.com); em dev é "/wallet"
// (relativo), então deixamos indefinido — o fallback localhost do Next é
// inofensivo em dev e evita `new URL()` quebrar com uma URL relativa.
const walletUrl = process.env.WALLET_URL;
const metadataBase =
  walletUrl && /^https?:\/\//.test(walletUrl) ? new URL(walletUrl) : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: "Wallet - RCaldas",
  description: "Carteira digital RCaldas",
  icons: {
    // `icons` explícito aqui substitui por completo o ícone que o Next.js
    // detectaria sozinho a partir de app/icon.svg — sem essa linha, o
    // <link rel="icon"> simplesmente não era gerado (só o apple-touch-icon).
    // Saquinho de dinheiro (mesmo motivo visual do "💰 Wallet" nos cabeçalhos),
    // desenhado como SVG estático — sem fonte/rede envolvida.
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wallet",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const userTheme = user?.theme === 'dark' || user?.theme === 'light' ? user.theme : undefined;

  return (
    <html
      lang="pt"
      className={userTheme === 'dark' ? 'dark' : undefined}
      data-user-theme={user ? (userTheme ?? 'auto') : ''}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const root = document.documentElement; const serverTheme = root.dataset.userTheme; const storedTheme = localStorage.getItem('theme'); const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; const theme = serverTheme === 'dark' || serverTheme === 'light' ? serverTheme : serverTheme === 'auto' ? systemTheme : storedTheme || systemTheme; root.classList.toggle('dark', theme === 'dark'); } catch (_) {} })();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-zinc-100`}
      >
        <ImpersonateBanner />
        {children}
      </body>
    </html>
  );
}
