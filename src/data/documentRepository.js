import { isSupabaseConfigured, supabase } from '../lib/supabase';

const requireSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
};

export async function listDocuments() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('documents')
    .select('id, owner_id, ticket_id, title, status, version, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDocument(documentId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();
  if (error) throw error;
  return data;
}

export async function createDocument({ ownerId, document }) {
  const client = requireSupabase();
  const payload = {
    owner_id: ownerId,
    ticket_id: document.document?.ticketId ?? '',
    title: document.document?.title ?? 'Documento sin título',
    version: document.document?.version ?? '1.0',
    status: 'draft',
    content: document,
  };
  const { data, error } = await client.from('documents').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateDocument(documentId, document) {
  const client = requireSupabase();
  const payload = {
    ticket_id: document.document?.ticketId ?? '',
    title: document.document?.title ?? 'Documento sin título',
    version: document.document?.version ?? '1.0',
    content: document,
  };
  const { data, error } = await client
    .from('documents')
    .update(payload)
    .eq('id', documentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeDocument(documentId) {
  const client = requireSupabase();
  const { error } = await client.from('documents').delete().eq('id', documentId);
  if (error) throw error;
}
