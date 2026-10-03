import type { Metadata } from "next";
import Link from "next/link";
import { OperatorContact, contactText } from "@/components/OperatorContact";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Privacidade | Moldura Eleitoral" };

const RETENTION: { item: string; how: string }[] = [
  { item: "Sua foto (pedido não pago)", how: "Normalmente apagada 24 h depois do pedido; no máximo em 4 dias." },
  { item: "Sua foto (pedido pago)", how: "Apagada logo que a foto pronta é montada (no máximo em 4 dias, se algo falhar)." },
  { item: "Foto pronta (com a moldura, sem marca d'água)", how: "Disponível para baixar por 7 dias e depois apagada (no máximo em 8 dias)." },
  { item: "Registro do pedido pago", how: "Apagado depois de 7 dias." },
  { item: "Registro do pedido pago em que a foto não pôde ser montada", how: "Apagado em até 5 dias." },
  { item: "Registro do pedido não pago ou expirado", how: "Normalmente apagado 24 h depois do pedido; no máximo em 3 dias." },
  { item: "Avisos de pagamento recebidos da AbacatePay", how: "Apagados depois de 30 dias." },
  { item: "Lista “Minhas molduras” (no seu navegador)", how: "Cada item some sozinho depois de 7 dias; você pode apagar antes." },
];

export default function PrivacyPage() {
  const contact = contactText();

  return (
    <main>
      <PageHeader title="Privacidade">Como o Moldura Eleitoral trata os seus dados, em palavras simples.</PageHeader>
      <div className="wrap legal">
        <p className="legal-note">Texto informativo, não é aconselhamento jurídico. Última atualização: outubro de 2026.</p>

        <OperatorContact />

        <section aria-labelledby="resumo">
          <h2 id="resumo">Resumo</h2>
          <ul>
            <li>Não usamos cookies, ferramentas de análise, anúncios nem rastreadores de terceiros.</li>
            <li>Não pedimos nome, CPF, e-mail nem telefone para criar a moldura.</li>
            <li>Não vendemos nem compartilhamos as suas fotos.</li>
            <li>A sua foto só sai do seu aparelho quando você clica em “Baixar foto pronta”, e é apagada assim que deixa de ser necessária.</li>
          </ul>
        </section>

        <section aria-labelledby="coleta">
          <h2 id="coleta">O que recebemos e para quê</h2>
          <dl className="legal-list">
            <dt>A foto que você escolhe</dt>
            <dd>
              Enquanto você ajusta, a prévia é montada só no seu navegador. A foto é enviada ao servidor apenas quando você clica em “Baixar foto pronta”, para montar a
              imagem final com a moldura depois do pagamento.
            </dd>
            <dt>A moldura escolhida e o enquadramento</dt>
            <dd>O candidato da moldura, o zoom e a posição da foto, para montar a imagem do jeito que você viu na prévia.</dd>
            <dt>Dados do pagamento por Pix</dt>
            <dd>
              A cobrança Pix é criada e processada pela AbacatePay. Guardamos só o necessário para conferir o pagamento (identificador e código da cobrança e o status).
              Nós não pedimos nem guardamos seu nome ou CPF; quem paga é identificado pelo banco e pela AbacatePay, como em qualquer Pix.
            </dd>
            <dt>Endereço IP</dt>
            <dd>Não é guardado. É usado apenas na memória do servidor, por pouco tempo, para limitar pedidos abusivos.</dd>
            <dt>Lista “Minhas molduras” (no seu navegador)</dt>
            <dd>
              Depois do pagamento, o seu navegador guarda (localStorage, só neste aparelho) o número do pedido, a moldura escolhida e a data, por 7 dias, para você
              baixar a foto de novo. Nada disso é enviado a terceiros. Para apagar, use “Apagar do meu navegador” em <Link href="/minhas">Minhas molduras</Link>. Em
              computador compartilhado, apague também o histórico do navegador ou use uma aba anônima, porque o endereço da página do pedido dá acesso à imagem por 7 dias.
            </dd>
          </dl>
        </section>

        <section aria-labelledby="retencao">
          <h2 id="retencao">Por quanto tempo guardamos</h2>
          <div className="table-scroll">
            <table className="legal-table">
              <thead>
                <tr>
                  <th scope="col">Dado</th>
                  <th scope="col">Quando é apagado</th>
                </tr>
              </thead>
              <tbody>
                {RETENTION.map((row) => (
                  <tr key={row.item}>
                    <th scope="row">{row.item}</th>
                    <td>{row.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="operadores">
          <h2 id="operadores">Quem mais trata os dados</h2>
          <ul>
            <li>AbacatePay: cria e processa a cobrança Pix.</li>
            <li>Provedor de hospedagem: onde rodam o site, o servidor e o armazenamento das imagens.</li>
          </ul>
        </section>

        <section aria-labelledby="previa">
          <h2 id="previa">Prévia e foto final</h2>
          <p>A prévia tem marca d&apos;água e resolução reduzida. A foto final, sem marca d&apos;água, só é montada no servidor e liberada depois do pagamento confirmado.</p>
          <p>As ilustrações do site são geradas por IA, estilizadas, e não são fotos nem material oficial das campanhas.</p>
          <p>O site é independente, feito por apoiadores, e não tem ligação com partidos, candidatos, campanhas ou com a Justiça Eleitoral.</p>
        </section>

        <section aria-labelledby="direitos">
          <h2 id="direitos">Seus direitos (LGPD)</h2>
          <p>
            Você pode pedir informações sobre os seus dados, correção ou exclusão antecipada {contact}. Informe o número do pedido (está no endereço da página do pedido)
            para localizarmos o registro mais rápido.
          </p>
        </section>

        <section aria-labelledby="problemas">
          <h2 id="problemas">Pagou e não recebeu a imagem?</h2>
          <p>Fale com a gente {contact}, informando o horário do pagamento e, se tiver, o número do pedido. Vamos verificar o pedido e responder.</p>
        </section>

        <p className="legal-links">
          Veja também os <Link href="/termos">Termos de uso</Link>.
        </p>
      </div>
    </main>
  );
}
