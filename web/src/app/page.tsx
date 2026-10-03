import Link from "next/link";
import { CANDIDATES, PRICE_CENTS } from "@moldura/common";

const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function HomePage() {
  return (
    <main className="wrap">
      <section className="hero">
        <h1>Coloque na sua foto a moldura do político que você gosta</h1>
        <p>Mostre seu apoio nas redes sociais com uma moldura das eleições 2026. Veja a prévia de graça; para baixar a foto pronta, {price}.</p>
        <div className="row">
          <Link className="btn" href="/criar">Criar agora →</Link>
          <a className="btn alt" href="#exemplos">Ver exemplos</a>
        </div>
      </section>

      <section id="exemplos">
        <h2>Exemplos de molduras</h2>
        <div className="grid">
          {CANDIDATES.map((candidate) => (
            <Link key={candidate.id} className="card" href={`/criar?c=${candidate.id}`}>
              <div className="art">
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="42" r="17" fill="#9fb0c8" />
                  <ellipse cx="50" cy="92" rx="30" ry="28" fill="#9fb0c8" />
                </svg>
                <img src={`/frames/${candidate.id}.png`} alt={`Moldura de ${candidate.name}`} />
              </div>
              <b>{candidate.name}</b>
              <small>Número {candidate.number}</small>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>Como funciona</h2>
        <div className="steps">
          <div className="step"><i>1</i><b>Envie sua foto</b><p>Escolha uma foto do celular ou computador.</p></div>
          <div className="step"><i>2</i><b>Escolha a moldura</b><p>Selecione o candidato e ajuste a imagem.</p></div>
          <div className="step"><i>3</i><b>Pague e baixe</b><p>Pague o Pix de {price}, baixe a foto e publique nas redes.</p></div>
        </div>
      </section>
    </main>
  );
}
