# Proposal

## Why

Los documentos técnicos repiten estructuras y perfiles, pero hoy cada editor debe reconstruirlos manualmente. Una plantilla completa puede incluir secciones o tablas que no interesan en un evolutivo concreto. Un catálogo aprobado con importación modular permitirá partir de la estructura útil, sin publicar el contenido específico del documento de origen.

## What Changes

- Convertir **Nuevo** en un acceso a **Documento en blanco** y **Desde plantilla**. El documento en blanco conservará inicialmente las ocho secciones actuales.
- Añadir un catálogo con plantillas completas y plantillas de módulo, propuestas propias y una cola de revisión para administradores. Un módulo publicado será una sección o un bloque estructural de una sección; usarlo creará un documento nuevo.
- Permitir que un editor o administrador proponga una plantilla a partir del documento local actual. La propuesta conservará las secciones presentes y su orden, subapartados, configuración de bloques y COBOL, tablas, cabeceras de columnas y, cuando incluya 01, su perfil técnico. Eliminará contenido y metadatos propios del documento antes de enviarla.
- Situar **+ Proponer plantilla** solo en **Mis propuestas**. Antes del envío, permitir seleccionar con casillas la estructura depurada que formará la propuesta y mostrarla con el mismo árbol alineado que la previsualización de una plantilla disponible; validar al menos una sección y la raíz obligatoria de módulos.
- Previsualizar la plantilla aprobada como árbol de selección. Al crear un documento, el usuario podrá desmarcar secciones y módulos internos, incluido el perfil técnico dentro de 01. Una sección desmarcada desaparecerá por completo del documento generado, de su índice y de las exportaciones; 01 ausente excluirá también el perfil y toda representación de sus metadatos. Se exigirá al menos una sección seleccionada.
- Permitir al autor `admin`/`editor` activo previsualizar y crear documentos locales desde cualquiera de sus versiones no ocultas, incluidas pendientes, rechazadas, aprobadas y versiones de plantillas retiradas, con selección modular y sin modificar su publicación o estado. El autor podrá ocultar cualquier versión de **Mis propuestas** sin eliminarla del catálogo, la cola administrativa ni la auditoría.
- Introducir en el documento un manifiesto versionado de secciones presentes y ordenadas. Renderizado, navegación, seguimiento del desplazamiento, importación y exportación derivarán de ese manifiesto. Los documentos editables antiguos sin manifiesto conservarán las ocho secciones al abrirse.
- Permitir que un administrador apruebe, rechace con motivo opcional o retire una plantilla. Solo las versiones aprobadas y vigentes se ofrecerán a otros usuarios; cada aprobación quedará fija y una revisión posterior creará otra versión.
- Mantener visibles la cabecera, las pestañas y los controles superiores del modal **Biblioteca** mientras se desplaza su contenido, también en pantallas pequeñas y en ambos temas.
- Crear un documento local independiente a partir de los módulos elegidos, con metadatos iniciales del usuario actual, sin vincular los documentos creados a cambios posteriores de la plantilla.
- Fijar en cada plantilla de módulo el tipo y la ubicación estructural de su raíz; las revisiones no podrán cambiar de sección o ranura. Aplicar validación del esquema y tamaño, permisos por rol, transiciones atómicas y registro de revisión en Supabase.

## Capabilities

### New Capabilities

- `document-templates`: propuesta, revisión, catálogo, selección modular, sanitización e instanciación de plantillas completas y de módulo.

### Modified Capabilities

Ninguna especificación principal existente. El contrato del documento editable, su índice y sus exportaciones sí deberán evolucionar para representar secciones ausentes; esta evolución queda especificada en el presente cambio.

## Impact

- Editor React (`src/App.jsx`, `src/styles.css`) y funciones de transformación de documentos/plantillas en `src/data/`; navegación y exportación HTML/Word/PDF/JSON.
- Migración de Supabase para versiones, revisiones, permisos y auditoría de plantillas, más una migración aditiva para ocultación personal, uso privado de cualquier versión propia y rechazo con motivo opcional; operaciones servidor/RPC sujetas a la identidad y al rol activos.
- Pruebas de selección jerárquica al proponer y al usar, compatibilidad con documentos anteriores, ausencia real de secciones, sanitización, permisos, ocultación personal, revisión, creación independiente y desplazamiento del modal.
- No se requiere persistir documentos en `public.documents` para crear uno desde una plantilla; el documento activo continúa siendo local hasta que se exporte.
