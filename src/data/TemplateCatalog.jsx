import { useEffect, useMemo, useRef, useState } from 'react';
import { allTemplateNodeIds, templateNodeState, toTemplateStructure, toggleTemplateNode } from './templateStructure';
import { hideOwnVersion, listAvailableTemplates, listOwnTemplates, listPendingTemplates, proposeTemplate, reviewTemplate, retireTemplate } from './templateRepository';

const labels = { section: 'Sección', technicalProfile: 'Perfil técnico', technicalSubsection: 'Subapartado técnico', dataSubsection: 'Subapartado de datos', dataSource: 'Tabla / fichero / datos', standardTable: 'Tabla' };

function TreeNode({ item, selection, onToggle, fixedIds, depth = 0, parentChecked = true }) {
  const { checked, indeterminate } = templateNodeState(item, selection);
  return <div className="template-tree-node" style={{ '--indent': `${4 + depth * 18}px` }}>
    <label><input type="checkbox" checked={checked} ref={(input) => { if (input) input.indeterminate = indeterminate; }}
      aria-label={`${labels[item.kind]} ${item.label}`} aria-checked={indeterminate ? 'mixed' : checked}
      disabled={!parentChecked || fixedIds.has(item.templateNodeId)} onChange={(event) => onToggle(item.templateNodeId, event.target.checked)} />
      <span><strong>{item.label || labels[item.kind]}</strong><small>{labels[item.kind]}</small></span></label>
    {item.children.map((child) => <TreeNode key={child.templateNodeId} item={child} selection={selection} onToggle={onToggle} fixedIds={fixedIds} depth={depth + 1} parentChecked={parentChecked && checked} />)}
  </div>;
}

const collectRoots = (structure) => {
  const roots = [];
  const visit = (item) => {
    if (['section', 'technicalSubsection', 'dataSubsection', 'dataSource', 'standardTable'].includes(item.kind)) roots.push(item);
    item.children.forEach(visit);
  };
  structure.sections.forEach(visit);
  return roots;
};

const fixedTemplateIds = (structure) => {
  const fixed = new Set();
  if (structure?.type !== 'module') return fixed;
  structure.sections.forEach((section) => fixed.add(section.templateNodeId));
  fixed.add(structure.root.rootNodeId);
  if (structure.root.rootKind === 'dataSource') fixed.add(structure.sections[0].children[0].templateNodeId);
  return fixed;
};

const selectedStructure = (structure, selection) => {
  const valid = new Set(allTemplateNodeIds(structure));
  if ([...selection].some((id) => !valid.has(id))) throw new Error('Selección de propuesta no válida.');
  const prune = (node, parentIncluded = true) => {
    if (!selection.has(node.templateNodeId)) return null;
    if (!parentIncluded) throw new Error('Falta un contenedor obligatorio.');
    return { ...node, children: node.children.map((child) => prune(child)).filter(Boolean) };
  };
  const sections = structure.sections.map((section) => prune(section)).filter(Boolean);
  if (!sections.length) throw new Error('Selecciona al menos una sección.');
  const root = structure.root;
  if (root && [...fixedTemplateIds(structure)].some((id) => !selection.has(id))) throw new Error('La raíz y los contenedores del módulo son obligatorios.');
  return { ...structure, sections };
};

export default function TemplateCatalog({ document, user, role, canEdit, configured, initialVersionId = null, onCreate }) {
  const [tab, setTab] = useState('available');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selection, setSelection] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [proposing, setProposing] = useState(false);
  const [revisionOf, setRevisionOf] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('full');
  const [rootNodeId, setRootNodeId] = useState('');
  const [proposalSelection, setProposalSelection] = useState(new Set());
  const [reason, setReason] = useState('');
  const loadVersion = useRef(0);
  const initialSelectionPending = useRef(initialVersionId);
  const fullStructure = useMemo(() => toTemplateStructure(document, { type: 'full' }), [document]);
  const rootOptions = useMemo(() => collectRoots(fullStructure), [fullStructure]);
  const eligibleRoots = revisionOf?.template_type === 'module'
    ? rootOptions.filter((item) => {
      try {
        const root = toTemplateStructure(document, { type: 'module', rootNodeId: item.templateNodeId }).root;
        return root.rootKind === revisionOf.root_kind && root.sectionId === revisionOf.section_id && root.rootSlot === revisionOf.root_slot;
      } catch { return false; }
    }) : rootOptions;
  const fixedIds = fixedTemplateIds(selected?.version?.structure);

  const refresh = async (activeTab = tab) => {
    if (!configured) return;
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const next = activeTab === 'available' ? await listAvailableTemplates()
        : activeTab === 'mine' ? await listOwnTemplates(user?.id) : await listPendingTemplates();
      if (version === loadVersion.current) {
        setRows(next);
        const initial = activeTab === 'available' ? next.find((row) => row.version.id === initialSelectionPending.current) : null;
        if (initial) {
          initialSelectionPending.current = null;
          setSelected(initial);
          setSelection(new Set(allTemplateNodeIds(initial.version.structure)));
        } else setSelected((current) => next.find((row) => row.version.id === current?.version?.id) ?? null);
      }
    } catch (failure) { if (version === loadVersion.current) setError(failure.message || 'No se pudo cargar el catálogo.'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  };
  useEffect(() => {
    void refresh(tab);
    return () => { loadVersion.current += 1; };
  }, [tab, configured, user?.id]);
  const switchTab = (nextTab) => {
    loadVersion.current += 1;
    setRows([]); setSelected(null); setSelection(new Set()); setLoading(true); setProposing(false); setTab(nextTab);
    if (nextTab === tab) void refresh(nextTab);
  };

  const choose = (item) => {
    setSelected(item); setNotice(''); setError('');
    setSelection(new Set(allTemplateNodeIds(item.version.structure)));
  };
  const beginProposal = (item = null) => {
    setRevisionOf(item); setProposing(true); setSelected(null); setNotice(''); setError('');
    setName(item?.version?.name ?? ''); setDescription(item?.version?.description ?? ''); setCategory(item?.version?.category ?? '');
    setType(item?.template_type ?? 'full');
    if (item?.template_type === 'module') {
      const match = rootOptions.find((root) => {
        const candidate = toTemplateStructure(document, { type: 'module', rootNodeId: root.templateNodeId }).root;
        return candidate.rootKind === item.root_kind && candidate.sectionId === item.section_id && candidate.rootSlot === item.root_slot;
      });
      setRootNodeId(match?.templateNodeId ?? '');
    } else setRootNodeId('');
  };
  const proposedStructure = useMemo(() => {
    try { return type === 'full' ? fullStructure : rootNodeId ? toTemplateStructure(document, { type: 'module', rootNodeId }) : null; }
    catch { return null; }
  }, [document, fullStructure, type, rootNodeId]);
  useEffect(() => { setProposalSelection(new Set(proposedStructure ? allTemplateNodeIds(proposedStructure) : [])); }, [proposedStructure]);
  const proposalSectionCount = proposedStructure?.sections.filter((item) => proposalSelection.has(item.templateNodeId)).length ?? 0;
  const submitProposal = async () => {
    if (!proposedStructure || !name.trim() || proposalSectionCount === 0) return;
    setBusy(true); setError('');
    try {
      const structure = selectedStructure(proposedStructure, proposalSelection);
      await proposeTemplate({ templateId: revisionOf?.id, name: name.trim(), description, category, structure });
      setRevisionOf(null); switchTab('mine'); setNotice('Propuesta enviada para revisión.');
    } catch (failure) { setError(failure.message || 'No se pudo enviar la propuesta.'); }
    finally { setBusy(false); }
  };
  const review = async (action) => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await reviewTemplate(selected.version.id, action, reason);
      setNotice(action === 'approved' ? 'Plantilla aprobada.' : 'Plantilla rechazada.');
      setSelected(null); setReason(''); await refresh(tab);
    } catch (failure) { setError(failure.message || 'No se pudo completar la revisión.'); }
    finally { setBusy(false); }
  };
  const retire = async () => {
    if (!selected || !window.confirm('¿Retirar esta plantilla del catálogo?')) return;
    setBusy(true); setError('');
    try { await retireTemplate(selected.id); setSelected(null); setNotice('Plantilla retirada.'); await refresh(tab); }
    catch (failure) { setError(failure.message || 'No se pudo retirar la plantilla.'); }
    finally { setBusy(false); }
  };
  const hideProposal = async () => {
    if (!selected || !window.confirm('¿Ocultar esta versión de Mis propuestas? Seguirá disponible para revisión o en el catálogo cuando corresponda.')) return;
    setBusy(true); setError('');
    try {
      await hideOwnVersion(selected.version.id);
      setSelected(null); setNotice('Versión oculta de Mis propuestas.'); await refresh(tab);
    } catch (failure) {
      await refresh(tab);
      setError(failure.message || 'No se pudo ocultar la versión.');
    } finally { setBusy(false); }
  };
  const create = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { await onCreate(selected.version.id, selection, tab); }
    catch (failure) { setError(failure.message || 'No se pudo crear el documento.'); }
    finally { setBusy(false); }
  };
  const sectionCount = selected?.version?.structure?.sections.filter((item) => selection.has(item.templateNodeId)).length ?? 0;

  if (!configured) return <div className="template-empty" role="status">El catálogo requiere una conexión a Supabase y un perfil activo.</div>;
  return <div className="template-catalog">
    <div className="template-tabs" role="tablist" aria-label="Catálogo de plantillas">
      <button role="tab" aria-selected={tab === 'available'} className={tab === 'available' ? 'active' : ''} onClick={() => switchTab('available')}>Disponibles</button>
      {canEdit && <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => switchTab('mine')}>Mis propuestas</button>}
      {role === 'admin' && <button role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => switchTab('pending')}>Pendientes</button>}
    </div>
    {canEdit && tab === 'mine' && !proposing && <button className="text-action template-propose" type="button" onClick={() => beginProposal()}>+ Proponer plantilla</button>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    <div className="template-catalog-body">{proposing ? <div className="template-proposal">
      <h3>{revisionOf ? 'Proponer nueva versión' : 'Nueva propuesta'}</h3>
      <label>Nombre<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
      <label>Descripción<textarea value={description} maxLength={600} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Categoría<input value={category} maxLength={80} onChange={(event) => setCategory(event.target.value)} /></label>
      <label>Tipo<select value={type} disabled={Boolean(revisionOf)} onChange={(event) => { setType(event.target.value); setRootNodeId(''); }}><option value="full">Completa</option><option value="module">Módulo</option></select></label>
      {type === 'module' && <label>Raíz del módulo<select value={rootNodeId} onChange={(event) => setRootNodeId(event.target.value)}><option value="">Selecciona una raíz</option>{eligibleRoots.map((root) => <option key={root.templateNodeId} value={root.templateNodeId}>{root.sectionId} · {labels[root.kind]} · {root.label}</option>)}</select></label>}
      <p className="template-warning">Revisa títulos de subapartados, cabeceras de columnas y opciones del perfil técnico: podrían contener términos internos. La propuesta excluye texto del documento, código y valores.</p>
      {proposedStructure && <><div className="template-tree-preview">{proposedStructure.sections.map((item) => <TreeNode key={item.templateNodeId} item={item} selection={proposalSelection} onToggle={(id, checked) => setProposalSelection((current) => toggleTemplateNode(proposedStructure, current, id, checked))} fixedIds={fixedTemplateIds(proposedStructure)} />)}</div>
        <p className="template-selection-summary" role="status">{proposalSectionCount} {proposalSectionCount === 1 ? 'sección' : 'secciones'} seleccionadas · {proposalSelection.size} bloques estructurales.</p></>}
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setProposing(false)}>Cancelar</button><button className="primary-button" type="button" disabled={busy || !name.trim() || !proposedStructure || proposalSectionCount === 0} onClick={submitProposal}>Enviar propuesta</button></div>
    </div> : <div className="template-layout">
      <div className="template-list" aria-label="Plantillas">
        {loading ? <p role="status">Cargando plantillas…</p> : rows.length === 0 ? <p>No hay plantillas en esta pestaña.</p> : rows.map((item) => <button type="button" key={item.version.id} className={selected?.version?.id === item.version.id ? 'selected' : ''} onClick={() => choose(item)}><strong>{item.version.name}</strong><span>{item.template_type === 'full' ? 'Completa' : `Módulo · ${item.section_id} · ${labels[item.root_kind]}`} · v{item.version.revision}</span><small>{item.version.category || 'Sin categoría'}{item.version.state !== 'approved' ? ` · ${item.version.state}` : ''}</small></button>)}
      </div>
      <div className="template-preview">
        {!selected ? <p>Selecciona una plantilla para ver su estructura.</p> : <>
          <h3>{selected.version.name}</h3><p>{selected.version.description || 'Sin descripción.'}</p>
          {selected.version.review_reason && <p className="template-warning">Motivo del rechazo: {selected.version.review_reason}</p>}
          <div className="template-tree-preview">{selected.version.structure.sections.map((item) => <TreeNode key={item.templateNodeId} item={item} selection={selection} fixedIds={fixedIds} onToggle={(id, checked) => setSelection((current) => toggleTemplateNode(selected.version.structure, current, id, checked))} />)}</div>
          <p className="template-selection-summary" role="status">{sectionCount} {sectionCount === 1 ? 'sección' : 'secciones'} seleccionadas · {[...selection].length} bloques estructurales.</p>
          {tab === 'available' && canEdit && <button className="primary-button" type="button" disabled={busy || sectionCount === 0} onClick={create}>Crear documento</button>}
          {tab === 'mine' && canEdit && selected.version.author_id === user?.id && <button className="primary-button" type="button" disabled={busy || sectionCount === 0} onClick={create}>Crear documento desde mi propuesta</button>}
          {canEdit && selected.version.state !== 'pending' && !selected.retired_at && (selected.owner_id === user?.id || role === 'admin') && <button className="text-action" type="button" onClick={() => beginProposal(selected)}>Proponer nueva versión</button>}
          {tab === 'mine' && canEdit && selected.version.author_id === user?.id && <button className="text-action delete-button" type="button" disabled={busy} onClick={hideProposal}>Ocultar de Mis propuestas</button>}
          {tab === 'pending' && role === 'admin' && <div className="template-review-actions"><label>Motivo del rechazo (opcional)<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" disabled={busy} onClick={() => review('approved')}>Aprobar</button><button type="button" disabled={busy} onClick={() => review('rejected')}>Rechazar</button></div>}
          {role === 'admin' && !selected.retired_at && <button className="text-action delete-button" type="button" disabled={busy} onClick={retire}>Retirar plantilla</button>}
        </>}
      </div>
    </div>}</div>
  </div>;
}
