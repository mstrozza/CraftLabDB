import { expect } from '@playwright/test';

const mockHost = 'test.supabase.invalid';
const origin = 'http://localhost:5187';
const now = () => new Date().toISOString();
const userId = '33333333-3333-4333-8333-333333333333';
const adminId = '11111111-1111-4111-8111-111111111111';

function user(id, email) {
  return { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { full_name: id === adminId ? 'Admin Test' : 'Cuenta Test' }, created_at: now() };
}

function session(account) {
  return { access_token: `local-access-${account.id}`, refresh_token: `local-refresh-${account.id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: account };
}

export class MockSupabase {
  constructor() {
    this.admin = user(adminId, 'admin@test.invalid');
    this.applicant = user(userId, 'journey@test.invalid');
    this.profiles = new Map([[adminId, this.profile(this.admin, 'admin', true)]]);
    this.requests = [];
    this.password = null;
    this.invitations = 0;
    this.recoveries = 0;
    this.createdUsers = 0;
    this.profileReads = 0;
    this.failProfileReads = 0;
    this.tokenRefreshes = 0;
    this.unexpected = [];
    this.failStage = null;
    this.templates = [];
    this.templateVersions = [];
    this.templateEvents = [];
    this.templateReadDelay = 0;
  }

  profile(account, role, active) {
    return { id: account.id, email: account.email, display_name: account.user_metadata.full_name, role, is_active: active, has_ever_been_active: active, created_at: now(), updated_at: now() };
  }

  setupReturn() {
    if (this.invitations !== 1) throw new Error('setup return requires one approved invitation');
    return '/?auth=setup';
  }

  recoveryReturn() {
    if (this.recoveries !== 1) throw new Error('recovery return requires one recovery request');
    return '/?auth=recovery';
  }

  async context(browser, account = null) {
    const context = await browser.newContext();
    await context.addInitScript(({ storedSession }) => {
      if (location.hostname === 'localhost' && storedSession) localStorage.setItem('sb-test-auth-token', JSON.stringify(storedSession));
    }, { storedSession: account ? session(account) : null });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === mockHost) return this.handle(route, url);
      if (url.origin === origin) return route.continue();
      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      this.unexpected.push(`external ${url.hostname}${url.pathname}`);
      await route.abort('blockedbyclient');
    });
    return context;
  }

  answer(route, body, status = 200, extraHeaders = {}) {
    return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...extraHeaders }, body: JSON.stringify(body) });
  }

  async handle(route, url) {
    const request = route.request();
    const path = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return this.answer(route, {}, 200, { 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' });
    const fail = (stage) => this.failStage === stage;
    const error = (message = 'test failure', status = 503) => this.answer(route, { error: message, message }, status);
    const actorId = request.headers().authorization?.replace(/^Bearer local-access-/, '') ?? null;
    const actor = this.profiles.get(actorId);
    const canEditTemplate = actor?.is_active && ['admin', 'editor'].includes(actor.role);

    if (path === '/functions/v1/request-access' && method === 'POST') {
      if (fail('request')) return error();
      const { email } = request.postDataJSON();
      if (!this.requests.some((item) => item.email === email)) this.requests.push({ id: '22222222-2222-4222-8222-222222222222', email, request_kind: 'registration', status: 'pending', requested_at: now(), updated_at: now(), reviewed_at: null, processing_started_at: null, attempts: 0, error: null });
      return this.answer(route, { ok: true });
    }
    if (path === '/functions/v1/review-access-request' && method === 'POST') {
      if (fail('review')) return error();
      const { id, action } = request.postDataJSON();
      const item = this.requests.find((entry) => entry.id === id);
      if (!item || item.status !== 'pending') return this.answer(route, { error: 'already reviewed' }, 409);
      item.status = action === 'approve' ? 'invited' : 'rejected';
      item.reviewed_at = now();
      item.updated_at = now();
      if (action === 'approve') {
        this.profiles.set(userId, this.profile(this.applicant, 'editor', true));
        this.createdUsers += 1;
        this.invitations += 1;
      }
      return this.answer(route, { ok: true, status: item.status });
    }
    if (path === '/rest/v1/access_requests' && method === 'GET') return this.answer(route, [...this.requests].reverse());
    if (path === '/rest/v1/document_templates' && method === 'GET') {
      if (this.templateReadDelay) await new Promise((resolve) => setTimeout(resolve, this.templateReadDelay));
      if (fail('template-list')) return error('catalog unavailable', 400);
      const idFilter = url.searchParams.get('id')?.replace('in.(', '').replace(')', '').split(',');
      const entries = this.templates.filter((item) => (!url.searchParams.has('retired_at') || item.retired_at === null)
        && (!url.searchParams.has('published_version_id') || item.published_version_id !== null)
        && (!idFilter || idFilter.includes(item.id)));
      return this.answer(route, entries);
    }
    if (path === '/rest/v1/document_template_versions' && method === 'GET') {
      if (fail('template-list')) return error('catalog unavailable', 400);
      const idFilter = url.searchParams.get('id')?.replace('in.(', '').replace(')', '').split(',');
      const state = url.searchParams.get('state')?.replace('eq.', '');
      const author = url.searchParams.get('author_id')?.replace('eq.', '');
      return this.answer(route, this.templateVersions.filter((item) => (!idFilter || idFilter.includes(item.id)) && (!state || item.state === state) && (!author || item.author_id === author) && (!url.searchParams.has('deleted_at') || item.deleted_at == null) && (!url.searchParams.has('author_hidden_at') || item.author_hidden_at == null)));
    }
    if (path === '/rest/v1/rpc/template_propose' && method === 'POST') {
      if (fail('template-propose')) return error('proposal unavailable');
      if (!canEditTemplate) return error('forbidden', 403);
      const payload = request.postDataJSON();
      const templateId = payload.p_template_id || `template-${this.templates.length + 1}`;
      let identity = this.templates.find((item) => item.id === templateId);
      if (!identity) {
        identity = { id: templateId, owner_id: actorId, template_type: payload.p_structure.type, root_kind: payload.p_structure.root?.rootKind ?? null,
          section_id: payload.p_structure.root?.sectionId ?? null, root_slot: payload.p_structure.root?.rootSlot ?? null, published_version_id: null, retired_at: null };
        this.templates.push(identity);
      }
      const id = `version-${this.templateVersions.length + 1}`;
      this.templateVersions.push({ id, template_id: templateId, revision: this.templateVersions.filter((item) => item.template_id === templateId).length + 1,
        name: payload.p_name, description: payload.p_description, category: payload.p_category, structure: payload.p_structure, state: 'pending', author_id: actorId, review_reason: null, deleted_at: null, author_hidden_at: null, created_at: now() });
      this.templateEvents.push({ version_id: id, actor_id: actorId, action: 'proposed' });
      return this.answer(route, id);
    }
    if (path === '/rest/v1/rpc/template_review' && method === 'POST') {
      const payload = request.postDataJSON();
      const version = this.templateVersions.find((item) => item.id === payload.p_version_id);
      if (actor?.role !== 'admin' || !actor?.is_active) return error('forbidden', 403);
      if (!version || version.state !== 'pending' || version.deleted_at) return this.answer(route, { message: 'review conflict' }, 409);
      version.state = payload.p_action;
      version.review_reason = payload.p_action === 'rejected' ? payload.p_reason?.trim() || null : null;
      if (version.state === 'approved') this.templates.find((item) => item.id === version.template_id).published_version_id = version.id;
      this.templateEvents.push({ version_id: version.id, actor_id: actorId, action: payload.p_action, reason: version.review_reason });
      return this.answer(route, null);
    }
    if (path === '/rest/v1/rpc/template_current' && method === 'POST') {
      const version = this.templateVersions.find((item) => item.id === request.postDataJSON().p_version_id);
      const identity = this.templates.find((item) => item.id === version?.template_id);
      if (!canEditTemplate || !version || !identity || identity.retired_at || version.deleted_at || identity.published_version_id !== version.id) return this.answer(route, { message: 'template unavailable' }, 409);
      return this.answer(route, version.structure);
    }
    if (path === '/rest/v1/rpc/template_own_current' && method === 'POST') {
      if (fail('template-own-current')) return error('private template unavailable');
      const version = this.templateVersions.find((item) => item.id === request.postDataJSON().p_version_id);
      const identity = this.templates.find((item) => item.id === version?.template_id);
      if (!canEditTemplate || !version || !identity || version.author_id !== actorId || version.deleted_at || version.author_hidden_at) return error('template_not_available', 409);
      return this.answer(route, version.structure);
    }
    if (path === '/rest/v1/rpc/template_hide_own_version' && method === 'POST') {
      if (fail('template-hide')) return error('hide unavailable');
      const version = this.templateVersions.find((item) => item.id === request.postDataJSON().p_version_id);
      if (!canEditTemplate || !version || version.author_id !== actorId) return error('forbidden', 403);
      if (version.deleted_at || version.author_hidden_at) return error('template_hide_conflict', 409);
      version.author_hidden_at = now();
      this.templateEvents.push({ version_id: version.id, actor_id: actorId, action: 'hidden' });
      return this.answer(route, null);
    }
    if (path === '/rest/v1/rpc/template_delete_proposal' && method === 'POST') {
      if (fail('template-delete')) return error('delete unavailable');
      const payload = request.postDataJSON();
      const version = this.templateVersions.find((item) => item.id === payload.p_version_id);
      const identity = this.templates.find((item) => item.id === version?.template_id);
      if (!canEditTemplate || !version || !identity || version.author_id !== actorId) return error('forbidden', 403);
      if (version.deleted_at || version.author_hidden_at || !['pending', 'rejected'].includes(payload.p_expected_state) || version.state !== payload.p_expected_state || identity.published_version_id === version.id) return error('template_delete_conflict', 409);
      version.deleted_at = now();
      this.templateEvents.push({ version_id: version.id, actor_id: actorId, action: 'deleted' });
      return this.answer(route, null);
    }
    if (path === '/rest/v1/rpc/template_retire' && method === 'POST') {
      const identity = this.templates.find((item) => item.id === request.postDataJSON().p_template_id);
      if (identity) identity.retired_at = now();
      return this.answer(route, null);
    }
    if (path === '/rest/v1/profiles' && method === 'GET') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (id) {
        this.profileReads += 1;
        if (this.failProfileReads > 0) {
          this.failProfileReads -= 1;
          return error('profile temporarily unavailable');
        }
      }
      const data = id ? this.profiles.get(id) : [...this.profiles.values()];
      return this.answer(route, data ?? null);
    }
    if (path === '/rest/v1/documents' && method === 'GET') return this.answer(route, []);
    if (path === '/auth/v1/user' && method === 'GET') {
      const id = request.headers().authorization?.includes(adminId) ? adminId : userId;
      return this.answer(route, id === adminId ? this.admin : this.applicant);
    }
    if (path === '/auth/v1/user' && method === 'PUT') {
      if (fail(url.searchParams.get('stage') || 'setup') || fail('password')) return error();
      this.password = request.postDataJSON().password;
      return this.answer(route, { user: this.applicant });
    }
    if (path === '/auth/v1/token' && method === 'POST') {
      const payload = request.postDataJSON();
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const account = payload.refresh_token === `local-refresh-${adminId}` ? this.admin
          : payload.refresh_token === `local-refresh-${userId}` ? this.applicant : null;
        if (!account) return this.answer(route, { error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
        this.tokenRefreshes += 1;
        return this.answer(route, session(account));
      }
      const email = payload.email;
      const password = payload.password;
      if (fail('login')) return this.answer(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      if (email === this.admin.email && password === 'AdminTestPassword1!') return this.answer(route, session(this.admin));
      if (email === this.applicant.email && this.profiles.has(userId) && password === this.password) return this.answer(route, session(this.applicant));
      return this.answer(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
    }
    if (path === '/auth/v1/recover' && method === 'POST') {
      if (fail('recovery')) return error();
      this.recoveries += 1;
      return this.answer(route, {});
    }
    if (path === '/auth/v1/logout' && method === 'POST') return this.answer(route, {}, 204);
    this.unexpected.push(`${method} ${path}`);
    return this.answer(route, { error: 'Unexpected mocked Supabase request' }, 599);
  }

  async assertNoExternalCalls() {
    expect(this.unexpected, 'Supabase harness must fail closed').toEqual([]);
  }
}
