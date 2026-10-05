import type { Metadata } from "next";
import Link from "next/link";
import { PRICE_CENTS } from "@moldura/common";
import { OperatorContact, contactText } from "@/components/OperatorContact";
import { PageHeader } from "@/components/PageHeader";
import { formatPrice } from "@/lib/site";

export const metadata: Metadata = { title: "Termos de uso | Moldura Eleitoral" };

export default function TermsPage() {
  const contact = contactText();
  const price = formatPrice(PRICE_CENTS);

  return (
    <main>
      <PageHeader title="Termos de uso">As regras do serviço, em palavras simples.</PageHeader>
      <div className="wrap legal">
        <p className="legal-note">Texto informativo, não é aconselhamento jurídico. Última atualização: outubro de 2026.</p>

        <OperatorContact />

        <section aria-labelledby="servico">
          <h2 id="servico">O que é o serviço</h2>
          <p>
            O Moldura Eleitoral coloca na sua foto a moldura de um candidato que você escolhe. A prévia é grátis e tem marca d&apos;água. A foto final, sem marca
            d&apos;água, custa {price} por foto.
          </p>
        </section>

        <section aria-labelledby="pagamento">
          <h2 id="pagamento">Pagamento e entrega</h2>
          <ul>
            <li>O pagamento é por Pix, processado pela AbacatePay. O Pix gerado vale por tempo limitado.</li>
            <li>Depois que o pagamento é confirmado, a foto pronta é montada e fica disponível para baixar por até 7 dias, pela página do pedido.</li>
            <li>Se você pagou e não recebeu a imagem, fale com a gente {contact}, informando o horário do pagamento.</li>
          </ul>
        </section>

        <section aria-labelledby="independencia">
          <h2 id="independencia">Sem ligação com partidos ou candidatos</h2>
          <p>
            O site é independente e não tem ligação com partidos, candidatos, campanhas ou com a Justiça Eleitoral. As molduras usam só dados públicos (nome, número,
            partido e cores). As ilustrações do site são geradas por IA, estilizadas, e não são fotos nem material oficial das campanhas.
          </p>
        </section>

        <section aria-labelledby="responsabilidade">
          <h2 id="responsabilidade">Sua responsabilidade</h2>
          <ul>
            <li>Para fazer o pedido, você autoriza o tratamento da foto e da moldura escolhida (que revela preferência política) e declara ter 18 anos ou mais, ou autorização do responsável legal.</li>
            <li>Envie só fotos suas ou de quem autorizou o uso.</li>
            <li>Não envie conteúdo ilegal, ofensivo ou que viole direitos de outras pessoas.</li>
            <li>O uso da foto pronta, inclusive como manifestação política ou propaganda eleitoral, é de sua responsabilidade e deve seguir as regras eleitorais.</li>
          </ul>
        </section>

        <section aria-labelledby="disponibilidade">
          <h2 id="disponibilidade">Disponibilidade</h2>
          <p>
            Fazemos o possível para manter o site no ar, mas ele pode ficar indisponível ou mudar sem aviso. Molduras e listas de candidatos podem ser corrigidas a
            qualquer momento.
          </p>
        </section>

        <p className="legal-links">
          Veja também a <Link href="/privacidade">Privacidade</Link>.
        </p>
      </div>
    </main>
  );
}
