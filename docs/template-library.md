# Biblioteca de plantillas

La biblioteca guarda únicamente estructuras de documentos. Los documentos creados siguen en el navegador hasta que se exportan. Una sección desmarcada desaparece del documento, del índice y de sus salidas. Las copias JSON anteriores que no contienen `sectionOrder` conservan las ocho secciones.

## Despliegue

1. Aplicar, en orden, `supabase/migrations/202610060001_template_library.sql`, `supabase/migrations/202610070001_private_template_proposals.sql` y `supabase/migrations/202610070002_author_hidden_templates.sql`. La última añade `author_hidden_at`, evento `hidden`, lectura privada ampliada y rechazo sin motivo. No reaplicar las migraciones ya ejecutadas ni limpiar `deleted_at`.
2. Verificar `template_propose`, `template_review`, `template_retire`, `template_current`, `template_own_current` y `template_hide_own_version`. La RPC legado `template_delete_proposal` permanece por compatibilidad, pero la interfaz no la llama. No se usan nuevas Edge Functions ni nuevas claves. Las RPC autenticadas vuelven a comprobar rol, estado activo y autoría.
3. Publicar el frontend después de las tres migraciones. `admin` y `editor` pueden proponer, usar sus versiones propias visibles de cualquier estado y ocultarlas de **Mis propuestas**; solo `admin` puede aprobar, rechazar o retirar. Ocultar una versión pendiente no la retira de **Pendientes**; ocultar una aprobada no la retira de **Disponibles**. Una nueva versión pendiente no reemplaza a la vigente hasta aprobarla.

## Comprobaciones de permisos

- Con `admin`: proponer una plantilla completa y otra de módulo, aprobar una, rechazar otra con motivo, revisar una aprobada, aprobar la revisión y retirar la plantilla.
- Con `editor`: leer el catálogo, proponer una plantilla, ver sus propias propuestas y revisar una identidad propia. No debe ver propuestas ajenas pendientes ni poder decidir sobre ellas.
- Con `reader` o `reviewer`: previsualizar las vigentes; no debe poder proponer ni crear un documento desde plantilla.
- Sin sesión o con perfil inactivo: no debe haber lectura de plantillas ni mutaciones.
- Intentar `insert`, `update` o `delete` directos con la clave pública: las tablas solo conceden `select` y RLS protege las lecturas.
- En la creación, retirar una plantilla después de cargar el catálogo y antes de pulsar **Crear documento**: `template_current` debe rechazar la versión sin sustituir el documento activo.
- Probar `template_own_current` con versión propia pendiente, rechazada y aprobada, incluida una identidad retirada; todas deben devolver estructura mientras ambos marcadores sean nulos. Denegar ajenas, ocultas, borradas y perfiles inactivos. Usarla no debe alterar estado ni publicación.
- Probar `template_hide_own_version` en los tres estados, incluida versión publicada: debe fijar solo `author_hidden_at` y añadir un evento `hidden`; conservar estado, `published_version_id`, retirada, cola, catálogo, revisión y auditoría anterior. Denegar ajenas, repetidas, borradas e inactivos. La escritura directa sigue denegada.
- Rechazar con motivo vacío o espacios: tanto `review_reason` como el motivo del evento deben ser `NULL`. La versión pendiente ocultada debe poder aprobarse o rechazarse desde **Pendientes**.
- Probar `template_delete_proposal(version_id, expected_state)` con propuesta propia pendiente y rechazada, ajena y aprobada. Las dos primeras deben registrar `deleted_at` y un evento `deleted`; las demás deben denegarse. Una aprobación o rechazo concurrente que cambie `expected_state` debe producir conflicto. La revisión siguiente debe aumentar el número, incluso cuando la anterior está eliminada.
- Comprobar que **Mis propuestas** omite `deleted_at` y `author_hidden_at`, mientras **Pendientes** y **Disponibles** solo omiten `deleted_at`. Los eventos y versiones permanecen en la base. `insert`, `update` y `delete` directos siguen sin estar concedidos al cliente.

## Reversión

Si es necesario revertir, publicar primero el frontend anterior. Las columnas, RPC y eventos nuevos pueden permanecer sin uso. Si se requiere reversión de esquema, preparar una migración compensatoria después de decidir cómo conservar los eventos `deleted`/`hidden`, las versiones marcadas y la auditoría. No quitar `deleted_at` ni restaurar el índice antiguo mientras existan pendientes eliminadas. No quitar `author_hidden_at` mientras el historial personal deba permanecer oculto. No borrar versiones ni auditoría como parte de una reversión de interfaz.
