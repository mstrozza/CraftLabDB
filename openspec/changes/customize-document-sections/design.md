# Design

## Context

`src/App.jsx` define ocho secciones estáticas (`01`–`08`) y utiliza esos mismos valores para identidad, número, navegación y Word. `sectionOrder` ordena esos IDs; `expanded` solo pliega tarjetas. `src/data/templateStructure.js` limita el orden a esos ocho IDs, y la migración `202610060001_template_library.sql` valida únicamente sus tipos de nodo y un máximo de ocho raíces. PDF procede del DOM impreso; Word se construye aparte. La copia editable acepta `schemaVersion: '1.0'`. El editor mantiene los documentos en memoria, mientras Supabase guarda solo las plantillas.

## Goals / Non-Goals

**Goals:**

- Una identidad inmutable por sección, separada de título y número visible; una única proyección de secciones activas ordenadas para índice, tarjetas y salidas.
- Un modelo de bloques propios compatible con tablas y subapartados existentes, con importación fiel y proyección de plantillas sin contenido.
- Compatibilidad de lectura para JSON `1.0` y plantillas `1`, y validación completa de las nuevas estructuras antes de publicarlas.

**Non-Goals:**

- Guardar documentos o contenido de sus bloques en Supabase o almacenamiento del navegador.
- Convertir los ocho bloques especiales existentes en un editor genérico arbitrario; mantienen sus datos y controles específicos.
- Fusionar una plantilla con un documento actual: el flujo existente crea un documento independiente.

## Decisions

### Identidad y estado por sección

Conservar `01`–`08` como IDs estables heredados y generar IDs opacos nuevos para secciones propias. `sectionOrder` pasa a contener todos los IDs presentes, incluso los desactivados; `sectionMeta[id]` contiene `title`, `active` y tipo (`builtIn`/`custom`). `customSections[id]` guarda bloques propios y sus datos. Calcular `visibleSections = sectionOrder.filter(active)` y el número visible a partir de su índice; no volver a interpretar el ID como número. La navegación y los IDs DOM usan identidad estable. Se prefiere esto a renombrar IDs antiguos, porque conserva enlaces internos de datos, tablas estándar y plantillas heredadas.

Mantener `expanded` exclusivamente para plegado. Añadir una acción de activación independiente en cada tarjeta y un control «Secciones desactivadas» en el lateral para reactivar secciones que ya no están en el índice de navegación. Las secciones inactivas siguen en JSON y en `sectionOrder`, pero se excluyen del DOM principal y de Word/PDF. El botón **+ Añadir sección** queda debajo de la última entrada activa; la lista de desactivadas va en un control de gestión aparte.

La eliminación quita ID, metadatos y bloques propios. Para secciones heredadas también elimina del estado local sus datos propios, columnas y manifiesto; el exportador JSON no reintroduce esos valores. El caso sin secciones presentes se admite en el editor con estado vacío y navegación segura. El catálogo de plantillas mantiene su regla de seleccionar al menos una sección.

### Bloques nuevos

Una sección propia contiene componentes iniciales seleccionados en un orden canónico: descripción, subapartados, tabla, COBOL. Descripción y COBOL usan cuadros editables extensibles; subapartados son una lista ordenable de `{id, title, content}`; la tabla usa columnas con IDs estables y filas de valores por ID de columna. Las operaciones de filas y columnas reutilizan los patrones ya presentes en `EditableTable`. El código COBOL se mantiene local y se omite de plantillas; las plantillas conservan únicamente la presencia del bloque. No se añaden opciones para insertar bloques después de la creación en esta primera entrega, pues el usuario pidió definirlos en el alta.

### Edición y orden visual

`SectionCard` recibe ID, título y número visibles de la proyección y expone un campo de título en la cabecera. El índice solo muestra texto. El arrastre del índice mueve IDs dentro de `sectionOrder` usando API nativa de arrastre; las flechas de cada tarjeta hacen el mismo movimiento y sirven como alternativa de teclado/móvil. Una sección activa puede pasar sobre las inactivas conservando el orden relativo completo. Tras cambios estructurales, reconciliar `activeSection`, `activeSubsection` y el destino de scroll con una sección visible vecina o con el estado vacío. Las confirmaciones de eliminación se disparan antes de mutar el estado; los controles son inaccesibles para roles sin edición.

### Versionado de la copia JSON

Exportar el nuevo modelo con `schemaVersion: '1.1'`. El importador acepta `1.0` y `1.1`: para `1.0` asigna títulos predeterminados y estado activo a las secciones presentes, respetando `sectionOrder` o el orden heredado; para `1.1` valida IDs únicos, títulos no vacíos, referencias a bloques y columnas, y restaura activación y orden. Rechaza versiones desconocidas o estructuras inválidas sin reemplazar el documento activo. Se prefiere una versión explícita a reinterpretar silenciosamente `1.0` con campos nuevos.

Word itera la misma proyección activa y un renderer por tipo de sección; PDF imprime la misma tarjeta visible. La sección especial `01` sigue controlando la cabecera y perfil técnico aunque se mueva a otra posición; el número mostrado proviene de su posición. Los ordinales de subapartados `05` y `06` y de los personalizados derivan del número visible actual de su sección. Una sección plegada se despliega temporalmente para imprimir sin cambiar su activación.

### Plantillas y servidor

Mantener la lectura de estructuras de plantilla `schemaVersion: 1` tal como fueron aprobadas. Proponer nuevas estructuras como versión `2`: la raíz de sección contiene ID, título y activación estructurales; los hijos representan descripción, subapartados, tabla y COBOL propios, además de los nodos existentes. No incluyen texto de descripción, código, valores de filas o nombres concretos de las fuentes que hoy se depuran. El servidor valida IDs únicos, jerarquía, tipos, límites de tamaño y configuración admitida; amplía el máximo de raíces actual de ocho y permite IDs de sección propia, preservando el validador de versión 1. Un módulo propio tiene raíz de sección o de uno de sus bloques y ancestros obligatorios, conforme a la selección modular existente. Instanciar genera IDs locales nuevos y datos internos vacíos. La migración de validación se añade como una nueva migración, sin editar las antiguas ni modificar versiones aprobadas.

### Permisos y privacidad

Todas las mutaciones estructurales pasan por la comprobación `canEditDocument` existente, incluidos arrastre, flechas, cambio de título, activación y borrado. La proyección para Supabase sigue pasando por la depuración estructural; las pruebas comprueban la ausencia de contenido en cargas de plantilla. El estado del documento permanece en memoria salvo exportación solicitada por el usuario.

## Risks / Trade-offs

- [Los números están codificados en subtítulos, índice y Word] → Derivarlos desde una sola proyección y probar movimientos, desactivación y exportación de 05/06/01.
- [Una sección desactivada desaparece de navegación] → Proveer un control de reactivación separado, visible incluso cuando no quedan secciones activas.
- [Plantillas publicadas y SQL estricto versión 1] → Validador nuevo de doble versión y pruebas con estructuras ya guardadas, sin reescribir registros publicados.
- [Importaciones antiguas y referencias huérfanas] → Normalización explícita antes de reemplazar el documento y rechazo no destructivo de copias inválidas.
- [Arrastre poco fiable en móvil o con teclado] → Mantener flechas con etiquetas accesibles como vía equivalente y comprobar foco, orden y scroll.
- [Las plantillas pueden revelar títulos/cabeceras estructurales] → Mostrar la proyección exacta antes de proponer y eliminar de ella todo contenido de celdas, texto y código.

## Migration Plan

1. Implementar el nuevo modelo y la importación dual local; conservar las estructuras heredadas en memoria al migrar.
2. Adaptar editor y exportaciones con pruebas de ida y vuelta y de paridad visible/impresa.
3. Añadir migración Supabase que admita plantillas versión 1 y 2, desplegarla antes de que el cliente proponga versión 2.
4. Verificar con una plantilla antigua y otra personalizada aprobada, después activar la UI de propuestas personalizadas.

La reversión del cliente puede leer únicamente JSON `1.0`; por eso, antes de volver a una versión anterior se conserva una copia del cliente nuevo para reimportar `1.1`. La migración de servidor conserva la ruta de validación de plantilla versión 1 y no altera registros existentes.
