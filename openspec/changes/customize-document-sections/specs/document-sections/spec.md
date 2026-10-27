# Spec Delta

## Purpose

Permite que cada documento técnico tenga secciones propias, orden y contenido estructural configurables, con numeración consecutiva y salidas fieles al documento visible.

## ADDED Requirements

### Requirement: Crear secciones configurables
Un `admin` o `editor` activo SHALL poder abrir **+ Añadir sección** al final del índice y crear una sección con título no vacío y al menos una opción marcada entre descripción, subapartados, tabla configurable y bloque COBOL. La nueva sección SHALL añadirse al final de la estructura, con los controles de edición propios de los bloques seleccionados.

#### Scenario: Crear con varios bloques
- **WHEN** el editor indica «Procesos batch» y marca descripción, subapartados y tabla
- **THEN** aparece una sección al final del índice y del editor con esos tres bloques iniciales editables y sin bloque COBOL

#### Scenario: Faltan título o bloques
- **WHEN** el editor intenta confirmar con un título en blanco o sin opciones marcadas
- **THEN** no se crea sección y el diálogo indica qué falta

#### Scenario: Lector consulta el índice
- **WHEN** un usuario con permiso de solo lectura abre un documento
- **THEN** puede consultar sus secciones, pero no puede abrir el creador ni modificar su estructura

### Requirement: Composición editable de una sección propia
Los bloques seleccionados SHALL empezar vacíos y SHALL usar los controles existentes pertinentes: descripción extensible, subapartados con título y descripción, tabla con filas y columnas editables, y cuadro COBOL. El editor SHALL poder añadir, quitar y reordenar filas, columnas y subapartados según el tipo de bloque. Los bloques no seleccionados MUST NOT aparecer ni exportarse.

#### Scenario: Tabla de sección nueva
- **WHEN** el editor crea una sección con tabla configurable
- **THEN** puede editar cabeceras, añadir, borrar y mover filas y columnas, y los valores permanecen asociados a su columna tras un movimiento

#### Scenario: Sección con COBOL
- **WHEN** el editor crea una sección con bloque COBOL e introduce código multilínea
- **THEN** el cuadro muestra el código completo en pantalla y en PDF y Word, sin cortar texto por un scroll interno de impresión

### Requirement: Título editable únicamente en la tarjeta
El título de cada sección SHALL editarse en la cabecera de su tarjeta cuando el usuario tenga permiso de edición. El índice SHALL mostrar el título actualizado como texto de navegación y las salidas SHALL usar ese mismo título. El índice MUST NOT ofrecer edición directa del título.

#### Scenario: Renombrar una sección existente
- **WHEN** el editor cambia «Casos de prueba» por «Plan de validación» en su tarjeta
- **THEN** el índice, PDF, Word y la copia JSON reflejan «Plan de validación» sin alterar el contenido de la sección

#### Scenario: Título vacío
- **WHEN** el editor borra todo el título o introduce solo espacios
- **THEN** el editor conserva un nombre válido anterior o exige corregirlo antes de confirmar la edición; no deja un elemento de índice sin nombre

### Requirement: Reordenar secciones
El editor SHALL poder reordenar secciones arrastrando entradas del índice y con flechas de subir y bajar en las cabeceras de las tarjetas. Ambos controles SHALL modificar el mismo orden del documento. El orden SHALL conservarse en el índice, el editor, las exportaciones y la copia editable.

#### Scenario: Arrastrar en el índice
- **WHEN** el editor mueve la última sección a la primera posición en el índice
- **THEN** la tarjeta pasa a primera posición y el índice, la numeración y las salidas siguen ese orden

#### Scenario: Usar flechas
- **WHEN** el editor pulsa subir o bajar en una tarjeta
- **THEN** esta intercambia posición con su vecina y las flechas imposibles en los extremos quedan deshabilitadas

#### Scenario: Teclado o lector
- **WHEN** el usuario no puede arrastrar o tiene permiso de solo lectura
- **THEN** el editor puede ordenar con flechas accesibles y el lector no dispone de acciones de reordenación

### Requirement: Desactivar y reactivar sin perder datos
La activación de una sección SHALL ser independiente del plegado visual de su tarjeta. Desactivar una sección SHALL conservar su título, bloques y contenido en la copia editable, retirarla del índice de navegación y del documento generado, y excluirla de la numeración visible. El índice SHALL ofrecer una lista separada de secciones desactivadas desde la que el editor podrá reactivarlas y restaurar exactamente esos datos en su posición relativa. Solo usuarios con permiso de edición SHALL poder cambiar la activación.

#### Scenario: Desactivar sección con contenido
- **WHEN** el editor desactiva una sección con texto y filas
- **THEN** desaparece del índice, del documento visible, del PDF y del Word; la copia JSON conserva sus datos y su estado inactivo

#### Scenario: Reactivar sección
- **WHEN** el editor reactiva esa sección
- **THEN** se muestra con el texto y filas anteriores, en el orden conservado, y las secciones visibles se renumeran sin huecos

#### Scenario: Plegar tarjeta
- **WHEN** el editor pliega una tarjeta activa
- **THEN** la sección permanece en el índice, conserva su número y continúa en las exportaciones

### Requirement: Eliminar secciones con confirmación
La entrada seleccionada del índice SHALL mostrar una X de eliminación y cada cabecera una papelera. Ambas SHALL solicitar confirmación y, si se acepta, eliminar completamente la sección y sus bloques del documento local, índice y salidas. Cancelar SHALL conservarlos. Los controles MUST NOT aparecer para usuarios de solo lectura.

#### Scenario: Eliminar desde el índice
- **WHEN** el editor confirma la X de una sección seleccionada
- **THEN** desaparecen su entrada, tarjeta, datos y salidas; la selección de navegación se mueve a una sección visible próxima

#### Scenario: Cancelar desde la tarjeta
- **WHEN** el editor pulsa la papelera y cancela la confirmación
- **THEN** la sección, su contenido y el orden permanecen intactos

#### Scenario: Eliminar la última sección
- **WHEN** el editor elimina la última sección presente
- **THEN** el documento muestra un estado vacío con **+ Añadir sección** accesible, sin fallo de navegación o exportación

### Requirement: Numeración derivada de las secciones activas
Los números visibles `01`, `02`, `03`… SHALL calcularse por la posición de las secciones activas, sin ser sus identificadores internos. Las etiquetas de subapartados SHALL usar el número visible actual de su sección y un ordinal consecutivo propio. Altas, movimientos, eliminaciones y activación MUST NOT dejar saltos ni transferir datos entre secciones.

#### Scenario: Cambio de orden y desactivación
- **WHEN** las secciones con identificadores internos distintos cambian de orden y se desactiva una intermedia
- **THEN** el índice, tarjetas, subapartados, PDF y Word muestran números consecutivos mientras cada sección conserva su contenido original

#### Scenario: Navegación tras cambio estructural
- **WHEN** se elimina o desactiva la sección activa
- **THEN** la selección y el desplazamiento apuntan a una sección visible existente, o al estado vacío si no queda ninguna

### Requirement: Copias editables compatibles
La exportación JSON SHALL conservar identificadores internos estables, títulos, orden, activación, composición y todo el contenido de las secciones presentes. La importación SHALL restaurarlos sin pérdida y SHALL admitir copias `schemaVersion: 1.0` anteriores, asignando a sus secciones los títulos predeterminados y estado activo. La eliminación SHALL excluir la sección y sus datos de nuevas copias; la desactivación SHALL conservarlos.

#### Scenario: Reimportar copia personalizada
- **WHEN** el usuario exporta e importa una copia con una sección nueva, otra renombrada, una desactivada y orden modificado
- **THEN** recupera exactamente su estructura, textos, filas, columnas, nombres, activaciones y orden

#### Scenario: Importar copia anterior
- **WHEN** el usuario importa una copia válida `1.0` sin metadatos nuevos de sección
- **THEN** se recuperan sus secciones originales y datos existentes con títulos predeterminados y números consecutivos

### Requirement: Exportaciones visuales coherentes
Word y PDF SHALL mostrar solo secciones activas, en el orden actual, con títulos y numeración derivados. SHALL representar todos los bloques seleccionados y su contenido completo, y SHALL omitir los bloques COBOL desactivados según los controles propios de cada bloque.

#### Scenario: Exportar tras personalizar
- **WHEN** un editor renombra, mueve y desactiva secciones antes de exportar
- **THEN** Word y PDF muestran el mismo conjunto activo, orden, nombres y numeración que el editor

### Requirement: Plantillas de estructura personalizadas
La creación y uso de plantillas SHALL conservar los títulos, orden, activación y tipos de bloques estructurales de secciones propias sin guardar descripciones, código, valores de celdas ni otro contenido específico. El servidor SHALL validar los nuevos tipos estructurales y seguir aceptando plantillas anteriores; la selección parcial SHALL omitir completamente las secciones desmarcadas al crear un documento.

#### Scenario: Proponer plantilla con sección propia
- **WHEN** un editor propone una plantilla desde un documento con sección propia, tabla y COBOL
- **THEN** la propuesta contiene título estructural, opciones y cabeceras de columnas, pero no texto descriptivo, código ni valores de filas

#### Scenario: Usar plantilla personalizada
- **WHEN** el editor selecciona esa sección al crear un documento desde plantilla
- **THEN** obtiene la estructura elegida y su nombre con contenido interno vacío e identificadores locales nuevos

#### Scenario: Plantilla anterior
- **WHEN** el usuario abre una plantilla válida guardada antes de este cambio
- **THEN** puede previsualizarla y usarla con las mismas secciones y bloques que antes

### Requirement: Documento volátil y permisos
Las ediciones de títulos, orden, activación y contenido SHALL permanecer locales al documento abierto y MUST NOT activar guardado de documentos en Supabase, `localStorage` ni `sessionStorage`. Solo la propuesta deliberada de una plantilla SHALL enviar su estructura depurada. Un usuario de solo lectura SHALL poder navegar e imprimir/exportar conforme a su permiso actual sin editar.

#### Scenario: Editar sin exportar
- **WHEN** el editor añade una sección y escribe en ella
- **THEN** no se crea ni actualiza un registro remoto de documento ni se persiste su contenido en almacenamiento del navegador

#### Scenario: Lector abre un documento personalizado
- **WHEN** un usuario de solo lectura visualiza el documento
- **THEN** puede ver títulos, numeración y contenido, sin controles para crear, renombrar, mover, desactivar o eliminar secciones
