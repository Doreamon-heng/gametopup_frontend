# Nexus Topup storefront

Next.js storefront for the Laravel Game Topup API.

## Local development

1. Start the Laravel API from `gametopup-website` and seed its catalog:

   ```powershell
   php artisan migrate --seed
   php artisan serve
   ```

2. Start the frontend from this directory:

   ```powershell
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

The frontend uses `https://game-topup-4.onrender.com/api` by default. To use another API URL, set `NEXT_PUBLIC_API_BASE_URL` in a local `.env.local` file. Set the same variable in the frontend deployment environment and redeploy after changing it. In the Laravel Render service, set `FRONTEND_URLS` to the exact deployed frontend origin (for example, `https://your-frontend.onrender.com`) so the browser can access the API.

The operations dashboard is available at `/admin`. Create an administrator from the backend with `php artisan admin:create`; no default admin credentials are seeded. Keep payment and supplier credentials in the Laravel dashboard/backend environment only.

## Available scripts

```powershell
npm run dev
npm run lint
npm run build
```

Checkout uses real Bakong individual KHQR; simulated payments are disabled. Configure an eligible Bakong account ID, account name, city, and API token in the protected Laravel admin dashboard or backend environment. Never put payment or supplier credentials in the frontend environment.

Customers can verify the Player ID (and Zone ID when required) to see the provider-returned player name. This check is optional; checkout remains available when no verification provider is configured. For Free Fire and Delta Force provider options, see the Laravel README. Verification expires after 10 minutes and is bound to the selected game and entered IDs.
