import test from 'node:test';
import assert from 'node:assert/strict';
import { allTemplateNodeIds, documentSectionOrder, instantiateTemplate, pruneDocumentSections, templateNodeState, toTemplateStructure, toggleTemplateNode } from '../src/data/templateStructure.js';

const source = () => ({
  schemaVersion: '1.0', sectionOrder: ['01', '05', '06', '08'], moduleManifest: {},
  document: { title: 'Secreto', ticketId: 'INC-0001', application: 'Aplicación interna', author: 'Autor anterior', date: '2020-01-01', version: '9.9', technicalProfile: 'COBOL', technicalProfileTags: ['COBOL'], technicalProfileCustomOptions: { technology: [], banking: [] } },
  tableColumns: { references: [{ id: 'reference', label: 'Referencia', kind: 'text' }] },
  technicalDetail: [{ id: 'old', title: 'Validaciones', content: 'Texto secreto', code: 'Código secreto', codeEnabled: true }],
  dataModel: [{ id: 'old-group', title: 'Estructura DB2', description: 'Texto secreto', sources: [{ id: 'old-source', type: 'Tabla', title: 'TB_SECRETA', description: 'Texto secreto', columns: [{ id: 'field', label: 'Campo', kind: 'text' }], items: [{ field: 'Dato secreto' }] }] }],
  references: [{ reference: 'Secreto' }],
});

test('manifiesto antiguo y subconjuntos explícitos', () => {
  assert.equal(documentSectionOrder({}).length, 8);
  assert.deepEqual(documentSectionOrder(source()), ['01', '05', '06', '08']);
  for (const sectionOrder of [[], ['01', '01'], ['09']]) assert.throws(() => documentSectionOrder({ sectionOrder }));
  const modular = pruneDocumentSections({ ...source(), sectionOrder: ['05'] });
  assert.deepEqual(modular.sectionOrder, ['05']);
  assert.equal(modular.document.technicalProfile, '');
  assert.deepEqual(modular.document.technicalProfileTags, []);
  assert.equal('dataModel' in modular, false);
  assert.deepEqual(pruneDocumentSections(JSON.parse(JSON.stringify(modular))).sectionOrder, ['05']);
});

test('proyección no incluye contenido propio del documento', () => {
  const structure = toTemplateStructure(source(), { type: 'full' });
  assert.deepEqual(structure.sections.map((item) => item.sectionId), ['01', '05', '06', '08']);
  assert.equal(structure.sections[1].children[0].config.codeEnabled, true);
  assert.deepEqual(structure.sections[0].children[0].config.tags, ['COBOL']);
  const serialised = JSON.stringify(structure);
  for (const secret of ['Secreto', 'INC-0001', 'Aplicación interna', 'Autor anterior', 'Texto secreto', 'Código secreto', 'TB_SECRETA', 'Dato secreto']) {
    assert.equal(serialised.includes(secret), false, secret);
  }
  assert.equal(serialised.includes('Validaciones'), true);
  assert.equal(serialised.includes('Campo'), true);
  assert.equal(serialised.includes('COBOL'), true);
});

test('las fuentes publican solo etiquetas genéricas coherentes con su tipo', () => {
  for (const type of ['Tabla', 'Fichero', 'Datos']) {
    const input = source();
    input.dataModel[0].sources[0].type = type;
    input.dataModel[0].sources[0].title = `Nombre privado ${type}`;
    const projected = toTemplateStructure(input);
    const node = projected.sections.find((section) => section.sectionId === '06').children[0].children[0];
    assert.equal(node.label, type);
    assert.equal(node.config.type, type);
    assert.equal(JSON.stringify(projected).includes('Nombre privado'), false);
  }
});

test('selección parcial y módulo aislado crean copias limpias', () => {
  const structure = toTemplateStructure(source(), { type: 'full' });
  let chosen = new Set(allTemplateNodeIds(structure));
  chosen = toggleTemplateNode(structure, chosen, 'section:01', false);
  chosen = toggleTemplateNode(structure, chosen, '06:group:0:source:0', false);
  assert.equal(templateNodeState(structure.sections[2], chosen).indeterminate, true);
  const document = instantiateTemplate(structure, chosen, { display_name: 'Nuevo autor' }, source(), new Date('2026-10-06'));
  assert.deepEqual(document.sectionOrder, ['05', '06', '08']);
  assert.equal(document.document.author, 'Nuevo autor');
  assert.equal(document.document.ticketId, '');
  assert.equal(document.document.technicalProfile, '');
  assert.deepEqual(document.document.technicalProfileTags, []);
  assert.equal(document.dataModel[0].sources.length, 0);
  assert.notEqual(document.technicalDetail[0].id, 'old');
  assert.equal(source().document.title, 'Secreto');
  const module = toTemplateStructure(source(), { type: 'module', rootNodeId: '06:group:0:source:0' });
  assert.deepEqual(module.root, { rootKind: 'dataSource', sectionId: '06', rootSlot: 'dataModel.groups.sources', rootNodeId: '06:group:0:source:0' });
  const isolated = instantiateTemplate(module, new Set(allTemplateNodeIds(module)), { name: 'Nuevo' }, source());
  assert.deepEqual(isolated.sectionOrder, ['06']);
  assert.equal(isolated.dataModel[0].sources.length, 1);
  assert.equal(isolated.dataModel[0].sources[0].title, '');
  assert.notEqual(isolated.dataModel[0].sources[0].id, 'old-source');
  assert.equal(isolated.dataModel[0].sources[0].items[0].field, '');
  assert.equal(JSON.stringify(module).includes('COBOL'), false);
  assert.equal(JSON.stringify(module).includes('Validaciones'), false);
  assert.throws(() => instantiateTemplate(structure, new Set(), {}, source()));
  assert.throws(() => instantiateTemplate(structure, new Set(['section:01', 'unknown']), {}, source()));
});

test('perfil omitido no reaparece al reimportar y la sección conserva sus hijos vacíos', () => {
  const structure = toTemplateStructure(source());
  const chosen = toggleTemplateNode(structure, new Set(allTemplateNodeIds(structure)), '01:profile', false);
  const document = instantiateTemplate(structure, chosen, {}, source());
  assert.equal(document.sectionOrder.includes('01'), true);
  assert.equal(document.moduleManifest['01'].technicalProfile, false);
  assert.equal(document.document.technicalProfile, '');
  assert.deepEqual(document.document.technicalProfileTags, []);
  assert.deepEqual(pruneDocumentSections(JSON.parse(JSON.stringify(document))).document.technicalProfileTags, []);
});

test('histórico inicial solo se crea al seleccionar su tabla', () => {
  const input = source();
  input.sectionOrder = ['02'];
  input.tableColumns.history = [{ id: 'version', label: 'Versión', kind: 'text' }];
  input.history = [{ version: '9.9', description: 'Histórico secreto' }];
  const structure = toTemplateStructure(input);
  const all = new Set(allTemplateNodeIds(structure));
  const withHistory = instantiateTemplate(structure, all, { name: 'Autora' }, input, new Date('2026-10-06'));
  assert.deepEqual(withHistory.history, [{ version: '1.0', date: '2026-10-06', author: 'Autora', description: '' }]);
  const without = instantiateTemplate(structure, toggleTemplateNode(structure, all, '02:table', false), {}, input);
  assert.deepEqual(without.sectionOrder, ['02']);
  assert.equal(without.moduleManifest['02'].table, false);
  assert.equal('history' in without, false);
});
