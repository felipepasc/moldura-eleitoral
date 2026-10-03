"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { findCandidate } from "@moldura/common";
import { getOrder, statusOf } from "@/lib/api";
import { browserStorage, clearSavedOrders, loadSavedOrders, removeSavedOrder } from "@/lib/my-orders";
import type { SavedOrder } from "@/lib/my-orders";

type Item = { saved: SavedOrder; downloadUrl: string | null; failed: boolean };

const NOTICE = "Esta lista fica só neste aparelho por 7 dias. Em computador compartilhado, apague ao terminar.";

export function MyOrders() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    let active = true;

    async function run() {
      const storage = browserStorage();
      const saved = loadSavedOrders(storage, Date.now());

      setItems(saved.map((entry) => ({ saved: entry, downloadUrl: null, failed: false })));

      // Um pedido por vez: a api limita as leituras por minuto.
      for (const entry of saved) {
        if (!active) {
          return;
        }

        try {
          const order = await getOrder(entry.id);

          if (!active) {
            return;
          }

          if (order.status === "paid" && order.downloadUrl) {
            const downloadUrl = order.downloadUrl;

            setItems((current) => current?.map((item) => (item.saved.id === entry.id ? { ...item, downloadUrl } : item)) ?? current);
          } else {
            removeSavedOrder(storage, entry.id, Date.now());
            setItems((current) => current?.filter((item) => item.saved.id !== entry.id) ?? current);
          }
        } catch (caught) {
          if (!active) {
            return;
          }

          if (statusOf(caught) === 404) {
            removeSavedOrder(storage, entry.id, Date.now());
            setItems((current) => current?.filter((item) => item.saved.id !== entry.id) ?? current);
          } else {
            setItems((current) => current?.map((item) => (item.saved.id === entry.id ? { ...item, failed: true } : item)) ?? current);
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
    clearSavedOrders(browserStorage());
    setItems([]);
    setConfirmAll(false);
  }

  if (items === null) {
    return <p aria-live="polite">Carregando...</p>;
  }

  return (
    <div aria-live="polite">
      <p className="hint">{NOTICE}</p>
      {items.length === 0 ? (
        <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
          <b>Você ainda não tem molduras guardadas neste aparelho.</b>
          <div className="row"><Link className="btn" href="/criar">Criar uma moldura</Link></div>
        </section>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
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
    <div className="card">
      {item.downloadUrl ? (
        <img src={item.downloadUrl} alt={`Moldura de ${name}`} referrerPolicy="no-referrer" style={{ width: "100%", aspectRatio: "1", borderRadius: 8 }} />
      ) : null}
      <b>{name}</b>
      <small>Salva em {date}</small>
      {item.failed ? <p className="error" role="alert">Não foi possível carregar agora. Tente de novo mais tarde.</p> : null}
      {!item.downloadUrl && !item.failed ? <p className="hint">Carregando...</p> : null}
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
