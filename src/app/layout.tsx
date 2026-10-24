import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RegistrarSW from "@/components/RegistrarSW";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Controle de Cabos",
  description: "Consulta e registro de corte e lançamento de cabos em campo",
  appleWebApp: { capable: true, title: "Cabos", statusBarStyle: "black-translucent" },
  icons: { icon: "/icone-app-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f1c1c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
