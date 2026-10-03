"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@moldura/common";
import { getOrder, messageOf } from "@/lib/api";

const POLL_MS = 3000;

function qrSource(brCodeBase64: string): string {
  return brCodeBase64.startsWith("data:") ? brCodeBase64 : `data:image/png;base64,${brCodeBase64}`;
}

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const status = order?.status;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const next = await getOrder(id);

        if (active) {
          setOrder(next);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setError(messageOf(caught));
        }
      }
    }

    void load();

    if (status === "paid" || status === "expired") {
      return () => {
        active = false;
      };
    }

    const timer = setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, status]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  if (error && !order) {
    return <p className="error">{error}</p>;
  }

  if (!order) {
    return <p>Carregando...</p>;
  }

  if (order.status === "paid" && order.downloadUrl) {
    return (
      <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
        <b>Pagamento confirmado! Sua foto está pronta.</b>
        <div className="row">
          <a className="btn" href={order.downloadUrl} rel="noreferrer noopener">Baixar foto</a>
          <Link className="btn alt" href="/criar">Criar outra</Link>
        </div>
        <p className="hint">O link vale por poucos minutos; recarregue esta página para gerar outro. A imagem fica disponível por 7 dias.</p>
      </section>
    );
  }

  if (order.status === "paid" || order.status === "paid_failed") {
    return (
      <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
        <b>Pagamento confirmado.</b>
        <p>{order.status === "paid_failed" ? "Estamos finalizando sua foto. Esta página atualiza sozinha." : "A imagem desse pedido não está mais disponível."}</p>
      </section>
    );
  }

  if (order.status === "expired") {
    return (
      <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
        <b>Esse Pix expirou.</b>
        <div className="row"><Link className="btn" href="/criar">Criar de novo</Link></div>
      </section>
    );
  }

  const pix = order.pix;

  return (
    <section className="panel">
      {pix ? <img className="qr" src={qrSource(pix.brCodeBase64)} alt="QR Code do Pix" /> : null}
      <div>
        <b>Pague o Pix para liberar sua foto</b>
        <p className="hint">Abra o app do seu banco, escolha Pix e leia o QR Code ou use o código copia e cola. Esta página confirma sozinha.</p>
        {pix ? (
          <>
            <div className="code">{pix.brCode}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn alt" onClick={() => copyCode(pix.brCode)}>{copied ? "Copiado!" : "Copiar código"}</button>
            </div>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </section>
  );
}
