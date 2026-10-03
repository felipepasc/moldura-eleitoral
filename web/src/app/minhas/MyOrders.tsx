"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { findCandidate } from "@moldura/common";
import { getOrder, statusOf } from "@/lib/api";
import { SHARED_DEVICE_WARNING, browserStorage, clearSavedOrders, loadSavedOrders, removeSavedOrder } from "@/lib/my-orders";
import { decideDownload } from "@/lib/download-url";
import { DEFAULT_IMAGES_ORIGIN, normalizeOrigin } from "@/lib/origin";
import type { SavedOrder } from "@/lib/my-orders";

type ItemState = "loading" | "ready" | "failed" | "unavailable" | "stale";
type Item = { saved: SavedOrder; downloadUrl: string | null; state: ItemState };

const NOTICE = `Esta lista fica só neste aparelho por 7 dias. ${SHARED_DEVICE_WARNING}`;
const EXPIRY_HINT = "Os links de download valem por poucos minutos; recarregue esta página para gerar outros.";
const RATE_LIMIT_MESSAGE = "Muitas consultas seguidas. Aguarde um minuto e recarregue a página.";
const LOAD_FAILED_MESSAGE = "Não foi possível carregar algumas molduras agora. Tente de novo mais tarde.";
const IMAGES_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_IMAGES_ORIGIN, DEFAULT_IMAGES_ORIGIN);
const STALE_MESSAGE = "Não foi possível atualizar agora; tente novamente em instantes.";

export function MyOrders() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    let active = true;

    stopped.current = false;

    async function run() {
      const storage = browserStorage();
      const saved = loadSavedOrders(storage, Date.now());

      setItems(saved.map((entry) => ({ saved: entry, downloadUrl: null, state: "loading" as const })));

      // Um pedido por vez: a api limita as leituras por minuto.
      for (const entry of saved) {
        if (!active || stopped.current) {
          return;
        }

        try {
          const order = await getOrder(entry.id);

          if (!active || stopped.current) {
            return;
          }

          const decision = decideDownload(order.status, order.downloadUrl, IMAGES_ORIGIN);

          if (decision.kind === "ok") {
            const downloadUrl = decision.url;

            setItems((current) => current?.map((item) => (item.saved.id === entry.id ? { ...item, downloadUrl, state: "ready" as const } : item)) ?? current);
          } else if (decision.kind === "unavailable") {
            // Link inutilizável: só avisa; nunca apaga a entrada por causa disso.
            setItems((current) => current?.map((item) => (item.saved.id === entry.id ? { ...item, state: "unavailable" as const } : item)) ?? current);
          } else {
            removeSavedOrder(storage, entry.id, Date.now());
            setItems((current) => current?.filter((item) => item.saved.id !== entry.id) ?? current);
          }
        } catch (caught) {
          if (!active || stopped.current) {
            return;
          }

          if (statusOf(caught) === 429) {
            setRateLimited(true);
            setItems((current) => current?.map((item) => (item.state === "loading" ? { ...item, state: "stale" as const } : item)) ?? current);

            return;
          }

          if (statusOf(caught) === 404) {
            removeSavedOrder(storage, entry.id, Date.now());
            setItems((current) => current?.filter((item) => item.saved.id !== entry.id) ?? current);
          } else {
            setItems((current) => current?.map((item) => (item.saved.id === entry.id ? { ...item, state: "failed" as const } : item)) ?? current);
          }
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  function removeOne(id: string) {
    removeSavedOrder(browserStorage(), id, Date.now());
    setItems((current) => current?.filter((item) => item.saved.id !== id) ?? current);
  }

  function removeAll() {
    stopped.current = true;
    clearSavedOrders(browserStorage());
    setItems([]);
    setRateLimited(false);
    setConfirmAll(false);
  }

  if (items === null) {
    return <p aria-live="polite">Carregando...</p>;
  }

  const someFailed = items.some((item) => item.state === "failed");

  return (
    <div aria-live="polite">
      <div className="notice">
        <p>{NOTICE}</p>
        {items.length > 0 ? <p>{EXPIRY_HINT}</p> : null}
      </div>
      {rateLimited || someFailed ? <p className="error" role="alert">{rateLimited ? RATE_LIMIT_MESSAGE : LOAD_FAILED_MESSAGE}</p> : null}
      {items.length === 0 ? (
        <section className="status-card">
          <img className="status-frame" src="/frames/neutral.webp" alt="" width={96} height={96} />
          <h2>Nenhuma moldura guardada neste aparelho</h2>
          <p>Depois do pagamento, a foto pronta aparece aqui por 7 dias.</p>
          <div className="row"><Link className="btn" href="/criar">Criar uma moldura</Link></div>
        </section>
      ) : (
        <>
          <div className="grid saved-grid">
            {items.map((item) => (
              <MyOrderCard key={item.saved.id} item={item} onRemove={removeOne} />
            ))}
          </div>
          <div className="row" style={{ marginTop: 24 }}>
            {confirmAll ? (
              <>
                <span role="alert"><b>Apagar todas as molduras deste navegador?</b></span>
                <button className="btn" onClick={removeAll}>Sim, apagar tudo</button>
                <button className="btn alt" onClick={() => setConfirmAll(false)}>Cancelar</button>
              </>
            ) : (
              <button className="btn alt" onClick={() => setConfirmAll(true)}>Apagar tudo do meu navegador</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MyOrderCard({ item, onRemove }: { item: Item; onRemove: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const name = findCandidate(item.saved.candidateId)?.name ?? "Moldura";
  const date = new Date(item.saved.savedAt).toLocaleDateString("pt-BR");

  return (
    <div className="card saved-card">
      {item.downloadUrl ? (
        <img src={item.downloadUrl} alt={`Moldura de ${name}`} referrerPolicy="no-referrer" style={{ width: "100%", aspectRatio: "1", borderRadius: 8 }} />
      ) : null}
      <b>{name}</b>
      <small>Salva em {date}</small>
      {item.state === "failed" ? <p className="hint">Não foi possível carregar.</p> : null}
      {item.state === "unavailable" ? <p className="hint">Indisponível neste momento.</p> : null}
      {item.state === "stale" ? <p className="hint">{STALE_MESSAGE}</p> : null}
      {item.state === "loading" ? <p className="hint">Carregando...</p> : null}
      <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
        {item.downloadUrl ? <a className="btn" href={item.downloadUrl} rel="noreferrer noopener">Baixar</a> : null}
        {confirming ? (
          <>
            <button className="btn" onClick={() => onRemove(item.saved.id)}>Confirmar</button>
            <button className="btn alt" onClick={() => setConfirming(false)}>Cancelar</button>
          </>
        ) : (
          <button className="btn alt" onClick={() => setConfirming(true)}>Apagar do meu navegador</button>
        )}
      </div>
    </div>
  );
}
