'use client';

import { useEffect, useState } from 'react';

interface LoadingDialogProps {
  open: boolean;
  title?: string;
  message?: string;
}

export default function LoadingDialog({
  open,
  title = 'Please wait',
  message = 'We are processing your request securely.',
}: LoadingDialogProps) {
  const [takingLong, setTakingLong] = useState(false);

  useEffect(() => {
    if (!open) {
      setTakingLong(false);
      return;
    }

    const timer = window.setTimeout(() => setTakingLong(true), 7000);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-live="polite"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby="loading-dialog-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border border-cyan-200/15 bg-[#101827] p-7 text-center shadow-2xl shadow-black/50"
      >
        <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-cyan-200/15 border-t-cyan-200">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200/20 border-t-cyan-200" />
        </span>
        <h2 id="loading-dialog-title" className="mt-5 text-lg font-bold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
        {takingLong && <p className="mt-3 text-xs leading-5 text-amber-200/80">This is taking longer than usual. The request will time out and show an error if the server does not respond.</p>}
      </section>
    </div>
  );
}
