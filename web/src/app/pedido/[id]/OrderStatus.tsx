"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@moldura/common";
import { getOrder, messageOf, statusOf } from "@/lib/api";
import { POLL_BASE_MS, nextDelay, qrSource } from "@/lib/polling";

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const status = order?.status;
  const stopped = notFound || status === "paid" || status === "expired";

  useEffect(() => {
    if (stopped) {
      return;
    }

    let active = true;
    let inflight = false;
    let delay = POLL_BASE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      if (active && !document.hidden) {
        timer = setTimeout(() => {
          void tick();
        }, delay);
      }
    }

    async function tick() {
      timer = undefined;
      inflight = true;

      try {
        const next = await getOrder(id);

        if (!active) {
          return;
        }

        setOrder(next);
        setError("");
        delay = nextDelay(delay, true);
      } catch (caught) {
        if (!active) {
          return;
        }

        if (statusOf(caught) === 404) {
          setNotFound(true);

          return;
        }

        setError(messageOf(caught));
        delay = nextDelay(delay, false);
      } finally {
        inflight = false;
      }

      schedule();
    }

    function onVisibility() {
      if (document.hidden) {
        clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined && !inflight) {
        delay = POLL_BASE_MS;
        void tick();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [id, stopped]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  return (
    <div aria-live="polite">
      <OrderView order={order} error={error} notFound={notFound} copied={copied} onCopy={copyCode} />
    </div>
  );
}

type ViewProps = { order: Order | null; error: string; notFound: boolean; copied: boolean; onCopy: (code: string) => void };

function OrderView({ order, error, notFound, copied, onCopy }: ViewProps) {
  if (notFound) {
    return <p className="error" role="alert">Pedido não encontrado.</p>;
  }

  if (error && !order) {
    return <p className="error" role="alert">{error}</p>;
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
        {order.status === "paid" ? <div className="row"><Link className="btn" href="/criar">Criar outra</Link></div> : null}
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
              <button className="btn alt" onClick={() => onCopy(pix.brCode)}>{copied ? "Copiado!" : "Copiar código"}</button>
            </div>
          </>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
