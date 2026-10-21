'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Diamond,
  Gamepad2,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Game, getErrorMessage, getGameImageUrl, getGames, Package, createOrder } from '@/app/lib/api';
import LoadingDialog from '@/app/components/LoadingDialog';

const formatPrice = (pkg: Package, currency: 'USD' | 'KHR') => (
  currency === 'USD'
    ? `$${Number(pkg.price_usd).toFixed(2)}`
    : `៛${Number(pkg.price_khr).toLocaleString()}`
);

export default function Storefront() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [playerId, setPlayerId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [loadingGames, setLoadingGames] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getGames()
      .then((items) => {
        if (!cancelled) {
          setGames(items);
          setSelectedGameId(items[0]?.id ?? null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingGames(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null;
  const selectedPackage = selectedGame?.packages.find((pkg) => pkg.id === selectedPackageId) ?? null;
  const packageGroups = selectedGame?.packages ?? [];
  const bannerIndex = games.length ? activeBannerIndex % games.length : 0;
  const bannerGame = games[bannerIndex] ?? null;
  const bannerImage = getGameImageUrl(bannerGame?.banner_url ?? null);
  const canCheckout = Boolean(
    selectedPackage
      && playerId.trim()
      && (!selectedGame?.has_zone_id || zoneId.trim())
      && !submitting,
  );

  useEffect(() => {
    if (games.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setActiveBannerIndex((index) => (index + 1) % games.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [games.length]);

  const chooseGame = (game: Game) => {
    setSelectedGameId(game.id);
    setSelectedPackageId(null);
    setZoneId('');
    setError('');
  };

  const handleCheckout = async () => {
    if (!canCheckout || !selectedPackage) return;
    setSubmitting(true);
    setError('');

    try {
      const order = await createOrder({
        package_id: selectedPackage.id,
        player_id: playerId.trim(),
        zone_id: zoneId.trim() || undefined,
        currency,
      });
      router.push(`/checkout/${order.order_number}`);
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <>
    <LoadingDialog
      open={loadingGames || submitting}
      title={submitting ? 'Creating your order' : 'Loading the store'}
      message={submitting ? 'Please wait while we prepare your secure Bakong checkout.' : 'Fetching the latest games and top-up packages.'}
    />
    <main className="storefront-v2">
      <header className="store-header">
        <div className="store-header-inner">
          <Link href="/" aria-label="Nexus home" className="store-brand"><span className="store-brand-mark"><Zap size={19} fill="currentColor" /></span><span><strong>NEXUS<span>.</span></strong><small>GAME TOP-UP</small></span></Link>
          <nav className="store-nav-links" aria-label="Main navigation"><a href="#games">Games</a><a href="#top-up">How to top up</a></nav>
          <div className="store-header-actions"><span className="store-secure-pill"><ShieldCheck size={15} /> Secure payments</span><Link href="/admin" className="store-admin-link">Admin <ArrowRight size={14} /></Link></div>
        </div>
      </header>

      <div className="store-main">
        <section aria-label="Featured game" className="store-hero">
          {bannerImage && <Image key={bannerGame?.id} src={bannerImage} alt={`${bannerGame?.name ?? 'Game'} featured artwork`} fill priority unoptimized sizes="(max-width: 1280px) 100vw, 1280px" className="store-hero-image" />}
          <div className="store-hero-shade" />
          <div className="store-hero-copy" aria-live="off"><p className="store-eyebrow"><Sparkles size={14} /> THE NEXT LEVEL STARTS HERE</p><h1>{bannerGame ? <>Top up <span>{bannerGame.name}</span><br />in a few taps.</> : <>Your game.<br /><span>Your next level.</span></>}</h1><p>Fast, secure game credits with simple Bakong KHQR checkout.</p><a href="#games" className="store-hero-cta">Explore games <ArrowRight size={17} /></a></div>
          <div className="store-hero-note"><span className="store-hero-note-icon"><PackageCheck size={19} /></span><span><strong>Quick and reliable</strong><small>Track your order after checkout</small></span></div>
          {games.length > 1 && <div className="store-hero-controls" aria-label="Featured games"><span>{String(bannerIndex + 1).padStart(2, '0')} <i>/ {String(games.length).padStart(2, '0')}</i></span><button type="button" aria-label="Previous featured game" onClick={() => setActiveBannerIndex((index) => (index - 1 + games.length) % games.length)}><ChevronLeft size={18} /></button><button type="button" aria-label="Next featured game" onClick={() => setActiveBannerIndex((index) => (index + 1) % games.length)}><ChevronRight size={18} /></button></div>}
        </section>

        <section className="store-benefits" aria-label="Store benefits"><div><span><Zap size={17} /></span><p><strong>Fast fulfillment</strong><small>Digital delivery, no shipping</small></p></div><div><span><LockKeyhole size={17} /></span><p><strong>Secure checkout</strong><small>Pay with Bakong KHQR</small></p></div><div><span><BadgeCheck size={17} /></span><p><strong>Order tracking</strong><small>Check progress anytime</small></p></div></section>

        <section id="games" className="store-section"><div className="store-section-heading"><div><span className="store-step-label">01 / PICK YOUR GAME</span><h2>Find your game</h2><p>Choose a title to see its available top-ups.</p></div><span className="store-count">{loadingGames ? 'Loading catalog' : `${games.length} ${games.length === 1 ? 'game' : 'games'} available`}</span></div>
          {loadingGames ? (
            <div className="store-game-grid">
              {[0, 1, 2].map((item) => <div key={item} className="store-game-skeleton" />)}
            </div>
          ) : games.length ? (
            <div className="store-game-grid">
              {games.map((game) => {
                const imageUrl = getGameImageUrl(game.icon_url || game.banner_url);
                const isSelected = selectedGameId === game.id;

                return (
                  <button
                    type="button"
                    key={game.id}
                    onClick={() => chooseGame(game)}
                    aria-pressed={isSelected}
                    className={`store-game-card ${isSelected ? 'is-selected' : ''}`}
                  >
                    <span className="store-game-art">
                      {imageUrl ? <Image src={imageUrl} alt={`${game.name} artwork`} fill unoptimized sizes="100px" className="object-cover" /> : <Gamepad2 size={31} />}
                      <span className="store-game-art-shade" />
                      <span className="store-game-category">{game.category}</span>
                    </span>
                    <span className="store-game-meta"><strong>{game.name}</strong><small>{game.publisher}</small></span>
                    <span className="store-game-action">
                      {isSelected ? <><Check size={15} /> Selected</> : <>View packages <ArrowRight size={14} /></>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="store-empty"><Gamepad2 size={28} /><strong>No games available yet</strong><span>Please check back soon.</span></div>
          )}
        </section>

        <section id="top-up" className="store-purchase-layout">
          <div className="store-package-panel"><div className="store-panel-heading"><div><span className="store-step-label">02 / CHOOSE A TOP-UP</span><h2>{selectedGame ? `${selectedGame.name} packages` : 'Available packages'}</h2></div><span className="store-package-count">{packageGroups.length} options</span></div>
            {!selectedGame ? <div className="store-empty store-empty-compact"><Gamepad2 size={24} /><strong>Choose a game first</strong><span>Your available packages will appear here.</span></div> : packageGroups.length ? <div className="store-package-grid">{packageGroups.map((pkg) => { const isSelected = selectedPackageId === pkg.id; const isDiamondPackage = /diamond/i.test(pkg.name); const isPassPackage = /weekly|week\s*pass|monthly|subscription|pass/i.test(pkg.name); const packageImage = getGameImageUrl(pkg.image_url); return <button type="button" key={pkg.id} onClick={() => { setSelectedPackageId(pkg.id); setError(''); }} aria-pressed={isSelected} className={`store-package-card ${isSelected ? 'is-selected' : ''}`}><span className="store-package-icon">{packageImage ? <Image src={packageImage} alt={`${pkg.name} artwork`} fill unoptimized sizes="46px" className="object-cover" /> : isPassPackage ? <CalendarDays size={20} /> : isDiamondPackage ? <Diamond size={20} /> : <PackageCheck size={20} />}</span>{pkg.badge && <span className="store-package-badge">{pkg.badge}</span>}<strong>{pkg.name}</strong><span className="store-package-price">{formatPrice(pkg, currency)}</span><span className="store-package-check">{isSelected && <Check size={13} />}</span></button>; })}</div> : <div className="store-empty store-empty-compact"><WalletCards size={24} /><strong>No packages yet</strong><span>There are no top-up options for this game right now.</span></div>}
            <div className="store-currency-row"><span><CreditCard size={16} /> Choose currency</span><div className="store-currency-switch" aria-label="Currency">{(['USD', 'KHR'] as const).map((item) => <button type="button" key={item} aria-pressed={currency === item} onClick={() => setCurrency(item)}>{item}</button>)}</div></div>
          </div>

          <aside className="store-order-panel" aria-label="Order details"><div className="store-order-heading"><span className="store-step-label">03 / PLAYER DETAILS</span><span className="store-order-lock"><LockKeyhole size={15} /></span></div><h2>Almost there</h2><p className="store-order-intro">Enter your player details to continue.</p>
            {selectedGame ? <div className="store-selected-game"><span className="store-selected-game-art">{getGameImageUrl(selectedGame.icon_url || selectedGame.banner_url) ? <Image src={getGameImageUrl(selectedGame.icon_url || selectedGame.banner_url) as string} alt="" fill unoptimized sizes="52px" className="object-cover" /> : <Gamepad2 size={21} />}</span><span><strong>{selectedGame.name}</strong><small>{selectedPackage?.name ?? 'Select a package'}</small></span></div> : <div className="store-selected-game store-selected-empty"><Gamepad2 size={20} /><span>Choose a game to start</span></div>}
            <div className="store-form-fields"><label htmlFor="player-id">Player ID <i>*</i><input id="player-id" autoComplete="off" maxLength={100} value={playerId} onChange={(event) => setPlayerId(event.target.value)} placeholder="Enter your Player ID" disabled={!selectedGame} /><small>Enter the ID connected to your game account.</small></label>{selectedGame?.has_zone_id && <label htmlFor="zone-id">Zone / Server ID <i>*</i><input id="zone-id" autoComplete="off" maxLength={100} value={zoneId} onChange={(event) => setZoneId(event.target.value)} placeholder="Enter your Zone ID" /></label>}</div>
            <div className="store-order-total"><div><span>Payment method</span><strong><span className="store-khqr-mark">K</span> Bakong KHQR</strong></div><div className="store-total-line"><span>Total <small>{currency}</small></span><strong>{selectedPackage ? formatPrice(selectedPackage, currency) : '—'}</strong></div></div>
            {error && <p role="alert" className="store-error">{error}</p>}<button type="button" disabled={!canCheckout} onClick={handleCheckout} className="store-submit-button">{submitting ? 'Creating your order…' : 'Continue to payment'} {!submitting && <ArrowRight size={17} />}</button><p className="store-payment-note"><ShieldCheck size={14} /> Your payment details are protected.</p>
          </aside>
        </section>

        <section id="how-it-works" className="store-how-it-works"><div><span className="store-step-label">SIMPLE AND SECURE</span><h2>Top up in three steps</h2></div><div className="store-how-grid"><article><span>01</span><strong>Choose your game</strong><p>Browse the catalog and select a title.</p></article><article><span>02</span><strong>Enter player details</strong><p>Pick a package and confirm your account ID.</p></article><article><span>03</span><strong>Pay with Bakong</strong><p>Scan the KHQR and follow your order status.</p></article></div></section>
      </div>

      <footer className="store-footer"><Link href="/" className="store-brand"><span className="store-brand-mark"><Zap size={17} fill="currentColor" /></span><span><strong>NEXUS<span>.</span></strong><small>GAME TOP-UP</small></span></Link><p>Secure game top-ups powered by Bakong KHQR.</p><span>© 2026 Nexus Topup</span></footer>
    </main>
    </>
  );
}
