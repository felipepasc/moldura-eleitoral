"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CANDIDATES, PRICE_CENTS } from "@moldura/common";
import { AiBadge } from "@/components/AiBadge";
import { FramedPortrait } from "@/components/home/FramedPortrait";
import { AI_NOTE, hasArt } from "@/lib/art";
import { NEUTRAL_FRAME_ID, NEUTRAL_SLIDE, buildHeroSlides } from "@/lib/hero-slides";
import type { HeroSlide } from "@/lib/hero-slides";

const CYCLE_MS = 3500;
const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function slideHasArt(slide: HeroSlide): boolean {
  return slide.kind === "candidate" && hasArt(slide.candidate.id);
}

// Só o slide atual, o anterior (saindo no crossfade) e o próximo (pré-carregado) ficam montados.
function isNear(index: number, active: number, total: number): boolean {
  return index === active || index === (active + 1) % total || index === (active - 1 + total) % total;
}

function SlidePortrait({ slide, decorative, badge }: { slide: HeroSlide; decorative: boolean; badge: "none" }) {
  if (slide.kind === "neutral") {
    return <FramedPortrait id={NEUTRAL_FRAME_ID} name="Sua foto aqui" badge={badge} decorative={decorative} eager frameAlt="Moldura de exemplo: sua foto aqui" />;
  }

  return <FramedPortrait id={slide.candidate.id} name={slide.candidate.name} badge={badge} decorative={decorative} eager />;
}

function SlideLayers({ slides, active, decorative }: { slides: HeroSlide[]; active: number; decorative: boolean }) {
  return (
    <>
      {slides.map((slide, index) => {
        if (!isNear(index, active, slides.length)) {
          return null;
        }

        const current = index === active;

        return (
          <div key={slide.key} className={`hero-layer${current ? " is-active" : ""}`} aria-hidden={current && !decorative ? undefined : true}>
            <SlidePortrait slide={slide} decorative={decorative || !current} badge="none" />
          </div>
        );
      })}
    </>
  );
}

export function Hero() {
  // SSR e primeira pintura: só o slide neutro (sem favorecer ninguém e sem diferença de hidratação).
  const [slides, setSlides] = useState<HeroSlide[]>([NEUTRAL_SLIDE]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const built = buildHeroSlides(CANDIDATES);
    let timer: number | undefined;

    function stop() {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    }

    function sync() {
      stop();

      // Movimento reduzido: só o slide neutro fica montado (nenhuma imagem de candidato é carregada).
      if (reduced.matches) {
        setActive(0);
        setSlides([NEUTRAL_SLIDE]);

        return;
      }

      setSlides(built);

      if (!document.hidden && built.length > 1) {
        timer = window.setInterval(() => {
          setActive((current) => (current + 1) % built.length);
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

  const showBadge = slideHasArt(slides[active] ?? NEUTRAL_SLIDE);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-flags" aria-hidden="true">
        <svg className="flag-green" viewBox="0 0 200 400" focusable="false">
          <path d="M0 0h70c60 70 100 150 110 250L0 400z" fill="#1f9d55" />
        </svg>
        <svg className="flag-yellow" viewBox="0 0 200 300" focusable="false">
          <path d="M0 20l170 120L0 290z" fill="#fcc82e" />
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
                <path d="M4 15c46-7 98-10 150-9 52 1 96 4 142 2" fill="none" stroke="#fcc82e" strokeWidth="9" strokeLinecap="round" />
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
          <div className="stage-blob stage-blob--yellow" aria-hidden="true" />
          <div className="stage-blob stage-blob--green" aria-hidden="true" />

          <div className="hero-avatar">
            <div className="hero-ring" aria-hidden="true" />
            <div className="hero-layers">
              <SlideLayers slides={slides} active={active} decorative={false} />
            </div>
            <span className={`badge-slot${showBadge ? " is-on" : ""}`} aria-hidden={showBadge ? undefined : true}>
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
                <SlideLayers slides={slides} active={active} decorative />
                <span className={`badge-slot${showBadge ? " is-on" : ""}`}>
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
