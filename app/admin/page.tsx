'use client';



import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import Image from 'next/image';

import {

  Activity,

  BadgeCheck,

  Boxes,

  CircleDollarSign,

  ClipboardList,

  Gamepad2,

  ImagePlus,

  KeyRound,

  LoaderCircle,

  LogOut,

  Pencil,

  PackageCheck,

  RefreshCw,

  Search,

  Settings2,

  ShieldCheck,

  TriangleAlert,

  Trash2,

  Wallet,

} from 'lucide-react';

import { motion } from 'framer-motion';

import { getErrorMessage, getGameImageUrl } from '@/app/lib/api';
import LoadingDialog from '@/app/components/LoadingDialog';

const PACKAGE_TYPES = {
  diamonds: { label: 'Diamonds', suffix: 'Diamonds', pattern: /diamond/i },
  weekly_pass: { label: 'Weekly Pass', suffix: 'Weekly Pass', pattern: /weekly|week\s*pass/i },
  elite_pass: { label: 'Elite Pass', suffix: 'Elite Pass', pattern: /elite\s*pass/i },
  monthly_pass: { label: 'Monthly Pass', suffix: 'Monthly Pass', pattern: /monthly|month\s*pass/i },
} as const;

type PackageType = keyof typeof PACKAGE_TYPES;

function packageNameWithType(name: string, type: string) {
  const normalizedName = name.trim();
  const packageType = PACKAGE_TYPES[type as PackageType] ?? PACKAGE_TYPES.diamonds;
  if (packageType.pattern.test(normalizedName)) return normalizedName.slice(0, 120);
  return `${normalizedName.slice(0, 119 - packageType.suffix.length)} ${packageType.suffix}`;
}



const API_BASE = '/api/admin';
const TOKEN_KEY = 'nexus.admin.token';



interface AdminOrder {

  id: number;

  order_number: string;

  player_id: string;

  amount_usd: string;

  amount_khr: number;

  currency: 'USD' | 'KHR';

  payment_status: 'pending' | 'paid' | 'failed' | 'cancelled';

  delivery_status: 'pending' | 'processing' | 'completed' | 'failed';

  created_at: string;

  package: { name: string; game: { name: string } | null } | null;

}



interface PackageRecord {

  id: number;

  game_id: number;

  name: string;

  price_usd: string;

  price_khr: number;

  supplier_sku: string;

  supplier_cost_usd: string | null;

  supplier_cost_khr: number | null;

  markup_percent: string | null;

  is_active: boolean;

  game: { id: number; name: string };

}



interface GameRecord {

  id: number;

  name: string;

  slug: string;

  publisher: string;

  category: string;

  banner_url: string | null;

  icon_url: string | null;

  has_zone_id: boolean;

  is_active: boolean;

  packages_count: number;

}



interface GatewaySettings {

  bakong_mode: 'live';

  bakong_account_id: string | null;

  bakong_merchant_name: string | null;

  bakong_merchant_city: string | null;

  bakong_configuration_complete: boolean;

  bakong_api_token_configured: boolean;

  bakong_webhook_secret_configured: boolean;

  supplier_mode: 'demo' | 'live';

  supplier_url: string | null;

  supplier_api_token_configured: boolean;

}



interface DashboardSummary {

  sales_usd: number;

  sales_khr: number;

  total_orders: number;

  success_rate: number;

  supplier_status: 'demo' | 'configured' | 'not_configured';

  payment_mode: string;

  recent_orders: AdminOrder[];

}



interface PageResult<T> {

  data: T[];

  current_page: number;

  last_page: number;

  total: number;

}



interface AdminSecretFields {

  bakong_api_token: string;

  bakong_webhook_secret: string;

  supplier_api_token: string;

}

function getGamesFromResponse(payload: unknown): GameRecord[] | null {
  if (Array.isArray(payload)) return payload as GameRecord[];
  if (!payload || typeof payload !== 'object') return null;

  const response = payload as { data?: unknown; games?: unknown };
  if (Array.isArray(response.data)) return response.data as GameRecord[];
  if (Array.isArray(response.games)) return response.games as GameRecord[];

  if (response.data && typeof response.data === 'object') {
    const nestedData = (response.data as { data?: unknown }).data;
    if (Array.isArray(nestedData)) return nestedData as GameRecord[];
  }

  return null;
}

type RequestOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

async function captureRequest<T>(request: Promise<T>): Promise<RequestOutcome<T>> {
  try {
    return { ok: true, value: await request };
  } catch (error) {
    return { ok: false, error };
  }
}



async function adminRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const requestTimeoutMs = 20000;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}`;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(requestTimeoutMs) });
  } catch (requestError) {
    if (requestError instanceof DOMException && requestError.name === 'TimeoutError') {
      throw new Error('The dashboard request took too long (20 seconds). The server may be waking up; please try again.');
    }
    throw new Error(`Could not reach the dashboard API proxy at ${url}. Check that the frontend server is running.`);
  }

  const responseText = await response.text();
  let body: any = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      throw new Error(`Laravel returned a non-JSON response (HTTP ${response.status}). Check the Render logs.`);
    }
  }

  if (!response.ok) {
    throw new Error(`[${response.status}] ${body?.message || body?.error || response.statusText || 'The API request failed.'}`);
  }
  return body as T;
}



const currency = (amount: number | string, unit: 'USD' | 'KHR') => (

  unit === 'USD'

    ? `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    : `៛${Number(amount).toLocaleString('en-US')}`

);



const statusClass = (status: string) => {

  if (status === 'paid' || status === 'completed' || status === 'configured') return 'status-good';

  if (status === 'failed' || status === 'not_configured') return 'status-bad';

  if (status === 'processing') return 'status-info';

  return 'status-wait';

};



function StatCard({

  label,

  value,

  note,

  icon: Icon,

  accent,

}: {

  label: string;

  value: string;

  note: string;

  icon: typeof Wallet;

  accent: string;

}) {

  return (

    <article className="admin-stat-card">

      <div className="flex items-start justify-between">

        <p className="admin-label">{label}</p>

        <span className={`admin-stat-icon ${accent}`}><Icon size={19} /></span>

      </div>

      <p className="mt-5 text-[1.75rem] font-black tracking-tight text-white">{value}</p>

      <p className="mt-2 text-xs text-slate-500">{note}</p>

    </article>

  );

}



export default function AdminPage() {

  const [token, setToken] = useState('');

  const [ready, setReady] = useState(false);

  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');

  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const [orders, setOrders] = useState<PageResult<AdminOrder> | null>(null);

  const [games, setGames] = useState<GameRecord[]>([]);

  const [packages, setPackages] = useState<PackageRecord[]>([]);

  const [gateway, setGateway] = useState<GatewaySettings | null>(null);

  const [secretInputs, setSecretInputs] = useState<AdminSecretFields>({

    bakong_api_token: '',

    bakong_webhook_secret: '',

    supplier_api_token: '',

  });

  const [query, setQuery] = useState('');

  const [paymentFilter, setPaymentFilter] = useState('');

  const [deliveryFilter, setDeliveryFilter] = useState('');

  const [orderPageNumber, setOrderPageNumber] = useState(1);

  const [section, setSection] = useState<'overview' | 'games' | 'orders' | 'packages' | 'gateway'>('overview');

  const [gameImage, setGameImage] = useState<File | null>(null);

  const [editingGameId, setEditingGameId] = useState<number | null>(null);

  const [addingPackageGameId, setAddingPackageGameId] = useState<number | null>(null);

  const [notice, setNotice] = useState('');

  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);
  const [busyDialog, setBusyDialog] = useState({ title: 'Working', message: 'Please wait while the dashboard finishes this action.' });
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const gameImagePreview = useMemo(

    () => gameImage ? URL.createObjectURL(gameImage) : '',

    [gameImage],

  );

  const gameRecords = Array.isArray(games) ? games : [];



  useEffect(() => () => {

    if (gameImagePreview) URL.revokeObjectURL(gameImagePreview);

  }, [gameImagePreview]);



  useEffect(() => {

    const timer = window.setTimeout(() => {

      try {

        setToken(window.sessionStorage.getItem(TOKEN_KEY) ?? '');

      } catch {

        setError('Browser session storage is unavailable. Enable it and reload the admin page.');

      } finally {

        setReady(true);

      }

    }, 0);



    return () => window.clearTimeout(timer);

  }, []);



  const loadDashboard = useCallback(async () => {

    if (!token) return;

    setDashboardLoading(true);
    try {
    setError('');

    const [overview, gameList, orderResult, packageList, gatewaySettings] = await Promise.all([
      captureRequest(adminRequest<{ data: DashboardSummary }>(token, '/dashboard')),
      captureRequest(adminRequest<unknown>(token, '/games')),
      captureRequest(adminRequest<PageResult<AdminOrder>>(token, `/orders?q=${encodeURIComponent(query)}&payment_status=${paymentFilter}&delivery_status=${deliveryFilter}&page=${orderPageNumber}`)),
      captureRequest(adminRequest<{ data: PackageRecord[] }>(token, '/packages')),
      captureRequest(adminRequest<{ data: GatewaySettings }>(token, '/gateway-settings')),
    ]);

    const errors: string[] = [];
    if (overview.ok) setSummary(overview.value.data);
    else errors.push(getErrorMessage(overview.error));

    if (gameList.ok) {
      const gameData = getGamesFromResponse(gameList.value);
      if (gameData) {
        setGames(gameData);
      } else {
        const response = gameList.value;
        const responseKeys = response && typeof response === 'object'
          ? Object.keys(response).join(', ') || '(none)'
          : typeof response;
        const responseMessage = response && typeof response === 'object'
          ? (response as { message?: unknown }).message
          : undefined;
        const detail = typeof responseMessage === 'string' ? ` API message: ${responseMessage}` : '';
        errors.push(`The admin games API returned an unexpected response (keys: ${responseKeys}). Expected an array of games.${detail}`);
      }
    } else {
      errors.push(getErrorMessage(gameList.error));
    }

    if (orderResult.ok) setOrders(orderResult.value);
    else errors.push(getErrorMessage(orderResult.error));

    if (packageList.ok) setPackages(packageList.value.data);
    else errors.push(getErrorMessage(packageList.error));

    if (gatewaySettings.ok) setGateway(gatewaySettings.value.data);
    else errors.push(getErrorMessage(gatewaySettings.error));

    if (errors.length) {
      setError(errors.join(' '));
      const sessionExpired = errors.some((message) =>
        message.startsWith('[401]')
        || message.startsWith('[419]')
        || message.startsWith('[403]')
        || message.toLowerCase().includes('unauthenticated')
        || message.toLowerCase().includes('token has expired'),
      );

      if (sessionExpired) {
        try {
          window.sessionStorage.removeItem(TOKEN_KEY);
        } catch {
          // Storage may be disabled.
        }
        setToken('');
        setSummary(null);
        setOrders(null);
        setGateway(null);
        setError('Your admin session has expired. Sign in again.');
      }
    }
    } finally {
      setDashboardLoading(false);
    }

  }, [deliveryFilter, orderPageNumber, paymentFilter, query, token]);



  useEffect(() => {

    if (!token) return;

    const timer = window.setTimeout(() => void loadDashboard(), 0);

    return () => window.clearTimeout(timer);

  }, [loadDashboard, token]);



  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyDialog({ title: 'Signing in', message: 'Checking your administrator credentials securely.' });
    setBusy(true);
    setError('');
    setNotice('');
    const url = `${API_BASE}/login`;

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        });
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'TimeoutError') {
          throw new Error('Sign in took too long (20 seconds). The server may be waking up; please try again.');
        }
        throw new Error(`Could not reach the dashboard API proxy at ${url}. Check that the frontend server is running.`);
      }

      const responseText = await response.text();
      let body: any = {};
      if (responseText) {
        try {
          body = JSON.parse(responseText);
        } catch {
          throw new Error(`The server returned a non-JSON response (HTTP ${response.status}). Check your Laravel Render logs.`);
        }
      }
      if (!response.ok) throw new Error(`[${response.status}] ${body?.message || 'Unable to sign in.'}`);
      if (!body?.token) throw new Error('Login succeeded but Laravel did not return an API token. Check the login controller response.');

      window.sessionStorage.setItem(TOKEN_KEY, body.token);
      setPassword('');
      setToken(body.token);
      setNotice(`Signed in as ${body?.user?.name ?? email}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };



  const logout = async () => {

    setBusyDialog({ title: 'Signing out', message: 'Closing your secure admin session.' });
    setBusy(true);
    try {
      try {
        await adminRequest(token, '/logout', { method: 'POST' });
      } catch {
        // The local session is cleared even if the API is unavailable.
      }

      try {
        window.sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // Keep the current view responsive if browser storage is unavailable.
      }

      setToken('');
      setSummary(null);
    } finally {
      setBusy(false);
    }

  };



  const visibleOrders = useMemo(() => orders?.data ?? [], [orders]);



  const savePackage = async (pkg: PackageRecord) => {

    setBusyDialog({ title: 'Updating package', message: `Saving ${pkg.name} and refreshing the dashboard.` });
    setBusy(true);

    setError('');

    try {

      await adminRequest(token, `/packages/${pkg.id}`, {

        method: 'PATCH',

        body: JSON.stringify({

          price_usd: Number(pkg.price_usd),

          price_khr: Number(pkg.price_khr),

          supplier_sku: pkg.supplier_sku,

          supplier_cost_usd: pkg.supplier_cost_usd === '' ? null : Number(pkg.supplier_cost_usd),

          supplier_cost_khr: pkg.supplier_cost_khr === null ? null : Number(pkg.supplier_cost_khr),

          markup_percent: pkg.markup_percent === null ? null : Number(pkg.markup_percent),

          is_active: pkg.is_active,

        }),

      });

      setNotice(`${pkg.name} saved.`);

      await loadDashboard();

    } catch (requestError) {

      setError(getErrorMessage(requestError));

    } finally {

      setBusy(false);

    }

  };



  const createGame = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault();

    const form = event.currentTarget;

    setBusyDialog({ title: 'Creating game', message: 'Adding the game and its first package.' });
    setBusy(true);

    setError('');

    try {

      const formData = new FormData(form);
      formData.set('package_name', packageNameWithType(
        String(formData.get('package_name') ?? ''),
        String(formData.get('package_type') ?? 'diamonds'),
      ));
      formData.delete('package_type');

      const result = await adminRequest<{ data: { name: string; slug: string } }>(token, '/games', {

        method: 'POST',

        body: formData,

      });

      form.reset();

      setGameImage(null);

      setNotice(`${result.data.name} and its first package were added to the storefront.`);

      await loadDashboard();

    } catch (requestError) {

      setError(getErrorMessage(requestError));

    } finally {

      setBusy(false);

    }

  };



  const updateGame = async (event: FormEvent<HTMLFormElement>, game: GameRecord) => {

    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    formData.set('has_zone_id', formData.has('has_zone_id') ? '1' : '0');
    formData.set('is_active', formData.has('is_active') ? '1' : '0');

    setBusyDialog({ title: 'Updating game', message: `Saving changes to ${game.name}.` });
    setBusy(true);
    setError('');

    try {
      await adminRequest(token, `/games/${game.id}`, { method: 'POST', body: formData });
      setEditingGameId(null);
      setNotice(`${game.name} was updated.`);
      await loadDashboard();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };



  const deleteGame = async (game: GameRecord) => {

    if (!window.confirm(`Delete ${game.name} and its packages? Games with order history cannot be deleted.`)) return;

    setBusyDialog({ title: 'Deleting game', message: `Removing ${game.name} and its packages. Please wait.` });
    setBusy(true);
    setError('');

    try {
      await adminRequest(token, `/games/${game.id}`, { method: 'DELETE' });
      setNotice(`${game.name} was deleted.`);
      await loadDashboard();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };



  const createPackage = async (event: FormEvent<HTMLFormElement>, game: GameRecord) => {

    event.preventDefault();

    const form = event.currentTarget;

    const formData = new FormData(form);
    formData.set('name', packageNameWithType(
      String(formData.get('name') ?? ''),
      String(formData.get('package_type') ?? 'diamonds'),
    ));
    formData.delete('package_type');

    setBusyDialog({ title: 'Adding top-up package', message: `Adding a package to ${game.name}.` });
    setBusy(true);

    setError('');

    try {

      await adminRequest(token, `/games/${game.id}/packages`, {

        method: 'POST',

        body: formData,

      });

      form.reset();

      setAddingPackageGameId(null);

      setNotice(`New top-up option added to ${game.name}.`);

      await loadDashboard();

    } catch (requestError) {

      setError(getErrorMessage(requestError));

    } finally {

      setBusy(false);

    }

  };



  const saveGateway = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault();

    if (!gateway) return;

    const payload: Record<string, string> = {

      bakong_mode: 'live',

      bakong_account_id: gateway.bakong_account_id ?? '',

      bakong_merchant_name: gateway.bakong_merchant_name ?? '',

      bakong_merchant_city: gateway.bakong_merchant_city ?? '',

      supplier_mode: gateway.supplier_mode,

      supplier_url: gateway.supplier_url ?? '',

    };

    for (const key of ['bakong_api_token', 'bakong_webhook_secret', 'supplier_api_token']) {

      const value = secretInputs[key as keyof typeof secretInputs];

      if (value) payload[key] = value;

    }

    const form = event.currentTarget;


    setBusyDialog({ title: 'Saving payment settings', message: 'Securely updating gateway configuration.' });
    setBusy(true);

    setError('');

    try {

      await adminRequest(token, '/gateway-settings', { method: 'PUT', body: JSON.stringify(payload) });

      setNotice('Gateway credentials saved encrypted. Secret values are never returned to the browser.');

      form.reset();

      setSecretInputs({ bakong_api_token: '', bakong_webhook_secret: '', supplier_api_token: '' });

      await loadDashboard();

    } catch (requestError) {

      setError(getErrorMessage(requestError));

    } finally {

      setBusy(false);

    }

  };



  const retryDelivery = async (orderNumber: string) => {

    setBusyDialog({ title: 'Retrying delivery', message: `Submitting a delivery retry for order ${orderNumber}.` });
    setBusy(true);

    setError('');

    try {

      await adminRequest(token, `/orders/${encodeURIComponent(orderNumber)}/retry-delivery`, { method: 'POST' });

      setNotice(`Delivery retry submitted for ${orderNumber}.`);

      await loadDashboard();

    } catch (requestError) {

      setError(getErrorMessage(requestError));

    } finally {

      setBusy(false);

    }

  };



  if (!ready) {

    return <main className="admin-shell flex min-h-screen items-center justify-center text-slate-400"><LoadingDialog open title="Opening admin dashboard" message="Restoring your secure admin session." /><LoaderCircle className="animate-spin" /> <span className="ml-3">Loading secure command centerâ€¦</span></main>;

  }



  if (!token) {

    return (

      <main className="admin-shell flex min-h-screen items-center justify-center px-4 py-12">
        <LoadingDialog open={busy} title="Signing in" message="Checking your administrator credentials securely." />

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="w-full max-w-md rounded-3xl border border-cyan-200/10 bg-[#101827]/95 p-8 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">

          <div className="mb-8 flex items-center gap-3">

            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950"><ShieldCheck size={23} /></span>

            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Nexus Topup</p><h1 className="text-xl font-black text-white">Admin sign in</h1></div>

          </div>

          <p className="mb-6 text-sm leading-6 text-slate-400">Use an administrator account provisioned by the backend operator.</p>

          <form onSubmit={login} className="space-y-4">

            <label className="admin-field-label">Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="admin-input" /></label>

            <label className="admin-field-label">Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="admin-input" /></label>

            {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] p-3 text-sm text-rose-200">{error}</p>}

            <button disabled={busy} className="admin-primary-button w-full">{busy ? 'Signing inâ€¦' : 'Sign in securely'}</button>

          </form>

          <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">API token expires after 8 hours and is held only in this browser session.</p>

        </motion.div>

      </main>

    );

  }



  return (

    <main className="admin-shell min-h-screen text-slate-100">
      <LoadingDialog
        open={busy || dashboardLoading}
        title={busy ? busyDialog.title : 'Loading dashboard'}
        message={busy ? busyDialog.message : 'Refreshing games, orders, packages, and settings.'}
      />


      <div className="admin-frame mx-auto flex max-w-[1500px] gap-0">

        <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b111c] px-5 py-6 lg:flex">

          <div className="flex items-center gap-3 px-2">

            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300 text-slate-950"><Gamepad2 size={20} /></span>

            <div><p className="font-black tracking-tight text-white">NEXUS<span className="text-cyan-300">.</span></p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Store admin</p></div>

          </div>

          <p className="mb-3 mt-10 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">Workspace</p>

          <nav className="space-y-1">

            {([

              ['overview', 'Overview', Activity],

              ['games', 'Games & images', ImagePlus],

              ['orders', 'Orders', ClipboardList],

              ['packages', 'Packages & margins', Boxes],

              ['gateway', 'Gateway settings', Settings2],

            ] as const).map(([key, label, Icon]) => (

              <button key={key} type="button" onClick={() => setSection(key)} className={`admin-nav-item ${section === key ? 'admin-nav-active' : ''}`}>

                <Icon size={17} /> {label}

              </button>

            ))}

          </nav>

          <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">

            <p className="flex items-center gap-2 text-xs font-bold text-slate-300"><ShieldCheck size={15} className="text-emerald-300" /> Admin session protected</p>

            <button type="button" onClick={logout} className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-white"><LogOut size={15} /> Sign out</button>

          </div>

        </aside>



        <div className="min-w-0 flex-1 px-4 py-5 sm:px-7 lg:px-10 lg:py-8">

          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">

            <div>

              <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">Store operations</p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Dashboard</h1>

            </div>

            <div className="flex items-center gap-3">

              <span className="hidden items-center gap-2 rounded-full border border-white/[0.08] px-3 py-2 text-xs font-semibold text-slate-400 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Admin API connected</span>

              <button type="button" onClick={() => void loadDashboard()} className="admin-icon-button" aria-label="Refresh dashboard"><RefreshCw size={17} /></button>

              <button type="button" onClick={logout} className="admin-icon-button lg:hidden" aria-label="Sign out"><LogOut size={17} /></button>

            </div>

          </header>



          <nav className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">

            {(['overview', 'games', 'orders', 'packages', 'gateway'] as const).map((key) => (

              <button key={key} type="button" onClick={() => setSection(key)} className={`admin-mobile-tab ${section === key ? 'admin-mobile-tab-active' : ''}`}>{key}</button>

            ))}

          </nav>



          {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] p-4 text-sm text-rose-100"><TriangleAlert size={17} className="mt-0.5 shrink-0" />{error}</div>}

          {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">{notice}</div>}



          <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

          {section === 'overview' && (

            <>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

                <StatCard label="Total sales Â· USD" value={currency(summary?.sales_usd ?? 0, 'USD')} note="Confirmed payments only" icon={CircleDollarSign} accent="text-cyan-200 bg-cyan-300/10" />

                <StatCard label="Total sales · KHR" value={currency(summary?.sales_khr ?? 0, 'KHR')} note="Confirmed payments only" icon={Wallet} accent="text-violet-200 bg-violet-300/10" />

                <StatCard label="Orders" value={(summary?.total_orders ?? 0).toLocaleString()} note="All-time order volume" icon={ClipboardList} accent="text-amber-200 bg-amber-300/10" />

                <StatCard label="Success rate" value={`${summary?.success_rate ?? 0}%`} note="Paid and delivered orders" icon={PackageCheck} accent="text-emerald-200 bg-emerald-300/10" />

              </div>

              <section className="admin-panel mt-6">

                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">

                  <div><p className="admin-label">Store catalog</p><h2 className="mt-1 text-lg font-bold text-white">Games</h2></div>

                  <div className="flex items-center gap-3">

                    <span className="admin-status status-info">{gameRecords.length} games Â· {gameRecords.reduce((total, game) => total + game.packages_count, 0)} packages</span>

                    <button type="button" onClick={() => setSection('games')} className="text-xs font-bold text-cyan-200">Manage games</button>

                  </div>

                </div>

                {gameRecords.length ? (

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

                    {gameRecords.map((game) => {

                      const imageUrl = getGameImageUrl(game.icon_url || game.banner_url);

                      return (

                        <article key={game.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">

                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cyan-300/[0.08] text-cyan-200">

                            {imageUrl

                              ? <Image src={imageUrl} alt="" width={48} height={48} unoptimized className="h-full w-full object-cover" />

                              : <Gamepad2 size={20} />}

                          </div>

                          <div className="min-w-0 flex-1">

                            <p className="truncate text-sm font-bold text-white">{game.name}</p>

                            <p className="mt-1 truncate text-xs text-slate-500">{game.packages_count} packages Â· {game.category}</p>

                          </div>

                          <span className={`h-2 w-2 shrink-0 rounded-full ${game.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} title={game.is_active ? 'Active' : 'Inactive'} />

                        </article>

                      );

                    })}

                  </div>

                ) : (

                  <p className="py-5 text-sm text-slate-500">No games found in the connected database.</p>

                )}

              </section>

              <section className="admin-panel mt-6">

                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">

                  <div><p className="admin-label">Latest activity</p><h2 className="mt-1 text-lg font-bold text-white">Recent orders</h2></div>

                  <div className="flex items-center gap-2"><span className={`admin-status ${statusClass(summary?.supplier_status ?? 'not_configured')}`}>Supplier {summary?.supplier_status?.replace('_', ' ') ?? 'loading'}</span><span className="admin-status status-info">Bakong {summary?.payment_mode ?? 'loading'}</span></div>

                </div>

                <OrderTable orders={summary?.recent_orders ?? []} onRetry={retryDelivery} />

              </section>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">

                <div className="admin-panel flex items-center gap-4"><span className="admin-stat-icon bg-cyan-300/10 text-cyan-200"><Activity size={20} /></span><div><p className="admin-label">Payment gateway mode</p><p className="mt-1 font-bold capitalize text-white">{summary?.payment_mode ?? 'Loading'}</p></div><span className="ml-auto text-xs text-slate-500">Configured by administrator</span></div>

                <div className="admin-panel flex items-center gap-4"><span className={`admin-stat-icon ${summary?.supplier_status === 'configured' ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200'}`}><BadgeCheck size={20} /></span><div><p className="admin-label">Supplier integration</p><p className="mt-1 font-bold capitalize text-white">{summary?.supplier_status?.replace('_', ' ') ?? 'Loading'}</p></div><button type="button" onClick={() => setSection('gateway')} className="ml-auto text-xs font-bold text-cyan-200">Configure</button></div>

              </div>

            </>

          )}



          {section === 'games' && (

            <div className="space-y-5">

              <form onSubmit={createGame} className="space-y-5">

                <section className="admin-panel">

                <div className="mb-5 flex items-center gap-3">

                  <span className="admin-stat-icon bg-cyan-300/10 text-cyan-200"><ImagePlus size={19} /></span>

                  <div><p className="admin-label">Store catalog</p><h2 className="mt-1 text-lg font-bold text-white">Create a game</h2><p className="mt-1 text-sm text-slate-500">Upload artwork and add the first top-up package so customers can order it immediately.</p></div>

                </div>

                <div className="grid gap-4 md:grid-cols-2">

                  <label className="admin-field-label">Game name<input name="name" required maxLength={120} className="admin-input" placeholder="e.g. Mobile Legends" /></label>

                  <label className="admin-field-label">Publisher<input name="publisher" required maxLength={120} className="admin-input" placeholder="e.g. Moonton" /></label>

                  <label className="admin-field-label">Category<input name="category" required maxLength={80} className="admin-input" placeholder="e.g. MOBA" /></label>

                  <label className="admin-field-label">Requires zone/server ID<select name="has_zone_id" defaultValue="0" className="admin-input"><option value="0">No</option><option value="1">Yes</option></select></label>

                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">

                  <label className="admin-field-label">Game image (JPG, PNG, or WebP; max 5 MB)<input name="image" type="file" required accept="image/jpeg,image/png,image/webp" onChange={(event) => setGameImage(event.currentTarget.files?.[0] ?? null)} className="admin-input file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-300/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-cyan-100" /><span className="text-[11px] text-slate-600">This image is used for the storefront banner and game icon.</span></label>

                  <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/[0.12] bg-[#0a111d]">

                    {gameImagePreview ? <Image src={gameImagePreview} alt="Selected game artwork preview" width={440} height={128} unoptimized className="h-32 w-full object-cover" /> : <span className="flex items-center gap-2 text-xs text-slate-600"><ImagePlus size={17} /> Image preview</span>}

                  </div>

                </div>

                </section>

                <section className="admin-panel">

                <div className="mb-5"><p className="admin-label">First package</p><h2 className="mt-1 text-lg font-bold text-white">Make the game purchasable</h2></div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">

                  <label className="admin-field-label">Package name<input name="package_name" required maxLength={120} className="admin-input" placeholder="e.g. 86 Diamonds" /></label>

                  <label className="admin-field-label">Package type<select name="package_type" required defaultValue="diamonds" className="admin-input">{Object.entries(PACKAGE_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}</select></label>

                  <label className="admin-field-label">Price USD<input name="price_usd" required type="number" min="0.01" max="999999" step="0.01" className="admin-input" /></label>

                  <label className="admin-field-label">Price KHR<input name="price_khr" required type="number" min="1" max="99999999" step="1" className="admin-input" /></label>

                  <label className="admin-field-label">Supplier SKU<input name="supplier_sku" required maxLength={120} className="admin-input" placeholder="Provider product code" /></label>

                </div>

                </section>

                <div className="flex justify-end"><button disabled={busy} className="admin-primary-button">{busy ? 'Creating gameâ€¦' : 'Create game & package'}</button></div>

              </form>

              <section className="admin-panel">

                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">

                  <div><p className="admin-label">Database catalog</p><h2 className="mt-1 text-lg font-bold text-white">Existing games</h2></div>

                  <span className="admin-status status-info">{gameRecords.length} games Â· {gameRecords.reduce((total, game) => total + game.packages_count, 0)} packages</span>

                </div>

                <div className="space-y-3">

                  {gameRecords.map((game) => {

                    const imageUrl = getGameImageUrl(game.icon_url || game.banner_url);

                    return (

                    <article key={game.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">

                      <div className="flex flex-wrap items-center gap-4">

                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cyan-300/[0.08] text-cyan-200">

                          {imageUrl

                            ? <Image src={imageUrl} alt="" width={56} height={56} unoptimized className="h-full w-full object-cover" />

                            : <Gamepad2 size={22} />}

                        </div>

                        <div className="min-w-0 flex-1">

                          <p className="truncate font-bold text-white">{game.name}</p>

                          <p className="mt-1 text-xs text-slate-500">{game.publisher} Â· {game.category} Â· {game.slug}</p>

                        </div>

                        <div className="flex flex-wrap items-center gap-2">

                          <span className="admin-status status-info">{game.packages_count} packages</span>

                          {game.has_zone_id && <span className="admin-status status-wait">Zone ID required</span>}

                          <span className={`admin-status ${game.is_active ? 'status-good' : 'status-bad'}`}>{game.is_active ? 'Active' : 'Inactive'}</span>

                          <button type="button" disabled={busy} onClick={() => { setEditingGameId(editingGameId === game.id ? null : game.id); setAddingPackageGameId(null); }} className="admin-small-button">

                            <Pencil size={13} /> {editingGameId === game.id ? 'Cancel edit' : 'Edit'}

                          </button>

                          <button type="button" disabled={busy} onClick={() => void deleteGame(game)} className="admin-small-button text-rose-200">

                            <Trash2 size={13} /> Delete

                          </button>

                          <button type="button" onClick={() => setAddingPackageGameId(addingPackageGameId === game.id ? null : game.id)} className="admin-small-button">

                            {addingPackageGameId === game.id ? 'Cancel' : 'Add top-up'}

                          </button>

                        </div>

                      </div>

                      {editingGameId === game.id && (

                        <form onSubmit={(event) => void updateGame(event, game)} className="mt-4 grid gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-2 xl:grid-cols-3">

                          <label className="admin-field-label">Game name<input name="name" required maxLength={120} defaultValue={game.name} className="admin-input" /></label>

                          <label className="admin-field-label">Publisher<input name="publisher" required maxLength={120} defaultValue={game.publisher} className="admin-input" /></label>

                          <label className="admin-field-label">Category<input name="category" required maxLength={80} defaultValue={game.category} className="admin-input" /></label>

                          <label className="admin-field-label">Replace artwork (optional)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="admin-input" /></label>

                          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-300">

                            <label className="flex items-center gap-2"><input name="has_zone_id" type="checkbox" defaultChecked={game.has_zone_id} />Requires Zone ID</label>

                            <label className="flex items-center gap-2"><input name="is_active" type="checkbox" defaultChecked={game.is_active} />Active on storefront</label>

                          </div>

                          <div className="flex items-end gap-2">

                            <button type="submit" disabled={busy} className="admin-primary-button">{busy ? 'Savingâ€¦' : 'Save game'}</button>

                            <button type="button" disabled={busy} onClick={() => setEditingGameId(null)} className="admin-small-button">Cancel</button>

                          </div>

                        </form>

                      )}

                      {addingPackageGameId === game.id && (

                        <form onSubmit={(event) => void createPackage(event, game)} className="mt-4 grid min-w-0 grid-cols-1 gap-4 border-t border-white/[0.07] pt-4 sm:grid-cols-2 lg:grid-cols-4">

                          <label className="admin-field-label">Package amount or title<input name="name" required maxLength={120} className="admin-input" placeholder="e.g. 172 or 7 days" /></label>

                          <label className="admin-field-label">Package type<select name="package_type" required defaultValue="diamonds" className="admin-input">{Object.entries(PACKAGE_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}</select></label>

                          <label className="admin-field-label">Price USD<input name="price_usd" required type="number" min="0.01" max="999999" step="0.01" className="admin-input" /></label>

                          <label className="admin-field-label">Price KHR<input name="price_khr" required type="number" min="1" max="99999999" step="1" className="admin-input" /></label>

                          <label className="admin-field-label">Supplier SKU<input name="supplier_sku" required maxLength={120} className="admin-input" placeholder="Provider product code" /></label>

                          <label className="admin-field-label">Package artwork (optional)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="admin-input" /></label>

                          <label className="admin-field-label min-w-0">Badge (optional)<input name="badge" maxLength={40} className="admin-input" placeholder="Popular" /></label>

                          <button type="submit" disabled={busy} className="admin-primary-button w-full self-end">{busy ? 'Savingâ€¦' : 'Add package'}</button>

                        </form>

                      )}

                    </article>

                    );

                  })}

                  {!gameRecords.length && <p className="py-8 text-center text-sm text-slate-500">No games found in the connected database.</p>}

                </div>

              </section>

            </div>

          )}



          {section === 'orders' && (

            <section className="admin-panel">

              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">

                <div><p className="admin-label">Transactions</p><h2 className="mt-1 text-lg font-bold text-white">Order management</h2></div>

                <div className="flex flex-wrap gap-2">

                  <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input aria-label="Search orders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order or player" className="admin-filter-input pl-9" /></label>

                  <select aria-label="Filter payment status" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="admin-filter-input"><option value="">All payments</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>

                  <select aria-label="Filter delivery status" value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)} className="admin-filter-input"><option value="">All delivery</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="failed">Failed</option></select>

                </div>

              </div>

              <OrderTable orders={visibleOrders} onRetry={retryDelivery} />

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">

                <span>{orders?.total ?? 0} orders</span>

                <div className="flex items-center gap-3"><span>Page {orders?.current_page ?? 1} of {orders?.last_page ?? 1}</span><button type="button" disabled={!orders || orders.current_page <= 1} onClick={() => setOrderPageNumber((page) => Math.max(1, page - 1))} className="admin-small-button">Previous</button><button type="button" disabled={!orders || orders.current_page >= orders.last_page} onClick={() => setOrderPageNumber((page) => page + 1)} className="admin-small-button">Next</button></div>

              </div>

            </section>

          )}



          {section === 'packages' && (

            <section className="admin-panel">

              <div className="mb-5"><p className="admin-label">Catalog controls</p><h2 className="mt-1 text-lg font-bold text-white">Package & margin manager</h2><p className="mt-2 text-sm text-slate-500">Margin is applied to supplier cost when both cost and markup are set.</p></div>

              <div className="space-y-3">

                {packages.map((pkg, index) => (

                  <div key={pkg.id} className="grid gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 xl:grid-cols-[1.2fr_repeat(5,minmax(100px,1fr))_auto]">

                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/[0.08] text-cyan-200"><Gamepad2 size={18} /></span><div><p className="text-sm font-bold text-white">{pkg.name}</p><p className="text-xs text-slate-500">{pkg.game.name}</p></div></div>

                    <label className="admin-field-label">Price USD<input aria-label={`${pkg.name} USD price`} type="number" min="0" step="0.01" value={pkg.price_usd} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, price_usd: event.target.value } : item))} className="admin-input admin-input-compact" /></label>

                    <label className="admin-field-label">Price KHR<input aria-label={`${pkg.name} KHR price`} type="number" min="0" step="1" value={pkg.price_khr} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, price_khr: Number(event.target.value) } : item))} className="admin-input admin-input-compact" /></label>

                    <label className="admin-field-label">Cost USD<input aria-label={`${pkg.name} supplier USD cost`} type="number" min="0" step="0.01" value={pkg.supplier_cost_usd ?? ''} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, supplier_cost_usd: event.target.value } : item))} className="admin-input admin-input-compact" /></label>

                    <label className="admin-field-label">Cost KHR<input aria-label={`${pkg.name} supplier KHR cost`} type="number" min="0" step="1" value={pkg.supplier_cost_khr ?? ''} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, supplier_cost_khr: event.target.value === '' ? null : Number(event.target.value) } : item))} className="admin-input admin-input-compact" /></label>

                    <div className="grid grid-cols-2 gap-2"><label className="admin-field-label">Markup %<input aria-label={`${pkg.name} markup percentage`} type="number" min="0" step="0.1" value={pkg.markup_percent ?? ''} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, markup_percent: event.target.value || null } : item))} className="admin-input admin-input-compact" /></label><label className="admin-field-label">Supplier SKU<input aria-label={`${pkg.name} supplier SKU`} value={pkg.supplier_sku} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, supplier_sku: event.target.value } : item))} className="admin-input admin-input-compact" /></label></div>

                    <div className="flex items-end gap-2"><label className="mb-2 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={pkg.is_active} onChange={(event) => setPackages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, is_active: event.target.checked } : item))} />Active</label><button type="button" disabled={busy} onClick={() => void savePackage(pkg)} className="admin-small-button">Save</button></div>

                  </div>

                ))}

                {!packages.length && <p className="py-10 text-center text-sm text-slate-500">Loading packagesâ€¦</p>}

              </div>

            </section>

          )}



          {section === 'gateway' && gateway && (

            <form onSubmit={saveGateway} className="space-y-5">

              <section className="admin-panel">

                <div className="mb-5 flex items-center gap-3"><span className="admin-stat-icon bg-rose-300/10 text-rose-200"><Wallet size={19} /></span><div><p className="admin-label">Payment gateway</p><h2 className="mt-1 text-lg font-bold text-white">Bakong KHQR configuration</h2></div></div>

                <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] p-4"><div><p className="text-sm font-bold text-white">Payment mode</p><p className="mt-1 text-xs text-slate-500">Real merchant KHQR generated locally and checked with the Bakong Open API.</p></div><span className="admin-status status-good">Live payments</span></div>

                {!gateway.bakong_configuration_complete && (

                  <div role="status" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">

                    <p className="font-bold">Bakong setup is incomplete. Checkout will remain unavailable until all required merchant details are saved.</p>

                    <p className="mt-1 text-xs text-amber-100/70">Required: Bakong account ID, merchant name, merchant city, and Bakong API token. Enter the verified account details provided by Bakong.</p>

                  </div>

                )}

                <div className="grid gap-4 md:grid-cols-2">

                  <label className="admin-field-label">Bakong account ID<input name="bakong_account_id" value={gateway.bakong_account_id ?? ''} onChange={(event) => setGateway({ ...gateway, bakong_account_id: event.target.value })} className="admin-input" /></label>

                  <label className="admin-field-label">Merchant name<input name="bakong_merchant_name" value={gateway.bakong_merchant_name ?? ''} onChange={(event) => setGateway({ ...gateway, bakong_merchant_name: event.target.value })} className="admin-input" /></label>

                  <label className="admin-field-label">Merchant city<input name="bakong_merchant_city" value={gateway.bakong_merchant_city ?? ''} onChange={(event) => setGateway({ ...gateway, bakong_merchant_city: event.target.value })} className="admin-input" /></label>

                  <SecretField name="bakong_api_token" label="Bakong API token" configured={gateway.bakong_api_token_configured} value={secretInputs.bakong_api_token} onChange={(value) => setSecretInputs({ ...secretInputs, bakong_api_token: value })} />

                  <SecretField name="bakong_webhook_secret" label="Optional webhook secret" configured={gateway.bakong_webhook_secret_configured} value={secretInputs.bakong_webhook_secret} onChange={(value) => setSecretInputs({ ...secretInputs, bakong_webhook_secret: value })} />

                </div>

              </section>

              <section className="admin-panel">

                <div className="mb-5 flex items-center gap-3"><span className="admin-stat-icon bg-violet-300/10 text-violet-200"><Boxes size={19} /></span><div><p className="admin-label">Wholesale delivery</p><h2 className="mt-1 text-lg font-bold text-white">Supplier API configuration</h2></div></div>

                <div className="mb-5 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><div><p className="text-sm font-bold text-white">Supplier mode</p><p className="mt-1 text-xs text-slate-500">Provider API must be confirmed before live top-ups.</p></div><select aria-label="Supplier mode" value={gateway.supplier_mode} onChange={(event) => setGateway({ ...gateway, supplier_mode: event.target.value as GatewaySettings['supplier_mode'] })} className="admin-filter-input"><option value="demo">Demo</option><option value="live">Live</option></select></div>

                <div className="grid gap-4 md:grid-cols-2">

                  <label className="admin-field-label">Supplier API endpoint<input name="supplier_url" value={gateway.supplier_url ?? ''} onChange={(event) => setGateway({ ...gateway, supplier_url: event.target.value })} placeholder="https://supplier.example/topup" className="admin-input" /></label>

                  <SecretField name="supplier_api_token" label="Wholesale B2B API key" configured={gateway.supplier_api_token_configured} value={secretInputs.supplier_api_token} onChange={(value) => setSecretInputs({ ...secretInputs, supplier_api_token: value })} />

                </div>

              </section>

              <div className="flex flex-wrap items-center justify-between gap-4"><p className="flex items-center gap-2 text-xs text-slate-500"><KeyRound size={14} /> Secrets are encrypted at rest and never echoed to the browser.</p><button disabled={busy} className="admin-primary-button">{busy ? 'Saving securelyâ€¦' : 'Save gateway configuration'}</button></div>

            </form>

          )}

          </motion.div>

        </div>

      </div>

    </main>

  );

}



function SecretField({ name, label, configured, value, onChange }: {

  name: keyof AdminSecretFields;

  label: string;

  configured: boolean;

  value: string;

  onChange: (value: string) => void;

}) {

  return (

    <label className="admin-field-label">{label}<input name={name} type="password" autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={configured ? 'Configured â€” enter a new value to rotate' : 'Not configured'} className="admin-input" /><span className="mt-1 text-[10px] font-medium text-slate-600">{configured ? 'A secret is currently stored. It is never displayed.' : 'No secret stored yet.'}</span></label>

  );

}



function OrderTable({ orders, onRetry }: { orders: AdminOrder[]; onRetry: (orderNumber: string) => void }) {

  return (

    <div className="overflow-x-auto">

      <table className="admin-table">

        <thead><tr><th>Order</th><th>Player</th><th>Package</th><th>Total</th><th>Payment</th><th>Delivery</th><th>Created</th><th /></tr></thead>

        <tbody>

          {orders.map((order) => (

            <tr key={order.id}>

              <td><span className="font-bold text-white">{order.order_number}</span><span className="mt-1 block text-[10px] text-slate-600">{order.package?.game?.name ?? 'Unknown game'}</span></td>

              <td className="font-medium text-slate-300">{order.player_id}</td>

              <td className="text-slate-300">{order.package?.name ?? 'Package unavailable'}</td>

              <td className="font-bold text-slate-200">{currency(order.currency === 'USD' ? order.amount_usd : order.amount_khr, order.currency)}</td>

              <td><span className={`admin-status ${statusClass(order.payment_status)}`}>{order.payment_status}</span></td>

              <td><span className={`admin-status ${statusClass(order.delivery_status)}`}>{order.delivery_status}</span></td>

              <td className="whitespace-nowrap text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</td>

              <td>{order.payment_status === 'paid' && order.delivery_status === 'failed' && <button type="button" onClick={() => onRetry(order.order_number)} className="text-xs font-bold text-cyan-200 hover:text-white">Retry</button>}</td>

            </tr>

          ))}

          {!orders.length && <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-500">No matching orders.</td></tr>}

        </tbody>

      </table>

    </div>

  );

}
