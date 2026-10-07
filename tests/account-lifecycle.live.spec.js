import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readMailboxMessages, validateLiveEnvironment } from './support/live-preflight.mjs';

test.describe.configure({ mode: 'serial' });

const env = process.env;
let live;
test.beforeAll(() => {
  if (env.LIVE_E2E_PREFLIGHT_OK !== '1') throw new Error('Live preflight: run pnpm test:e2e:live');
  live = validateLiveEnvironment(env);
});

function adminClient() {
  return createClient(live.url, env.LIVE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function mailboxMessages(request, email) {
  return readMailboxMessages(request, live, env.LIVE_MAILBOX_API_TOKEN, email);
}

function oneTimeLink(messages, flow) {
  const candidates = messages.flatMap((message) => {
    const body = `${message.text ?? ''}\n${message.html ?? ''}`.replaceAll('&amp;', '&');
    return [...body.matchAll(/https:\/\/[^\s"'<>]+/g)].map((match) => match[0]);
  });
  const link = candidates.find((value) => {
    try {
      const url = new URL(value);
      return (url.origin === live.url || url.origin === 'http://localhost:5187')
        && (value.includes(`auth%3D${flow}`) || value.includes(`auth=${flow}`));
    } catch { return false; }
  });
  if (!link) throw new Error(`delivery: no ${flow} link from captured mailbox`);
  return link;
}

async function waitForLink(request, email, flow, previousIds = new Set()) {
  for (let i = 0; i < 24; i += 1) {
    const messages = await mailboxMessages(request, email);
    const fresh = messages.filter((message) => !previousIds.has(message.id));
    if (fresh.length) {
      try { return oneTimeLink(fresh, flow); }
      catch { /* The provider may expose a message before filling its body. */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`delivery: ${flow} message was not captured within one minute`);
}

async function signIn(page, email, password) {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function cleanup(client, email, created) {
  const unresolved = [];
  if (!email.startsWith('dbdocgen-test-') || !email.endsWith(`@${live.domain}`)) {
    throw new Error('cleanup: test identity marker mismatch');
  }
  try {
    const { data: rows, error } = await client.from('access_requests').select('id,email').eq('email', email);
    if (error) throw error;
    for (const row of rows ?? []) {
      if (row.email !== email || !row.id) continue;
      created.requests.add(row.id);
      const removed = await client.from('access_requests').delete().eq('id', row.id).eq('email', email);
      if (removed.error) unresolved.push(`access_request:${row.id}`);
    }
  } catch {
    unresolved.push(`access_request_lookup:${email}`);
    unresolved.push(...[...created.requests].map((id) => `access_request:${id}`));
  }
  try {
    const { data: profiles, error } = await client.from('profiles').select('id,email').eq('email', email);
    if (error) throw error;
    for (const profile of profiles ?? []) if (profile.email === email && profile.id) created.users.add(profile.id);
  } catch { unresolved.push(`profile_lookup:${email}`); }
  // Auth can create an identity even if invitation mail or the profile trigger fails.
  // Discover only the unique marked email, then verify it again before deletion.
  try {
    for (let page = 1; ; page += 1) {
      const listed = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) throw listed.error;
      for (const account of listed.data.users ?? []) if (account.email === email) created.users.add(account.id);
      if ((listed.data.users ?? []).length < 1000) break;
    }
    for (const id of created.users) {
      const identity = await client.auth.admin.getUserById(id);
      if (identity.error || identity.data.user?.email !== email) {
        unresolved.push(`auth_user:${id}`);
        continue;
      }
      const removed = await client.auth.admin.deleteUser(id);
      if (removed.error) unresolved.push(`auth_user:${id}`);
    }
  } catch {
    unresolved.push(`auth_user_lookup:${email}`);
    unresolved.push(...[...created.users].map((id) => `auth_user:${id}`));
  }
  // access_request_rate_limits is keyed by IP hash, not account email. It is
  // shared with unrelated requests and must never be deleted by this test.
  if (unresolved.length) throw new Error(`cleanup: exact fixtures require manual review: ${[...new Set(unresolved)].join(', ')}`);
}

test('staging request, approval, delivery, setup, login and reset', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const marker = `dbdocgen-test-${randomUUID()}`;
  const email = `${marker}@${live.domain}`;
  const created = { requests: new Set(), users: new Set() };
  const client = adminClient();
  const initialPassword = `TestA-${randomUUID()}!`;
  const replacementPassword = `TestB-${randomUUID()}!`;
  let stage = 'preflight';
  let failure;
  try {
    // Read-only connectivity check precedes all writes, including the access request.
    await mailboxMessages(request, email);
    const applicant = await browser.newContext();
    const page = await applicant.newPage();
    stage = 'request';
    await page.goto('/');
    await page.getByRole('button', { name: 'Solicitar acceso' }).first().click();
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button', { name: 'Solicitar acceso' }).last().click();
    await expect(page.getByRole('status')).toContainText('Solicitud recibida');
    const found = await client.from('access_requests').select('id,email').eq('email', email).single();
    if (found.error || !found.data?.id) throw new Error(`request: record lookup status ${found.status}`);
    created.requests.add(found.data.id);
    await applicant.close();

    stage = 'review';
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await adminPage.goto('/');
    await signIn(adminPage, env.LIVE_ADMIN_EMAIL, env.LIVE_ADMIN_PASSWORD);
    await expect(adminPage.locator('.user-menu')).toBeVisible();
    await adminPage.locator('.user-menu > button').click();
    await adminPage.getByRole('menuitem', { name: 'Solicitudes de acceso' }).click();
    await adminPage.getByText(email).waitFor();
    await adminPage.getByRole('button', { name: 'Aprobar' }).click();
    await expect(adminPage.getByText('Invitación enviada')).toBeVisible();
    // The invite is already sent when this confirmation appears, so this
    // timestamp cannot precede Supabase's per-user email cooldown.
    const invitationConfirmedAt = performance.now();
    await admin.close();

    stage = 'delivery';
    const setupLink = await waitForLink(request, email, 'setup');
    const profile = await client.from('profiles').select('id,email,is_active').eq('email', email).single();
    if (profile.error || !profile.data?.is_active) throw new Error(`delivery: profile status ${profile.status}`);
    created.users.add(profile.data.id);
    const account = await browser.newContext();
    const accountPage = await account.newPage();
    stage = 'setup';
    await accountPage.goto(setupLink);
    await expect(accountPage.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible();
    await accountPage.getByLabel('Nueva contraseña').fill(initialPassword);
    await accountPage.getByLabel('Confirmar contraseña').fill(initialPassword);
    await accountPage.getByRole('button', { name: 'Guardar contraseña y entrar' }).click();
    await expect(accountPage.locator('.user-menu')).toBeVisible();
    await accountPage.locator('.user-menu > button').click();
    await accountPage.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    stage = 'login';
    await signIn(accountPage, email, initialPassword);
    await expect(accountPage.locator('.user-menu')).toBeVisible();
    await accountPage.locator('.user-menu > button').click();
    await accountPage.getByRole('menuitem', { name: 'Cerrar sesión' }).click();

    stage = 'recovery';
    // Supabase applies a per-user recovery window of 60 seconds. Wait only
    // the remainder, with one second of margin for clock and network timing.
    const recoveryWaitMs = Math.max(0, 61_000 - (performance.now() - invitationConfirmedAt));
    if (recoveryWaitMs > 0) await new Promise((resolve) => setTimeout(resolve, recoveryWaitMs));
    const priorMailIds = new Set((await mailboxMessages(request, email)).map((message) => message.id));
    await accountPage.getByRole('button', { name: '¿Olvidaste la contraseña?' }).click();
    await accountPage.getByLabel('Correo electrónico').fill(email);
    await accountPage.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
    await expect(accountPage.getByRole('status')).toContainText('bandeja de entrada');
    const recoveryLink = await waitForLink(request, email, 'recovery', priorMailIds);
    await accountPage.goto(recoveryLink);
    await expect(accountPage.getByRole('heading', { name: 'Nueva contraseña' })).toBeVisible();
    await accountPage.getByLabel('Nueva contraseña').fill(replacementPassword);
    await accountPage.getByLabel('Confirmar contraseña').fill(replacementPassword);
    await accountPage.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
    await expect(accountPage.locator('.user-menu')).toBeVisible();
    await accountPage.locator('.user-menu > button').click();
    await accountPage.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await signIn(accountPage, email, initialPassword);
    await expect(accountPage.getByRole('alert')).toContainText('No hemos podido iniciar sesión');
    await signIn(accountPage, email, replacementPassword);
    await expect(accountPage.locator('.user-menu')).toBeVisible();
    await account.close();
  } catch (error) {
    // Avoid Playwright serializing a one-time URL or password into reports.
    const safeCode = Number.isInteger(error?.status) ? error.status : 'unknown';
    failure = new Error(`${stage}: lifecycle failed; inspect staging Auth/Functions/SMTP logs (safe code: ${safeCode})`);
  } finally {
    try { await cleanup(client, email, created); }
    catch (error) {
      const cleanupMessage = error?.message?.startsWith('cleanup:')
        ? error.message
        : 'cleanup: exact fixture status unknown; review the unique test identity manually';
      failure = new Error(failure ? `${failure.message}; ${cleanupMessage}` : cleanupMessage);
    }
  }
  if (failure) throw failure;
});
