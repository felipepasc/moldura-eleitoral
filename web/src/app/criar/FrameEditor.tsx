"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CANDIDATES, MAX_ZOOM, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, PRICE_CENTS, candidatesBy } from "@moldura/common";
import type { Framing } from "@moldura/common";
import { createOrder, messageOf } from "@/lib/api";
import { sortCandidatesAlphabetically } from "@/lib/candidate-order";
import { canSubmit, frameFailed, frameLoaded, frameLoading, isFrameFailed, isFrameReady, payHint as describePayHint, previewFrameSrc } from "@/lib/frame-choice";
import type { FrameStatus } from "@/lib/frame-choice";
import { OFFICE_OPTIONS } from "@/lib/offices";
import { drawPreview } from "@/lib/preview";
import { PREVIEW_SIZE, dragFraming } from "@/lib/preview-geometry";
import { BLACKOUT_MS, isCaptureShortcut } from "@/lib/protection";

const KEY_STEP = 0.02;
const clamp = (value: number) => Math.min(1, Math.max(-1, value));
const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type LoadedFrame = { id: string; image: HTMLImageElement };

type Drag = { x: number; y: number; offsetX: number; offsetY: number };

export function FrameEditor({ initialCandidateId }: { initialCandidateId: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [candidateId, setCandidateId] = useState(initialCandidateId);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<LoadedFrame | null>(null);
  const [framing, setFraming] = useState<Framing>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [frameStatus, setFrameStatus] = useState<FrameStatus>(() => frameLoading(initialCandidateId));
  const [frameAttempt, setFrameAttempt] = useState(0);
  const [shortcutHidden, setShortcutHidden] = useState(false);
  const [awayHidden, setAwayHidden] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  // Atrito (não é proteção): escurece a prévia em atalhos de captura do sistema e, em computador
  // (ponteiro fino), enquanto a janela está sem foco ou oculta. Volta ao normal no foco/interação.
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    let timer: number | undefined;

    function onKey(event: globalThis.KeyboardEvent) {
      if (!isCaptureShortcut(event)) {
        return;
      }

      setShortcutHidden(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShortcutHidden(false), BLACKOUT_MS);

      try {
        void navigator.clipboard?.writeText("").catch(() => undefined);
      } catch {
        // A área de transferência pode recusar; é só atrito.
      }
    }

    function away() {
      if (finePointer.matches) {
        setAwayHidden(true);
      }
    }

    function back() {
      setAwayHidden(false);
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        away();
      } else if (document.hasFocus()) {
        back();
      }
    }

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    window.addEventListener("pointerdown", back, true);
    window.addEventListener("pointermove", back, true);
    window.addEventListener("pageshow", back);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      window.removeEventListener("pointerdown", back, true);
      window.removeEventListener("pointermove", back, true);
      window.removeEventListener("pageshow", back);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const element = previewRef.current;

    if (!element) {
      return;
    }

    const block = (event: Event) => event.preventDefault();

    element.addEventListener("selectstart", block);

    return () => {
      element.removeEventListener("selectstart", block);
    };
  }, []);

  // O status da moldura fica separado do erro genérico (que escolher a foto limpa).
  useEffect(() => {
    let active = true;
    const element = new Image();

    setFrameStatus(frameLoading(candidateId));
    element.onload = () => {
      if (active) {
        setFrame({ id: candidateId, image: element });
        setFrameStatus(frameLoaded(candidateId));
      }
    };
    element.onerror = () => {
      if (active) {
        setFrame(null);
        setFrameStatus(frameFailed(candidateId));
      }
    };
    element.src = previewFrameSrc(candidateId);

    return () => {
      active = false;
    };
  }, [candidateId, frameAttempt]);

  useEffect(() => {
    if (!file) {
      setImage(null);

      return;
    }

    let active = true;
    const url = URL.createObjectURL(file);
    const element = new Image();

    element.onload = () => {
      if (active) {
        setImage(element);
      }
    };
    element.onerror = () => {
      if (active) {
        setImage(null);
        setFile(null);
        setError("Não foi possível abrir essa foto. Escolha outra.");

        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    };
    element.src = url;

    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (canvasRef.current) {
      drawPreview(canvasRef.current, image, frame && frame.id === candidateId ? frame.image : null, framing, shortcutHidden || awayHidden);
    }
  }, [image, frame, framing, candidateId, shortcutHidden, awayHidden]);

  function rejectFile(message: string) {
    setFile(null);
    setImage(null);
    setError(message);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function pickFile(selected: File | null) {
    setError("");

    if (selected && !PHOTO_MIME_TYPES.includes(selected.type)) {
      rejectFile("Use uma foto JPEG, PNG ou WebP.");

      return;
    }

    if (selected && selected.size > PHOTO_MAX_BYTES) {
      rejectFile("A foto passa de 8 MB. Escolha outra.");

      return;
    }

    setFile(selected);
    setFraming({ zoom: 1, offsetX: 0, offsetY: 0 });
  }

  function endDrag() {
    dragRef.current = null;
  }

  function moveByKey(event: KeyboardEvent<HTMLCanvasElement>) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const step = steps[event.key];

    if (!step) {
      return;
    }

    event.preventDefault();
    setFraming((current) => ({ ...current, offsetX: clamp(current.offsetX + step[0]), offsetY: clamp(current.offsetY + step[1]) }));
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: framing.offsetX, offsetY: framing.offsetY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const width = event.currentTarget.getBoundingClientRect().width;

    setFraming((current) => dragFraming({ ...current, offsetX: drag.offsetX, offsetY: drag.offsetY }, { x: drag.x, y: drag.y }, { x: event.clientX, y: event.clientY }, width));
  }

  const frameReady = frame !== null && frame.id === candidateId && isFrameReady(frameStatus, candidateId);
  const frameFailedNow = candidateId !== "" && isFrameFailed(frameStatus, candidateId);
  const candidateName = CANDIDATES.find((candidate) => candidate.id === candidateId)?.name ?? "";

  async function submit() {
    if (!file || !canSubmit({ candidateId, hasFile: true, hasImage: image !== null, frameReady, busy })) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const order = await createOrder({ candidateId, framing, photo: file });

      router.push(`/pedido/${order.id}`);
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }

  const photoReady = image !== null;
  const ready = canSubmit({ candidateId, hasFile: file !== null, hasImage: photoReady, frameReady, busy });
  const zoomLabel = `${framing.zoom.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);

    const dropped = event.dataTransfer.files?.[0];

    if (dropped) {
      pickFile(dropped);
    }
  }

  function changeZoom(delta: number) {
    setFraming((current) => ({ ...current, zoom: Math.min(MAX_ZOOM, Math.max(1, Math.round((current.zoom + delta) * 100) / 100)) }));
  }

  const payHint = describePayHint({ candidateId, photoReady, ready, frame: frameStatus });

  return (
    <section className="editor">
      <div className="editor-preview">
        <div className="preview-card" ref={previewRef} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
          <p className="print-notice">A prévia não é impressa. Pague para baixar a foto final.</p>
          <canvas
            ref={canvasRef}
            className="preview"
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={moveByKey}
            role="img"
            tabIndex={0}
            aria-label={candidateName ? `Prévia da sua foto com a moldura de ${candidateName}` : "Prévia da sua foto com a moldura de exemplo; escolha uma moldura"}
          />
          <p className="preview-tip">{photoReady ? "Arraste a foto para posicionar, ou use as setas do teclado." : "Sua prévia aparece aqui assim que você escolher a foto."}</p>
        </div>
        <p className="preview-note">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M10 2l6 2.5v4.6c0 4-2.6 7-6 8.9-3.4-1.9-6-4.9-6-8.9V4.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M7.2 10l2 2 3.8-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          A prévia tem marca d&apos;água. A foto final, sem marca, só é liberada depois do pagamento.
        </p>
      </div>

      <ol className="editor-steps">
        <li className={`editor-step${photoReady ? " is-done" : ""}`}>
          <div className="editor-step-head">
            <span className="editor-step-number" aria-hidden="true">{photoReady ? "✓" : "1"}</span>
            <h2 className="editor-step-title">Sua foto</h2>
          </div>
          <input
            ref={inputRef}
            id="photo"
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onChange={(event) => {
              const chosen = event.target.files?.[0];

              if (chosen) {
                pickFile(chosen);
              }
            }}
          />
          <label
            htmlFor="photo"
            className={`dropzone${dragging ? " is-dragging" : ""}${photoReady ? " has-photo" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);

              if (dragDepth.current === 0) {
                setDragging(false);
              }
            }}
            onDrop={dropFile}
          >
            {photoReady && image ? (
              <>
                <img className="dropzone-thumb" src={image.src} alt="" draggable={false} />
                <span className="dropzone-text">
                  <b>{file?.name ?? "Foto escolhida"}</b>
                  <span>Clique ou toque para trocar a foto</span>
                </span>
              </>
            ) : (
              <>
                <span className="dropzone-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" focusable="false">
                    <rect x="5" y="9" width="30" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2.6" />
                    <circle cx="26" cy="17" r="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
                    <path d="M5 31l9-9 8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
                    <path d="M38 44V26M31.5 32l6.5-6.5 6.5 6.5" fill="none" stroke="#1459d9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="dropzone-text">
                  <b>Escolher foto</b>
                  <span className="dropzone-desktop">ou arraste a imagem para cá</span>
                  <small>JPG, PNG ou WebP, até 8 MB</small>
                </span>
              </>
            )}
          </label>
        </li>

        <li className={`editor-step${candidateId ? " is-done" : ""}`}>
          <div className="editor-step-head">
            <span className="editor-step-number" aria-hidden="true">{candidateId ? "✓" : "2"}</span>
            <h2 className="editor-step-title">
              <label htmlFor="candidate">Moldura</label>
            </h2>
          </div>
          <div className="frame-picker">
            <img className="frame-picker-thumb" src={candidateId ? `/frames/${candidateId}.webp` : "/frames/neutral.webp"} alt="" width={56} height={56} draggable={false} />
            <select id="candidate" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
              <option value="" disabled>
                Escolha uma moldura…
              </option>
              {OFFICE_OPTIONS.map((office) => {
                const group = sortCandidatesAlphabetically(candidatesBy(office.office));

                if (group.length === 0) {
                  return null;
                }

                return (
                  <optgroup key={office.office} label={office.label}>
                    {group.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} • {candidate.number}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="governor-row">
            <label htmlFor="governor-state">Estado (governador)</label>
            <select id="governor-state" disabled defaultValue="" aria-describedby="governor-soon">
              <option value="">Governadores: em breve</option>
            </select>
            <p id="governor-soon" className="hint">Por enquanto, só as molduras de presidente.</p>
          </div>
        </li>

        <li className="editor-step">
          <div className="editor-step-head">
            <span className="editor-step-number" aria-hidden="true">3</span>
            <h2 className="editor-step-title">
              <label htmlFor="zoom">Ajuste</label>
            </h2>
            <span className="editor-step-aside">Zoom {zoomLabel}</span>
          </div>
          <div className="zoom-row">
            <button type="button" className="icon-btn" onClick={() => changeZoom(-0.1)} disabled={!photoReady || framing.zoom <= 1} aria-label="Diminuir zoom">
              −
            </button>
            <input
              id="zoom"
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={framing.zoom}
              disabled={!photoReady}
              onChange={(event) => setFraming((current) => ({ ...current, zoom: Number(event.target.value) }))}
            />
            <button type="button" className="icon-btn" onClick={() => changeZoom(0.1)} disabled={!photoReady || framing.zoom >= MAX_ZOOM} aria-label="Aumentar zoom">
              +
            </button>
          </div>
          <button type="button" className="link-btn" onClick={() => setFraming({ zoom: 1, offsetX: 0, offsetY: 0 })} disabled={!photoReady}>
            Centralizar de novo
          </button>
        </li>

        <li className="editor-pay">
          <div className="pay-summary">
            <span>Foto pronta, sem marca d&apos;água</span>
            <b>{price}</b>
          </div>
          <button className="btn btn-lg pay-btn" disabled={!ready} onClick={submit}>
            {busy ? "Gerando Pix..." : `Baixar foto pronta • ${price}`}
          </button>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {frameFailedNow ? (
            <div className="frame-failed" role="alert">
              <span>{payHint}</span>
              <button type="button" className="btn alt retry-btn" onClick={() => setFrameAttempt((current) => current + 1)}>
                Tentar de novo
              </button>
            </div>
          ) : null}
          <p className="hint">
            {frameFailedNow ? "" : `${payHint} `}A prévia é grátis; a foto final é montada depois do Pix, sem marca d&apos;água.
          </p>
        </li>
      </ol>
    </section>
  );
}
