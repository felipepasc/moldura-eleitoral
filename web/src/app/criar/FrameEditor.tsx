"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CANDIDATES, FRAME_SIZE, MAX_ZOOM, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, PRICE_CENTS } from "@moldura/common";
import type { Framing } from "@moldura/common";
import { createOrder, messageOf } from "@/lib/api";
import { drawPreview } from "@/lib/preview";

const KEY_STEP = 0.02;
const FRAME_ERROR = "Não foi possível carregar a moldura.";
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

  useEffect(() => {
    let active = true;
    const element = new Image();

    element.onload = () => {
      if (active) {
        setFrame({ id: candidateId, image: element });
        setError((current) => (current === FRAME_ERROR ? "" : current));
      }
    };
    element.onerror = () => {
      if (active) {
        setFrame(null);
        setError(FRAME_ERROR);
      }
    };
    element.src = `/frames/${candidateId}.png`;

    return () => {
      active = false;
    };
  }, [candidateId]);

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
      drawPreview(canvasRef.current, image, frame && frame.id === candidateId ? frame.image : null, framing);
    }
  }, [image, frame, framing, candidateId]);

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

    setFraming((current) => ({
      ...current,
      offsetX: clamp(drag.offsetX + (event.clientX - drag.x) / width),
      offsetY: clamp(drag.offsetY + (event.clientY - drag.y) / width),
    }));
  }

  const frameReady = frame !== null && frame.id === candidateId;
  const candidateName = CANDIDATES.find((candidate) => candidate.id === candidateId)?.name ?? "";

  async function submit() {
    if (!file || !frameReady) {
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

  return (
    <section className="panel">
      <canvas
        ref={canvasRef}
        className="preview"
        width={FRAME_SIZE}
        height={FRAME_SIZE}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={moveByKey}
        role="img"
        tabIndex={0}
        aria-label={`Prévia da sua foto com a moldura de ${candidateName}`}
      />

      <div>
        <label htmlFor="photo">1. Sua foto</label>
        <input ref={inputRef} id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />

        <label htmlFor="candidate">2. Moldura</label>
        <select id="candidate" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
          {CANDIDATES.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} • {candidate.number}
            </option>
          ))}
        </select>

        <label htmlFor="zoom">3. Ajuste (arraste a foto e use o zoom)</label>
        <input
          id="zoom"
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={framing.zoom}
          onChange={(event) => setFraming((current) => ({ ...current, zoom: Number(event.target.value) }))}
        />

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn" disabled={!file || !image || !frameReady || busy} onClick={submit}>
            {busy ? "Gerando Pix..." : `Baixar foto pronta • ${price}`}
          </button>
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}
        <p className="hint">A prévia tem marca d&apos;água. Depois do pagamento do Pix, você baixa a foto sem ela.</p>
      </div>
    </section>
  );
}
