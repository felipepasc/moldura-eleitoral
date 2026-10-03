import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moldura Eleitoral",
  description: "Coloque na sua foto a moldura do político que você gosta.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="top">
          <div className="wrap">
            <Link className="logo" href="/">Moldura Eleitoral</Link>
            <nav className="row" style={{ alignItems: "center" }}>
              <Link href="/minhas">Minhas molduras</Link>
              <Link className="btn" href="/criar">Criar agora</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer>Site independente de apoio de eleitores. Não é material oficial de nenhuma campanha.</footer>
      </body>
    </html>
  );
}
