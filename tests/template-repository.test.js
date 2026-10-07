import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplateRepository, listAvailableTemplates } from '../src/data/templateRepository.js';

function fakeClient({ tables = {}, procedures = {} } = {}) {
  const calls = [];
  return {
    calls,
    from(name) {
      calls.push(['from', name]);
      const query = {
        select: () => query,
        is: () => query,
        not: () => query,
        order: () => query,
        in: () => query,
        eq: () => query,
        then(resolve, reject) { return Promise.resolve(tables[name] ?? { data: [], error: null }).then(resolve, reject); },
      };
      return query;
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve(procedures[name] ?? { data: null, error: null });
    },
  };
}

test('sin Supabase configurado no intenta consultas ni RPC', async () => {
  const client = fakeClient();
  const repository = createTemplateRepository({ supabaseClient: client, configured: false });
  await assert.rejects(repository.listAvailableTemplates(), /Supabase configurado/);
  await assert.rejects(repository.proposeTemplate({ name: 'Prueba', structure: {} }), /Supabase configurado/);
  await assert.rejects(repository.getCurrentTemplate('version-1'), /Supabase configurado/);
  await assert.rejects(repository.getOwnCurrentTemplate('version-1'), /Supabase configurado/);
  await assert.rejects(repository.deleteOwnProposal('version-1'), /Supabase configurado/);
  await assert.rejects(repository.hideOwnVersion('version-1'), /Supabase configurado/);
  await assert.rejects(listAvailableTemplates(), /Supabase configurado/);
  assert.deepEqual(client.calls, []);
});

test('catálogo vacío y catálogo aprobado se listan correctamente', async () => {
  const emptyClient = fakeClient();
  assert.deepEqual(await createTemplateRepository({ supabaseClient: emptyClient, configured: true }).listAvailableTemplates(), []);
  assert.deepEqual(emptyClient.calls, [['from', 'document_templates']]);

  const client = fakeClient({ tables: {
    document_templates: { data: [
      { id: 'template-1', published_version_id: 'version-1' },
      { id: 'template-2', published_version_id: 'version-2' },
    ], error: null },
    document_template_versions: { data: [
      { id: 'version-1', state: 'approved', name: 'Vigente' },
      { id: 'version-2', state: 'pending', name: 'No publicada' },
    ], error: null },
  } });
  const repository = createTemplateRepository({ supabaseClient: client, configured: true });
  assert.deepEqual(await repository.listAvailableTemplates(), [
    { id: 'template-1', published_version_id: 'version-1', version: { id: 'version-1', state: 'approved', name: 'Vigente' } },
  ]);
});

test('proponer, revisar, retirar y comprobar vigencia usan RPC con sus argumentos', async () => {
  const structure = { schemaVersion: 1 };
  const client = fakeClient({ procedures: {
    template_propose: { data: 'version-3', error: null },
    template_review: { data: null, error: null },
    template_retire: { data: null, error: null },
    template_current: { data: structure, error: null },
  } });
  const repository = createTemplateRepository({ supabaseClient: client, configured: true });
  assert.equal(await repository.proposeTemplate({ templateId: 'template-1', name: 'Nueva', description: 'Descripción', category: 'Batch', structure }), 'version-3');
  await repository.reviewTemplate('version-3', 'approved', '');
  await repository.retireTemplate('template-1');
  assert.deepEqual(await repository.getCurrentTemplate('version-3'), structure);
  assert.deepEqual(client.calls, [
    ['rpc', 'template_propose', { p_template_id: 'template-1', p_name: 'Nueva', p_description: 'Descripción', p_category: 'Batch', p_structure: structure }],
    ['rpc', 'template_review', { p_version_id: 'version-3', p_action: 'approved', p_reason: '' }],
    ['rpc', 'template_retire', { p_template_id: 'template-1' }],
    ['rpc', 'template_current', { p_version_id: 'version-3' }],
  ]);
});

test('errores simulados se propagan al listar, proponer y comprobar vigencia', async () => {
  const failure = new Error('error simulado');
  const client = fakeClient({
    tables: { document_templates: { data: null, error: failure } },
    procedures: {
      template_propose: { data: null, error: failure },
      template_current: { data: null, error: failure },
    },
  });
  const repository = createTemplateRepository({ supabaseClient: client, configured: true });
  await assert.rejects(repository.listAvailableTemplates(), failure);
  await assert.rejects(repository.proposeTemplate({ name: 'Prueba', structure: {} }), failure);
  await assert.rejects(repository.getCurrentTemplate('version-1'), failure);
});

test('lectura privada y borrado de propuesta propia invocan RPC autenticadas', async () => {
  const structure = { schemaVersion: 1, sections: [] };
  const client = fakeClient({ procedures: {
    template_own_current: { data: structure, error: null },
    template_delete_proposal: { data: null, error: null },
    template_hide_own_version: { data: null, error: null },
  } });
  const repository = createTemplateRepository({ supabaseClient: client, configured: true });
  assert.deepEqual(await repository.getOwnCurrentTemplate('version-own'), structure);
  await repository.deleteOwnProposal('version-own', 'pending');
  await repository.hideOwnVersion('version-own');
  assert.deepEqual(client.calls, [
    ['rpc', 'template_own_current', { p_version_id: 'version-own' }],
    ['rpc', 'template_delete_proposal', { p_version_id: 'version-own', p_expected_state: 'pending' }],
    ['rpc', 'template_hide_own_version', { p_version_id: 'version-own' }],
  ]);
});

test('fallos de permiso y conflicto de RPC privadas se propagan sin sustitución local', async () => {
  const denied = new Error('forbidden');
  const conflict = new Error('template_delete_conflict');
  const client = fakeClient({ procedures: {
    template_own_current: { data: null, error: denied },
    template_delete_proposal: { data: null, error: conflict },
    template_hide_own_version: { data: null, error: conflict },
  } });
  const repository = createTemplateRepository({ supabaseClient: client, configured: true });
  await assert.rejects(repository.getOwnCurrentTemplate('foreign'), denied);
  await assert.rejects(repository.deleteOwnProposal('approved', 'pending'), conflict);
  await assert.rejects(repository.hideOwnVersion('hidden'), conflict);
});
