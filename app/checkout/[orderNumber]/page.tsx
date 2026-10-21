'use client';

import { Suspense, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, ShieldCheck } from 'lucide-react';
import {
  checkOrderStatus,
  getErrorMessage,
  OrderStatus,
} from '@/app/lib/api';
import LoadingDialog from '@/app/components/LoadingDialog';

export default function CheckoutPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutContent params={params} />
    </Suspense>
  );
}

function CheckoutLoading() {
  return (
    <main className="checkout-v2 checkout-loading">
      <LoadingDialog open title="Opening checkout" message="Preparing your secure payment page." />
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-300">
        <Loader2 size={20} className="animate-spin text-cyan-300" />
        Loading your checkout…
      </div>
    </main>
  );
}

function CheckoutContent({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const refreshOrder = useCallback(async () => {
    try {
      const currentOrder = await checkOrderStatus(orderNumber);
      setOrder(currentOrder);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }, [orderNumber]);

  useEffect(() => {
    let cancelled = false;

    checkOrderStatus(orderNumber)
      .then((currentOrder) => {
        if (!cancelled) {
          setOrder(currentOrder);
          setError('');
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(getErrorMessage(requestError));
      });

    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  useEffect(() => {
    if (order?.payment_status !== 'pending' && order?.delivery_status !== 'processing') return;
    const interval = window.setInterval(() => void refreshOrder(), 30000);
    return () => window.clearInterval(interval);
  }, [order?.payment_status, order?.delivery_status, refreshOrder]);

  const paid = order?.payment_status === 'paid';
  const failed = order?.payment_status === 'failed';

  return (
    <main className="checkout-v2">
      <LoadingDialog open={(!order && !error) || retrying} title={retrying ? 'Checking your order' : 'Loading checkout'} message={retrying ? 'Fetching the latest secure payment status.' : 'Retrieving your Bakong payment details.'} />
      <header className="checkout-v2-header"><Link href="/" className="checkout-v2-brand">NEXUS<span>.</span></Link><Link href="/"><ArrowLeft size={15} /> Back to store</Link></header>
      <div className="checkout-v2-wrap">
        <div className="checkout-v2-title"><span>SECURE ORDER CHECKOUT</span><h1>Complete your payment</h1><p>Scan your KHQR with a Bakong enabled banking app.</p></div>
        <section className="checkout-v2-card">
          <div className="checkout-v2-summary">
            <div className="checkout-v2-order-heading"><span className="checkout-v2-shield"><ShieldCheck size={20} /></span><div><p>Payment method</p><strong>Bakong KHQR</strong></div></div>

        {!order && !error && (
          <div className="flex flex-col items-center py-14 text-slate-400">
            <Loader2 size={26} className="mb-3 animate-spin text-cyan-300" />
            Loading your order…
          </div>
        )}

        {error && !order && (
          <div className="space-y-4">
            <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] p-4 text-sm leading-6 text-rose-200">
              {error}
            </div>
            <button
              type="button"
              onClick={async () => {
                setRetrying(true);
                try {
                  await refreshOrder();
                } finally {
                  setRetrying(false);
                }
              }}
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.05]"
            >
              Try again
            </button>
          </div>
        )}

        {order && (
          <>
            <div className="mb-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{order.game_name}</p>
                  <p className="mt-1 font-bold text-white">{order.package_name}</p>
                  <p className="mt-1 text-xs text-slate-400">Player ID {order.player_id}{order.zone_id ? `· Zone ${order.zone_id}` : ''}</p>
                </div>
                <p className="shrink-0 text-right text-lg font-black text-cyan-200">
                  {order.currency === 'USD' ? `$${Number(order.amount).toFixed(2)}` : `៛${Number(order.amount).toLocaleString()}`}
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">{order.currency}</span>
                </p>
              </div>
            </div>

            {paid ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={68} className="mx-auto text-emerald-300" />
                <h2 className="mt-5 text-2xl font-black text-white">Payment received</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
                  {order.delivery_status === 'completed'
                    ? 'Your top-up has been delivered.'
                    : order.delivery_status === 'failed'
                      ? 'Payment was received, but delivery needs support. Please contact the store with your order number.'
                      : 'Your payment was received. Your top-up is being processed.'}
                </p>
                {order.delivery_status === 'processing' && (
                  <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200">
                    <Loader2 size={15} className="animate-spin" /> Processing delivery
                  </p>
                )}
              </div>
            ) : failed ? (
              <div className="py-8 text-center">
                <CircleAlert size={60} className="mx-auto text-rose-300" />
                <h2 className="mt-5 text-2xl font-black text-white">Payment not completed</h2>
                <p className="mt-2 text-sm text-slate-400">This payment was marked as failed. Please create a new order if you still want to top up.</p>
              </div>
            ) : order.khqr_string ? (
              <div className="space-y-5 py-3 text-center">
                <div className="inline-block rounded-2xl bg-white p-4">
                  <QRCodeSVG value={order.khqr_string} size={220} level="M" />
                </div>
                <div>
                  <p className="font-bold text-white">Scan to pay with Bakong</p>
                  <p className="mt-1 text-sm text-slate-400">Bakong verifies payment automatically. This page checks for updates every 30 seconds.</p>
                </div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200">
                  <Loader2 size={15} className="animate-spin" /> Waiting for payment
                </p>
                {order.verification_message && (
                  <p role="status" className="mx-auto max-w-sm rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100">
                    {order.verification_message}
                  </p>
                )}
              </div>
            ) : (
              <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] p-4 text-sm leading-6 text-rose-200">
                A payment QR was not provided. No payment was taken. Contact the store before retrying this order.
              </div>
            )}

            {error && order && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs leading-5 text-rose-200">{error}</p>
            )}

            <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4 text-xs">
              <span className="text-slate-500">Order <span className="font-bold text-slate-300">{order.order_number}</span></span>
              <span className={`font-bold uppercase tracking-wider ${paid ? 'text-emerald-300' : failed ? 'text-rose-300' : 'text-cyan-200'}`}>
                {order.payment_status}
              </span>
            </div>
          </>
        )}
          </div>
        </section>
        <p className="checkout-v2-footnote"><ShieldCheck size={14} /> Your payment is verified securely by Bakong.</p>
      </div>
    </main>
  );
}
