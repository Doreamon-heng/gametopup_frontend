'use client';

import { Suspense, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, ShieldCheck } from 'lucide-react';
import {
  cancelOrder,
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
  const [canceling, setCanceling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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
    const pending = order?.payment_status === 'pending';
    const reconcilingRecentCancel = order?.payment_status === 'cancelled'
      && Date.now() < new Date(order.created_at).getTime() + 30 * 60 * 1000;
    if (!pending && !reconcilingRecentCancel && order?.delivery_status !== 'processing') return;
    const interval = window.setInterval(() => void refreshOrder(), 30000);
    const stopReconciliation = reconcilingRecentCancel
      ? window.setTimeout(() => window.clearInterval(interval), Math.max(0, new Date(order.created_at).getTime() + 30 * 60 * 1000 - Date.now()))
      : undefined;
    return () => {
      window.clearInterval(interval);
      if (stopReconciliation) window.clearTimeout(stopReconciliation);
    };
  }, [order?.payment_status, order?.delivery_status, order?.created_at, refreshOrder]);

  const handleCancel = async () => {
    setCanceling(true);
    setError('');
    try {
      await cancelOrder(orderNumber);
      setOrder((currentOrder) => currentOrder
        ? { ...currentOrder, payment_status: 'cancelled', verification_message: null }
        : currentOrder);
      await refreshOrder();
    } catch (requestError) {
      await refreshOrder();
      setError(getErrorMessage(requestError));
    } finally {
      setCanceling(false);
    }
  };

  const paid = order?.payment_status === 'paid';
  const failed = order?.payment_status === 'failed';
  const cancelled = order?.payment_status === 'cancelled';

  return (
    <main className="checkout-v2">
      {showCancelDialog && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="presentation" onClick={() => setShowCancelDialog(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" aria-describedby="cancel-order-description" className="w-full max-w-sm rounded-2xl border border-amber-300/20 bg-[#101827] p-6 shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
            <CircleAlert size={34} className="text-amber-300" />
            <h2 id="cancel-order-title" className="mt-4 text-lg font-black text-white">Cancel this payment?</h2>
            <p id="cancel-order-description" className="mt-2 text-sm leading-6 text-slate-300">Only continue if you have not paid. The QR may remain payable until it expires in 15 minutes. If Bakong confirms payment, we will still process your order.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" autoFocus onClick={() => setShowCancelDialog(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.06]">Keep payment</button>
              <button type="button" onClick={() => { setShowCancelDialog(false); void handleCancel(); }} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-400">Cancel order</button>
            </div>
          </section>
        </div>
      )}
      <LoadingDialog open={(!order && !error) || retrying || canceling} title={canceling ? 'Cancelling your order' : retrying ? 'Checking your order' : 'Loading checkout'} message={canceling ? 'Checking Bakong and updating your order.' : retrying ? 'Fetching the latest secure payment status.' : 'Retrieving your Bakong payment details.'} />
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
            ) : cancelled ? (
              <div className="py-8 text-center">
                <CircleAlert size={60} className="mx-auto text-amber-300" />
                <h2 className="mt-5 text-2xl font-black text-white">Order cancelled</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">If you completed payment before cancelling, we are still checking with Bakong and will process the order if payment is confirmed.</p>
                <Link href="/" className="mt-5 inline-flex rounded-xl bg-lime-400 px-5 py-3 text-sm font-bold text-slate-950">Back to store</Link>
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
                <div className="mx-auto max-w-sm space-y-3 pt-2">
                  <p className="text-xs leading-5 text-amber-100/80">Only cancel if you have not paid. The QR may stay payable until its 15-minute expiry; any confirmed payment will still be processed.</p>
                  <button type="button" disabled={canceling} onClick={() => setShowCancelDialog(true)} className="rounded-xl border border-rose-300/20 px-4 py-2.5 text-sm font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-50">Cancel this order</button>
                </div>
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
              <span className={`font-bold uppercase tracking-wider ${paid ? 'text-emerald-300' : failed ? 'text-rose-300' : cancelled ? 'text-amber-300' : 'text-cyan-200'}`}>
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
