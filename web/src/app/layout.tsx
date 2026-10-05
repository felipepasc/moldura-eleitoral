import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AI_NOTE } from "@/lib/art";
import { OPERATOR, operatorLine } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moldura Eleitoral",
  description: "Coloque na sua foto a moldura do político que você gosta.",
};

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#1f9d55" />
      <path d="M16 5l11 11-11 11L5 16z" fill="#fcc82e" />
      <circle cx="16" cy="16" r="6" fill="#1459d9" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
        <header className="top">
          <div className="wrap top-inner">
            <Link className="logo" href="/">
              <LogoMark />
              Moldura Eleitoral
            </Link>
            <nav className="top-nav" aria-label="Principal">
              <Link href="/#como-funciona">Como funciona</Link>
              <Link href="/#exemplos">Exemplos</Link>
              <Link href="/minhas">Minhas molduras</Link>
            </nav>
            <Link className="btn top-cta" href="/criar">Criar agora</Link>
          </div>
        </header>
        <div id="conteudo">{children}</div>
        <footer className="site-footer">
          <p>Site independente de apoio de eleitores. Não é material oficial de nenhuma campanha.</p>
          <p>{AI_NOTE}</p>
          {OPERATOR ? <p className="footer-operator">{operatorLine(OPERATOR)}</p> : null}
          <nav className="footer-links" aria-label="Informações">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos de uso</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
