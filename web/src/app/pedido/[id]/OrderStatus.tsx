"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@moldura/common";
import { getOrder, messageOf, statusOf } from "@/lib/api";
import { POLL_BASE_MS, nextDelay, qrSource } from "@/lib/polling";
import { SHARED_DEVICE_WARNING, browserStorage, removeSavedOrder, saveOrder } from "@/lib/my-orders";

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const status = order?.status;
  const candidateId = order?.candidateId;
  const savable = status === "paid" && Boolean(order?.downloadUrl);
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

  useEffect(() => {
    if (savable && candidateId && !dismissed) {
      saveOrder(browserStorage(), { id, candidateId }, Date.now());
    }
  }, [savable, id, candidateId, dismissed]);

  function dismiss() {
    removeSavedOrder(browserStorage(), id, Date.now());
    setDismissed(true);
  }

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
      <OrderView order={order} error={error} notFound={notFound} copied={copied} dismissed={dismissed} onCopy={copyCode} onDismiss={dismiss} />
    </div>
  );
}

type ViewProps = { order: Order | null; error: string; notFound: boolean; copied: boolean; dismissed: boolean; onCopy: (code: string) => void; onDismiss: () => void };

function OrderView({ order, error, notFound, copied, dismissed, onCopy, onDismiss }: ViewProps) {
  if (notFound) {
    return (
      <section className="status-card">
        <h2>Pedido não encontrado</h2>
        <p className="error" role="alert">Confira o link ou crie uma nova moldura.</p>
        <div className="row"><Link className="btn" href="/criar">Criar uma moldura</Link></div>
      </section>
    );
  }

  if (error && !order) {
    return (
      <section className="status-card">
        <p className="error" role="alert">{error}</p>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="status-card">
        <span className="status-pill"><span className="pulse-dot" aria-hidden="true" />Carregando o pedido…</span>
      </section>
    );
  }

  if (order.status === "paid" && order.downloadUrl) {
    return (
      <section className="status-card is-success">
        <svg className="status-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22" fill="currentColor" /><path d="M14 24.5l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h2>Pagamento confirmado! Sua foto está pronta.</h2>
        <div className="row">
          <a className="btn" href={order.downloadUrl} rel="noreferrer noopener">Baixar foto</a>
          <Link className="btn alt" href="/criar">Criar outra</Link>
        </div>
        <p className="hint">O link vale por poucos minutos; recarregue esta página para gerar outro. A imagem fica disponível por 7 dias.</p>
        {dismissed ? (
          <p className="hint">Este pedido não está guardado neste aparelho.</p>
        ) : (
          <>
            <p className="hint">Guardamos este pedido neste aparelho por 7 dias. Veja em <Link href="/minhas">Minhas molduras</Link>.</p>
            <div className="row"><button className="btn alt" onClick={onDismiss}>Não guardar neste aparelho</button></div>
          </>
        )}
        <p className="hint">{SHARED_DEVICE_WARNING}</p>
      </section>
    );
  }

  if (order.status === "paid" || order.status === "paid_failed") {
    return (
      <section className="status-card is-success">
        <svg className="status-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22" fill="currentColor" /><path d="M14 24.5l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h2>Pagamento confirmado.</h2>
        <p>{order.status === "paid_failed" ? "Estamos finalizando sua foto. Esta página atualiza sozinha." : "A imagem desse pedido não está mais disponível."}</p>
        {order.status === "paid" ? <div className="row"><Link className="btn" href="/criar">Criar outra</Link></div> : null}
      </section>
    );
  }

  if (order.status === "expired") {
    return (
      <section className="status-card">
        <svg className="status-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M24 13v12l8 5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h2>Esse Pix expirou.</h2>
        <p>Crie a moldura de novo para gerar outro Pix.</p>
        <div className="row"><Link className="btn" href="/criar">Criar de novo</Link></div>
      </section>
    );
  }

  const pix = order.pix;

  return (
    <section className="pix-card">
      {pix ? (
        <div className="pix-qr">
          <img className="qr" src={qrSource(pix.brCodeBase64)} alt="QR Code do Pix" />
        </div>
      ) : null}
      <div className="pix-body">
        <span className="status-pill"><span className="pulse-dot" aria-hidden="true" />Aguardando pagamento</span>
        <h2>Pague o Pix para liberar sua foto</h2>
        <ol className="pix-steps">
          <li>Abra o app do seu banco e escolha Pix.</li>
          <li>Leia o QR Code ou use o código copia e cola.</li>
          <li>Pronto: esta página confirma sozinha.</li>
        </ol>
        {pix ? (
          <>
            <div className="code">{pix.brCode}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className={`btn${copied ? " alt" : ""}`} onClick={() => onCopy(pix.brCode)}>{copied ? "Código copiado" : "Copiar código Pix"}</button>
            </div>
          </>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
