"use client";

import { useEffect } from "react";

export function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 rounded-[10px] border border-line bg-sheet px-4 py-3 text-sm leading-6 text-ink shadow-sheet md:bottom-6 md:left-auto md:w-80 md:right-6"
    >
      {message}
    </div>
  );
}
