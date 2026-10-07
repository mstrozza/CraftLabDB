import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export function createTemplateRepository({ supabaseClient = supabase, configured = isSupabaseConfigured } = {}) {
  const client = () => {
    if (!configured || !supabaseClient) throw new Error('El catálogo requiere Supabase configurado.');
    return supabaseClient;
  };

  async function listAvailableTemplates() {
    const { data: identities, error } = await client().from('document_templates')
      .select('id, owner_id, template_type, root_kind, section_id, root_slot, published_version_id, retired_at')
      .is('retired_at', null).not('published_version_id', 'is', null).order('created_at', { ascending: false });
    if (error) throw error;
    if (!identities?.length) return [];
    const versions = unwrap(await client().from('document_template_versions')
      .select('id, template_id, revision, name, description, category, structure, state, author_id, created_at')
      .in('id', identities.map((item) => item.published_version_id)).is('deleted_at', null));
    const byId = new Map(versions.map((item) => [item.id, item]));
    return identities.flatMap((identity) => {
      const version = byId.get(identity.published_version_id);
      return version?.state === 'approved' ? [{ ...identity, version }] : [];
    });
  }

  async function listOwnTemplates(userId) {
    if (!userId) throw new Error('Se requiere una sesión activa.');
    const versions = unwrap(await client().from('document_template_versions')
      .select('id, template_id, revision, name, description, category, structure, state, author_id, review_reason, created_at')
      .eq('author_id', userId).is('deleted_at', null).is('author_hidden_at', null).order('created_at', { ascending: false }));
    if (!versions.length) return [];
    const identities = unwrap(await client().from('document_templates')
      .select('id, owner_id, template_type, root_kind, section_id, root_slot, published_version_id, retired_at')
      .in('id', [...new Set(versions.map((item) => item.template_id))]));
    const byId = new Map(identities.map((item) => [item.id, item]));
    return versions.map((version) => ({ ...byId.get(version.template_id), version }));
  }

  async function listPendingTemplates() {
    const versions = unwrap(await client().from('document_template_versions')
      .select('id, template_id, revision, name, description, category, structure, state, author_id, created_at')
      .eq('state', 'pending').is('deleted_at', null).order('created_at', { ascending: true }));
    if (!versions.length) return [];
    const identities = unwrap(await client().from('document_templates')
      .select('id, owner_id, template_type, root_kind, section_id, root_slot, published_version_id, retired_at')
      .in('id', [...new Set(versions.map((item) => item.template_id))]));
    const byId = new Map(identities.map((item) => [item.id, item]));
    return versions.flatMap((version) => byId.has(version.template_id) ? [{ ...byId.get(version.template_id), version }] : []);
  }

  async function proposeTemplate({ templateId = null, name, description, category, structure }) {
    return unwrap(await client().rpc('template_propose', {
      p_template_id: templateId, p_name: name, p_description: description, p_category: category, p_structure: structure,
    }));
  }

  async function reviewTemplate(versionId, action, reason = '') {
    return unwrap(await client().rpc('template_review', { p_version_id: versionId, p_action: action, p_reason: reason }));
  }

  async function retireTemplate(templateId) {
    return unwrap(await client().rpc('template_retire', { p_template_id: templateId }));
  }

  async function getCurrentTemplate(versionId) {
    return unwrap(await client().rpc('template_current', { p_version_id: versionId }));
  }

  async function getOwnCurrentTemplate(versionId) {
    return unwrap(await client().rpc('template_own_current', { p_version_id: versionId }));
  }

  async function deleteOwnProposal(versionId, expectedState) {
    return unwrap(await client().rpc('template_delete_proposal', { p_version_id: versionId, p_expected_state: expectedState }));
  }

  async function hideOwnVersion(versionId) {
    return unwrap(await client().rpc('template_hide_own_version', { p_version_id: versionId }));
  }

  return { listAvailableTemplates, listOwnTemplates, listPendingTemplates, proposeTemplate, reviewTemplate, retireTemplate, getCurrentTemplate, getOwnCurrentTemplate, deleteOwnProposal, hideOwnVersion };
}

const repository = createTemplateRepository();
export const { listAvailableTemplates, listOwnTemplates, listPendingTemplates, proposeTemplate, reviewTemplate, retireTemplate, getCurrentTemplate, getOwnCurrentTemplate, deleteOwnProposal, hideOwnVersion } = repository;
