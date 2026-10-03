import { PARTIES } from "@moldura/common";
import type { Party } from "@moldura/common";
import { swatch } from "@/lib/art";

function PartyChip({ party }: { party: Party }) {
  const colors = swatch(party.colors.primary);

  return (
    <li className="party" title={party.name}>
      <span className="party-number" style={{ background: colors.background, color: colors.text }}>{party.number}</span>
      <span className="party-acronym">{party.acronym}</span>
    </li>
  );
}

// Só sigla, número e cor de cada partido (sem logotipos). A lista é repetida para o loop contínuo;
// a cópia fica escondida dos leitores de tela.
export function PartiesStrip() {
  return (
    <section className="section parties" aria-labelledby="parties-title">
      <div className="wrap">
        <h2 id="parties-title">Partidos</h2>
        <p className="section-sub">Sigla, número e cor de cada partido.</p>
      </div>
      <div className="marquee" tabIndex={0} aria-label="Faixa de partidos: sigla, número e cor">
        <div className="marquee-track">
          <ul className="marquee-list">
            {PARTIES.map((party) => (
              <PartyChip key={party.acronym} party={party} />
            ))}
          </ul>
          <ul className="marquee-list marquee-copy" aria-hidden="true">
            {PARTIES.map((party) => (
              <PartyChip key={party.acronym} party={party} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
