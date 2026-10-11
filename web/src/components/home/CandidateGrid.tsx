import Link from "next/link";
import { candidatesBy, findParty, frameStylesFor } from "@moldura/common";
import { Reveal } from "@/components/Reveal";
import { FramedPortrait } from "@/components/home/FramedPortrait";
import { displayName, hasArt } from "@/lib/art";
import { sortCandidatesAlphabetically } from "@/lib/candidate-order";

// O site oferece só as molduras dos candidatos do 2º turno (decisão do produto).
const PRESIDENTS = sortCandidatesAlphabetically(candidatesBy("presidente"));

export function CandidateGrid() {
  return (
    <section id="exemplos" className="section examples" aria-labelledby="examples-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <h2 id="examples-title">Exemplos de molduras</h2>
            <p className="section-sub">Molduras prontas dos candidatos do 2º turno das eleições 2026. Toque em uma para usar na sua foto.</p>
          </div>
        </div>

        <ul className="cards">
          {PRESIDENTS.map((candidate, index) => {
            const party = findParty(candidate.partyAcronym);
            const name = displayName(candidate.name);
            const models = frameStylesFor(candidate.id).length;

            return (
              <Reveal key={candidate.id} as="li" delay={(index % 6) * 70}>
                <Link className="cand-card" href={`/criar?c=${candidate.id}`} aria-label={`Usar a moldura de ${name}, número ${candidate.number}${party ? `, ${party.acronym}` : ""}. Moldura pronta, ${models} modelos${hasArt(candidate.id) ? ". Ilustração gerada por IA" : ""}`}>
                  <FramedPortrait id={candidate.id} name={candidate.name} />
                  <b className="card-name">{name}</b>
                  <span className="card-meta">
                    Número {candidate.number}
                    {party ? <span className="card-party"> · {party.acronym}</span> : null}
                  </span>
                  <span className="card-styles">{models} modelos de moldura</span>
                  <span className="chip-ready">
                    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                      <circle cx="10" cy="10" r="9" fill="currentColor" />
                      <path d="M6 10.3l2.6 2.6L14 7.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Moldura pronta
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
