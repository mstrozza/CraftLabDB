import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpenText,
  Boxes,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  Download,
  FileText,
  Info,
  Link2,
  LogOut,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Moon,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { SECTION_IDS, documentSectionOrder, instantiateTemplate, pruneDocumentSections } from './data/templateStructure';
import TemplateCatalog from './data/TemplateCatalog';
import { getCurrentTemplate, getOwnCurrentTemplate, listAvailableTemplates } from './data/templateRepository';

const DocumentEditContext = createContext(true);

const sectionDefinitions = [
  { id: '01', title: 'Cabecera', icon: FileText },
  { id: '02', title: 'Histórico de cambios', icon: Clock3 },
  { id: '03', title: 'Resumen del cambio', icon: Info },
  { id: '04', title: 'Componentes afectados', icon: Boxes },
  { id: '05', title: 'Detalle técnico', icon: Code2 },
  { id: '06', title: 'Datos / Modelo de datos', icon: Database },
  { id: '07', title: 'Casos de prueba', icon: CheckSquare2 },
  { id: '08', title: 'Referencias / Documentación relacionada', icon: Link2 },
];

const navigationOffset = 84;

const technicalProfileGroups = [
  { id: 'technology', title: 'Tecnología y ejecución', options: ['COBOL', 'Batch', 'CICS', 'DB2', 'JCL', 'VSAM', 'Copybook', 'BMS', 'SQL embebido', 'IBM MQ'] },
  { id: 'banking', title: 'Operativa bancaria', options: ['Cuentas', 'Transferencias', 'Pagos', 'Tarjetas', 'SEPA', 'SWIFT', 'Conciliación', 'Liquidación', 'Contabilidad', 'Riesgos'] },
];
const getTechnicalProfileGroups = (document) => technicalProfileGroups.map((group) => ({
  ...group,
  options: [...new Set([...group.options, ...(document.technicalProfileCustomOptions?.[group.id] ?? [])])],
}));
const getTechnicalProfileOptions = (document) => getTechnicalProfileGroups(document).flatMap((group) => group.options);
const getTechnicalProfileTags = (document) => {
  const availableOptions = getTechnicalProfileOptions(document);
  if (Array.isArray(document.technicalProfileTags)) {
    return availableOptions.filter((option) => document.technicalProfileTags.includes(option));
  }
  const legacyProfile = String(document.technicalProfile ?? '').toLocaleLowerCase('es-ES');
  return availableOptions.filter((option) => legacyProfile.includes(option.toLocaleLowerCase('es-ES')));
};

const createItemId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultDataColumns = () => [
  { id: 'field', label: 'Campo', kind: 'text', width: '22%' },
  { id: 'dataType', label: 'Tipo de dato', kind: 'text', width: '18%' },
  { id: 'action', label: 'Acción', kind: 'action', width: '18%' },
  { id: 'description', label: 'Descripción', kind: 'text' },
];

const createDefaultTableColumns = () => ({
  history: [
    { id: 'version', label: 'Versión', kind: 'text', width: '12%' },
    { id: 'date', label: 'Fecha', kind: 'date', width: '18%' },
    { id: 'author', label: 'Autor', kind: 'text', width: '22%' },
    { id: 'description', label: 'Descripción del cambio', kind: 'text' },
  ],
  affectedComponents: [
    { id: 'component', label: 'Componente', kind: 'text', width: '19%' },
    { id: 'type', label: 'Tipo', kind: 'text', width: '20%' },
    { id: 'action', label: 'Acción', kind: 'action', width: '17%' },
    { id: 'description', label: 'Descripción breve', kind: 'text' },
  ],
  testCases: [
    { id: 'id', label: 'ID', kind: 'text', width: '10%' },
    { id: 'scenario', label: 'Escenario', kind: 'text' },
    { id: 'conditions', label: 'Datos / Condiciones', kind: 'text' },
    { id: 'expected', label: 'Resultado esperado', kind: 'text' },
    { id: 'obtained', label: 'Resultado obtenido', kind: 'text' },
  ],
  references: [
    { id: 'reference', label: 'Referencia', kind: 'text', width: '20%' },
    { id: 'location', label: 'Enlace / Ubicación', kind: 'text', width: '25%' },
    { id: 'description', label: 'Descripción', kind: 'text' },
  ],
});

const toEditableColumn = (column) => ({
  key: column.id,
  label: column.label,
  width: column.width,
  badge: column.kind === 'action',
  type: column.kind === 'date' ? 'date' : 'text',
});

const getTableColumns = (data, key) => data.tableColumns?.[key] ?? createDefaultTableColumns()[key];

const createInitialDocument = (authorName = 'Usuario') => ({
  schemaVersion: '1.0',
  sectionOrder: [...SECTION_IDS],
  moduleManifest: {},
  tableColumns: createDefaultTableColumns(),
  document: {
    title: 'Validación de nuevo indicador en transferencias recibidas',
    ticketId: 'DB-28451',
    application: 'TRF · Transferencias',
    author: authorName,
    date: '2025-05-07',
    version: '1.1',
    technicalProfile: 'COBOL + DB2 (Batch)',
    technicalProfileTags: ['COBOL', 'DB2', 'Batch'],
    technicalProfileCustomOptions: { technology: [], banking: [] },
  },
  history: [
    { version: '1.0', date: '2025-05-07', author: authorName, description: 'Creación inicial del documento' },
    { version: '1.1', date: '2025-05-15', author: authorName, description: 'Actualización del análisis técnico y casos de prueba' },
  ],
  summary:
    'Se modifica el tratamiento de transferencias recibidas para incorporar la validación del nuevo indicador XXX antes de realizar la contabilización. El objetivo es evitar el procesamiento de operaciones que no cumplen las nuevas condiciones definidas por negocio.',
  affectedComponents: [
    { component: 'PGMTRF01', type: 'Programa COBOL', action: 'Modificado', description: 'Incorporación de nueva validación antes de contabilización' },
    { component: 'CPYTRF02', type: 'Copybook', action: 'Modificado', description: 'Nuevo indicador de operación' },
    { component: 'JCLTRF01', type: 'JCL', action: 'Modificado', description: 'Adaptación del proceso batch' },
    { component: 'PGMTRF03', type: 'Programa COBOL', action: 'Nuevo', description: 'Nuevo tratamiento de rechazo de operación' },
  ],
  technicalDetail: [
    {
      id: 'detail-1',
      title: 'Modificación del tratamiento de entrada',
      content: 'Se añade la validación del nuevo indicador XXX en el punto de entrada del programa PGMTRF01, antes de realizar cualquier proceso de negocio.',
      code: "01  WS-INDICADOR-XXX      PIC X(1).\n\n    IF WS-INDICADOR-XXX = 'X'\n       PERFORM 900-RECHAZAR-OPERACION\n       GO TO 999-FIN-PROGRAMA\n    END-IF.",
      codeEnabled: true,
    },
    { id: 'detail-2', title: 'Validación del indicador', content: 'Se aceptan los valores informados en la tabla de parametrización vigente.', code: '', codeEnabled: true },
    { id: 'detail-3', title: 'Tratamiento de errores', content: 'Las operaciones no válidas se rechazan con el código funcional correspondiente.', code: '', codeEnabled: true },
    { id: 'detail-4', title: 'Modificaciones en proceso batch', content: 'El JCL incorpora el nuevo paso de validación previo a la contabilización.', code: '', codeEnabled: true },
  ],
  dataModel: [
    {
      id: 'data-1',
      title: 'Persistencia DB2',
      description: 'Cambios necesarios en las tablas utilizadas por el proceso de transferencias.',
      sources: [
        {
          id: 'data-source-1',
          type: 'Tabla',
          title: 'TB_OPERACIONES',
          description: 'Tabla principal de operaciones utilizada durante la validación.',
          columns: createDefaultDataColumns(),
          items: [
            { field: 'IND_TIPO', dataType: 'CHAR(1)', action: 'Modificado', description: 'Incorporación del nuevo valor X' },
          ],
        },
      ],
    },
    {
      id: 'data-2',
      title: 'Fichero de entrada',
      description: 'Adaptación de la estructura recibida por el proceso batch.',
      sources: [
        {
          id: 'data-source-2',
          type: 'Fichero',
          title: 'FIC_TRF_ENT',
          description: 'Estructura de entrada recibida por el proceso batch.',
          columns: createDefaultDataColumns(),
          items: [
            { field: 'TIPO-OPER', dataType: 'X(01)', action: 'Nuevo', description: 'Indicador recibido en fichero' },
          ],
        },
      ],
    },
  ],
  testCases: [
    { id: 'CP-01', scenario: 'Operación válida', conditions: 'Indicador = A', expected: 'Operación procesada', obtained: '—' },
    { id: 'CP-02', scenario: 'Indicador no permitido', conditions: 'Indicador = X', expected: 'Operación rechazada', obtained: '—' },
    { id: 'CP-03', scenario: 'Indicador vacío', conditions: 'Sin información', expected: 'Aplicación del tratamiento existente', obtained: '—' },
  ],
  references: [
    { reference: 'DB-28451', location: 'Jira', description: 'Petición origen del evolutivo' },
    { reference: 'DOC-1234', location: 'Confluence', description: 'Especificación funcional' },
    { reference: 'INC-19284', location: 'ServiceNow', description: 'Incidencia relacionada' },
  ],
});

const emptyDocument = (authorName = 'Usuario') => {
  const base = createInitialDocument(authorName);
  return {
    ...base,
    document: {
      ...base.document,
      title: 'Nuevo evolutivo',
      ticketId: 'EV-NUEVO',
      application: '',
      author: authorName,
      date: new Date().toISOString().slice(0, 10),
      version: '1.0',
    },
    history: [{ version: '1.0', date: new Date().toISOString().slice(0, 10), author: authorName, description: 'Creación inicial del documento' }],
    summary: '',
    affectedComponents: [],
    technicalDetail: [{ id: createItemId('detail'), title: 'Descripción de la implementación', content: '', code: '', codeEnabled: true }],
    dataModel: [],
    testCases: [],
    references: [],
  };
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const normalizeDocument = (source) => {
  const normalized = structuredClone(source);
  normalized.sectionOrder = documentSectionOrder(normalized);
  normalized.moduleManifest ??= {};
  normalized.document ??= {};
  normalized.document.technicalProfileCustomOptions = Object.fromEntries(technicalProfileGroups.map((group) => {
    const customOptions = normalized.document.technicalProfileCustomOptions?.[group.id];
    return [group.id, Array.isArray(customOptions) ? [...new Set(customOptions.map((option) => String(option).trim()).filter(Boolean))] : []];
  }));
  normalized.document.technicalProfileTags = getTechnicalProfileTags(normalized.document);
  const defaultTableColumns = createDefaultTableColumns();
  normalized.tableColumns = Object.fromEntries(Object.entries(defaultTableColumns).map(([key, defaults]) => {
    const supplied = normalized.tableColumns?.[key];
    const columns = Array.isArray(supplied) && supplied.length ? supplied : defaults;
    return [key, columns.map((column, index) => {
      const id = column.id ?? column.key ?? `column-imported-${index + 1}`;
      const defaultColumn = defaults.find((item) => item.id === id);
      const rawKind = column.kind ?? (column.badge ? 'action' : column.type ?? defaultColumn?.kind);
      return {
        id,
        label: column.label ?? defaultColumn?.label ?? `Columna ${index + 1}`,
        kind: ['action', 'date'].includes(rawKind) ? rawKind : 'text',
        width: column.width ?? defaultColumn?.width,
      };
    })];
  }));
  normalized.affectedComponents = (normalized.affectedComponents ?? []).map((item) => ({
    ...item,
    action: item.action === 'Eliminado/Deprecado' ? 'Eliminado' : item.action,
  }));
  normalized.technicalDetail = (normalized.technicalDetail ?? []).map((block, index) => ({
    id: block.id ?? `detail-imported-${index + 1}`,
    title: block.title ?? '',
    content: block.content ?? '',
    code: block.code ?? '',
    codeEnabled: block.codeEnabled ?? true,
  }));

  const normalizeDataSource = (source, fallbackId) => ({
    id: source.id ?? fallbackId,
    type: ['Tabla', 'Fichero', 'Datos'].includes(source.type) ? source.type : 'Tabla',
    title: source.title ?? '',
    description: source.description ?? '',
    columns: (source.columns?.length ? source.columns : createDefaultDataColumns()).map((column, columnIndex) => ({
      id: column.id ?? column.key ?? `column-${columnIndex + 1}`,
      label: column.label ?? `Columna ${columnIndex + 1}`,
      kind: column.kind === 'action' || column.badge ? 'action' : 'text',
      width: column.width,
    })),
    items: (source.items ?? []).map((item) => ({
      ...item,
      action: item.action === 'Eliminado/Deprecado' ? 'Eliminado' : item.action,
    })),
  });

  const currentDataModel = normalized.dataModel ?? [];
  if (currentDataModel.some((item) => Object.hasOwn(item, 'source'))) {
    const groups = new Map();
    currentDataModel.forEach(({ source, field, dataType, action, description }) => {
      const title = source || 'Tabla / Fichero sin nombre';
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push({
        field: field ?? '',
        dataType: dataType ?? '',
        action: action === 'Eliminado/Deprecado' ? 'Eliminado' : action,
        description: description ?? '',
      });
    });
    normalized.dataModel = [...groups].map(([title, items], index) => ({
      id: `data-imported-${index + 1}`,
      title,
      description: '',
      sources: [normalizeDataSource({ title, items }, `data-source-imported-${index + 1}-1`)],
    }));
  } else {
    normalized.dataModel = currentDataModel.map((group, index) => ({
      id: group.id ?? `data-imported-${index + 1}`,
      title: group.title ?? '',
      description: group.description ?? '',
      sources: (group.sources ?? [{ id: `data-source-imported-${index + 1}-1`, title: group.title ?? '', items: group.items ?? [] }]).map((source, sourceIndex) => normalizeDataSource(source, `data-source-imported-${index + 1}-${sourceIndex + 1}`)),
    }));
  }
  return pruneDocumentSections(normalized);
};

const wordTable = (headers, rows) => `
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length
      ? rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header.key])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}">Sin impacto / No aplica.</td></tr>`}
    </tbody>
  </table>`;

const buildWordDocument = (data) => {
  const section = (number, title, content) => `<section><h2><span>${number}</span> ${escapeHtml(title)}</h2>${content}</section>`;
  const headerRows = [
    ['Título', data.document.title, 'ID / Ticket', data.document.ticketId],
    ['Aplicación', data.document.application, 'Autor', data.document.author],
    ['Fecha', data.document.date, 'Versión', data.document.version],
  ];
  const headerTable = `<table>${headerRows.map((row) => `<tr><th>${escapeHtml(row[0])}</th><td>${escapeHtml(row[1])}</td><th>${escapeHtml(row[2])}</th><td>${escapeHtml(row[3])}</td></tr>`).join('')}${data.moduleManifest?.['01']?.technicalProfile === false ? '' : `<tr><th>Perfil técnico</th><td colspan="3">${escapeHtml(data.document.technicalProfile || 'Sin especificar')}</td></tr>`}</table>`;
  const detail = (data.technicalDetail ?? []).map((block, index) => `<article><h3>5.${index + 1} ${escapeHtml(block.title)}</h3><p>${escapeHtml(block.content)}</p>${block.codeEnabled && block.code ? `<pre><code>${escapeHtml(block.code)}</code></pre>` : ''}</article>`).join('');
  const dataGroups = (data.dataModel ?? []).map((group, index) => `<article><h3>6.${index + 1} ${escapeHtml(group.title)}</h3><p>${escapeHtml(group.description)}</p>${group.sources.map((source) => `<div><h4>${escapeHtml(source.type)} · ${escapeHtml(source.title)}</h4><p>${escapeHtml(source.description)}</p>${wordTable(source.columns.map((column) => ({ key: column.id, label: column.label })), source.items)}</div>`).join('')}</article>`).join('');
  const sectionBodies = {
    '01': headerTable,
    '02': data.moduleManifest?.['02']?.table === false ? '' : wordTable(getTableColumns(data, 'history').map(toEditableColumn), data.history ?? []),
    '03': `<p>${escapeHtml(data.summary) || 'Sin impacto / No aplica.'}</p>`,
    '04': data.moduleManifest?.['04']?.table === false ? '' : wordTable(getTableColumns(data, 'affectedComponents').map(toEditableColumn), data.affectedComponents ?? []),
    '05': detail || '<p>Sin impacto / No aplica.</p>',
    '06': dataGroups || '<p>Sin impacto / No aplica.</p>',
    '07': data.moduleManifest?.['07']?.table === false ? '' : wordTable(getTableColumns(data, 'testCases').map(toEditableColumn), data.testCases ?? []),
    '08': data.moduleManifest?.['08']?.table === false ? '' : wordTable(getTableColumns(data, 'references').map(toEditableColumn), data.references ?? []),
  };
  const content = documentSectionOrder(data).map((id) => section(id, sectionDefinitions.find((item) => item.id === id).title, sectionBodies[id])).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#10264a;font-size:10pt}h1{font-size:18pt;border-bottom:3px solid #0667f5;padding-bottom:10px}h2{font-size:12pt;margin:22px 0 8px;text-transform:uppercase;page-break-after:avoid}h2 span{display:inline-block;padding:5px 7px;color:#fff;background:#0667f5}h3,h4{page-break-after:avoid}h3{font-size:10.5pt;color:#075fdc}h4{font-size:10pt;margin:14px 0 6px;color:#263f63}table{width:100%;border-collapse:collapse}tr{page-break-inside:avoid}th,td{border:1px solid #ccd5e3;padding:6px;text-align:left}th{background:#f3f6fa}p{white-space:pre-wrap;overflow-wrap:anywhere}pre{padding:12px;background:#f2f4f8;border:1px solid #d9e0ea;white-space:pre-wrap;overflow-wrap:anywhere;page-break-inside:auto}section,article{page-break-inside:auto}
  </style></head><body>${documentSectionOrder(data).includes('01') ? `<h1>${escapeHtml(data.document.ticketId)} · ${escapeHtml(data.document.title)}</h1>` : ''}${content}</body></html>`;
};

function InlineInput({ value, onChange, ariaLabel, type = 'text', className = '' }) {
  const canEdit = useContext(DocumentEditContext);
  return (
    <input
      className={`inline-input ${className}`}
      type={type}
      value={value ?? ''}
      aria-label={ariaLabel}
      readOnly={!canEdit}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ResizableTextarea({ resizeId, height, onResize, className = '', value = '', ...props }) {
  const canEdit = useContext(DocumentEditContext);
  return (
    <>
      <textarea
        {...props}
        className={`${className} print-textarea-source`}
        value={value}
        readOnly={!canEdit}
        style={height ? { height: `${height}px` } : undefined}
        onPointerUp={(event) => onResize(resizeId, event.currentTarget.offsetHeight)}
      />
      <div className={`${className} print-textarea-mirror`} aria-hidden="true">{value}</div>
    </>
  );
}

function EditableTable({ columns, rows, onCellChange, onAdd, onRemove, onMove, addLabel, onColumnLabelChange, onColumnAdd, onColumnRemove, onColumnMove }) {
  const canEdit = useContext(DocumentEditContext);
  return (
    <div className="table-block">
      <div className="table-scroll">
        <table style={onColumnMove ? { minWidth: `${columns.length * 136 + 94}px` } : undefined}>
          <thead>
            <tr>{columns.map((column, columnIndex) => (
              <th key={column.key}>
                {onColumnLabelChange ? (
                  <div className="editable-column-header">
                    <input value={column.label} readOnly={!canEdit} aria-label={`Nombre de columna ${columnIndex + 1}`} onChange={(event) => onColumnLabelChange(columnIndex, event.target.value)} />
                    {canEdit && <div className="column-header-actions no-print">
                      <button type="button" onClick={() => onColumnMove(columnIndex, -1)} disabled={columnIndex === 0} aria-label={`Mover columna ${column.label} a la izquierda`} title="Mover columna a la izquierda"><ArrowLeft size={12} /></button>
                      <button type="button" onClick={() => onColumnMove(columnIndex, 1)} disabled={columnIndex === columns.length - 1} aria-label={`Mover columna ${column.label} a la derecha`} title="Mover columna a la derecha"><ArrowRight size={12} /></button>
                      <button className="delete-button" type="button" onClick={() => onColumnRemove(columnIndex)} disabled={columns.length === 1} aria-label={`Eliminar columna ${column.label}`} title="Eliminar columna"><Trash2 size={12} /></button>
                    </div>}
                  </div>
                ) : column.label}
              </th>
            ))}{canEdit && <th className="row-actions-heading no-print"><span className="sr-only">Acciones</span></th>}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column.key} style={{ width: column.width }}>
                    {column.badge ? (
                      <select
                        className={`action-select action-${String(row[column.key]).toLowerCase()}`}
                        value={row[column.key]}
                        aria-label={`${column.label}, fila ${rowIndex + 1}`}
                        disabled={!canEdit}
                        onChange={(event) => onCellChange(rowIndex, column.key, event.target.value)}
                      >
                        {(column.options ?? ['Nuevo', 'Modificado', 'Eliminado']).map((option) => <option key={option}>{option}</option>)}
                      </select>
                    ) : (
                      <InlineInput
                        type={column.type ?? 'text'}
                        value={row[column.key]}
                        ariaLabel={`${column.label}, fila ${rowIndex + 1}`}
                        onChange={(value) => onCellChange(rowIndex, column.key, value)}
                      />
                    )}
                  </td>
                ))}
                {canEdit && <td className="row-actions-cell no-print">
                  <div className="row-actions">
                    <button type="button" onClick={() => onMove(rowIndex, -1)} disabled={rowIndex === 0} aria-label={`Subir fila ${rowIndex + 1}`} title="Subir fila"><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => onMove(rowIndex, 1)} disabled={rowIndex === rows.length - 1} aria-label={`Bajar fila ${rowIndex + 1}`} title="Bajar fila"><ArrowDown size={13} /></button>
                    <button className="delete-button" type="button" onClick={() => onRemove(rowIndex)} aria-label={`Eliminar fila ${rowIndex + 1}`} title="Eliminar fila"><Trash2 size={13} /></button>
                  </div>
                </td>}
              </tr>
            )) : (
              <tr className="empty-row"><td colSpan={columns.length + (canEdit ? 1 : 0)}>Sin impacto / No aplica.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && <div className="table-footer-actions no-print">
        <button className="text-action" type="button" onClick={onAdd}><Plus size={15} />{addLabel}</button>
        {onColumnAdd && <button className="text-action" type="button" onClick={onColumnAdd}><Plus size={15} />Añadir columna</button>}
      </div>}
    </div>
  );
}

function SectionCard({ definition, expanded, onToggle, children }) {
  return (
    <section id={`section-${definition.id}`} className="section-card">
      <header className="section-header">
        <div className="section-title">
          <span className="section-number">{definition.id}</span>
          <button className="collapse-button" type="button" onClick={onToggle} aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} detalle de ${definition.title}`}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <h2>{definition.title}</h2>
        </div>
        <button className={`switch no-print ${expanded ? 'on' : ''}`} type="button" onClick={onToggle} role="switch" aria-checked={expanded} aria-label={`Mostrar u ocultar detalle de ${definition.title}`}><span /></button>
      </header>
      {expanded && <div className="section-content">{children}</div>}
    </section>
  );
}

function Modal({ title, children, onClose, className = '', returnFocusRef = null }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    return () => {
      const focusTarget = returnFocusRef?.current ?? previousFocus;
      if (focusTarget?.isConnected) focusTarget.focus?.();
    };
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} tabIndex={-1} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={handleKeyDown}>
        <div className="modal-head"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

function NewDocumentChoices({ configured, onBlank, onTemplate, onManage, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!configured) return;
    let active = true;
    listAvailableTemplates().then((rows) => {
      if (active) setTemplates(rows);
    }).catch(() => {
      if (active) setError('No se pudieron cargar las plantillas disponibles.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [configured]);

  return <>
    <p>Elige cómo comenzar el documento.</p>
    <div className="new-document-options">
      <button className="new-document-option" type="button" onClick={onBlank}>
        <FileText size={22} aria-hidden="true" />
        <span className="new-document-option-content"><strong>Documento en blanco</strong><span>Versión inicial 1.0 · Estructura 01–08</span></span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      {templates.map((item) => {
        const sections = item.version.structure?.sections ?? [];
        const countNodes = (nodes) => nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);
        const blocks = countNodes(sections) - sections.length;
        return <button className="new-document-option" type="button" key={item.version.id} onClick={() => onTemplate(item.version.id)}>
          <BookOpenText size={22} aria-hidden="true" />
          <span className="new-document-option-content">
            <strong>{item.version.name}</strong>
            <span>Versión {item.version.revision} · {item.template_type === 'full' ? 'Completa' : 'Módulo'} · {sections.length} {sections.length === 1 ? 'sección' : 'secciones'} · {blocks} {blocks === 1 ? 'bloque' : 'bloques'}</span>
            <small>Estructura: {sections.map((section) => section.sectionId).join(', ')}</small>
            {item.version.category && <small>{item.version.category}</small>}
            {item.version.description && <small>{item.version.description}</small>}
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>;
      })}
    </div>
    {loading && <p className="new-document-status" role="status">Cargando plantillas disponibles…</p>}
    {!loading && !error && configured && templates.length === 0 && <p className="new-document-status" role="status">Aún no hay plantillas aprobadas.</p>}
    {!configured && <p className="new-document-status" role="status">La biblioteca de plantillas no está disponible en este momento.</p>}
    {error && <p className="new-document-status" role="alert">{error}</p>}
    <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="secondary-button" type="button" onClick={onManage}>Gestionar plantillas</button></div>
  </>;
}

const accessRequestLabels = {
  pending: 'Pendiente',
  processing: 'En proceso',
  invited: 'Invitación enviada',
  reactivated: 'Reactivada',
  rejected: 'Rechazada',
  invite_failed: 'Falló la invitación',
};

function AccessRequestsModal({ onClose, returnFocusRef }) {
  const { listAccessRequests, reviewAccessRequest } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await listAccessRequests());
      setError('');
    } catch {
      setError('No se han podido cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [listAccessRequests]);

  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const review = async (id, action) => {
    setBusyId(id);
    setError('');
    try {
      await reviewAccessRequest(id, action);
    } catch {
      setError('No se ha podido completar la revisión. Comprueba el estado antes de reintentar.');
    } finally {
      setBusyId(null);
      try { setRequests(await listAccessRequests()); }
      catch { setError('No se ha podido actualizar la lista de solicitudes.'); }
    }
  };

  return <Modal title="Solicitudes de acceso" className="access-requests-modal" onClose={onClose} returnFocusRef={returnFocusRef}>
    <p>Las altas iniciales envían una invitación o enlace de contraseña al aprobarse. Las reactivaciones sólo habilitan la cuenta existente: no envían correo. Los reintentos de alta pueden enviar un segundo mensaje tras 15 minutos.</p>
    <div className="access-requests-toolbar"><span>{requests.length} solicitudes</span><button type="button" onClick={loadRequests} disabled={loading || Boolean(busyId)}><RotateCcw size={14} />Actualizar</button></div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading ? <p className="access-requests-empty">Cargando solicitudes…</p> : requests.length === 0 ? <p className="access-requests-empty">No hay solicitudes de acceso.</p> : <div className="access-requests-list">
      {requests.map((request) => {
        const retryable = request.request_kind === 'registration' && (request.status === 'invite_failed' || request.status === 'processing');
        const retryAt = new Date(request.processing_started_at || request.updated_at).getTime() + 15 * 60 * 1000;
        const canRetry = retryable && now >= retryAt;
        return <div className="access-request" key={request.id}>
        <div className="access-request-details"><strong>{request.email}</strong><span className="access-request-kind">{request.request_kind === 'reactivation' ? 'Reactivación' : 'Alta inicial'}</span><span>Solicitada el {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.requested_at))}</span></div>
        <span className={`access-request-status status-${request.status}`}>{accessRequestLabels[request.status] ?? request.status}</span>
        {request.status === 'invite_failed' && <small className="access-request-error">{request.error || 'No se pudo enviar la invitación.'}</small>}
        <div className="access-request-actions">
          {request.status === 'pending' && <>
            <button type="button" disabled={Boolean(busyId)} onClick={() => review(request.id, 'approve')}>Aprobar</button>
            <button type="button" className="access-reject-button" disabled={Boolean(busyId)} onClick={() => review(request.id, 'reject')}>Rechazar</button>
          </>}
          {canRetry && <button type="button" disabled={Boolean(busyId)} onClick={() => review(request.id, 'retry')}>Reintentar envío</button>}
          {busyId === request.id && <span role="status">Procesando…</span>}
        </div>
      </div>;
      })}
    </div>}
  </Modal>;
}

const userRoleLabels = { admin: 'Administrador', editor: 'Editor', reader: 'Sólo lectura', reviewer: 'Sólo lectura (rol anterior)' };

function UsersAndRolesModal({ onClose, returnFocusRef }) {
  const { user, listUsers, manageUserAccess } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
      setError('');
    } catch {
      setError('No se ha podido cargar la lista de usuarios.');
    } finally {
      setLoading(false);
    }
  }, [listUsers]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const changeAccess = async (targetId, action, value) => {
    setBusyId(targetId);
    setError('');
    try {
      setUsers(await manageUserAccess(targetId, action, value));
    } catch {
      setError('No se ha podido cambiar el acceso. Actualiza la lista y comprueba que permanece un administrador activo.');
      try { setUsers(await listUsers()); } catch { /* Conservar la lista visible. */ }
    } finally {
      setBusyId(null);
    }
  };

  return <Modal title="Usuarios y roles" className="users-roles-modal" onClose={onClose} returnFocusRef={returnFocusRef}>
    <p>Gestiona los perfiles existentes. Las solicitudes de primer acceso se revisan por separado.</p>
    <div className="access-requests-toolbar"><span>{users.length} usuarios</span><button type="button" onClick={loadUsers} disabled={loading || Boolean(busyId)}><RotateCcw size={14} />Actualizar</button></div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading ? <p role="status">Cargando usuarios…</p> : users.length === 0 ? <p>No hay usuarios.</p> : <div className="users-roles-list">
      {users.map((item) => {
        const self = item.id === user?.id;
        const locked = Boolean(busyId) || self;
        return <div className="users-roles-item" key={item.id}>
          <div className="users-roles-identity"><strong>{item.display_name || item.email || 'Usuario'}</strong><span>{item.email || 'Sin correo'}</span>{self && <small>Tu cuenta · no puedes quitarte el acceso de administrador.</small>}</div>
          <label>Rol
            <select value={item.role} disabled={locked} aria-label={`Rol de ${item.display_name || item.email}`} onChange={(event) => changeAccess(item.id, 'set_role', event.target.value)}>
              {item.role === 'reviewer' && <option value="reviewer" disabled>{userRoleLabels.reviewer}</option>}
              <option value="admin">Administrador</option><option value="editor">Editor</option><option value="reader">Sólo lectura</option>
            </select>
          </label>
          <label className="users-roles-active"><input type="checkbox" checked={item.is_active} disabled={locked} onChange={(event) => changeAccess(item.id, 'set_active', event.target.checked)} />Activo</label>
          {busyId === item.id && <span role="status">Guardando…</span>}
        </div>;
      })}
    </div>}
  </Modal>;
}

export default function App() {
  const { user, profile, profileStatus, role, isDemo, configured, signOut } = useAuth();
  const canEditDocument = profileStatus === 'ready' && profile?.is_active === true && ['admin', 'editor'].includes(role);
  const canManageUsers = profileStatus === 'ready' && profile?.is_active === true && role === 'admin' && !isDemo;
  const canEditDocumentRef = useRef(canEditDocument);
  useLayoutEffect(() => { canEditDocumentRef.current = canEditDocument; }, [canEditDocument]);
  const loggedUserName = profile?.display_name
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Usuario';
  const userInitials = loggedUserName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
  const roleLabel = isDemo
    ? 'Modo de prueba'
    : ({ admin: 'Administrador', editor: 'Editor técnico', reader: 'Sólo lectura', reviewer: 'Sólo lectura' }[role] ?? 'Usuario autenticado');
  const [data, setData] = useState(() => createInitialDocument(loggedUserName));
  const visibleSections = documentSectionOrder(data).map((id) => sectionDefinitions.find((section) => section.id === id));
  const [expanded, setExpanded] = useState(() => Object.fromEntries(sectionDefinitions.map(({ id }) => [id, true])));
  const [activeSection, setActiveSection] = useState('01');
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [navigationTarget, setNavigationTarget] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newModal, setNewModal] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogInitialVersionId, setCatalogInitialVersionId] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accessRequestsOpen, setAccessRequestsOpen] = useState(false);
  const [usersRolesOpen, setUsersRolesOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileAddGroup, setProfileAddGroup] = useState(null);
  const [newProfileOption, setNewProfileOption] = useState('');
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('db-docgen-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [toast, setToast] = useState('');
  const [textareaHeights, setTextareaHeights] = useState({});
  const fileInput = useRef(null);
  const pendingImportRef = useRef(null);
  const userButtonRef = useRef(null);
  const navigationLock = useRef(false);
  const manualScrollIntent = useRef(false);
  const themeSwitchTimer = useRef(null);

  const updatedLabel = useMemo(
    () => new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
    [data],
  );
  const profileTags = getTechnicalProfileTags(data.document);
  const profileGroups = getTechnicalProfileGroups(data.document);
  const profileSummary = profileTags.length
    ? `${profileTags.slice(0, 3).join(' · ')}${profileTags.length > 3 ? ` +${profileTags.length - 3}` : ''}`
    : 'Seleccionar';
  const renderProfilePickerTrigger = () => (
    canEditDocument
      ? <button className="profile-picker-trigger" type="button" aria-haspopup="dialog" aria-label={`Editar perfil técnico. Actual: ${profileTags.join(', ') || 'sin especificar'}`} title={profileTags.join(' · ') || 'Sin especificar'} onClick={() => setProfileModalOpen(true)}><span>{profileSummary}</span><i aria-hidden="true"><Pencil size={11} /></i></button>
      : <span className="profile-readonly" title={profileTags.join(' · ') || 'Sin especificar'}>{profileSummary}</span>
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem('db-docgen-theme', theme);
    } catch {
      // La aplicación sigue funcionando aunque el navegador bloquee el almacenamiento local.
    }
  }, [theme]);

  useEffect(() => () => {
    if (themeSwitchTimer.current) window.clearTimeout(themeSwitchTimer.current);
    document.documentElement.classList.remove('theme-switching');
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (themeSwitchTimer.current) window.clearTimeout(themeSwitchTimer.current);
    root.classList.add('theme-switching');
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
    themeSwitchTimer.current = window.setTimeout(() => {
      root.classList.remove('theme-switching');
      themeSwitchTimer.current = null;
    }, 220);
  };

  useEffect(() => {
    let frame = 0;
    const updateActive = () => {
      frame = 0;
      if (navigationLock.current) return;
      const marker = navigationOffset + 16;
      let sectionId = visibleSections[0].id;
      for (const { id } of visibleSections) {
        const section = document.getElementById(`section-${id}`);
        if (section && section.getBoundingClientRect().top <= marker) sectionId = id;
      }
      if (window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2) {
        sectionId = visibleSections.at(-1).id;
      }
      setActiveSection((current) => current === sectionId ? current : sectionId);

      const subsectionIds = sectionId === '05'
        ? (data.technicalDetail ?? []).map((item) => item.id)
        : sectionId === '06' ? (data.dataModel ?? []).map((item) => item.id) : [];
      let subsectionId = null;
      for (const id of subsectionIds) {
        const subsection = document.getElementById(`${sectionId}-${id}`);
        if (subsection && subsection.getBoundingClientRect().top <= marker) subsectionId = id;
      }
      setActiveSubsection((current) => current === subsectionId ? current : subsectionId);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActive);
    };
    const onScroll = () => {
      if (manualScrollIntent.current) {
        navigationLock.current = false;
        manualScrollIntent.current = false;
      }
      scheduleUpdate();
    };
    const markManualScroll = () => { manualScrollIntent.current = true; };
    const markKeyboardScroll = (event) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)
        && !event.target.closest?.('input, textarea, select, [contenteditable="true"]')) markManualScroll();
    };
    scheduleUpdate();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('wheel', markManualScroll, { passive: true });
    window.addEventListener('touchstart', markManualScroll, { passive: true });
    window.addEventListener('pointerdown', markManualScroll, { passive: true });
    window.addEventListener('keydown', markKeyboardScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('wheel', markManualScroll);
      window.removeEventListener('touchstart', markManualScroll);
      window.removeEventListener('pointerdown', markManualScroll);
      window.removeEventListener('keydown', markKeyboardScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [expanded, data.technicalDetail, data.dataModel, data.sectionOrder]);

  useLayoutEffect(() => {
    if (!navigationTarget || !expanded[navigationTarget.sectionId]) return undefined;
    const destination = document.getElementById(navigationTarget.elementId);
    if (!destination) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const top = Math.max(0, window.scrollY + destination.getBoundingClientRect().top - navigationOffset);
      window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      setNavigationTarget(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navigationTarget, expanded]);

  const mutate = (updater) => {
    if (!canEditDocument) return;
    setData((current) => {
      const next = structuredClone(current);
      next.tableColumns ??= createDefaultTableColumns();
      updater(next);
      return next;
    });
    setDirty(true);
  };

  const setDocumentField = (field, value) => mutate((next) => { next.document[field] = value; });
  const toggleTechnicalProfileTag = (tag) => mutate((next) => {
    const selected = getTechnicalProfileTags(next.document);
    const updated = selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag];
    next.document.technicalProfileTags = getTechnicalProfileOptions(next.document).filter((option) => updated.includes(option));
    next.document.technicalProfile = next.document.technicalProfileTags.join(' · ');
  });
  const startAddingProfileOption = (groupId) => {
    setProfileAddGroup(groupId);
    setNewProfileOption('');
  };
  const cancelAddingProfileOption = () => {
    setProfileAddGroup(null);
    setNewProfileOption('');
  };
  const addTechnicalProfileOption = (groupId) => {
    const option = newProfileOption.trim();
    if (!option) return;
    mutate((next) => {
      next.document.technicalProfileCustomOptions ??= Object.fromEntries(technicalProfileGroups.map((group) => [group.id, []]));
      const availableOptions = getTechnicalProfileOptions(next.document);
      const existing = availableOptions.find((item) => item.toLocaleLowerCase('es-ES') === option.toLocaleLowerCase('es-ES'));
      const selectedOption = existing ?? option;
      if (!existing) next.document.technicalProfileCustomOptions[groupId].push(option);
      const selected = getTechnicalProfileTags(next.document);
      next.document.technicalProfileTags = getTechnicalProfileOptions(next.document).filter((item) => selected.includes(item) || item === selectedOption);
      next.document.technicalProfile = next.document.technicalProfileTags.join(' · ');
    });
    cancelAddingProfileOption();
  };
  const setArrayCell = (key, rowIndex, field, value) => mutate((next) => { next[key][rowIndex][field] = value; });
  const addRow = (key, row) => mutate((next) => { next[key].push(row); });
  const addTableRow = (key, template) => mutate((next) => {
    next[key].push(Object.fromEntries(next.tableColumns[key].map((column) => [column.id, Object.hasOwn(template, column.id) ? template[column.id] : ''])));
  });
  const moveArrayItem = (items, fromIndex, direction) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= items.length) return;
    [items[fromIndex], items[toIndex]] = [items[toIndex], items[fromIndex]];
  };
  const moveRow = (key, rowIndex, direction) => mutate((next) => moveArrayItem(next[key], rowIndex, direction));
  const removeRow = (key, rowIndex) => mutate((next) => { next[key].splice(rowIndex, 1); });
  const setTableColumnLabel = (key, columnIndex, value) => mutate((next) => { next.tableColumns[key][columnIndex].label = value; });
  const moveTableColumn = (key, columnIndex, direction) => mutate((next) => moveArrayItem(next.tableColumns[key], columnIndex, direction));
  const addTableColumn = (key) => mutate((next) => {
    const columnId = createItemId('column');
    next.tableColumns[key].push({ id: columnId, label: 'Nueva columna', kind: 'text' });
    next[key].forEach((row) => { row[columnId] = ''; });
  });
  const removeTableColumn = (key, columnIndex) => mutate((next) => {
    const columns = next.tableColumns[key];
    if (columns.length === 1) return;
    const [removed] = columns.splice(columnIndex, 1);
    next[key].forEach((row) => { delete row[removed.id]; });
  });
  const moveSubsection = (key, index, direction) => mutate((next) => moveArrayItem(next[key], index, direction));
  const removeSubsection = (key, index) => mutate((next) => { next[key].splice(index, 1); });
  const changeVersion = (amount) => {
    const current = Number.parseFloat(String(data.document.version).replace(',', '.'));
    const next = Math.max(0, Math.round(((Number.isFinite(current) ? current : 0) + amount) * 10) / 10);
    setDocumentField('version', next.toFixed(1));
  };
  const rememberTextareaHeight = (id, height) => {
    setTextareaHeights((current) => current[id] === height ? current : { ...current, [id]: height });
  };
  const setDataModelTitle = (groupIndex, value) => mutate((next) => { next.dataModel[groupIndex].title = value; });
  const setDataModelDescription = (groupIndex, value) => mutate((next) => { next.dataModel[groupIndex].description = value; });
  const setDataSourceTitle = (groupIndex, sourceIndex, value) => mutate((next) => { next.dataModel[groupIndex].sources[sourceIndex].title = value; });
  const setDataSourceType = (groupIndex, sourceIndex, value) => mutate((next) => { next.dataModel[groupIndex].sources[sourceIndex].type = value; });
  const setDataSourceDescription = (groupIndex, sourceIndex, value) => mutate((next) => { next.dataModel[groupIndex].sources[sourceIndex].description = value; });
  const setDataColumnLabel = (groupIndex, sourceIndex, columnIndex, value) => mutate((next) => { next.dataModel[groupIndex].sources[sourceIndex].columns[columnIndex].label = value; });
  const moveDataColumn = (groupIndex, sourceIndex, columnIndex, direction) => mutate((next) => moveArrayItem(next.dataModel[groupIndex].sources[sourceIndex].columns, columnIndex, direction));
  const setDataModelCell = (groupIndex, sourceIndex, rowIndex, field, value) => mutate((next) => { next.dataModel[groupIndex].sources[sourceIndex].items[rowIndex][field] = value; });
  const moveDataModelItem = (groupIndex, sourceIndex, rowIndex, direction) => mutate((next) => moveArrayItem(next.dataModel[groupIndex].sources[sourceIndex].items, rowIndex, direction));
  const removeDataModelItem = (groupIndex, sourceIndex, rowIndex) => mutate((next) => { next.dataModel[groupIndex].sources[sourceIndex].items.splice(rowIndex, 1); });
  const addDataModelItem = (groupIndex, sourceIndex) => mutate((next) => {
    const source = next.dataModel[groupIndex].sources[sourceIndex];
    source.items.push(Object.fromEntries(source.columns.map((column) => [column.id, column.kind === 'action' ? 'Modificado' : ''])));
  });
  const addDataColumn = (groupIndex, sourceIndex) => mutate((next) => {
    const source = next.dataModel[groupIndex].sources[sourceIndex];
    const columnId = createItemId('column');
    source.columns.push({ id: columnId, label: 'Nueva columna', kind: 'text' });
    source.items.forEach((item) => { item[columnId] = ''; });
  });
  const removeDataColumn = (groupIndex, sourceIndex, columnIndex) => mutate((next) => {
    const source = next.dataModel[groupIndex].sources[sourceIndex];
    if (source.columns.length === 1) return;
    const [removed] = source.columns.splice(columnIndex, 1);
    source.items.forEach((item) => { delete item[removed.id]; });
  });
  const moveDataSource = (groupIndex, sourceIndex, direction) => mutate((next) => moveArrayItem(next.dataModel[groupIndex].sources, sourceIndex, direction));
  const removeDataSource = (groupIndex, sourceIndex) => mutate((next) => { next.dataModel[groupIndex].sources.splice(sourceIndex, 1); });
  const addDataSource = (groupIndex) => mutate((next) => {
    next.dataModel[groupIndex].sources.push({ id: createItemId('data-source'), type: 'Tabla', title: 'Nueva tabla', description: '', columns: createDefaultDataColumns(), items: [] });
  });
  const addDataModelGroup = () => mutate((next) => {
    next.dataModel.push({
      id: createItemId('data'),
      title: 'Nuevo subapartado',
      description: '',
      sources: [{ id: createItemId('data-source'), type: 'Tabla', title: 'Nueva tabla', description: '', columns: createDefaultDataColumns(), items: [] }],
    });
  });

  const goToSubsection = (sectionId, subsectionId) => {
    navigationLock.current = true;
    manualScrollIntent.current = false;
    setExpanded((current) => ({ ...current, [sectionId]: true }));
    setActiveSection(sectionId);
    setActiveSubsection(subsectionId);
    setNavigationTarget({ sectionId, elementId: `${sectionId}-${subsectionId}` });
  };

  const goTo = (id) => {
    navigationLock.current = true;
    manualScrollIntent.current = false;
    setExpanded((current) => ({ ...current, [id]: true }));
    setActiveSection(id);
    setActiveSubsection(null);
    setNavigationTarget({ sectionId: id, elementId: `section-${id}` });
  };

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  useLayoutEffect(() => {
    const importedDocument = pendingImportRef.current;
    if (!importedDocument) return;
    if (data === importedDocument) {
      pendingImportRef.current = null;
      setTextareaHeights({});
      setDirty(false);
      notify('Documento importado correctamente');
    } else if (!canEditDocument) {
      pendingImportRef.current = null;
    }
  }, [data, canEditDocument]);

  const createNew = () => {
    if (!canEditDocument) return;
    if (dirty && !window.confirm('Hay cambios no exportados. ¿Quieres continuar y perderlos?')) return;
    setData(emptyDocument(loggedUserName));
    setActiveSection('01');
    setActiveSubsection(null);
    setNavigationTarget(null);
    setTextareaHeights({});
    setDirty(false);
    setNewModal(false);
    notify('Nuevo evolutivo creado');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCatalog = (versionId = null) => {
    setCatalogInitialVersionId(versionId);
    setNewModal(false);
    setCatalogOpen(true);
  };

  const createFromTemplate = async (versionId, selection, source = 'available') => {
    if (!canEditDocumentRef.current) throw new Error('No tienes permiso de edición.');
    const structure = source === 'mine' ? await getOwnCurrentTemplate(versionId) : await getCurrentTemplate(versionId);
    const next = instantiateTemplate(structure, selection, { display_name: loggedUserName }, emptyDocument(loggedUserName));
    if (!canEditDocumentRef.current) throw new Error('No tienes permiso de edición.');
    if (dirty && !window.confirm('Hay cambios no exportados. ¿Quieres continuar y perderlos?')) return;
    setData(next);
    setActiveSection(next.sectionOrder[0]);
    setActiveSubsection(null);
    setNavigationTarget(null);
    setExpanded(Object.fromEntries(next.sectionOrder.map((id) => [id, true])));
    setTextareaHeights({});
    setDirty(false);
    setCatalogOpen(false);
    notify('Documento creado desde plantilla');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const download = (content, mime, extension) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const hasHeader = documentSectionOrder(data).includes('01');
    const safeId = hasHeader ? (data.document.ticketId.replace(/[^a-z0-9-_]/gi, '_') || 'EVOLUTIVO') : 'DOCUMENTO';
    anchor.href = url;
    anchor.download = `${safeId}${hasHeader ? `_v${data.document.version}` : ''}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDirty(false);
    setExportOpen(false);
  };

  const exportJson = () => {
    download(JSON.stringify(pruneDocumentSections(data), null, 2), 'application/json', 'json');
    notify('Copia editable exportada');
  };

  const exportWord = () => {
    download(buildWordDocument(data), 'application/msword', 'doc');
    notify('Documento Word exportado');
  };

  const exportPdf = () => {
    setExportOpen(false);
    setDirty(false);
    setExpanded(Object.fromEntries(visibleSections.map(({ id }) => [id, true])));
    setTimeout(() => window.print(), 120);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!canEditDocument) return;
    if (!file) return;
    if (dirty && !window.confirm('Hay cambios no exportados. ¿Quieres reemplazar el documento actual?')) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      notify('En esta primera versión, reimporta la copia editable .json');
      return;
    }
    try {
      const fileContent = await file.text();
      if (!canEditDocumentRef.current) return;
      const parsed = JSON.parse(fileContent);
      if (parsed.schemaVersion !== '1.0' || !parsed.document) throw new Error('Formato no reconocido');
      const importedDocument = normalizeDocument(parsed);
      pendingImportRef.current = importedDocument;
      setData((current) => canEditDocumentRef.current ? importedDocument : current);
      setActiveSection(importedDocument.sectionOrder[0]);
      setActiveSubsection(null);
      setNavigationTarget(null);
    } catch {
      notify('No se ha podido importar el archivo');
    }
  };

  const renderStandardTable = (key, createRow, addLabel) => (
    data.moduleManifest?.[{ history: '02', affectedComponents: '04', testCases: '07', references: '08' }[key]]?.table === false
      ? (canEditDocument ? <button className="text-action no-print" type="button" onClick={() => mutate((next) => {
        const sectionId = { history: '02', affectedComponents: '04', testCases: '07', references: '08' }[key];
        next.moduleManifest[sectionId] = { table: true };
        next.tableColumns[key] = createDefaultTableColumns()[key];
        next[key] = [];
      })}><Plus size={15} />Añadir tabla</button> : null)
      :
    <EditableTable
      columns={getTableColumns(data, key).map(toEditableColumn)}
      rows={data[key] ?? []}
      onCellChange={(rowIndex, field, value) => setArrayCell(key, rowIndex, field, value)}
      onAdd={() => addTableRow(key, createRow())}
      onRemove={(rowIndex) => removeRow(key, rowIndex)}
      onMove={(rowIndex, direction) => moveRow(key, rowIndex, direction)}
      onColumnLabelChange={(columnIndex, value) => setTableColumnLabel(key, columnIndex, value)}
      onColumnAdd={() => addTableColumn(key)}
      onColumnRemove={(columnIndex) => removeTableColumn(key, columnIndex)}
      onColumnMove={(columnIndex, direction) => moveTableColumn(key, columnIndex, direction)}
      addLabel={addLabel}
    />
  );

  const renderSection = (id) => {
    if (id === '01') return (
      <>
        <div className="header-grid">
          <label><span>Título</span><InlineInput value={data.document.title} ariaLabel="Título" onChange={(value) => setDocumentField('title', value)} /></label>
          <label><span>ID / Ticket</span><InlineInput value={data.document.ticketId} ariaLabel="ID o ticket" onChange={(value) => setDocumentField('ticketId', value)} /></label>
          <label><span>Aplicación</span><InlineInput value={data.document.application} ariaLabel="Aplicación" onChange={(value) => setDocumentField('application', value)} /></label>
          <label><span>Autor</span><InlineInput value={data.document.author} ariaLabel="Autor" onChange={(value) => setDocumentField('author', value)} /></label>
          <label><span>Fecha</span><InlineInput type="date" value={data.document.date} ariaLabel="Fecha" onChange={(value) => setDocumentField('date', value)} /></label>
          <div className="header-field"><span>Versión</span><div className="version-control"><InlineInput value={data.document.version} ariaLabel="Versión" onChange={(value) => setDocumentField('version', value)} /><div className="version-buttons no-print"><button type="button" onClick={() => changeVersion(-0.1)} aria-label="Reducir versión en 0,1"><Minus size={12} /></button><button type="button" onClick={() => changeVersion(0.1)} aria-label="Incrementar versión en 0,1"><Plus size={12} /></button></div></div></div>
        </div>
        {data.moduleManifest?.['01']?.technicalProfile !== false && <div className="mobile-profile-control no-print"><span>Perfil técnico</span>{renderProfilePickerTrigger()}</div>}
        {data.moduleManifest?.['01']?.technicalProfile !== false && <div className="print-profile"><strong>Perfil técnico</strong><span>{data.document.technicalProfile || 'Sin especificar'}</span></div>}
      </>
    );
    if (id === '02') return renderStandardTable('history', () => ({ version: '', date: new Date().toISOString().slice(0, 10), author: data.document.author, description: '' }), 'Añadir versión');
    if (id === '03') return <ResizableTextarea resizeId="summary" height={textareaHeights.summary} onResize={rememberTextareaHeight} className="rich-text" value={data.summary} aria-label="Resumen del cambio" placeholder="Describe brevemente qué cambia y cuál es su objetivo…" onChange={(event) => mutate((next) => { next.summary = event.target.value; })} />;
    if (id === '04') return renderStandardTable('affectedComponents', () => ({ component: '', type: 'Programa COBOL', action: 'Modificado', description: '' }), 'Añadir componente');
    if (id === '05') return (
      <div className="detail-editor">
        {data.technicalDetail.map((block, index) => (
          <article id={`05-${block.id}`} className="detail-block" key={block.id}>
            <div className="subsection-heading-row">
              <div className="detail-heading"><span>5.{index + 1}</span><InlineInput value={block.title} ariaLabel={`Título del apartado 5.${index + 1}`} onChange={(value) => setArrayCell('technicalDetail', index, 'title', value)} /></div>
              <div className="subsection-actions no-print">
                <button className={`code-toggle ${block.codeEnabled ? 'active' : ''}`} type="button" role="switch" aria-checked={block.codeEnabled} onClick={() => setArrayCell('technicalDetail', index, 'codeEnabled', !block.codeEnabled)} title={`${block.codeEnabled ? 'Desactivar' : 'Activar'} bloque COBOL`}><Code2 size={13} /><span>COBOL</span><i /></button>
                <button type="button" onClick={() => moveSubsection('technicalDetail', index, -1)} disabled={index === 0} aria-label={`Subir subapartado 5.${index + 1}`} title="Subir subapartado"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => moveSubsection('technicalDetail', index, 1)} disabled={index === data.technicalDetail.length - 1} aria-label={`Bajar subapartado 5.${index + 1}`} title="Bajar subapartado"><ArrowDown size={14} /></button>
                <button className="delete-button" type="button" onClick={() => removeSubsection('technicalDetail', index)} aria-label={`Eliminar subapartado 5.${index + 1}`} title="Eliminar subapartado"><Trash2 size={14} /></button>
              </div>
            </div>
            <ResizableTextarea resizeId={`technical-content-${block.id}`} height={textareaHeights[`technical-content-${block.id}`]} onResize={rememberTextareaHeight} className="rich-text compact" value={block.content} aria-label={`Contenido del apartado 5.${index + 1}`} onChange={(event) => setArrayCell('technicalDetail', index, 'content', event.target.value)} />
            {block.codeEnabled && <div className="code-wrap"><div className="code-label">COBOL</div><ResizableTextarea resizeId={`technical-code-${block.id}`} height={textareaHeights[`technical-code-${block.id}`]} onResize={rememberTextareaHeight} className="code-editor" spellCheck="false" value={block.code} aria-label={`Código del apartado 5.${index + 1}`} placeholder="Escribe o pega aquí el código COBOL…" onChange={(event) => setArrayCell('technicalDetail', index, 'code', event.target.value)} /></div>}
          </article>
        ))}
        {data.technicalDetail.length > 0 && <div className="subsections-separator" aria-hidden="true" />}
        <button className="text-action no-print" type="button" onClick={() => addRow('technicalDetail', { id: createItemId('detail'), title: 'Nuevo subapartado', content: '', code: '', codeEnabled: true })}><Plus size={15} />Añadir subapartado</button>
      </div>
    );
    if (id === '06') return (
      <div className="data-model-editor">
        {data.dataModel.length ? data.dataModel.map((group, groupIndex) => (
          <article id={`06-${group.id}`} className="data-model-group" key={group.id}>
            <div className="subsection-heading-row">
              <div className="detail-heading"><span>6.{groupIndex + 1}</span><InlineInput value={group.title} ariaLabel={`Título del apartado 6.${groupIndex + 1}`} onChange={(value) => setDataModelTitle(groupIndex, value)} /></div>
              <div className="subsection-actions no-print">
                <button type="button" onClick={() => moveSubsection('dataModel', groupIndex, -1)} disabled={groupIndex === 0} aria-label={`Subir apartado 6.${groupIndex + 1}`} title="Subir subapartado"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => moveSubsection('dataModel', groupIndex, 1)} disabled={groupIndex === data.dataModel.length - 1} aria-label={`Bajar apartado 6.${groupIndex + 1}`} title="Bajar subapartado"><ArrowDown size={14} /></button>
                <button className="delete-button" type="button" onClick={() => removeSubsection('dataModel', groupIndex)} aria-label={`Eliminar apartado 6.${groupIndex + 1}`} title="Eliminar subapartado"><Trash2 size={14} /></button>
              </div>
            </div>
            <ResizableTextarea resizeId={`data-description-${group.id}`} height={textareaHeights[`data-description-${group.id}`]} onResize={rememberTextareaHeight} className="rich-text compact data-model-description" value={group.description} aria-label={`Descripción del apartado 6.${groupIndex + 1}`} placeholder="Describe el impacto sobre los datos de este subapartado…" onChange={(event) => setDataModelDescription(groupIndex, event.target.value)} />
            <div className="data-sources">
              {group.sources.length ? group.sources.map((source, sourceIndex) => (
                <div className="data-source-block" key={source.id}>
                  <div className="data-source-heading-row">
                    <div className="data-source-heading"><Database size={14} /><select className="source-type-select" value={source.type} disabled={!canEditDocument} aria-label={`Tipo de datos ${sourceIndex + 1} del apartado 6.${groupIndex + 1}`} onChange={(event) => setDataSourceType(groupIndex, sourceIndex, event.target.value)}><option>Tabla</option><option>Fichero</option><option>Datos</option></select><InlineInput value={source.title} ariaLabel={`Nombre de ${source.type.toLowerCase()} ${sourceIndex + 1} del apartado 6.${groupIndex + 1}`} onChange={(value) => setDataSourceTitle(groupIndex, sourceIndex, value)} /></div>
                    <div className="subsection-actions no-print">
                      <button type="button" onClick={() => moveDataSource(groupIndex, sourceIndex, -1)} disabled={sourceIndex === 0} aria-label={`Subir tabla o fichero ${sourceIndex + 1} del apartado 6.${groupIndex + 1}`} title="Subir tabla o fichero"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => moveDataSource(groupIndex, sourceIndex, 1)} disabled={sourceIndex === group.sources.length - 1} aria-label={`Bajar tabla o fichero ${sourceIndex + 1} del apartado 6.${groupIndex + 1}`} title="Bajar tabla o fichero"><ArrowDown size={14} /></button>
                      <button className="delete-button" type="button" onClick={() => removeDataSource(groupIndex, sourceIndex)} aria-label={`Eliminar tabla o fichero ${sourceIndex + 1} del apartado 6.${groupIndex + 1}`} title="Eliminar tabla o fichero"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <ResizableTextarea resizeId={`data-source-description-${source.id}`} height={textareaHeights[`data-source-description-${source.id}`]} onResize={rememberTextareaHeight} className="rich-text compact data-source-description" value={source.description} aria-label={`Descripción de ${source.type.toLowerCase()} ${sourceIndex + 1} del apartado 6.${groupIndex + 1}`} placeholder={`Describe esta ${source.type.toLowerCase()} y su finalidad…`} onChange={(event) => setDataSourceDescription(groupIndex, sourceIndex, event.target.value)} />
                  <EditableTable
                    columns={source.columns.map(toEditableColumn)}
                    rows={source.items}
                    onCellChange={(rowIndex, field, value) => setDataModelCell(groupIndex, sourceIndex, rowIndex, field, value)}
                    onAdd={() => addDataModelItem(groupIndex, sourceIndex)}
                    onRemove={(rowIndex) => removeDataModelItem(groupIndex, sourceIndex, rowIndex)}
                    onMove={(rowIndex, direction) => moveDataModelItem(groupIndex, sourceIndex, rowIndex, direction)}
                    onColumnLabelChange={(columnIndex, value) => setDataColumnLabel(groupIndex, sourceIndex, columnIndex, value)}
                    onColumnAdd={() => addDataColumn(groupIndex, sourceIndex)}
                    onColumnRemove={(columnIndex) => removeDataColumn(groupIndex, sourceIndex, columnIndex)}
                    onColumnMove={(columnIndex, direction) => moveDataColumn(groupIndex, sourceIndex, columnIndex, direction)}
                    addLabel="Añadir elemento"
                  />
                </div>
              )) : <div className="data-source-empty">Este subapartado todavía no contiene tablas o ficheros.</div>}
            </div>
            <button className="text-action no-print" type="button" onClick={() => addDataSource(groupIndex)}><Plus size={15} />Añadir tabla</button>
          </article>
        )) : <div className="data-model-empty">Sin impacto / No aplica. Añade un subapartado si esta sección requiere contenido.</div>}
        {data.dataModel.length > 0 && <div className="subsections-separator" aria-hidden="true" />}
        <button className="text-action no-print" type="button" onClick={addDataModelGroup}><Plus size={15} />Añadir subapartado</button>
      </div>
    );
    if (id === '07') return renderStandardTable('testCases', () => ({ id: `CP-${String(data.testCases.length + 1).padStart(2, '0')}`, scenario: '', conditions: '', expected: '', obtained: '—' }), 'Añadir caso');
    return renderStandardTable('references', () => ({ reference: '', location: '', description: '' }), 'Añadir referencia');
  };

  return (
    <DocumentEditContext.Provider value={canEditDocument}>
    <div className={`app-shell ${canEditDocument ? '' : 'read-only'}`}>
      <header className="topbar no-print">
        <div className="brand-zone">
          <div className="brand">Deutsche Bank <span className="brand-mark"><i /></span></div>
          <button className="new-button" type="button" disabled={!canEditDocument} onClick={() => setNewModal(true)}><Plus size={16} />Nuevo</button>
        </div>
        <div className="breadcrumb"><span>Evolutivos</span>{data.sectionOrder.includes('01') && <><ChevronRight size={15} /><strong>{data.document.ticketId}</strong></>}{dirty && <i title="Cambios sin exportar" />}</div>
        <div className="top-actions">
          <input ref={fileInput} className="file-input" type="file" disabled={!canEditDocument} accept=".json,.doc,.docx,.pdf" onChange={handleImport} />
          <button className="ghost-button" type="button" disabled={!canEditDocument} onClick={() => fileInput.current?.click()}><Upload size={16} />Importar</button>
          <div className="export-menu">
            <button className="export-button" type="button" onClick={() => setExportOpen((open) => !open)}><Download size={16} />Exportar<ChevronDown size={15} /></button>
            {exportOpen && <div className="export-popover">
              <button type="button" onClick={exportPdf}><FileText size={16} /><span><strong>PDF</strong><small>Imprimir o guardar como PDF</small></span></button>
              <button type="button" onClick={exportWord}><BookOpenText size={16} /><span><strong>Word</strong><small>Documento compatible .doc</small></span></button>
              <button type="button" onClick={exportJson}><RotateCcw size={16} /><span><strong>Copia editable</strong><small>Para reimportar sin pérdidas</small></span></button>
            </div>}
          </div>
          <div className="user-menu">
            <button ref={userButtonRef} className="user" type="button" aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>
              <span>{userInitials}</span><div><strong>{loggedUserName}</strong><small>{roleLabel}</small></div><ChevronDown size={14} />
            </button>
            {userMenuOpen && <div className="user-popover" role="menu">
              <div className="user-popover-profile"><span>{userInitials}</span><div><strong>{loggedUserName}</strong><small>{profile?.email || user?.email}</small></div></div>
              <div className="user-role-label">{roleLabel}</div>
              {canManageUsers && <button className="user-admin-action" type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); setAccessRequestsOpen(true); }}><ShieldCheck size={15} />Solicitudes de acceso</button>}
              {canManageUsers && <button className="user-admin-action" type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); setUsersRolesOpen(true); }}><Users size={15} />Usuarios y roles</button>}
              <button type="button" role="menuitem" onClick={signOut}><LogOut size={15} />Cerrar sesión</button>
            </div>}
          </div>
        </div>
      </header>

      <aside className="sidebar no-print">
        <div className="sidebar-title">Índice</div>
        <nav>
          {visibleSections.map(({ id, title, icon: Icon }) => (
            <div key={id}>
              <button className={`nav-item ${activeSection === id ? 'active' : ''}`} type="button" onClick={() => goTo(id)}><Icon size={17} /><span className="nav-number">{id}</span><span>{title}</span>{(id === '05' || id === '06') && <ChevronDown size={14} className="nav-chevron" />}</button>
              {id === '05' && expanded['05'] && <div className="subnav">{(data.technicalDetail ?? []).map((item, index) => <button className={activeSection === '05' && activeSubsection === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => goToSubsection('05', item.id)}><span>5.{index + 1}</span>{item.title}</button>)}</div>}
              {id === '06' && expanded['06'] && <div className="subnav">{(data.dataModel ?? []).map((group, index) => <button className={activeSection === '06' && activeSubsection === group.id ? 'active' : ''} type="button" key={group.id} onClick={() => goToSubsection('06', group.id)}><span>6.{index + 1}</span>{group.title}</button>)}</div>}
            </div>
          ))}
        </nav>
        {data.sectionOrder.includes('01') && <div className="document-info">
          <h3>Información del documento</h3>
          <dl>
            {data.moduleManifest?.['01']?.technicalProfile !== false && <div className="profile-info-row"><dt>Perfil técnico</dt><dd>{renderProfilePickerTrigger()}</dd></div>}
            {data.moduleManifest?.['01']?.technicalProfile === false && canEditDocument && <div><dt>Perfil técnico</dt><dd><button className="text-action" type="button" onClick={() => { mutate((next) => { next.moduleManifest['01'] = { technicalProfile: true }; }); setProfileModalOpen(true); }}>+ Añadir</button></dd></div>}
            <div><dt>Estado</dt><dd><span className="status-badge">{canEditDocument ? 'En edición' : 'Sólo lectura'}</span></dd></div>
            <div><dt>Última actualización</dt><dd>{updatedLabel}</dd></div>
            <div><dt>Autor</dt><dd>{data.document.author || 'Sin asignar'}</dd></div>
          </dl>
        </div>}
        <div className="template-sidebar-control"><button className="template-sidebar-entry" type="button" onClick={() => openCatalog()}><BookOpenText size={16} />Plantillas</button></div>
        <div className="appearance-control">
          <span>Apariencia</span>
          <button className={`theme-switch ${theme}`} type="button" role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'dark' ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'} title={theme === 'dark' ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'} onClick={toggleTheme}>
            <span className="theme-selector" aria-hidden="true">
              <Sun className="theme-icon theme-icon-sun" size={13} />
              <Moon className="theme-icon theme-icon-moon" size={13} />
            </span>
          </button>
        </div>
      </aside>

      <main className="document-area">
        <div className="mobile-title no-print"><span>Documento activo</span>{data.sectionOrder.includes('01') && <strong>{data.document.ticketId}</strong>}</div>
        {visibleSections.map((definition) => (
          <SectionCard key={definition.id} definition={definition} expanded={expanded[definition.id]} onToggle={() => setExpanded((current) => ({ ...current, [definition.id]: !current[definition.id] }))}>
            {renderSection(definition.id)}
          </SectionCard>
        ))}
      </main>

      {newModal && canEditDocument && <Modal title="Crear nuevo evolutivo" className="new-document-modal" onClose={() => setNewModal(false)}><NewDocumentChoices configured={configured && profileStatus === 'ready' && profile?.is_active} onBlank={createNew} onTemplate={openCatalog} onManage={() => openCatalog()} onClose={() => setNewModal(false)} /></Modal>}
      {catalogOpen && <Modal title="Biblioteca de plantillas" className="template-modal" onClose={() => setCatalogOpen(false)}><TemplateCatalog document={data} user={user} role={role} canEdit={canEditDocument} configured={configured && profileStatus === 'ready' && profile?.is_active} initialVersionId={catalogInitialVersionId} onCreate={createFromTemplate} /></Modal>}
      {accessRequestsOpen && canManageUsers && <AccessRequestsModal onClose={() => setAccessRequestsOpen(false)} returnFocusRef={userButtonRef} />}
      {usersRolesOpen && canManageUsers && <UsersAndRolesModal onClose={() => setUsersRolesOpen(false)} returnFocusRef={userButtonRef} />}
      {profileModalOpen && canEditDocument && <Modal title="Perfil técnico" className="profile-modal" onClose={() => setProfileModalOpen(false)}>
        <p>Selecciona las tecnologías y los procesos bancarios que intervienen en este evolutivo.</p>
        <div className="profile-groups">
          {profileGroups.map((group) => <fieldset className="profile-group" key={group.id}>
            <legend>{group.title}</legend>
            <div className="profile-options">
              {group.options.map((option, index) => <label key={option}><input type="checkbox" autoFocus={group.id === profileGroups[0].id && index === 0 && !profileAddGroup} checked={profileTags.includes(option)} onChange={() => toggleTechnicalProfileTag(option)} /><span>{option}</span></label>)}
            </div>
            <div className="profile-add-area">
              {profileAddGroup === group.id ? <div className="profile-add-editor">
                <input autoFocus type="text" value={newProfileOption} aria-label={`Nueva opción para ${group.title}`} placeholder={group.id === 'technology' ? 'Nueva tecnología' : 'Nueva operativa'} onChange={(event) => setNewProfileOption(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addTechnicalProfileOption(group.id); if (event.key === 'Escape') cancelAddingProfileOption(); }} />
                <button className="profile-add-confirm" type="button" disabled={!newProfileOption.trim()} onClick={() => addTechnicalProfileOption(group.id)}>Añadir</button>
                <button className="profile-add-cancel" type="button" aria-label="Cancelar" onClick={cancelAddingProfileOption}><X size={15} /></button>
              </div> : <button className="profile-add-button" type="button" onClick={() => startAddingProfileOption(group.id)}><Plus size={14} />Añadir</button>}
            </div>
          </fieldset>)}
        </div>
        <div className="modal-actions"><button className="primary-button" type="button" onClick={() => setProfileModalOpen(false)}>Listo</button></div>
      </Modal>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
    </DocumentEditContext.Provider>
  );
}
