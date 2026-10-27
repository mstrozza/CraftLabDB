import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILT_IN_SECTION_IDS, createCustomSection, moveSection, normalizeSectionModel, removeSection, sectionOrdinal, visibleSectionIds } from '../src/data/documentSections.js';
import { allTemplateNodeIds, hasEmptyCustomSelection, instantiateTemplate, pruneDocumentSections, toTemplateStructure, toggleTemplateNode } from '../src/data/templateStructure.js';

const sample = () => {
  const section = createCustomSection(['description', 'subsections', 'table', 'cobol'], 'section-abcdefgh');
  section.description = 'Texto privado';
  section.cobol = 'DISPLAY "PRIVADO".\nSTOP RUN.';
  section.subsections.push({ id: 'sub-1', title: 'Reglas', content: 'Contenido privado' });
  section.table.columns = [{ id: 'a', label: 'Campo', kind: 'text' }, { id: 'b', label: 'Tratamiento', kind: 'text' }];
  section.table.rows = [{ id: 'row-1', a: 'Secreto A', b: 'Secreto B' }];
  return {
    schemaVersion: '1.1', sectionOrder: ['01', section.id, '05'],
    sectionMeta: {
      '01': { title: 'Cabecera', active: true, kind: 'builtIn' },
      [section.id]: { title: 'Procesos batch', active: true, kind: 'custom' },
      '05': { title: 'Detalle técnico', active: true, kind: 'builtIn' },
    },
    customSections: { [section.id]: section }, moduleManifest: {},
    document: { title: 'Privado', ticketId: 'INC-1', technicalProfileTags: [], technicalProfileCustomOptions: { technology: [], banking: [] } },
    technicalDetail: [], tableColumns: {},
  };
};

test('orden, activación y eliminación conservan identidad y números consecutivos', () => {
  const document = sample();
  moveSection(document, 'section-abcdefgh', '01');
  assert.deepEqual(visibleSectionIds(document), ['section-abcdefgh', '01', '05']);
  assert.equal(sectionOrdinal(document, '01'), '02');
  assert.equal(document.customSections['section-abcdefgh'].table.rows[0].a, 'Secreto A');
  document.sectionMeta['01'].active = false;
  assert.equal(sectionOrdinal(document, '05'), '02');
  assert.equal(sectionOrdinal(document, '01'), null);
  assert.equal(normalizeSectionModel(document).sectionMeta['01'].active, false);
  removeSection(document, 'section-abcdefgh');
  assert.equal('section-abcdefgh' in pruneDocumentSections(document).customSections, false);
  removeSection(document, '01');
  removeSection(document, '05');
  assert.deepEqual(visibleSectionIds(document), []);
});

test('JSON 1.0 se amplía sin contenido perdido y 1.1 rechaza referencias inválidas', () => {
  const legacy = { schemaVersion: '1.0', sectionOrder: ['05', '01'], document: {}, technicalDetail: [{ id: 'a', title: 'X', content: 'Y', code: '' }] };
  const upgraded = normalizeSectionModel(legacy);
  assert.equal(upgraded.schemaVersion, '1.1');
  assert.equal(upgraded.sectionMeta['05'].title, 'Detalle técnico');
  assert.equal(upgraded.technicalDetail[0].content, 'Y');
  const modern = sample();
  assert.deepEqual(normalizeSectionModel(JSON.parse(JSON.stringify(modern))), modern);
  modern.customSections['section-abcdefgh'].table.columns[1].id = 'a';
  assert.throws(() => normalizeSectionModel(modern), /Columna/);
});

test('plantilla v2 conserva estructura, depura contenido e instancia IDs locales nuevos', () => {
  const document = sample();
  const structure = toTemplateStructure(document);
  assert.equal(structure.schemaVersion, 2);
  assert.deepEqual(structure.sections.map((item) => item.sectionId), document.sectionOrder);
  const body = JSON.stringify(structure);
  for (const privateValue of ['Texto privado', 'DISPLAY', 'Contenido privado', 'Secreto A', 'Secreto B', 'Privado', 'INC-1']) assert.equal(body.includes(privateValue), false, privateValue);
  assert.equal(body.includes('Procesos batch'), true);
  assert.equal(body.includes('Campo'), true);
  const selection = toggleTemplateNode(structure, new Set(allTemplateNodeIds(structure)), 'section:01', false);
  const created = instantiateTemplate(structure, selection, { name: 'Nueva autora' }, document);
  assert.equal(created.sectionOrder.includes('01'), false);
  const customId = created.sectionOrder.find((id) => !BUILT_IN_SECTION_IDS.includes(id));
  assert.notEqual(customId, 'section-abcdefgh');
  assert.equal(created.customSections[customId].description, '');
  assert.equal(created.customSections[customId].cobol, '');
  assert.equal(created.customSections[customId].table.rows[0].a, undefined);
  assert.equal(Object.values(created.customSections[customId].table.rows[0]).filter((value) => value === 'Secreto A').length, 0);
  assert.equal(created.customSections[customId].subsections[0].content, '');
  const module = toTemplateStructure(document, { type: 'module', rootNodeId: 'section-abcdefgh:table' });
  const isolated = instantiateTemplate(module, new Set(allTemplateNodeIds(module)), {}, document);
  const isolatedId = isolated.sectionOrder[0];
  assert.deepEqual(isolated.customSections[isolatedId].blocks, ['table']);
});

test('una sección propia seleccionada necesita al menos un bloque', () => {
  const document = sample();
  const structure = toTemplateStructure(document);
  let selected = new Set(allTemplateNodeIds(structure));
  for (const child of structure.sections[1].children) selected = toggleTemplateNode(structure, selected, child.templateNodeId, false);
  assert.equal(hasEmptyCustomSelection(structure, selected), true);
  assert.throws(() => instantiateTemplate(structure, selected, {}, document), /al menos un bloque/);
  selected = toggleTemplateNode(structure, selected, structure.sections[1].children[0].templateNodeId, true);
  assert.equal(hasEmptyCustomSelection(structure, selected), false);
});

test('JSON 1.1 depura COBOL y valores de bloques no seleccionados', () => {
  const document = sample();
  const id = 'section-abcdefgh';
  document.customSections[id].blocks = ['description'];
  const copy = pruneDocumentSections(document);
  assert.equal(copy.customSections[id].cobol, '');
  assert.deepEqual(copy.customSections[id].subsections, []);
  assert.deepEqual(copy.customSections[id].table, { columns: [], rows: [] });
  const restored = normalizeSectionModel(copy);
  assert.equal(restored.customSections[id].cobol, '');
  assert.equal(JSON.stringify(restored).includes('Secreto A'), false);
  assert.equal(JSON.stringify(restored).includes('DISPLAY'), false);
});

test('sin 01 se excluyen todos los datos propios de cabecera de la copia', () => {
  const document = sample();
  document.document = { ...document.document, author: 'Autora secreta', date: '2026-10-26', version: '9.9' };
  removeSection(document, '01');
  const copy = pruneDocumentSections(document);
  for (const field of ['title', 'ticketId', 'application', 'author', 'date', 'version', 'technicalProfile']) assert.equal(copy.document[field], '');
});

test('la migración restringe etiquetas genéricas de bloques propios', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610260001_custom_document_sections.sql', import.meta.url), 'utf8');
  for (const [kind, label] of [['customDescription', 'Descripción'], ['customSubsections', 'Subapartados'], ['customTable', 'Tabla'], ['customCobol', 'COBOL']]) {
    assert.match(sql, new RegExp(`when '${kind}' then '${label}'`));
  }
  assert.match(sql, /raise exception 'invalid_template_label'/);
});
