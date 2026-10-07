import { test, expect } from '@playwright/test';
import { MockSupabase } from './support/mock-supabase.js';
import { readFile } from 'node:fs/promises';

let mock;
test.beforeEach(() => { mock = new MockSupabase(); });
test.afterEach(async () => { await mock.assertNoExternalCalls(); });

test('propuesta, aprobación e importación parcial omiten secciones completas', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click();
  await page.getByRole('button', { name: 'Gestionar plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Estructura bancaria');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect.poll(() => mock.templateVersions.length).toBe(1);
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Estructura bancaria/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect.poll(() => mock.templateVersions[0].state).toBe('approved');
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await page.getByRole('button', { name: /Estructura bancaria/ }).click();
  await page.getByRole('button', { name: 'Proponer nueva versión' }).click();
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect.poll(() => mock.templateVersions.length).toBe(2);
  expect(mock.templateVersions[1].state).toBe('pending');
  expect(mock.templates[0].published_version_id).toBe(mock.templateVersions[0].id);
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await page.getByRole('button', { name: /Estructura bancaria/ }).click();
  const sourceCheckbox = page.getByRole('checkbox', { name: 'Tabla / fichero / datos Tabla' }).first();
  await sourceCheckbox.focus();
  await sourceCheckbox.press('Space');
  await expect(sourceCheckbox).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Subapartado de datos/ }).first()).toHaveAttribute('aria-checked', 'mixed');
  await sourceCheckbox.press('Space');
  await page.getByRole('checkbox', { name: 'Sección 01' }).uncheck();
  await expect(page.getByRole('checkbox', { name: /Perfil técnico/ })).toBeDisabled();
  const technicalSection = page.getByRole('checkbox', { name: 'Sección 05' });
  await technicalSection.focus();
  await technicalSection.press('Space');
  await expect(technicalSection).not.toBeChecked();
  for (const id of ['02', '03', '04', '06', '07', '08']) await page.getByRole('checkbox', { name: `Sección ${id}` }).uncheck();
  await expect(page.getByRole('button', { name: 'Crear documento' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Sección 06' }).check();
  await page.getByRole('button', { name: 'Crear documento' }).click();
  await expect(page.getByRole('dialog', { name: 'Biblioteca de plantillas' })).toHaveCount(0);
  await expect(page.locator('#section-01')).toHaveCount(0);
  await expect(page.locator('#section-05')).toHaveCount(0);
  await expect(page.locator('#section-06')).toBeVisible();
  await expect(page.getByText('Información del documento')).toHaveCount(0);
  await expect(page.locator('.breadcrumb')).not.toContainText('DB-28451');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const jsonFile = await jsonDownload;
  expect(jsonFile.suggestedFilename()).toBe('DOCUMENTO.json');
  const exported = JSON.parse(await readFile(await jsonFile.path(), 'utf8'));
  expect(exported.sectionOrder).not.toContain('01');
  expect(exported.sectionOrder).not.toContain('05');
  expect(exported.document.technicalProfileTags).toEqual([]);
  expect(exported.document.technicalProfile).toBe('');
  expect(exported.document.technicalProfileCustomOptions).toEqual({ technology: [], banking: [] });
  expect(exported.document.title).toBe('');
  expect(exported.document.ticketId).toBe('');
  expect(exported.document.application).toBe('');
  expect(exported).not.toHaveProperty('technicalDetail');
  await page.locator('input[type=file]').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.locator('#section-01')).toHaveCount(0);
  await expect(page.locator('#section-06')).toBeVisible();
  await page.getByRole('button', { name: 'Exportar' }).click();
  const roundtripDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const roundtrip = JSON.parse(await readFile(await (await roundtripDownload).path(), 'utf8'));
  expect(roundtrip.document.technicalProfile).toBe('');
  expect(roundtrip.document.technicalProfileTags).toEqual([]);
  expect(roundtrip.document.technicalProfileCustomOptions).toEqual({ technology: [], banking: [] });
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('button', { name: /Estructura bancaria/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Retirar plantilla' }).click();
  await expect(page.getByText('No hay plantillas en esta pestaña.')).toBeVisible();
  expect(mock.templateVersions[0].state).toBe('approved');
  await expect(page.locator('#section-06')).toBeVisible();
  await context.close();
});

test('Nuevo muestra tarjetas aprobadas y abre la estructura de la versión elegida', async ({ browser }) => {
  const structure = { schemaVersion: 1, type: 'full', root: null, sections: [
    { templateNodeId: 'section:03', kind: 'section', sectionId: '03', label: '03', config: {}, children: [] },
    { templateNodeId: 'section:04', kind: 'section', sectionId: '04', label: '04', config: {}, children: [{ templateNodeId: 'section:04:table', kind: 'standardTable', sectionId: '04', label: 'Componentes', config: { columns: [], rowCount: 0 }, children: [] }] },
  ] };
  mock.templates.push({ id: 'template-1', owner_id: mock.admin.id, template_type: 'full', root_kind: null, section_id: null, root_slot: null, published_version_id: 'version-2', retired_at: null });
  mock.templateVersions.push({ id: 'version-2', template_id: 'template-1', revision: 2, name: 'Base bancaria', description: 'Estructura para evolutivos', category: 'Banca', structure, state: 'approved', author_id: mock.admin.id, created_at: new Date().toISOString() });
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Crear nuevo evolutivo' });
  await expect(chooser.getByRole('button', { name: /Documento en blanco/ })).toContainText('Versión inicial 1.0 · Estructura 01–08');
  const template = chooser.getByRole('button', { name: /Base bancaria/ });
  await expect(template).toContainText('Versión 2 · Completa · 2 secciones · 1 bloque');
  await expect(template).toContainText('Estructura: 03, 04');
  await expect(template).toContainText('Banca');
  await expect(template).toContainText('Estructura para evolutivos');
  await template.click();
  await expect(chooser).toHaveCount(0);
  const catalog = page.getByRole('dialog', { name: 'Biblioteca de plantillas' });
  await expect(catalog).toBeVisible();
  await expect(catalog.locator('.template-list button.selected')).toContainText('Base bancaria');
  await expect(catalog.getByRole('checkbox', { name: 'Sección 03' })).toBeChecked();
  await expect(catalog.getByRole('checkbox', { name: 'Sección 04' })).toBeChecked();
  await expect(page.locator('#section-01')).toBeVisible();
  await context.close();
});

test('Nuevo mantiene documento en blanco y acceso al catálogo cuando carga o falla la lista', async ({ browser }) => {
  mock.templateReadDelay = 400;
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Crear nuevo evolutivo' });
  await expect(chooser.getByRole('status')).toContainText('Cargando plantillas disponibles');
  await expect(chooser.getByRole('button', { name: /Documento en blanco/ })).toBeEnabled();
  await expect(chooser.getByRole('status')).toContainText('Aún no hay plantillas aprobadas');
  await chooser.getByRole('button', { name: 'Gestionar plantillas' }).click();
  await expect(page.getByRole('dialog', { name: 'Biblioteca de plantillas' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  mock.failStage = 'template-list';
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Crear nuevo evolutivo' }).getByRole('alert')).toContainText('No se pudieron cargar las plantillas');
  await expect(page.getByRole('dialog', { name: 'Crear nuevo evolutivo' }).getByRole('button', { name: /Documento en blanco/ })).toBeEnabled();
  await context.close();
});

test('Plantillas se sitúa entre Información del documento y Apariencia, incluso sin 01', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.sidebar > .document-info + .template-sidebar-control + .appearance-control')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exportar' }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const documentCopy = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
  documentCopy.sectionOrder = ['03'];
  await page.locator('input[type=file]').setInputFiles({ name: 'sin-cabecera.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(documentCopy)) });
  await expect(page.locator('.sidebar > nav + .template-sidebar-control + .appearance-control')).toHaveCount(1);
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await expect(page.getByRole('dialog', { name: 'Biblioteca de plantillas' })).toBeVisible();
  await context.close();
});

test('módulo de fuente crea solo 06 y su contenedor', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Fuente de datos');
  await page.locator('.template-proposal select').first().selectOption('module');
  await page.getByLabel('Raíz del módulo').selectOption('06:group:0:source:0');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Fuente de datos/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await page.getByRole('button', { name: /Fuente de datos/ }).click();
  await page.getByRole('button', { name: 'Proponer nueva versión' }).click();
  await expect(page.locator('.template-proposal select').first()).toBeDisabled();
  await expect(page.locator('.template-proposal select').first()).toHaveValue('module');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  expect(mock.templates[0].published_version_id).toBe(mock.templateVersions[0].id);
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await page.getByRole('button', { name: /Fuente de datos/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Sección 06' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Tabla / fichero / datos Tabla' })).toBeDisabled();
  await page.getByRole('button', { name: 'Crear documento' }).click();
  await expect(page.locator('#section-06')).toBeVisible();
  await expect(page.locator('#section-01')).toHaveCount(0);
  await expect(page.locator('.data-source-block')).toHaveCount(1);
  await context.close();
});

test('copia modular antigua y salidas conservan solo las secciones presentes', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const initialDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const original = JSON.parse(await readFile(await (await initialDownload).path(), 'utf8'));
  const legacy = { ...original };
  delete legacy.sectionOrder;
  delete legacy.moduleManifest;
  await page.locator('input[type=file]').setInputFiles({ name: 'antigua.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.locator('.document-area > section')).toHaveCount(8);
  const modular = { ...original, sectionOrder: ['03', '04', '07'], moduleManifest: { '04': { table: false } } };
  await page.locator('input[type=file]').setInputFiles({ name: 'modular.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(modular)) });
  await expect(page.locator('#section-01')).toHaveCount(0);
  await expect(page.locator('#section-02')).toHaveCount(0);
  await expect(page.locator('#section-05')).toHaveCount(0);
  await expect(page.locator('#section-06')).toHaveCount(0);
  await expect(page.locator('#section-08')).toHaveCount(0);
  await expect(page.locator('#section-03')).toBeVisible();
  await expect(page.locator('#section-04 table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exportar' }).click();
  const wordDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Word/ }).click();
  const wordFile = await wordDownload;
  expect(wordFile.suggestedFilename()).toBe('DOCUMENTO.doc');
  const word = await readFile(await wordFile.path(), 'utf8');
  expect(word).not.toContain('<span>01</span>');
  expect(word).not.toContain('<span>05</span>');
  expect(word).not.toContain('Información del documento');
  expect(word).not.toContain('evolutivo-payload');
  for (const metadata of [original.document.title, original.document.ticketId, original.document.application, original.document.author, original.document.date, original.document.version, original.document.technicalProfile]) {
    expect(word).not.toContain(metadata);
  }
  await page.evaluate(() => { window.__printedDocument = null; window.print = () => { window.__printedDocument = document.querySelector('.document-area').innerText; }; });
  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('button', { name: /PDF/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printedDocument)).not.toBeNull();
  const printContent = await page.evaluate(() => window.__printedDocument);
  expect(printContent).not.toContain('Cabecera');
  expect(printContent).not.toContain('Detalle técnico');
  expect(printContent).not.toContain(original.document.ticketId);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.sidebar .nav-item.active')).toContainText('07');
  await context.close();
});

test('lector activo puede previsualizar, pero no crear ni proponer', async ({ browser }) => {
  mock.profiles.set(mock.applicant.id, mock.profile(mock.applicant, 'reader', true));
  const structure = { schemaVersion: 1, type: 'full', root: null, sections: [{ templateNodeId: 'section:03', kind: 'section', sectionId: '03', label: '03', config: {}, children: [] }] };
  mock.templates.push({ id: 'template-1', owner_id: mock.admin.id, template_type: 'full', root_kind: null, section_id: null, root_slot: null, published_version_id: 'version-1', retired_at: null });
  mock.templateVersions.push({ id: 'version-1', template_id: 'template-1', revision: 1, name: 'Solo resumen', description: '', category: '', structure, state: 'approved', author_id: mock.admin.id, created_at: new Date().toISOString() });
  const context = await mock.context(browser, mock.applicant);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Nuevo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('button', { name: /Solo resumen/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Sección 03' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear documento' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Proponer plantilla' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Pendientes' })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 740 });
  const size = await page.locator('.template-modal').evaluate((element) => ({ width: element.getBoundingClientRect().width, viewport: window.innerWidth }));
  expect(size.width).toBeLessThanOrEqual(size.viewport);
  await context.close();
});

test('rechazo motivado deja visible el motivo al autor', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Borrador');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Borrador/ }).click();
  await page.getByLabel('Motivo del rechazo').fill('Revisar cabeceras');
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Borrador/ }).click();
  await expect(page.getByText('Motivo del rechazo: Revisar cabeceras')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('#section-01')).toBeVisible();
  await context.close();
});

test('cancelación o retirada no sustituyen cambios locales', async ({ browser }) => {
  const structure = { schemaVersion: 1, type: 'full', root: null, sections: [{ templateNodeId: 'section:03', kind: 'section', sectionId: '03', label: '03', config: {}, children: [] }] };
  mock.templates.push({ id: 'template-1', owner_id: mock.admin.id, template_type: 'full', root_kind: null, section_id: null, root_slot: null, published_version_id: 'version-1', retired_at: null });
  mock.templateVersions.push({ id: 'version-1', template_id: 'template-1', revision: 1, name: 'Solo resumen', description: '', category: '', structure, state: 'approved', author_id: mock.admin.id, created_at: new Date().toISOString() });
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Trabajo sin exportar');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('button', { name: /Solo resumen/ }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Crear documento' }).click();
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Trabajo sin exportar');
  mock.templates[0].retired_at = new Date().toISOString();
  await page.getByRole('button', { name: 'Crear documento' }).click();
  await expect(page.getByRole('alert')).toContainText('template unavailable');
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Trabajo sin exportar');
  await context.close();
});

test('cancelar o fallar una propuesta no publica ni altera el documento', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Documento sin guardar');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Borrador cancelado');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect(mock.templateVersions).toHaveLength(0);
  mock.failStage = 'template-propose';
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Borrador fallido');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect(page.getByRole('alert')).toContainText('proposal unavailable');
  expect(mock.templateVersions).toHaveLength(0);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Documento sin guardar');
  await context.close();
});

test('editor no recibe controles administrativos y el catálogo anuncia carga, vacío y error', async ({ browser }) => {
  mock.profiles.set(mock.applicant.id, mock.profile(mock.applicant, 'editor', true));
  mock.templateReadDelay = 400;
  const context = await mock.context(browser, mock.applicant);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Cargando plantillas' })).toBeVisible();
  await expect(page.getByText('No hay plantillas en esta pestaña.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pendientes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Proponer plantilla' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: 'Proponer plantilla' })).toBeVisible();
  mock.failStage = 'template-list';
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await expect(page.getByRole('alert')).toContainText('catalog unavailable');
  await context.close();
});

test('modal accesible conserva foco, tema oscuro y anchura móvil', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Plantillas' });
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Biblioteca de plantillas' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1000, height: 520 });
  await expect(opener).toBeFocused();
  await page.getByRole('switch', { name: 'Cambiar al tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await opener.click();
  await page.setViewportSize({ width: 375, height: 740 });
  const bounds = await page.locator('.template-modal').evaluate((node) => ({ width: node.getBoundingClientRect().width, viewport: innerWidth, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
  await context.close();
});

test('omitir 01, 05, 06 y 08 o solo una fuente mantiene salidas y copia modular coherentes', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const initialDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const original = JSON.parse(await readFile(await (await initialDownload).path(), 'utf8'));
  const omitted = { ...original, sectionOrder: ['02', '03', '04', '07'], moduleManifest: { '04': { table: false } } };
  await page.locator('input[type=file]').setInputFiles({ name: 'omitidas.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(omitted)) });
  for (const id of ['01', '05', '06', '08']) {
    await expect(page.locator(`#section-${id}`)).toHaveCount(0);
    await expect(page.locator(`.sidebar .nav-item[href="#section-${id}"]`)).toHaveCount(0);
  }
  await expect(page.locator('#section-04 table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exportar' }).click();
  const wordDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Word/ }).click();
  const word = await readFile(await (await wordDownload).path(), 'utf8');
  for (const text of ['Información del documento', 'Detalle técnico', 'Modelo de datos', 'Anexos', original.document.title, original.document.ticketId, 'evolutivo-payload']) expect(word).not.toContain(text);
  await page.evaluate(() => { window.__printedDocument = null; window.print = () => { window.__printedDocument = document.querySelector('.document-area').innerText; }; });
  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('button', { name: /PDF/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printedDocument)).not.toBeNull();
  const printed = await page.evaluate(() => window.__printedDocument);
  for (const text of ['Cabecera', 'Detalle técnico', 'Datos / Modelo de datos', original.document.ticketId]) expect(printed).not.toContain(text);
  await page.getByRole('button', { name: 'Exportar' }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const copy = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
  expect(copy.sectionOrder).toEqual(['02', '03', '04', '07']);
  expect(copy.document.technicalProfileTags).toEqual([]);
  await page.locator('input[type=file]').setInputFiles({ name: 'vuelta.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copy)) });
  await expect(page.locator('.document-area > section')).toHaveCount(4);
  await expect(page.locator('#section-04 table')).toHaveCount(0);
  await context.close();
});

test('fuente 06 desmarcada se excluye conservando su sección y subapartado', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Fuentes parciales');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Fuentes parciales/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await page.getByRole('button', { name: /Fuentes parciales/ }).click();
  const sources = page.getByRole('checkbox', { name: /Tabla \/ fichero \/ datos/ });
  await expect(sources).toHaveCount(2);
  await sources.first().uncheck();
  await expect(page.getByRole('checkbox', { name: /Subapartado de datos/ }).first()).toHaveAttribute('aria-checked', 'mixed');
  for (const id of ['01', '02', '03', '04', '05', '07', '08']) await page.getByRole('checkbox', { name: `Sección ${id}` }).uncheck();
  await page.getByRole('button', { name: 'Crear documento' }).click();
  await expect(page.locator('#section-06')).toBeVisible();
  await expect(page.locator('.data-source-block')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exportar' }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Copia editable/ }).click();
  const copy = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
  expect(copy.sectionOrder).toEqual(['06']);
  expect(copy.dataModel).toHaveLength(2);
  expect(copy.dataModel.map((group) => group.sources.length)).toEqual([0, 1]);
  await page.getByRole('button', { name: 'Exportar' }).click();
  const wordDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Word/ }).click();
  const word = await readFile(await (await wordDownload).path(), 'utf8');
  expect((word.match(/<h4>/g) ?? [])).toHaveLength(1);
  await page.evaluate(() => { window.__printedSources = null; window.print = () => { window.__printedSources = document.querySelectorAll('.document-area .data-source-block').length; }; });
  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('button', { name: /PDF/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printedSources)).toBe(1);
  await context.close();
});

test('propuesta parcial se guarda recortada y se usa en privado mientras sigue pendiente', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await expect(page.getByRole('button', { name: 'Proponer plantilla' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Esquema privado');
  await page.getByRole('checkbox', { name: 'Sección 01' }).uncheck();
  for (const id of ['02', '03', '04', '07', '08']) await page.getByRole('checkbox', { name: `Sección ${id}` }).uncheck();
  await page.getByRole('checkbox', { name: 'Sección 05' }).uncheck();
  await page.getByRole('checkbox', { name: 'Sección 06' }).uncheck();
  await expect(page.getByRole('button', { name: 'Enviar propuesta' })).toBeDisabled();
  expect(mock.templateVersions).toHaveLength(0);
  await page.getByRole('checkbox', { name: 'Sección 05' }).check();
  await page.getByRole('checkbox', { name: 'Sección 06' }).check();
  const sources = page.getByRole('checkbox', { name: /Tabla \/ fichero \/ datos/ });
  await sources.first().uncheck();
  await expect(page.getByRole('checkbox', { name: /Subapartado de datos/ }).first()).toHaveAttribute('aria-checked', 'mixed');
  await expect(page.locator('.template-proposal .template-selection-summary')).toContainText('2 secciones seleccionadas');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  const saved = mock.templateVersions[0];
  expect(saved.structure.sections.map((section) => section.sectionId)).toEqual(['05', '06']);
  expect(saved.structure.sections.find((section) => section.sectionId === '06').children[0].children).toHaveLength(0);
  expect(saved.state).toBe('pending');
  await page.getByRole('button', { name: /Esquema privado/ }).click();
  await page.getByRole('checkbox', { name: 'Sección 05' }).uncheck();
  await page.getByRole('button', { name: 'Crear documento desde mi propuesta' }).click();
  await expect(page.locator('#section-06')).toBeVisible();
  await expect(page.locator('#section-05')).toHaveCount(0);
  expect(saved.state).toBe('pending');
  expect(mock.templates[0].published_version_id).toBeNull();
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await expect(page.getByRole('button', { name: /Esquema privado/ })).toHaveCount(0);
  await context.close();
});

test('ocultar pendientes y rechazadas conserva revisión, cola y auditoría', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Base privada');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('button', { name: /Base privada/ }).click();
  const first = mock.templateVersions[0];
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: /Base privada/ })).toHaveCount(0);
  expect(first.deleted_at).toBeNull();
  expect(first.author_hidden_at).toBeTruthy();
  expect(mock.templateEvents.map((event) => event.action)).toEqual(['proposed', 'hidden']);
  const legacyDeleteStatus = await page.evaluate(async (versionId) => {
    const response = await fetch('https://test.supabase.invalid/rest/v1/rpc/template_delete_proposal', {
      method: 'POST', headers: { authorization: 'Bearer local-access-11111111-1111-4111-8111-111111111111', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_version_id: versionId, p_expected_state: 'pending' }),
    });
    return response.status;
  }, first.id);
  expect(legacyDeleteStatus).toBe(409);
  expect(first.deleted_at).toBeNull();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await expect(page.getByRole('button', { name: /Base privada/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Base rechazada');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  const rejected = mock.templateVersions[1];
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Base rechazada/ }).click();
  await page.getByLabel('Motivo del rechazo').fill('Revisar etiquetas');
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Base rechazada/ }).click();
  await expect(page.getByRole('button', { name: 'Crear documento desde mi propuesta' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear documento desde mi propuesta' }).click();
  expect(rejected.state).toBe('rejected');
  expect(mock.templates[1].published_version_id).toBeNull();
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Base rechazada/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: /Base rechazada/ })).toHaveCount(0);
  expect(rejected.deleted_at).toBeNull();
  expect(rejected.author_hidden_at).toBeTruthy();
  expect(rejected.review_reason).toBe('Revisar etiquetas');
  expect(mock.templateEvents.map((event) => event.action)).toEqual(['proposed', 'hidden', 'proposed', 'rejected', 'hidden']);
  await context.close();
});

test('errores privados y revisión concurrente no impiden ocultar sin cambiar publicación', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Trabajo local');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Borrador en carrera');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('button', { name: /Borrador en carrera/ }).click();
  mock.failStage = 'template-own-current';
  await page.getByRole('button', { name: 'Crear documento desde mi propuesta' }).click();
  await expect(page.getByRole('alert')).toContainText('private template unavailable');
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Trabajo local');
  mock.failStage = null;
  mock.templateVersions[0].state = 'approved';
  mock.templates[0].published_version_id = mock.templateVersions[0].id;
  mock.failStage = 'template-hide';
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await expect(page.getByRole('alert')).toContainText('hide unavailable');
  await expect(page.getByRole('button', { name: /Borrador en carrera/ })).toBeVisible();
  mock.failStage = null;
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: /Borrador en carrera/ })).toHaveCount(0);
  expect(mock.templateVersions[0].deleted_at).toBeNull();
  expect(mock.templateVersions[0].author_hidden_at).toBeTruthy();
  expect(mock.templates[0].published_version_id).toBe(mock.templateVersions[0].id);
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await expect(page.getByRole('button', { name: /Borrador en carrera/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Pendiente que fue rechazada');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('button', { name: /Pendiente que fue rechazada/ }).click();
  mock.templateVersions[1].state = 'rejected';
  mock.templateVersions[1].review_reason = 'Motivo concurrente';
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: /Pendiente que fue rechazada/ })).toHaveCount(0);
  expect(mock.templateVersions[1].deleted_at).toBeNull();
  expect(mock.templateVersions[1].author_hidden_at).toBeTruthy();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Trabajo local');
  await context.close();
});

test('editor usa su propuesta, pero RPC privadas deniegan versión ajena e inactivos', async ({ browser }) => {
  mock.profiles.set(mock.applicant.id, mock.profile(mock.applicant, 'editor', true));
  const editorContext = await mock.context(browser, mock.applicant);
  const editorPage = await editorContext.newPage();
  await editorPage.goto('/');
  await editorPage.getByRole('button', { name: 'Plantillas' }).click();
  await editorPage.getByRole('tab', { name: 'Mis propuestas' }).click();
  await editorPage.getByRole('button', { name: 'Proponer plantilla' }).click();
  await editorPage.getByLabel('Nombre', { exact: true }).fill('Propuesta del editor');
  await editorPage.getByRole('button', { name: 'Enviar propuesta' }).click();
  await editorPage.getByRole('button', { name: /Propuesta del editor/ }).click();
  await editorPage.getByRole('button', { name: 'Crear documento desde mi propuesta' }).click();
  await expect(editorPage.locator('#section-01')).toBeVisible();
  expect(mock.templateVersions[0].state).toBe('pending');

  const callPrivate = async (page, accountId, procedure) => page.evaluate(async ({ accountId, procedure, versionId }) => {
    const response = await fetch(`https://test.supabase.invalid/rest/v1/rpc/${procedure}`, {
      method: 'POST', headers: { authorization: `Bearer local-access-${accountId}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_version_id: versionId }),
    });
    return response.status;
  }, { accountId, procedure, versionId: mock.templateVersions[0].id });
  const adminContext = await mock.context(browser, mock.admin);
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/');
  expect(await callPrivate(adminPage, mock.admin.id, 'template_own_current')).toBe(409);
  expect(await callPrivate(adminPage, mock.admin.id, 'template_hide_own_version')).toBe(403);
  await editorPage.getByRole('button', { name: 'Plantillas' }).click();
  await editorPage.getByRole('tab', { name: 'Mis propuestas' }).click();
  await editorPage.getByRole('button', { name: /Propuesta del editor/ }).click();
  editorPage.once('dialog', (dialog) => dialog.accept());
  await editorPage.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  expect(await callPrivate(editorPage, mock.applicant.id, 'template_own_current')).toBe(409);
  expect(await callPrivate(editorPage, mock.applicant.id, 'template_hide_own_version')).toBe(409);
  mock.profiles.set(mock.applicant.id, mock.profile(mock.applicant, 'editor', false));
  expect(await callPrivate(editorPage, mock.applicant.id, 'template_own_current')).toBe(409);
  expect(await callPrivate(editorPage, mock.applicant.id, 'template_hide_own_version')).toBe(403);
  expect(mock.templateVersions[0].deleted_at).toBeNull();
  await editorContext.close();
  await adminContext.close();
});

test('árbol de propuesta conserva casillas alineadas en móvil y tema oscuro', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  const tree = page.locator('.template-proposal .template-tree-preview');
  await expect(tree.getByRole('checkbox', { name: 'Sección 01' })).toBeEnabled();
  for (const width of [1000, 375]) {
    await page.setViewportSize({ width, height: 740 });
    const bounds = await tree.evaluate((node) => ({
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
      checkboxWidth: node.querySelector('input[type=checkbox]').getBoundingClientRect().width,
      labelWidth: node.querySelector('label').getBoundingClientRect().width,
    }));
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
    expect(bounds.checkboxWidth).toBeGreaterThanOrEqual(15);
    expect(bounds.labelWidth).toBeGreaterThan(bounds.checkboxWidth);
  }
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.setViewportSize({ width: 1000, height: 740 });
  await page.getByRole('switch', { name: 'Cambiar al tema oscuro' }).click();
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.template-proposal .template-tree-preview').getByRole('checkbox', { name: 'Sección 01' })).toBeEnabled();
  await context.close();
});

test('versión aprobada oculta sigue disponible y versión retirada propia se puede usar', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Aprobada personal');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Aprobada personal/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Aprobada personal/ }).click();
  await expect(page.getByRole('button', { name: 'Crear documento desde mi propuesta' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: /Aprobada personal/ })).toHaveCount(0);
  expect(mock.templateVersions[0].state).toBe('approved');
  expect(mock.templates[0].published_version_id).toBe(mock.templateVersions[0].id);
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await expect(page.getByRole('button', { name: /Aprobada personal/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Retirada personal');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Retirada personal/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await page.getByRole('button', { name: /Retirada personal/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Retirar plantilla' }).click();
  await expect(page.getByRole('button', { name: /Retirada personal/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Retirada personal/ }).click();
  await page.getByRole('button', { name: 'Crear documento desde mi propuesta' }).click();
  await expect(page.locator('#section-01')).toBeVisible();
  expect(mock.templateVersions[1].state).toBe('approved');
  await context.close();
});

test('rechazo sin motivo guarda NULL y revisión continúa tras ocultación del autor', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Sin motivo');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Sin motivo/ }).click();
  await expect(page.getByRole('button', { name: 'Rechazar' })).toBeEnabled();
  await page.getByRole('button', { name: 'Rechazar' }).click();
  expect(mock.templateVersions[0].review_reason).toBeNull();
  expect(mock.templateEvents.at(-1).reason).toBeNull();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Sin motivo/ }).click();
  await expect(page.getByText(/Motivo del rechazo:/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Oculta en cola');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('button', { name: /Oculta en cola/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ocultar de Mis propuestas' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Oculta en cola/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  expect(mock.templateVersions[1].state).toBe('approved');
  expect(mock.templateVersions[1].author_hidden_at).toBeTruthy();
  await page.getByRole('tab', { name: 'Disponibles' }).click();
  await expect(page.getByRole('button', { name: /Oculta en cola/ })).toBeVisible();
  await context.close();
});

test('motivo con espacios, tabulaciones y saltos se normaliza a NULL', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Sin contenido en motivo');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await page.getByRole('button', { name: /Sin contenido en motivo/ }).click();
  await page.getByLabel('Motivo del rechazo').fill(' \t\r\n  ');
  await page.getByRole('button', { name: 'Rechazar' }).click();
  expect(mock.templateVersions[0].review_reason).toBeNull();
  expect(mock.templateEvents.at(-1).reason).toBeNull();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: /Sin contenido en motivo/ }).click();
  await expect(page.getByText(/Motivo del rechazo:/)).toHaveCount(0);
  await context.close();
});

test('cabecera y pestañas del catálogo permanecen visibles durante scroll interno', async ({ browser }) => {
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  for (const width of [1000, 375]) {
    await page.setViewportSize({ width, height: 520 });
    const metrics = await page.locator('.template-catalog-body').evaluate((body) => {
      body.scrollTop = body.scrollHeight;
      const dialog = body.closest('.template-modal');
      const head = dialog.querySelector('.modal-head').getBoundingClientRect();
      const tabs = dialog.querySelector('.template-tabs').getBoundingClientRect();
      return { scrollable: body.scrollHeight > body.clientHeight, top: body.scrollTop, headBottom: head.bottom, tabsBottom: tabs.bottom,
        bodyTop: body.getBoundingClientRect().top, dialogWidth: dialog.getBoundingClientRect().width, viewport: innerWidth,
        horizontal: dialog.scrollWidth > dialog.clientWidth + 1 };
    });
    expect(metrics.scrollable).toBe(true);
    expect(metrics.top).toBeGreaterThan(0);
    expect(metrics.headBottom).toBeLessThanOrEqual(metrics.bodyTop);
    expect(metrics.tabsBottom).toBeLessThanOrEqual(metrics.bodyTop);
    expect(metrics.dialogWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.horizontal).toBe(false);
  }
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.setViewportSize({ width: 1000, height: 520 });
  await page.getByRole('switch', { name: 'Cambiar al tema oscuro' }).click();
  const opener = page.getByRole('button', { name: 'Plantillas' });
  await opener.click();
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await page.getByRole('button', { name: 'Proponer plantilla' }).click();
  await page.setViewportSize({ width: 375, height: 520 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await page.locator('.template-catalog-body').evaluate((body) => {
    body.scrollTop = body.scrollHeight;
    return { top: body.scrollTop, horizontal: body.closest('.template-modal').scrollWidth > body.closest('.template-modal').clientWidth + 1 };
  });
  expect(dark.top).toBeGreaterThan(0);
  expect(dark.horizontal).toBe(false);
  const dialog = page.getByRole('dialog', { name: 'Biblioteca de plantillas' });
  const lastCheckbox = dialog.getByRole('checkbox', { name: 'Sección 08' });
  await lastCheckbox.scrollIntoViewIfNeeded();
  await lastCheckbox.focus();
  await expect(lastCheckbox).toBeFocused();
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba de teclado');
  const submit = dialog.getByRole('button', { name: 'Enviar propuesta' });
  await submit.focus();
  await expect(submit).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(submit).toBeFocused();
  await page.setViewportSize({ width: 1000, height: 520 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await context.close();
});

test('tombstones globales anteriores siguen fuera de todas las listas y RPC privadas', async ({ browser }) => {
  const structure = { schemaVersion: 1, type: 'full', root: null, sections: [{ templateNodeId: 'section:03', kind: 'section', sectionId: '03', label: '03', config: {}, children: [] }] };
  mock.templates.push({ id: 'template-old', owner_id: mock.admin.id, template_type: 'full', root_kind: null, section_id: null, root_slot: null, published_version_id: 'version-old', retired_at: null });
  mock.templateVersions.push({ id: 'version-old', template_id: 'template-old', revision: 1, name: 'Versión borrada', description: '', category: '', structure, state: 'approved', author_id: mock.admin.id, deleted_at: new Date().toISOString(), author_hidden_at: null, created_at: new Date().toISOString() });
  const context = await mock.context(browser, mock.admin);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantillas' }).click();
  await expect(page.getByRole('button', { name: /Versión borrada/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Mis propuestas' }).click();
  await expect(page.getByRole('button', { name: /Versión borrada/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Pendientes' }).click();
  await expect(page.getByRole('button', { name: /Versión borrada/ })).toHaveCount(0);
  const status = await page.evaluate(async () => {
    const response = await fetch('https://test.supabase.invalid/rest/v1/rpc/template_own_current', {
      method: 'POST', headers: { authorization: 'Bearer local-access-11111111-1111-4111-8111-111111111111', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_version_id: 'version-old' }),
    });
    return response.status;
  });
  expect(status).toBe(409);
  await context.close();
});
