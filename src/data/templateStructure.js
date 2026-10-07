export const SECTION_IDS = ['01', '02', '03', '04', '05', '06', '07', '08'];
export const STANDARD_TABLES = { '02': 'history', '04': 'affectedComponents', '07': 'testCases', '08': 'references' };
export const TEMPLATE_SCHEMA_VERSION = 1;
export const EMPTY_PROFILE_OPTIONS = { technology: [], banking: [] };

export function validateSectionOrder(order) {
  if (!Array.isArray(order) || !order.length || new Set(order).size !== order.length || order.some((id) => !SECTION_IDS.includes(id))) {
    throw new Error('El documento debe contener secciones conocidas, únicas y ordenadas.');
  }
  return [...order];
}

export function documentSectionOrder(document) {
  return validateSectionOrder(document.sectionOrder === undefined ? SECTION_IDS : document.sectionOrder);
}

export function pruneDocumentSections(document) {
  const result = structuredClone(document);
  const order = documentSectionOrder(result);
  result.sectionOrder = order;
  result.moduleManifest ??= {};
  const present = new Set(order);
  for (const sectionId of SECTION_IDS) if (!present.has(sectionId)) delete result.moduleManifest[sectionId];
  for (const [sectionId, key] of Object.entries(STANDARD_TABLES)) {
    if (!present.has(sectionId) || result.moduleManifest[sectionId]?.table === false) {
      delete result[key];
      delete result.tableColumns?.[key];
      if (present.has(sectionId)) result.moduleManifest[sectionId] = { table: false };
    }
  }
  if (!present.has('03')) delete result.summary;
  if (!present.has('05')) delete result.technicalDetail;
  if (!present.has('06')) delete result.dataModel;
  if (!present.has('01')) {
    result.document.title = '';
    result.document.ticketId = '';
    result.document.application = '';
  }
  if (!present.has('01') || result.moduleManifest['01']?.technicalProfile === false) {
    result.document.technicalProfile = '';
    result.document.technicalProfileTags = [];
    result.document.technicalProfileCustomOptions = structuredClone(EMPTY_PROFILE_OPTIONS);
    if (present.has('01')) result.moduleManifest['01'] = { technicalProfile: false };
  }
  return result;
}

const column = (item) => ({ id: String(item.id), label: String(item.label ?? ''), kind: item.kind ?? 'text', ...(item.width ? { width: String(item.width) } : {}) });
const node = (id, kind, sectionId, label, config = {}, children = []) => ({ templateNodeId: id, kind, sectionId, label, config, children });

export function toTemplateStructure(document, scope = { type: 'full' }) {
  const order = documentSectionOrder(document);
  const roots = order.map((sectionId) => {
    const children = [];
    if (sectionId === '01' && document.moduleManifest?.['01']?.technicalProfile !== false) {
      children.push(node('01:profile', 'technicalProfile', '01', 'Perfil técnico', {
        tags: [...(document.document?.technicalProfileTags ?? [])],
        customOptions: {
          technology: [...(document.document?.technicalProfileCustomOptions?.technology ?? [])],
          banking: [...(document.document?.technicalProfileCustomOptions?.banking ?? [])],
        },
      }));
    }
    const tableKey = STANDARD_TABLES[sectionId];
    if (tableKey && document.moduleManifest?.[sectionId]?.table !== false) {
      children.push(node(`${sectionId}:table`, 'standardTable', sectionId, 'Tabla', {
        slot: tableKey,
        columns: (document.tableColumns?.[tableKey] ?? []).map(column),
        rowCount: tableKey === 'history' ? 1 : (document[tableKey]?.length ?? 0),
      }));
    }
    if (sectionId === '05') {
      (document.technicalDetail ?? []).forEach((item, index) => children.push(node(`05:item:${index}`, 'technicalSubsection', '05', String(item.title ?? ''), { codeEnabled: item.codeEnabled !== false })));
    }
    if (sectionId === '06') {
      (document.dataModel ?? []).forEach((group, groupIndex) => children.push(node(`06:group:${groupIndex}`, 'dataSubsection', '06', String(group.title ?? ''), {},
        (group.sources ?? []).map((source, sourceIndex) => {
          const type = ['Tabla', 'Fichero', 'Datos'].includes(source.type) ? source.type : 'Tabla';
          return node(`06:group:${groupIndex}:source:${sourceIndex}`, 'dataSource', '06', type, {
            type, columns: (source.columns ?? []).map(column), rowCount: source.items?.length ?? 0,
          });
        }))));
    }
    return node(`section:${sectionId}`, 'section', sectionId, sectionId, {}, children);
  });
  let selectedRoots = roots;
  let root = null;
  if (scope.type === 'module') {
    const wanted = scope.rootNodeId;
    const find = (nodes, ancestors = []) => {
      for (const current of nodes) {
        if (current.templateNodeId === wanted) return { current, ancestors };
        const result = find(current.children, [...ancestors, current]);
        if (result) return result;
      }
      return null;
    };
    const found = find(roots);
    if (!found || !['section', 'technicalSubsection', 'dataSubsection', 'dataSource', 'standardTable'].includes(found.current.kind)) throw new Error('Raíz de módulo no válida.');
    root = { rootKind: found.current.kind, sectionId: found.current.sectionId,
      rootSlot: found.current.kind === 'standardTable' ? found.current.config.slot : ({ section: 'section', technicalSubsection: 'technicalDetail.items', dataSubsection: 'dataModel.groups', dataSource: 'dataModel.groups.sources' })[found.current.kind],
      rootNodeId: wanted };
    let branch = found.current;
    for (const ancestor of [...found.ancestors].reverse()) branch = { ...ancestor, children: [branch] };
    selectedRoots = [branch];
  } else if (scope.type !== 'full') throw new Error('Tipo de plantilla no válido.');
  return { schemaVersion: TEMPLATE_SCHEMA_VERSION, type: scope.type, root, sections: selectedRoots };
}

export function allTemplateNodeIds(structure) {
  const ids = [];
  const visit = (item) => { ids.push(item.templateNodeId); item.children.forEach(visit); };
  structure.sections.forEach(visit);
  return ids;
}

export function toggleTemplateNode(structure, selection, nodeId, selected) {
  const next = new Set(selection);
  const find = (items) => {
    for (const item of items) {
      if (item.templateNodeId === nodeId) return item;
      const result = find(item.children);
      if (result) return result;
    }
    return null;
  };
  const target = find(structure.sections);
  if (!target || (structure.type === 'module' && (target.templateNodeId === structure.root?.rootNodeId || target.kind === 'section'))) return next;
  const update = (item) => { if (selected) next.add(item.templateNodeId); else next.delete(item.templateNodeId); item.children.forEach(update); };
  update(target);
  return next;
}

export function templateNodeState(node, selection) {
  const descendants = node.children.flatMap((child) => [child.templateNodeId, ...allTemplateNodeIds({ sections: child.children })]);
  return { checked: selection.has(node.templateNodeId), indeterminate: selection.has(node.templateNodeId) && descendants.some((id) => !selection.has(id)) };
}

export function instantiateTemplate(structure, selection, user, baseDocument, now = new Date()) {
  if (structure.schemaVersion !== TEMPLATE_SCHEMA_VERSION || !['full', 'module'].includes(structure.type)) throw new Error('Versión de plantilla no compatible.');
  const valid = new Set(allTemplateNodeIds(structure));
  const chosen = new Set(selection);
  if ([...chosen].some((id) => !valid.has(id))) throw new Error('Selección de plantilla no válida.');
  const checkHierarchy = (item, parentSelected = true) => {
    if (chosen.has(item.templateNodeId) && !parentSelected) throw new Error('Selección sin sección o subapartado contenedor.');
    item.children.forEach((child) => checkHierarchy(child, chosen.has(item.templateNodeId)));
  };
  structure.sections.forEach((item) => checkHierarchy(item));
  if (structure.type === 'module' && !chosen.has(structure.root?.rootNodeId)) throw new Error('La raíz del módulo es obligatoria.');
  const selectedRoots = structure.sections.filter((section) => chosen.has(section.templateNodeId));
  if (!selectedRoots.length) throw new Error('Selecciona al menos una sección.');
  const result = structuredClone(baseDocument);
  result.sectionOrder = selectedRoots.map((section) => section.sectionId);
  result.moduleManifest = {};
  result.document = { title: '', ticketId: '', application: '', author: user?.display_name ?? user?.name ?? 'Usuario', date: now.toISOString().slice(0, 10), version: '1.0', technicalProfile: '', technicalProfileTags: [], technicalProfileCustomOptions: structuredClone(EMPTY_PROFILE_OPTIONS) };
  const localId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
  for (const section of selectedRoots) {
    const children = section.children.filter((item) => chosen.has(item.templateNodeId));
    if (section.sectionId === '01') {
      const profile = children.find((item) => item.kind === 'technicalProfile');
      result.moduleManifest['01'] = { technicalProfile: Boolean(profile) };
      if (profile) {
        result.document.technicalProfileTags = [...profile.config.tags];
        result.document.technicalProfileCustomOptions = structuredClone(profile.config.customOptions);
        result.document.technicalProfile = profile.config.tags.join(' · ');
      }
    }
    const key = STANDARD_TABLES[section.sectionId];
    if (key) {
      const table = children.find((item) => item.kind === 'standardTable');
      result.moduleManifest[section.sectionId] = { table: Boolean(table) };
      if (table) {
        result.tableColumns[key] = table.config.columns.map(column);
        result[key] = key === 'history' ? [{ version: '1.0', date: result.document.date, author: result.document.author, description: '' }] : Array.from({ length: table.config.rowCount }, () => Object.fromEntries(table.config.columns.map((col) => [col.id, ''])));
      }
    }
    if (section.sectionId === '03') result.summary = '';
    if (section.sectionId === '05') result.technicalDetail = children.map((item) => ({ id: localId('detail'), title: item.label, content: '', code: '', codeEnabled: item.config.codeEnabled }));
    if (section.sectionId === '06') result.dataModel = children.filter((item) => item.kind === 'dataSubsection').map((group) => ({
      id: localId('data'), title: group.label, description: '',
      sources: group.children.filter((item) => chosen.has(item.templateNodeId)).map((source) => ({ id: localId('source'), type: source.config.type, title: '', description: '', columns: source.config.columns.map(column), items: Array.from({ length: source.config.rowCount }, () => Object.fromEntries(source.config.columns.map((col) => [col.id, '']))) })),
    }));
  }
  return pruneDocumentSections(result);
}
