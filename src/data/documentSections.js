export const BUILT_IN_SECTION_TITLES = {
  '01': 'Cabecera',
  '02': 'Histórico de cambios',
  '03': 'Resumen del cambio',
  '04': 'Componentes afectados',
  '05': 'Detalle técnico',
  '06': 'Datos / Modelo de datos',
  '07': 'Casos de prueba',
  '08': 'Referencias / Documentación relacionada',
};

export const BUILT_IN_SECTION_IDS = Object.keys(BUILT_IN_SECTION_TITLES);
export const CUSTOM_BLOCKS = ['description', 'subsections', 'table', 'cobol'];

export const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export function createCustomSection(blocks, id = newId('section')) {
  const selected = CUSTOM_BLOCKS.filter((block) => blocks.includes(block));
  if (!selected.length) throw new Error('Selecciona al menos un bloque.');
  return {
    id,
    blocks: selected,
    description: '',
    subsections: [],
    table: { columns: [{ id: newId('column'), label: 'Columna 1', kind: 'text' }], rows: [] },
    cobol: '',
  };
}

export function pruneCustomBlocks(block) {
  const result = structuredClone(block);
  if (!result.blocks.includes('description')) result.description = '';
  if (!result.blocks.includes('subsections')) result.subsections = [];
  if (!result.blocks.includes('table')) result.table = { columns: [], rows: [] };
  if (!result.blocks.includes('cobol')) result.cobol = '';
  return result;
}

export function normalizeSectionModel(source) {
  if (!source || !['1.0', '1.1'].includes(source.schemaVersion)) throw new Error('Versión de documento no compatible.');
  const order = source.sectionOrder ?? BUILT_IN_SECTION_IDS;
  if (!Array.isArray(order) || new Set(order).size !== order.length || order.some((id) => typeof id !== 'string' || !id || (!BUILT_IN_SECTION_IDS.includes(id) && !/^section-[A-Za-z0-9-]{8,}$/.test(id)))) throw new Error('Orden de secciones no válido.');
  const result = structuredClone(source);
  const present = new Set(order);
  result.sectionOrder = [...order];
  result.sectionMeta = {};
  result.customSections = {};
  for (const id of order) {
    const custom = !BUILT_IN_SECTION_IDS.includes(id);
    const meta = source.schemaVersion === '1.1' ? source.sectionMeta?.[id] : null;
    const title = meta?.title ?? BUILT_IN_SECTION_TITLES[id];
    if (typeof title !== 'string' || !title.trim() || title.length > 160 || (source.schemaVersion === '1.1' && (!meta || typeof meta.active !== 'boolean' || meta.kind !== (custom ? 'custom' : 'builtIn')))) throw new Error('Metadatos de sección no válidos.');
    result.sectionMeta[id] = { title: title.trim(), active: meta?.active ?? true, kind: custom ? 'custom' : 'builtIn' };
    if (custom) {
      const block = source.customSections?.[id];
      if (!block || block.id !== id || !Array.isArray(block.blocks) || !block.blocks.length || new Set(block.blocks).size !== block.blocks.length || block.blocks.some((key) => !CUSTOM_BLOCKS.includes(key))) throw new Error('Bloques de sección no válidos.');
      if (block.blocks.includes('description') && typeof block.description !== 'string' || block.blocks.includes('cobol') && typeof block.cobol !== 'string' || block.blocks.includes('subsections') && !Array.isArray(block.subsections) || block.blocks.includes('table') && (!block.table || !Array.isArray(block.table.columns) || !Array.isArray(block.table.rows))) throw new Error('Contenido de sección no válido.');
      const cleanBlock = pruneCustomBlocks({ ...block, description: block.description ?? '', cobol: block.cobol ?? '', subsections: block.subsections ?? [], table: block.table ?? { columns: [], rows: [] } });
      const subsectionIds = new Set();
      for (const item of cleanBlock.subsections) {
        if (!item || typeof item.id !== 'string' || !item.id || subsectionIds.has(item.id) || typeof item.title !== 'string' || typeof item.content !== 'string') throw new Error('Subapartado no válido.');
        subsectionIds.add(item.id);
      }
      const columnIds = new Set();
      for (const column of cleanBlock.table.columns) {
        if (!column || typeof column.id !== 'string' || !column.id || columnIds.has(column.id) || typeof column.label !== 'string' || !column.label.trim() || !['text', 'date', 'action'].includes(column.kind)) throw new Error('Columna no válida.');
        columnIds.add(column.id);
      }
      if (cleanBlock.blocks.includes('table') && (!columnIds.size || cleanBlock.table.rows.some((row) => !row || typeof row.id !== 'string' || !row.id || [...columnIds].some((key) => typeof row[key] !== 'string')))) throw new Error('Filas de sección no válidas.');
      if (new Set(cleanBlock.table.rows.map((row) => row.id)).size !== cleanBlock.table.rows.length) throw new Error('IDs de fila duplicados.');
      result.customSections[id] = cleanBlock;
    }
  }
  if (source.schemaVersion === '1.1' && (Object.keys(source.sectionMeta ?? {}).some((id) => !present.has(id)) || Object.keys(source.customSections ?? {}).some((id) => !present.has(id)))) throw new Error('Referencia de sección huérfana.');
  result.schemaVersion = '1.1';
  return result;
}

export function visibleSectionIds(document) {
  return document.sectionOrder.filter((id) => document.sectionMeta?.[id]?.active !== false);
}

export function sectionOrdinal(document, id) {
  const index = visibleSectionIds(document).indexOf(id);
  return index < 0 ? null : String(index + 1).padStart(2, '0');
}

export function moveSection(document, fromId, targetId) {
  const from = document.sectionOrder.indexOf(fromId);
  const target = document.sectionOrder.indexOf(targetId);
  if (from < 0 || target < 0 || from === target) return;
  document.sectionOrder.splice(from, 1);
  document.sectionOrder.splice(target, 0, fromId);
}

export function removeSection(document, id) {
  document.sectionOrder = document.sectionOrder.filter((item) => item !== id);
  delete document.sectionMeta?.[id];
  delete document.customSections?.[id];
}
