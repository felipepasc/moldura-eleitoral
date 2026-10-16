"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import Link from "next/link";
import type { Order } from "@moldura/common";
import { getOrder, messageOf, retryAfterOf, statusOf } from "@/lib/api";
import { decideDownload, isDownloadStale } from "@/lib/download-url";
import { DEFAULT_IMAGES_ORIGIN, normalizeOrigin } from "@/lib/origin";
import { POLL_BASE_MS, nextDelay, qrSource, retryDelay, shouldKeepPolling } from "@/lib/polling";
import { SHARED_DEVICE_WARNING, browserStorage, removeSavedOrder, saveOrder } from "@/lib/my-orders";

const IMAGES_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_IMAGES_ORIGIN, DEFAULT_IMAGES_ORIGIN);

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const status = order?.status;
  const candidateId = order?.candidateId;
  const savable = status === "paid" && Boolean(order?.downloadUrl);
  const stopped = notFound || status === "paid" || finished;

  useEffect(() => {
    if (stopped) {
      return;
    }

    let active = true;
    let inflight = false;
    let delay = POLL_BASE_MS;
    let expiredPolls = 0;
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
        setFetchedAt(Date.now());
        setError("");
        delay = nextDelay(delay, true);

        // Expirado: ainda consulta algumas vezes (um Pix pago no último segundo ainda chega).
        expiredPolls = next.status === "expired" ? expiredPolls + 1 : 0;

        if (!shouldKeepPolling(next.status, expiredPolls)) {
          if (next.status === "expired") {
            setFinished(true);
          }

          return;
        }
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

        // 429/503: respeita o Retry-After da api quando ele pede para esperar mais que o backoff.
        if (statusOf(caught) === 429 || statusOf(caught) === 503) {
          delay = retryDelay(delay, retryAfterOf(caught));
        }
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

  // Busca o pedido de novo (link assinado novo). Devolve a URL de download válida, se houver.
  async function refreshDownload(): Promise<string | null> {
    setRefreshing(true);

    try {
      const next = await getOrder(id);
      setOrder(next);
      setFetchedAt(Date.now());
      setError("");
      const decision = decideDownload(next.status, next.downloadUrl, IMAGES_ORIGIN);

      return decision.kind === "ok" ? decision.url : null;
    } catch (caught) {
      setError(messageOf(caught));

      return null;
    } finally {
      setRefreshing(false);
    }
  }

  async function startDownload(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDownloadStale(fetchedAt, Date.now())) {
      return;
    }

    event.preventDefault();
    const url = await refreshDownload();

    if (url) {
      window.location.assign(url);
    }
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
      <OrderView order={order} error={error} notFound={notFound} copied={copied} dismissed={dismissed} refreshing={refreshing} onCopy={copyCode} onDismiss={dismiss} onDownload={startDownload} onImageError={() => void refreshDownload()} />
    </div>
  );
}

type ViewProps = {
  order: Order | null;
  error: string;
  notFound: boolean;
  copied: boolean;
  dismissed: boolean;
  refreshing: boolean;
  onCopy: (code: string) => void;
  onDismiss: () => void;
  onDownload: (event: MouseEvent<HTMLAnchorElement>) => void;
  onImageError: () => void;
};

function OrderView({ order, error, notFound, copied, dismissed, refreshing, onCopy, onDismiss, onDownload, onImageError }: ViewProps) {
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

  const download = decideDownload(order.status, order.downloadUrl, IMAGES_ORIGIN);

  if (order.status === "paid" && order.downloadUrl && download.kind === "unavailable") {
    return (
      <section className="status-card is-success">
        <svg className="status-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22" fill="currentColor" /><path d="M14 24.5l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h2>Pagamento confirmado.</h2>
        <p>O link da sua foto está indisponível neste momento. Recarregue esta página em instantes.</p>
      </section>
    );
  }

  if (order.status === "paid" && download.kind === "ok") {
    return <ReadyView url={download.url} error={error} dismissed={dismissed} refreshing={refreshing} onDismiss={onDismiss} onDownload={onDownload} onImageError={onImageError} />;
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
        <p>Já pagou? Recarregue esta página em instantes — se o pagamento tiver sido confirmado, sua foto será liberada.</p>
        <p className="hint">Se não pagou, crie a moldura de novo para gerar outro Pix.</p>
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
        <p className="pix-sub">Pague o Pix e a foto sem marca d&apos;água fica pronta para baixar.</p>
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

type ReadyProps = {
  url: string;
  error: string;
  dismissed: boolean;
  refreshing: boolean;
  onDismiss: () => void;
  onDownload: (event: MouseEvent<HTMLAnchorElement>) => void;
  onImageError: () => void;
};

function ReadyView({ url, error, dismissed, refreshing, onDismiss, onDownload, onImageError }: ReadyProps) {
  // Uma tentativa de renovar o link por imagem quebrada (link vencido ao voltar para a aba); depois, só o botão.
  const [retried, setRetried] = useState(false);

  function imageFailed() {
    if (!retried) {
      setRetried(true);
      onImageError();
    }
  }

  return (
    <section className="ready-card">
      <figure className="ready-figure">
        <img className="ready-image" src={url} alt="Sua foto pronta, com a moldura" width={1080} height={1080} onError={imageFailed} />
      </figure>
      <div className="ready-body">
        <span className="ready-pill">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="M6 10.3l2.7 2.7L14 7.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Pagamento confirmado
        </span>
        <h2>Sua foto está pronta!</h2>
        <p className="ready-sub">Sem marca d&apos;água, em alta qualidade (1080 × 1080). Baixe e use como foto de perfil.</p>
        <div className="ready-actions">
          <a className="btn btn-lg" href={url} rel="noreferrer noopener" onClick={onDownload} aria-busy={refreshing}>
            <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {refreshing ? "Preparando…" : "Baixar foto"}
          </a>
          <Link className="btn btn-lg alt" href="/criar">Criar outra</Link>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="ready-howto">
          <h3>Como usar no perfil</h3>
          <ol>
            <li><b>WhatsApp:</b> Configurações → toque na sua foto → Editar → escolha a imagem baixada.</li>
            <li><b>Instagram:</b> Perfil → Editar perfil → Editar foto → escolha a imagem.</li>
            <li>No recorte, deixe a moldura inteira dentro do círculo.</li>
          </ol>
        </div>
        <div className="ready-foot">
          <p>
            A foto fica disponível por 7 dias.{" "}
            {dismissed ? "Este pedido não está guardado neste aparelho." : <>Guardamos o pedido em <Link href="/minhas">Minhas molduras</Link> neste aparelho.</>}
          </p>
          {dismissed ? null : <button type="button" className="link-btn" onClick={onDismiss}>Não guardar neste aparelho</button>}
          <details className="ready-details">
            <summary>Está num computador compartilhado?</summary>
            <p>{SHARED_DEVICE_WARNING}</p>
          </details>
        </div>
      </div>
    </section>
  );
}
