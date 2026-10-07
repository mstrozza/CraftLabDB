const currentProject = 'awrknpyiaefvsxrmbetz';
import { createHash } from 'node:crypto';

const mailtrapLegacyPath = /^\/api\/accounts\/([1-9]\d*)\/(?:inboxes|sandboxes)\/([1-9]\d*)\/messages$/;
const mailtrapCurrentPath = /^\/api\/sandboxes\/([1-9]\d*)\/messages$/;

function mailtrapConfig(mailbox) {
  if (mailbox.hostname !== 'mailtrap.io') {
    if (mailbox.hostname.endsWith('.mailtrap.io')) throw new Error('Live preflight: use the mailtrap.io Sandbox read API');
    return null;
  }
  const legacy = mailtrapLegacyPath.exec(mailbox.pathname);
  const current = mailtrapCurrentPath.exec(mailbox.pathname);
  if (!legacy && !current) throw new Error('Live preflight: Mailtrap URL must address one sandbox message list');
  return { accountId: legacy?.[1] ?? null, inboxId: legacy?.[2] ?? current[1] };
}

function exactRecipient(message, email) {
  const recipients = [message.to_email, message.to];
  return recipients.some((value) => {
    if (typeof value === 'string') return value.toLowerCase() === email.toLowerCase();
    if (Array.isArray(value)) return value.some((item) => (typeof item === 'string' ? item : item?.email)?.toLowerCase() === email.toLowerCase());
    return value?.email?.toLowerCase() === email.toLowerCase();
  });
}

function mailtrapBodyUrl(mailbox, config, message, extension) {
  const id = String(message.id ?? '');
  if (!/^[1-9]\d*$/.test(id)) throw new Error('delivery: invalid Mailtrap message id');
  const supplied = extension === 'html' ? message.html_path : message.txt_path;
  const fallback = `${mailbox.pathname}/${id}/body.${extension}`;
  const candidate = new URL(supplied || fallback, mailbox.origin);
  const account = config.accountId;
  const expected = account
    ? new RegExp(`^/api/accounts/${account}/(?:inboxes|sandboxes)/${config.inboxId}/messages/${id}/body\\.${extension}$`)
    : new RegExp(`^/api/(?:sandboxes/${config.inboxId}|accounts/[1-9]\\d*/sandboxes/${config.inboxId})/messages/${id}/body\\.${extension}$`);
  // Mailtrap also returns signed, opaque part paths in its message list. The
  // single encoded segment is never interpreted as an arbitrary URL or path.
  const opaquePart = new RegExp(`^/api/testing_message_parts/[^/]+/body\\.${extension}$`);
  if (candidate.origin !== mailbox.origin || candidate.username || candidate.password
      || candidate.search || candidate.hash
      || (!expected.test(candidate.pathname) && !opaquePart.test(candidate.pathname))) {
    throw new Error('delivery: Mailtrap body path is outside the configured sandbox');
  }
  return candidate.toString();
}

async function readMailtrapBody(request, live, message, extension, token) {
  const url = mailtrapBodyUrl(live.mailbox, live.mailtrap, message, extension);
  const response = await request.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 });
  if (response.status() === 404) return '';
  if (!response.ok()) throw new Error(`delivery: Mailtrap body status ${response.status()}`);
  return response.text();
}

export async function readMailboxMessages(request, live, token, email) {
  const url = new URL(live.mailbox);
  url.searchParams.set(live.mailtrap ? 'search' : 'to', email);
  const response = await request.get(url.toString(), { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 });
  if (!response.ok()) throw new Error(`delivery: mailbox API status ${response.status()}`);
  const data = await response.json();
  const messages = live.mailtrap ? data : data.messages;
  if (!Array.isArray(messages)) throw new Error('delivery: mailbox API returned an unexpected message list');
  const matching = messages.filter((message) => exactRecipient(message, email));
  return Promise.all(matching.map(async (message) => {
    const id = String(message.id ?? createHash('sha256').update(JSON.stringify(message)).digest('hex'));
    if (!live.mailtrap) return { id, to: email, text: message.text ?? '', html: message.html ?? '' };
    const [html, text] = await Promise.all([
      message.html || readMailtrapBody(request, live, message, 'html', token),
      message.text || readMailtrapBody(request, live, message, 'txt', token),
    ]);
    return { id, to: email, html, text };
  }));
}

export function validateLiveEnvironment(env) {
  const required = [
    'LIVE_E2E_ENABLED', 'LIVE_STAGING_PROJECT_REF', 'LIVE_ALLOWED_PROJECT_REFS',
    'LIVE_SUPABASE_URL', 'LIVE_SUPABASE_PUBLISHABLE_KEY', 'LIVE_SERVICE_ROLE_KEY',
    'LIVE_ADMIN_EMAIL', 'LIVE_ADMIN_PASSWORD', 'LIVE_MAILBOX_API_URL',
    'LIVE_MAILBOX_API_TOKEN', 'LIVE_MAILBOX_DOMAIN', 'LIVE_SMTP_CONFIRMED',
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Live preflight: missing ${missing.join(', ')}`);
  if (env.LIVE_E2E_ENABLED !== 'yes' || env.LIVE_SMTP_CONFIRMED !== 'captured') {
    throw new Error('Live preflight: explicit opt-in and captured SMTP confirmation required');
  }
  const ref = env.LIVE_STAGING_PROJECT_REF.trim();
  const allowlist = env.LIVE_ALLOWED_PROJECT_REFS.split(',').map((value) => value.trim());
  if (!/^[a-z0-9]{20}$/.test(ref) || ref === currentProject || !allowlist.includes(ref)) {
    throw new Error('Live preflight: staging project is not allowlisted or is the current project');
  }
  const url = new URL(env.LIVE_SUPABASE_URL);
  if (url.protocol !== 'https:' || url.origin !== `https://${ref}.supabase.co`) {
    throw new Error('Live preflight: Supabase URL does not match staging ref');
  }
  const mailbox = new URL(env.LIVE_MAILBOX_API_URL);
  if (mailbox.protocol !== 'https:' || !mailbox.hostname || mailbox.hostname.endsWith('.supabase.co')
      || mailbox.username || mailbox.password || mailbox.search || mailbox.hash) {
    throw new Error('Live preflight: capturable mailbox API must use a separate HTTPS host');
  }
  const mailtrap = mailtrapConfig(mailbox);
  const domain = env.LIVE_MAILBOX_DOMAIN.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('Live preflight: invalid mailbox domain');
  if (!env.LIVE_ADMIN_EMAIL.includes('@') || env.LIVE_ADMIN_EMAIL.toLowerCase().endsWith(`@${domain}`)) {
    throw new Error('Live preflight: dedicated administrator must be separate from test mailbox');
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') && /SERVICE_ROLE|ADMIN_PASSWORD|MAILBOX_API_TOKEN/i.test(key)) {
      throw new Error('Live preflight: privileged value must not use a VITE_ variable');
    }
  }
  return { ref, url: url.origin, publicKey: env.LIVE_SUPABASE_PUBLISHABLE_KEY, mailbox, domain, mailtrap };
}
