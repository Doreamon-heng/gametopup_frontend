import axios from 'axios';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  || (typeof window === 'undefined'
    ? 'https://game-topup-4.onrender.com/api'
    : 'https://game-topup-4.onrender.com/api')
).replace(/\/$/, '');
const API_ORIGIN = new URL(API_BASE_URL).origin;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 20000,
});

export const getGameImageUrl = (imageUrl: string | null): string | null => {
  if (!imageUrl) return null;

  try {
    const image = new URL(imageUrl, API_ORIGIN);
    const apiOrigin = new URL(API_ORIGIN);
    if (
      image.pathname.startsWith('/storage/')
      && ['localhost', '127.0.0.1'].includes(image.hostname)
    ) {
      image.protocol = apiOrigin.protocol;
      image.host = apiOrigin.host;
    }

    return image.toString();
  } catch {
    return null;
  }
};

export interface Package {
  id: number;
  name: string;
  price_usd: string;
  price_khr: number;
  badge: string | null;
  image_url: string | null;
}

export interface Game {
  id: number;
  name: string;
  slug: string;
  publisher: string;
  category: string;
  banner_url: string | null;
  icon_url: string | null;
  has_zone_id: boolean;
  packages: Package[];
}

export interface OrderStatus {
  order_number: string;
  payment_status: 'pending' | 'paid' | 'failed';
  delivery_status: 'pending' | 'processing' | 'completed' | 'failed';
  paid_at: string | null;
  player_id: string;
  zone_id: string | null;
  package_name: string;
  game_name: string;
  amount: number | string;
  currency: 'USD' | 'KHR';
  khqr_string: string | null;
  payment_mode: 'live';
  delivery_mode: 'demo' | 'live';
  verification_message?: string | null;
}

export interface ApiError {
  message?: string;
  errors?: Record<string, string[]>;
}

export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'The store request took too long (20 seconds). The server may be waking up; please try again.';
    }
    const firstFieldError = Object.values(error.response?.data?.errors ?? {})[0]?.[0];
    const missingSettings = (error.response?.data as ApiError & { missing_settings?: string[] })?.missing_settings;
    return firstFieldError
      || error.response?.data?.message
        && (missingSettings?.length
          ? `${error.response.data.message} Missing: ${missingSettings.join(', ')}.`
          : error.response.data.message)
      || 'Could not connect to the store. Check that the backend is running.';
  }

  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
};

export const getGames = async (): Promise<Game[]> => {
  const response = await api.get<{ data: Game[] }>('/v1/games');
  return response.data.data;
};

export const createOrder = async (data: {
  package_id: number;
  player_id: string;
  zone_id?: string;
  currency: 'USD' | 'KHR';
  verification_token?: string;
}): Promise<{ order_number: string }> => {
  const response = await api.post('/v1/orders', data);
  return response.data;
};

export const verifyPlayer = async (data: {
  game_slug: string;
  player_id: string;
  zone_id?: string;
}): Promise<{ verified: true; player_name: string; verification_token: string; expires_in: number }> => {
  const response = await api.post<{ data: { verified: true; player_name: string; verification_token: string; expires_in: number } }>(
    '/v1/player-verifications',
    data,
  );
  return response.data.data;
};

export const checkOrderStatus = async (orderNumber: string): Promise<OrderStatus> => {
  const response = await api.get<OrderStatus>(`/v1/orders/${encodeURIComponent(orderNumber)}/status`);
  return response.data;
};
