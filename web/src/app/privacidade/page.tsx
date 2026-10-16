import type { Metadata } from "next";
import Link from "next/link";
import { OperatorContact, contactText } from "@/components/OperatorContact";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Privacidade | Moldura Eleitoral" };

const RETENTION: { item: string; how: string }[] = [
  { item: "Sua foto (pedido não pago)", how: "Até 4 dias (normalmente apagada 24 h depois do pedido)." },
  { item: "Sua foto (pedido pago)", how: "Até 4 dias (normalmente apagada logo que a foto pronta é montada)." },
  { item: "Foto pronta (com a moldura, sem marca d'água)", how: "Até 8 dias (fica disponível para baixar por 7 dias)." },
  { item: "Registro do pedido pago", how: "Até 7 dias depois do pagamento." },
  { item: "Registro do pedido pago em que a foto não pôde ser montada", how: "Até 5 dias." },
  { item: "Registro do pedido não pago ou expirado", how: "Até 3 dias (normalmente apagado 24 h depois do pedido)." },
  { item: "Avisos de pagamento recebidos do nosso sistema financeiro", how: "Até 30 dias." },
  { item: "Registro financeiro da venda (valor, data e identificador da cobrança)", how: "Pelo prazo exigido pela legislação fiscal e contábil." },
  { item: "Registros técnicos (logs) do site e da hospedagem", how: "Por período limitado, definido pelo operador." },
  { item: "Lista “Minhas molduras” (no seu navegador)", how: "Até 7 dias (cada item some sozinho; você pode apagar antes)." },
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
            <dt>Seu consentimento</dt>
            <dd>
              Sua foto junto com a moldura de um candidato revela sua preferência política, que a LGPD trata como dado pessoal sensível. Por isso, antes de pagar, você
              marca que autoriza o tratamento da foto e da moldura apenas para montar e entregar a imagem, e declara ter 18 anos ou mais (ou autorização do responsável
              legal). Sem essas confirmações o pedido não é criado. Você pode pedir a exclusão a qualquer momento pelo contato abaixo.
            </dd>
            <dt>Dados do pagamento por Pix</dt>
            <dd>
              A cobrança é registrada no nosso sistema financeiro, que gera o Pix pela Woovi, a instituição que processa o pagamento. Esse registro tem só o valor, a
              data, o status e um identificador aleatório da cobrança: nunca a sua foto nem o candidato escolhido. Nós não pedimos nem guardamos seu nome ou CPF; quem
              paga é identificado pelo banco e pela Woovi, como em qualquer Pix.
            </dd>
            <dt>Endereço IP</dt>
            <dd>
              O site não guarda o seu endereço IP no banco de dados, e os registros (logs) da própria aplicação não o anotam: ele é usado apenas na memória do servidor,
              por pouco tempo, para limitar pedidos abusivos. Os servidores, o provedor de hospedagem e o proxy por onde o site é entregue podem manter registros de acesso
              comuns, que podem incluir endereços IP, por um período curto definido pelo operador, para segurança e estabilidade.
            </dd>
            <dt>Registros técnicos da aplicação</dt>
            <dd>
              Os logs da aplicação guardam só uma referência interna ao pedido (não o número do pedido) e, em casos raros de falha envolvendo pagamento, o identificador
              da cobrança, para que um reembolso possa ser rastreado. Eles ficam guardados por período limitado e definido pelo operador.
            </dd>
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
          <p>
            Os prazos abaixo são máximos. O armazenamento aplica a expiração uma vez por dia, então a exclusão pode levar cerca de um dia a mais do que o prazo
            indicado.
          </p>
          <div className="table-scroll">
            <table className="legal-table">
              <thead>
                <tr>
                  <th scope="col">Dado</th>
                  <th scope="col">Prazo máximo</th>
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
            <li>Cloudflare: armazenamento da sua foto e da foto pronta (Cloudflare R2) e entrega do site (DNS e proxy).</li>
            <li>Woovi: gera e processa o Pix.</li>
            <li>Provedor de hospedagem: onde rodam o site e o servidor.</li>
          </ul>
        </section>

        <section aria-labelledby="internacional">
          <h2 id="internacional">Transferência internacional</h2>
          <p>
            A sua foto e a foto pronta ficam guardadas na Cloudflare (R2), que pode armazená-las em servidores fora do Brasil. Isso é uma transferência internacional de
            dados (LGPD, art. 33), feita com um fornecedor que oferece garantias contratuais de proteção de dados, e só pelos prazos da tabela acima.
          </p>
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
