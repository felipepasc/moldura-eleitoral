import { PRICE_CENTS } from "@moldura/common";
import { Reveal } from "@/components/Reveal";

const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function UploadIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="5" y="9" width="30" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="26" cy="17" r="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M5 31l9-9 8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <g className="icon-bob">
        <path d="M38 44V26M31.5 32l6.5-6.5 6.5 6.5" fill="none" stroke="#1459d9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function FrameIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="40" height="40" rx="10" fill="#e9f8ef" stroke="#1f9d55" strokeWidth="2.6" />
      <g className="icon-spin">
        <circle cx="24" cy="24" r="13" fill="none" stroke="#1f9d55" strokeWidth="4" strokeDasharray="10 5" />
      </g>
      <circle cx="24" cy="21" r="4" fill="#1459d9" />
      <path d="M17 31c1.5-4 4-5.5 7-5.5s5.5 1.5 7 5.5" fill="#1459d9" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g className="icon-bob">
        <path d="M24 5v24M15 21l9 9 9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M7 31v7a4 4 0 0 0 4 4h26a4 4 0 0 0 4-4v-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const STEPS = [
  { title: "Envie sua foto", text: "Escolha uma foto do celular ou do computador.", icon: <UploadIcon /> },
  { title: "Escolha a moldura", text: "Selecione o candidato e ajuste a foto no círculo.", icon: <FrameIcon /> },
  { title: "Baixe e compartilhe", text: `Pague o Pix de ${price}, baixe a foto e publique.`, icon: <DownloadIcon /> },
];

export function Steps() {
  return (
    <section id="como-funciona" className="section" aria-labelledby="steps-title">
      <div className="wrap">
        <Reveal className="steps-band">
          <div className="steps-intro">
            <h2 id="steps-title">Como funciona</h2>
            <p>Em 3 passos sua foto fica com a moldura e pronta para as redes sociais.</p>
          </div>
          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="step">
                <span className="step-number" aria-hidden="true">{index + 1}</span>
                <span className="step-icon">{step.icon}</span>
                <span className="step-text">
                  <b>{step.title}</b>
                  <span>{step.text}</span>
                </span>
                {index < STEPS.length - 1 ? (
                  <svg className="step-chevron" viewBox="0 0 16 24" aria-hidden="true" focusable="false">
                    <path d="M4 4l8 8-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
