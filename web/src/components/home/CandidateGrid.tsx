"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { STATES, findParty } from "@moldura/common";
import type { Office, StateCode } from "@moldura/common";
import { Reveal } from "@/components/Reveal";
import { FramedPortrait } from "@/components/home/FramedPortrait";
import { displayName, filterCandidates, hasArt } from "@/lib/art";
import { sortCandidatesAlphabetically } from "@/lib/candidate-order";
import { OFFICE_OPTIONS } from "@/lib/offices";

const TABS = OFFICE_OPTIONS;

export function CandidateGrid() {
  const [office, setOffice] = useState<Office>("presidente");
  const [state, setState] = useState<StateCode | "">("");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const candidates = sortCandidatesAlphabetically(filterCandidates(office, state));

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = targets[event.key];

    if (next === undefined) {
      return;
    }

    event.preventDefault();

    setOffice(TABS[next].office);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="exemplos" className="section examples" aria-labelledby="examples-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <h2 id="examples-title">Exemplos de molduras</h2>
            <p className="section-sub">Molduras prontas dos candidatos das eleições 2026. Toque em uma para usar na sua foto.</p>
          </div>
          <div className="tabs" role="tablist" aria-label="Cargo">
            {TABS.map((tab, index) => (
              <button
                key={tab.office}
                ref={(node) => { tabRefs.current[index] = node; }}
                id={`tab-${tab.office}`}
                type="button"
                role="tab"
                className="tab"
                aria-selected={office === tab.office}
                aria-controls="examples-panel"
                tabIndex={office === tab.office ? 0 : -1}
                onClick={() => setOffice(tab.office)}
                onKeyDown={(event) => moveFocus(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div id="examples-panel" role="tabpanel" aria-labelledby={`tab-${office}`}>
          {office === "governador" ? (
            <div className="state-picker">
              <label htmlFor="home-state">Estado</label>
              <select id="home-state" value={state} onChange={(event) => setState(event.target.value as StateCode | "")}>
                <option value="">Escolha o estado</option>
                {STATES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
              {candidates.length === 0 ? (
                <p className="soon" role="status">
                  <strong>Governadores: em breve.</strong> As molduras dos candidatos a governador entram aqui assim que as candidaturas forem confirmadas. Por enquanto, escolha uma moldura de presidente.
                </p>
              ) : null}
            </div>
          ) : null}

          {candidates.length > 0 ? (
            <ul className="cards">
              {candidates.map((candidate, index) => {
                const party = findParty(candidate.partyAcronym);
                const name = displayName(candidate.name);

                return (
                  <Reveal key={candidate.id} as="li" delay={(index % 6) * 70}>
                    <Link className="cand-card" href={`/criar?c=${candidate.id}`} aria-label={`Usar a moldura de ${name}, número ${candidate.number}${party ? `, ${party.acronym}` : ""}. Moldura pronta${hasArt(candidate.id) ? ". Ilustração gerada por IA" : ""}`}>
                      <FramedPortrait id={candidate.id} name={candidate.name} />
                      <b className="card-name">{name}</b>
                      <span className="card-meta">
                        Número {candidate.number}
                        {party ? <span className="card-party"> · {party.acronym}</span> : null}
                      </span>
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
          ) : null}
        </div>
      </div>
    </section>
  );
}
