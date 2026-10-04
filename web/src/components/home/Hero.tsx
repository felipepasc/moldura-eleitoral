"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PRICE_CENTS } from "@moldura/common";
import { AiBadge } from "@/components/AiBadge";
import { AI_NOTE, EXAMPLE_FRAME_ID, HERO_ART, frameSrc } from "@/lib/art";
import type { HeroArt } from "@/lib/art";

const CYCLE_MS = 4000;
const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Pessoa fictícia (ilustração de IA) na moldura de exemplo "SEU CANDIDATO" / 00: o topo não mostra candidato nem partido.
function ExamplePortrait({ art, decorative }: { art: HeroArt; decorative: boolean }) {
  return (
    <div className="portrait">
      <div className="portrait-photo">
        <img src={art.src} alt={decorative ? "" : art.alt} loading="eager" decoding="async" width={640} height={640} />
      </div>
      <img className="portrait-frame" src={frameSrc(EXAMPLE_FRAME_ID)} alt="" loading="eager" decoding="async" width={1080} height={1080} />
    </div>
  );
}

function ExampleLayers({ active, decorative }: { active: number; decorative: boolean }) {
  return (
    <>
      {HERO_ART.map((art, index) => {
        const current = index === active;

        return (
          <div key={art.id} className={`hero-layer${current ? " is-active" : ""}`} aria-hidden={current && !decorative ? undefined : true}>
            <ExamplePortrait art={art} decorative={decorative || !current} />
          </div>
        );
      })}
    </>
  );
}

export function Hero() {
  // SSR e primeira pintura: a primeira pessoa; com movimento reduzido fica nela.
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;

    function stop() {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    }

    function sync() {
      stop();

      if (reduced.matches) {
        setActive(0);

        return;
      }

      if (!document.hidden && HERO_ART.length > 1) {
        timer = window.setInterval(() => {
          setActive((current) => (current + 1) % HERO_ART.length);
        }, CYCLE_MS);
      }
    }

    sync();
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-shapes" aria-hidden="true">
        <svg className="shape-a" viewBox="0 0 200 400" focusable="false">
          <path d="M0 0h70c60 70 100 150 110 250L0 400z" />
        </svg>
        <svg className="shape-b" viewBox="0 0 200 300" focusable="false">
          <path d="M0 20l170 120L0 290z" />
        </svg>
      </div>

      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Eleições 2026</p>
          <h1 id="hero-title">
            Coloque na sua foto a moldura do político que{" "}
            <span className="scribble">
              você gosta
              <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M4 15c46-7 98-10 150-9 52 1 96 4 142 2" fill="none" strokeWidth="9" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="lead">Mostre seu apoio nas redes sociais com uma moldura das eleições 2026. A prévia é grátis; a foto pronta, sem marca d&apos;água, sai por {price}.</p>
          <div className="hero-actions">
            <Link className="btn btn-lg" href="/criar">
              Criar agora <span aria-hidden="true">→</span>
            </Link>
            <a className="btn btn-lg alt" href="#exemplos">Ver exemplos</a>
          </div>
          <p className="ai-note">{AI_NOTE}</p>
        </div>

        <div className="hero-stage">
          <div className="stage-blob stage-blob--a" aria-hidden="true" />
          <div className="stage-blob stage-blob--b" aria-hidden="true" />

          <div className="hero-avatar">
            <div className="hero-ring" aria-hidden="true" />
            <div className="hero-layers">
              <ExampleLayers active={active} decorative={false} />
            </div>
            <span className="badge-slot is-on">
              <AiBadge size="lg" />
            </span>
          </div>

          <p className="hand-note" aria-hidden="true">
            Sua foto com a moldura em segundos!
            <svg viewBox="0 0 60 60" focusable="false">
              <path d="M44 4c6 18 2 34-18 44" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M16 40l9 9 12-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </p>

          <div className="phone" aria-hidden="true">
            <div className="phone-screen">
              <span className="phone-notch" />
              <div className="phone-avatar">
                <ExampleLayers active={active} decorative />
                <span className="badge-slot is-on">
                  <AiBadge size="sm" />
                </span>
              </div>
              <span className="phone-line" />
              <span className="phone-line phone-line--short" />
              <span className="phone-like">♥</span>
            </div>
          </div>

          <p className="sticky-note" aria-hidden="true">Mostre seu apoio!</p>
        </div>
      </div>
    </section>
  );
}
