"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

interface SignatureCanvasProps {
  onAccept: (dataUrl: string) => void;
  onClose: () => void;
}

export function SignatureCanvas({ onAccept, onClose }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Reference line
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#D6D3D1";
    ctx.lineWidth = 1;
    const lineY = rect.height * 0.72;
    ctx.beginPath();
    ctx.moveTo(24, lineY);
    ctx.lineTo(rect.width - 24, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  const getPos = (touch: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e.touches[0]);
    lastPos.current = pos;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pos = getPos(e.touches[0]);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1C2340";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;

    if (!hasDrawn) setHasDrawn(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = false;
  };

  // Mouse events as desktop fallback
  const handleMouseDown = (e: React.MouseEvent) => {
    isDrawing.current = true;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    lastPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1C2340";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    if (!hasDrawn) setHasDrawn(true);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const handleClear = () => {
    setHasDrawn(false);
    setupCanvas();
  };

  const handleAccept = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onAccept(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg animate-sheet-up rounded-t-3xl bg-card safe-bottom">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100"
            aria-label="Cerrar"
          >
            <X size={18} className="text-stone-500" />
          </button>
          <span className="text-sm font-medium text-stone-700">
            Firma aquí
          </span>
          <div className="w-9" />
        </div>

        {/* Canvas */}
        <div className="mx-5 mb-4">
          <canvas
            ref={canvasRef}
            className="h-[200px] w-full rounded-xl border border-stone-200 bg-stone-50"
            style={{ touchAction: "none" }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={handleClear}
            className="flex-1 rounded-2xl border border-stone-200 py-3.5 text-sm font-medium text-stone-600 active:bg-stone-50"
          >
            Aclarar
          </button>
          <button
            onClick={handleAccept}
            disabled={!hasDrawn}
            className="flex-1 rounded-2xl bg-[#1C2340] py-3.5 text-sm font-medium text-white disabled:opacity-40 active:opacity-90"
          >
            Aceptar firma
          </button>
        </div>
      </div>
    </div>
  );
}
