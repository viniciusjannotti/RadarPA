import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import { SCRIPT_TEMA_INICIAL } from "@/lib/tema";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Radar PA", template: "%s · Radar PA" },
  description: "Acompanhamento da Câmara Municipal de Pouso Alegre",
  applicationName: "Radar PA",
  appleWebApp: { capable: true, title: "Radar PA", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070d1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme é aplicado pelo script abaixo antes da hidratação.
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Texto fixo (sem dados do usuário); permitido pelo CSP via 'unsafe-inline'. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body className="min-h-full">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
