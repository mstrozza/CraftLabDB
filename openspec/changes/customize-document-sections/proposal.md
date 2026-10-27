# Proposal

## Why

El documento está limitado a ocho secciones con títulos y números fijos. Esto impide adaptar su estructura a cada evolutivo y hace que el índice y las exportaciones dependan de identificadores que hoy también se usan como numeración visible.

## What Changes

- Añadir secciones desde el final del índice mediante un diálogo con nombre y al menos uno de estos bloques iniciales: descripción, subapartados, tabla configurable y COBOL.
- Permitir cambiar el título solo en la cabecera de cada tarjeta y reflejarlo en el índice y las exportaciones.
- Reordenar secciones arrastrándolas en el índice o con flechas en las cabeceras; eliminarlas desde la X de la entrada activa o desde la papelera de la tarjeta, con confirmación.
- Separar el identificador interno de la posición visible y renumerar consecutivamente las secciones activas y sus subapartados tras altas, movimientos, eliminaciones y cambios de activación. Desactivar conserva el contenido; eliminarlo lo descarta del documento actual.
- Adaptar JSON, Word, PDF y plantillas estructurales para las secciones nuevas y los títulos, componentes y órdenes personalizados, conservando la importación de copias y plantillas anteriores.

## Capabilities

### New Capabilities

- `document-sections`: creación, edición de títulos, composición, activación, orden, eliminación, numeración, importación/exportación y proyección estructural de secciones del documento.

### Modified Capabilities

Ninguna. El proyecto aún no tiene especificaciones principales sincronizadas; la integración con el cambio en curso `add-approved-template-library` se define en la nueva capacidad y se coordinará al sincronizar ambos cambios.

## Impact

- Editor, índice, navegación y estilos en `src/App.jsx` y `src/styles.css`.
- Modelo y transformación de plantillas en `src/data/templateStructure.js`, catálogo/vistas de plantilla y validación SQL de Supabase para admitir secciones personalizadas.
- Importación de copia editable JSON y generación de Word/PDF, incluidas las reglas de impresión.
- Pruebas del editor, transformación estructural, exportaciones, compatibilidad y permisos; documentación de plantillas.
- El contenido del documento sigue siendo local y solo se entrega al usuario cuando exporta. Las plantillas aprobadas guardan únicamente estructura y perfil técnico.
