// Explicit live preflight is the only path that can point this server at staging.
if (process.env.LIVE_E2E_PREFLIGHT_OK === '1') {
  const { validateLiveEnvironment } = await import('./support/live-preflight.mjs');
  const live = validateLiveEnvironment(process.env);
  process.env.VITE_SUPABASE_URL = live.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = live.publicKey;
  process.env.VITE_SUPABASE_ANON_KEY = live.publicKey;
} else {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.invalid';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_test_only';
  process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_local_test_only';
}
const { createServer } = await import('vite');
const server = await createServer({ server: { host: 'localhost', port: 5187, strictPort: true } });
await server.listen();
server.printUrls();
