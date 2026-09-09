"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export default function BarcodeScannerModal({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access isn't available. Make sure you're on HTTPS (or localhost) and using a supported browser."
      );
      return;
    }

    setError(null);
    detectedRef.current = false;

    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    let cancelled = false;

    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current!,
        (result) => {
          if (result && !detectedRef.current) {
            detectedRef.current = true;
            controlsRef.current?.stop();
            onDetectedRef.current(result.getText());
          }
        }
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't access the camera. Check permissions and try again.");
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-4 text-white">
        <h2 className="text-sm font-medium">Scan Barcode</h2>
        <button
          onClick={onClose}
          className="p-2 -m-2 rounded-full hover:bg-white/10 transition"
          aria-label="Close scanner"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {/* Camera feed */}
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <p className="text-sm text-white/70 text-center max-w-xs">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Viewfinder overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-44 max-w-[80vw]">
                {[
                  "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                  "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                ].map((cls) => (
                  <span key={cls} className={`absolute w-8 h-8 border-[#ee8000] ${cls}`} />
                ))}
              </div>
            </div>

            <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
              <p className="text-xs text-white/70 bg-black/40 px-3 py-1.5 rounded-full">
                Point the camera at a barcode
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
