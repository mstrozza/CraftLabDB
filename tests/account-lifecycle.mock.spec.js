import { test, expect } from '@playwright/test';
import { MockSupabase } from './support/mock-supabase.js';
import { readMailboxMessages, validateLiveEnvironment } from './support/live-preflight.mjs';
import { safeCleanupTargets, safeStage } from './support/safe-reporter.js';

let mock;
const firstPassword = 'FirstPassword123!';
const secondPassword = 'SecondPassword456!';

test.beforeEach(() => { mock = new MockSupabase(); });
test.afterEach(async () => { await mock.assertNoExternalCalls(); });

async function stage(name, callback) {
  return test.step(name, callback);
}

async function requestAccess(browser) {
  const context = await mock.context(browser);
  const page = await context.newPage();
  await page.goto('/');
  await stage('request', async () => {
    await page.getByRole('button', { name: 'Solicitar acceso' }).first().click();
    await page.getByLabel('Correo electrónico').fill(mock.applicant.email);
    await page.getByRole('button', { name: 'Solicitar acceso' }).last().click();
    await expect(page.getByRole('status')).toContainText('Solicitud recibida');
  });
  return { context, page };
}

async function adminRequests(browser) {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('.user-menu > button').click();
  await page.getByRole('menuitem', { name: 'Solicitudes de acceso' }).click();
  await expect(page.getByText(mock.applicant.email)).toBeVisible();
  return { context, page };
}

async function login(page, password) {
  await page.getByLabel('Correo electrónico').fill(mock.applicant.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function editedAdminDocument(browser, title) {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  const titleInput = page.getByRole('textbox', { name: 'Título', exact: true });
  await expect(titleInput).toBeEditable();
  await titleInput.fill(title);
  await expect(titleInput).toHaveValue(title);
  await expect(page.locator('[title="Cambios sin exportar"]')).toBeVisible();
  return { context, page, titleInput };
}

test('token refresh for the same account keeps the unsaved document mounted', async ({ browser }) => {
  const title = 'Borrador pendiente tras renovar sesión';
  const { context, page, titleInput } = await editedAdminDocument(browser, title);
  const readsBefore = mock.profileReads;
  const result = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.js');
    const { data, error } = await supabase.auth.refreshSession();
    return { userId: data.user?.id, error: error?.message ?? null };
  });
  expect(result).toEqual({ userId: mock.admin.id, error: null });
  await expect.poll(() => mock.tokenRefreshes).toBe(1);
  await expect.poll(() => mock.profileReads).toBeGreaterThan(readsBefore);
  await expect(titleInput).toHaveValue(title);
  await expect(page.locator('[title="Cambios sin exportar"]')).toBeVisible();
  await expect(titleInput).toBeEditable();
  await context.close();
});

test('temporary profile failure on focus keeps draft and blocks edits until revalidation', async ({ browser }) => {
  const title = 'Borrador pendiente al volver a la ventana';
  const { context, page, titleInput } = await editedAdminDocument(browser, title);
  mock.failProfileReads = 1;
  const readsBefore = mock.profileReads;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => mock.profileReads).toBeGreaterThan(readsBefore);
  await expect(titleInput).toHaveValue(title);
  await expect(page.locator('[title="Cambios sin exportar"]')).toBeVisible();
  await expect(titleInput).not.toBeEditable();
  await expect(page.getByText('Sólo lectura', { exact: true }).first()).toBeVisible();
  await page.locator('.user-menu > button').click();
  await expect(page.getByRole('menuitem', { name: 'Solicitudes de acceso' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Usuarios y roles' })).toHaveCount(0);

  const readsAfterFailure = mock.profileReads;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => mock.profileReads).toBeGreaterThan(readsAfterFailure);
  await expect(titleInput).toHaveValue(title);
  await expect(page.locator('[title="Cambios sin exportar"]')).toBeVisible();
  await expect(titleInput).toBeEditable();
  await expect(page.getByRole('menuitem', { name: 'Solicitudes de acceso' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Usuarios y roles' })).toBeVisible();
  await context.close();
});

test('failed invitation hides the estimated retry countdown during cooldown', async ({ browser }) => {
  const timestamp = new Date().toISOString();
  mock.requests.push({
    id: '22222222-2222-4222-8222-222222222222',
    email: mock.applicant.email,
    request_kind: 'registration',
    status: 'invite_failed',
    requested_at: timestamp,
    updated_at: timestamp,
    reviewed_at: timestamp,
    processing_started_at: null,
    attempts: 1,
    error: 'No se pudo completar el envío o la activación. Reintenta la invitación.',
  });
  const { context, page } = await adminRequests(browser);
  await expect(page.getByText('Falló la invitación', { exact: true })).toBeVisible();
  await expect(page.getByText(/Reintento disponible en/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar envío' })).toHaveCount(0);
  await context.close();
});

test('pending request grants no account and no invitation', async ({ browser }) => {
  const { context, page } = await requestAccess(browser);
  expect(mock.requests[0].status).toBe('pending');
  expect(mock.createdUsers).toBe(0);
  expect(mock.invitations).toBe(0);
  await page.getByRole('button', { name: 'Volver' }).click();
  await login(page, firstPassword);
  await expect(page.getByRole('alert')).toContainText('No hemos podido iniciar sesión');
  await context.close();
});

test('approval, setup, login, recovery and password replacement', async ({ browser }) => {
  const applicant = await requestAccess(browser);
  const admin = await stage('review', () => adminRequests(browser));
  await admin.page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(admin.page.getByText('Invitación enviada')).toBeVisible();
  expect(mock.invitations).toBe(1);
  expect(mock.createdUsers).toBe(1);
  await admin.context.close();
  await applicant.context.close();

  const setupContext = await mock.context(browser, mock.applicant);
  const setup = await setupContext.newPage();
  await stage('setup', async () => {
    await setup.goto(mock.setupReturn());
    await expect(setup.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible();
    await setup.getByLabel('Nueva contraseña').fill(firstPassword);
    await setup.getByLabel('Confirmar contraseña').fill(firstPassword);
    await setup.getByRole('button', { name: 'Guardar contraseña y entrar' }).click();
    await expect(setup.locator('.user-menu')).toBeVisible();
  });
  await setup.locator('.user-menu > button').click();
  await setup.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(setup.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await stage('login', async () => {
    await login(setup, firstPassword);
    await expect(setup.locator('.user-menu')).toBeVisible();
  });
  await setup.locator('.user-menu > button').click();
  await setup.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await stage('recovery', async () => {
    await setup.getByRole('button', { name: '¿Olvidaste la contraseña?' }).click();
    await setup.getByLabel('Correo electrónico').fill(mock.applicant.email);
    await setup.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
    await expect(setup.getByRole('status')).toContainText('bandeja de entrada');
    expect(mock.recoveries).toBe(1);
  });
  await setupContext.close();

  const recoveryContext = await mock.context(browser, mock.applicant);
  const recovery = await recoveryContext.newPage();
  await recovery.goto(mock.recoveryReturn());
  await expect(recovery.getByRole('heading', { name: 'Nueva contraseña' })).toBeVisible();
  await recovery.getByLabel('Nueva contraseña').fill(secondPassword);
  await recovery.getByLabel('Confirmar contraseña').fill(secondPassword);
  await recovery.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(recovery.locator('.user-menu')).toBeVisible();
  await recovery.locator('.user-menu > button').click();
  await recovery.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await login(recovery, firstPassword);
  await expect(recovery.getByRole('alert')).toContainText('No hemos podido iniciar sesión');
  await login(recovery, secondPassword);
  await expect(recovery.locator('.user-menu')).toBeVisible();
  await recoveryContext.close();
});

test('rejection sends no invitation; repeated approval remains single use', async ({ browser }) => {
  const applicant = await requestAccess(browser);
  const admin = await adminRequests(browser);
  await admin.page.getByRole('button', { name: 'Rechazar' }).click();
  await expect(admin.page.getByText('Rechazada')).toBeVisible();
  expect(mock.invitations).toBe(0);
  expect(mock.createdUsers).toBe(0);
  await admin.context.close();
  await applicant.context.close();

  const second = new MockSupabase();
  mock = second;
  const nextApplicant = await requestAccess(browser);
  const nextAdmin = await adminRequests(browser);
  await nextAdmin.page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(nextAdmin.page.getByText('Invitación enviada')).toBeVisible();
  // Repeat the same authenticated review call exactly as the UI would send it.
  const repeated = await nextAdmin.page.evaluate(async (id) => {
    const response = await fetch('https://test.supabase.invalid/functions/v1/review-access-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action: 'approve' }) });
    return response.status;
  }, mock.requests[0].id);
  expect(repeated).toBe(409);
  expect(mock.invitations).toBe(1);
  expect(mock.createdUsers).toBe(1);
  await nextAdmin.context.close();
  await nextApplicant.context.close();
});

test('safe stage diagnostics for request and review failures', async ({ browser }, testInfo) => {
  mock.failStage = 'request';
  const context = await mock.context(browser);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Solicitar acceso' }).first().click();
  await page.getByLabel('Correo electrónico').fill(mock.applicant.email);
  await page.getByRole('button', { name: 'Solicitar acceso' }).last().click();
  await expect(page.getByRole('alert')).toContainText('No se ha podido registrar la solicitud');
  await testInfo.attach('request-diagnostic.json', { body: JSON.stringify({ stage: 'request', status: 503, code: 'test failure' }), contentType: 'application/json' });
  await context.close();

  mock.failStage = 'review';
  const applicant = await requestAccess(browser);
  const admin = await adminRequests(browser);
  await admin.page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(admin.page.getByRole('alert')).toContainText('No se ha podido completar la revisión');
  await testInfo.attach('review-diagnostic.json', { body: JSON.stringify({ stage: 'review', status: 503, code: 'test failure' }), contentType: 'application/json' });
  await admin.context.close();
  await applicant.context.close();
});

test('setup, login and recovery failures show stage-specific safe errors', async ({ browser }, testInfo) => {
  const applicant = await requestAccess(browser);
  const admin = await adminRequests(browser);
  await admin.page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(admin.page.getByText('Invitación enviada')).toBeVisible();
  await applicant.context.close();
  await admin.context.close();

  mock.failStage = 'setup';
  const context = await mock.context(browser, mock.applicant);
  const page = await context.newPage();
  await page.goto(mock.setupReturn());
  await page.getByLabel('Nueva contraseña').fill(firstPassword);
  await page.getByLabel('Confirmar contraseña').fill(firstPassword);
  await page.getByRole('button', { name: 'Guardar contraseña y entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('No se ha podido guardar la contraseña');
  await testInfo.attach('setup-diagnostic.json', { body: JSON.stringify({ stage: 'setup', status: 503 }), contentType: 'application/json' });
  await context.close();

  mock.failStage = 'login';
  const loginContext = await mock.context(browser);
  const loginPage = await loginContext.newPage();
  await loginPage.goto('/');
  await login(loginPage, firstPassword);
  await expect(loginPage.getByRole('alert')).toContainText('No hemos podido iniciar sesión');
  await testInfo.attach('login-diagnostic.json', { body: JSON.stringify({ stage: 'login', status: 400 }), contentType: 'application/json' });
  await loginContext.close();

  mock.failStage = 'recovery';
  const recoveryContext = await mock.context(browser);
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto('/');
  await recoveryPage.getByRole('button', { name: '¿Olvidaste la contraseña?' }).click();
  await recoveryPage.getByLabel('Correo electrónico').fill(mock.applicant.email);
  await recoveryPage.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
  await expect(recoveryPage.getByRole('alert')).toContainText('No se ha podido enviar el enlace');
  await testInfo.attach('recovery-diagnostic.json', { body: JSON.stringify({ stage: 'recovery', status: 503 }), contentType: 'application/json' });
  await recoveryContext.close();
});

test('external requests are blocked and live preflight rejects missing configuration', async ({ browser }) => {
  expect(safeStage({ steps: [], errors: [{ message: 'review: lifecycle failed; cleanup: exact fixtures require manual review: auth_user:123' }] })).toBe('review');
  expect(safeStage({ steps: [], errors: [{ message: 'cleanup: exact fixtures require manual review: auth_user:123' }] })).toBe('cleanup');
  expect(safeStage({ steps: [], errors: [{ message: 'secret-token: leaked' }] })).toBeNull();
  const validId = '11111111-1111-4111-8111-111111111111';
  const validAddress = 'dbdocgen-test-22222222-2222-4222-8222-222222222222@mail.example.org';
  expect(safeCleanupTargets({ errors: [{ message: `review: failed; cleanup: exact fixtures require manual review: access_request:${validId}, auth_user:${validId}, access_request_lookup:${validAddress}, profile_lookup:${validAddress}` }] })).toEqual([
    `access_request:${validId}`, `access_request_lookup:${validAddress}`, `auth_user:${validId}`, `profile_lookup:${validAddress}`,
  ]);
  expect(safeCleanupTargets({ errors: [{ message: `cleanup: exact fixtures require manual review: access_request:https://evil.example/token, auth_user:${validId}?token=secret, auth_user_lookup:dbdocgen-test-22222222-2222-4222-8222-222222222222@bad..example.org, password:secret` }] })).toEqual([]);
  expect(() => validateLiveEnvironment({})).toThrow('Live preflight: missing');
  const values = {
    LIVE_E2E_ENABLED: 'yes', LIVE_STAGING_PROJECT_REF: 'abcdefghijklmnopqrst',
    LIVE_ALLOWED_PROJECT_REFS: 'abcdefghijklmnopqrst',
    LIVE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    LIVE_SUPABASE_PUBLISHABLE_KEY: 'public-test', LIVE_SERVICE_ROLE_KEY: 'server-test',
    LIVE_ADMIN_EMAIL: 'admin@example.org', LIVE_ADMIN_PASSWORD: 'test-only',
    LIVE_MAILBOX_API_URL: 'https://mailbox.example.org/messages', LIVE_MAILBOX_API_TOKEN: 'test-only',
    LIVE_MAILBOX_DOMAIN: 'test.example.org', LIVE_SMTP_CONFIRMED: 'captured',
  };
  expect(validateLiveEnvironment(values).ref).toBe('abcdefghijklmnopqrst');
  expect(() => validateLiveEnvironment({ ...values, LIVE_STAGING_PROJECT_REF: 'awrknpyiaefvsxrmbetz', LIVE_ALLOWED_PROJECT_REFS: 'awrknpyiaefvsxrmbetz', LIVE_SUPABASE_URL: 'https://awrknpyiaefvsxrmbetz.supabase.co' })).toThrow('not allowlisted or is the current project');
  expect(() => validateLiveEnvironment({ ...values, LIVE_SUPABASE_URL: 'https://other.supabase.co' })).toThrow('does not match');
  expect(() => validateLiveEnvironment({ ...values, LIVE_SMTP_CONFIRMED: 'free' })).toThrow('captured SMTP');
  const context = await mock.context(browser);
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => fetch('https://unapproved.example.invalid/account').catch(() => null));
  expect(mock.unexpected).toContain('external unapproved.example.invalid/account');
  mock.unexpected.length = 0;
  await context.close();
});

test('Mailtrap Sandbox list and body endpoints are normalized without trusting external body paths', async () => {
  const email = 'dbdocgen-test-22222222-2222-4222-8222-222222222222@example.test';
  const live = validateLiveEnvironment({
    LIVE_E2E_ENABLED: 'yes', LIVE_STAGING_PROJECT_REF: 'abcdefghijklmnopqrst',
    LIVE_ALLOWED_PROJECT_REFS: 'abcdefghijklmnopqrst',
    LIVE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    LIVE_SUPABASE_PUBLISHABLE_KEY: 'public-test', LIVE_SERVICE_ROLE_KEY: 'server-test',
    LIVE_ADMIN_EMAIL: 'admin@example.org', LIVE_ADMIN_PASSWORD: 'test-only',
    LIVE_MAILBOX_API_URL: 'https://mailtrap.io/api/accounts/123/inboxes/4943452/messages',
    LIVE_MAILBOX_API_TOKEN: 'test-only', LIVE_MAILBOX_DOMAIN: 'example.test', LIVE_SMTP_CONFIRMED: 'captured',
  });
  const calls = [];
  const message = {
    id: 777, to_email: email,
    html_path: '/api/accounts/123/sandboxes/4943452/messages/777/body.html',
    txt_path: '/api/accounts/123/sandboxes/4943452/messages/777/body.txt',
  };
  const fakeRequest = {
    async get(url, options) {
      calls.push(new URL(url));
      expect(options.headers.Authorization).toBe('Bearer test-token');
      if (url.includes('/body.html')) return { ok: () => true, status: () => 200, text: async () => '<a href="https://example.test/?auth=setup">Abrir</a>' };
      if (url.includes('/body.txt')) return { ok: () => true, status: () => 200, text: async () => 'https://example.test/?auth=setup' };
      return { ok: () => true, json: async () => [message, { id: 778, to_email: 'other@example.test' }] };
    },
  };
  const messages = await readMailboxMessages(fakeRequest, live, 'test-token', email);
  expect(messages).toEqual([{ id: '777', to: email, html: '<a href="https://example.test/?auth=setup">Abrir</a>', text: 'https://example.test/?auth=setup' }]);
  expect(calls).toHaveLength(3);
  expect(calls[0].searchParams.get('search')).toBe(email);
  expect(calls.slice(1).every((url) => url.origin === 'https://mailtrap.io')).toBe(true);
  message.html_path = '/api/testing_message_parts/opaque%2Fpart%3Dtoken/body.html';
  message.txt_path = '/api/testing_message_parts/opaque%2Fpart%3Dtoken/body.txt';
  const opaqueMessages = await readMailboxMessages(fakeRequest, live, 'test-token', email);
  expect(opaqueMessages).toHaveLength(1);
  expect(calls.at(-2).pathname).toBe(message.html_path);
  expect(calls.at(-1).pathname).toBe(message.txt_path);
  for (const maliciousPath of [
    'https://untrusted.example/api/testing_message_parts/opaque/body.html',
    'https://user:pass@mailtrap.io/api/testing_message_parts/opaque/body.html',
    '/api/testing_message_parts/opaque/body.html?token=secret',
    '/api/testing_message_parts/opaque/other/body.html',
    '/api/testing_message_parts/opaque/body.txt',
  ]) {
    message.html_path = maliciousPath;
    await expect(readMailboxMessages(fakeRequest, live, 'test-token', email)).rejects.toThrow('outside the configured sandbox');
  }
  const generic = validateLiveEnvironment({
    LIVE_E2E_ENABLED: 'yes', LIVE_STAGING_PROJECT_REF: 'abcdefghijklmnopqrst',
    LIVE_ALLOWED_PROJECT_REFS: 'abcdefghijklmnopqrst',
    LIVE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    LIVE_SUPABASE_PUBLISHABLE_KEY: 'public-test', LIVE_SERVICE_ROLE_KEY: 'server-test',
    LIVE_ADMIN_EMAIL: 'admin@example.org', LIVE_ADMIN_PASSWORD: 'test-only',
    LIVE_MAILBOX_API_URL: 'https://mailbox.example.org/messages',
    LIVE_MAILBOX_API_TOKEN: 'test-only', LIVE_MAILBOX_DOMAIN: 'example.test', LIVE_SMTP_CONFIRMED: 'captured',
  });
  const genericMessages = await readMailboxMessages({
    async get(url) {
      expect(new URL(url).searchParams.get('to')).toBe(email);
      return { ok: () => true, json: async () => ({ messages: [{ to: email, text: 'generic body' }] }) };
    },
  }, generic, 'test-token', email);
  expect(genericMessages).toHaveLength(1);
  expect(genericMessages[0].text).toBe('generic body');
});
