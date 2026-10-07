# Spec Delta

## Purpose

Permite reutilizar estructuras completas o módulos de documentos técnicos y perfiles aprobados por administradores, elegir qué partes se importan y generar documentos que omiten por completo las secciones desmarcadas, sin divulgar contenido específico del original ni modificar documentos ya creados.

## ADDED Requirements

### Requirement: Entrada a documentos nuevos y catálogo
El sistema SHALL ofrecer **Documento en blanco** y **Desde plantilla** desde el control **Nuevo**. El catálogo SHALL permitir previsualizar plantillas a los usuarios activos; solo `admin` y `editor` SHALL poder crear un documento editable.

#### Scenario: Editor inicia un documento
- **WHEN** un administrador o editor activo abre **Nuevo**
- **THEN** puede escoger un documento en blanco o una plantilla aprobada del catálogo

#### Scenario: Lector abre el catálogo
- **WHEN** un `reader` o `reviewer` activo abre el catálogo
- **THEN** puede consultar y previsualizar plantillas aprobadas, sin opción de proponerlas ni instanciarlas como documentos editables

### Requirement: Propuesta desde el documento actual
El sistema SHALL permitir que un `admin` o `editor` activo proponga desde el documento local actual una plantilla **Completa** o de **Módulo**, con nombre, descripción y categoría. El control **+ Proponer plantilla** SHALL aparecer únicamente en **Mis propuestas**. Para una plantilla de módulo SHALL exigir elegir exactamente una raíz estructural: sección, subapartado técnico, subapartado de datos, fuente de datos o tabla estándar, e identificar su tipo, sección y ranura estructural. La propuesta SHALL mostrar una vista previa de la estructura depurada con casillas interactivas y enviará únicamente los nodos seleccionados válidos, con al menos una sección. En módulos SHALL conservar la raíz y sus ancestros obligatorios. El servidor SHALL validar estructura, sección y raíz antes de dejarla pendiente de revisión.

#### Scenario: Editor envía una propuesta
- **WHEN** un editor confirma el nombre, la descripción, la categoría y la vista previa
- **THEN** la propuesta aparece en **Mis propuestas** y en **Pendientes** para administradores, sin aparecer entre las plantillas disponibles

#### Scenario: Editor propone una tabla como módulo
- **WHEN** un editor elige una fuente de 06 o una tabla estándar como raíz de una plantilla de módulo
- **THEN** la propuesta contiene solo esa tabla y los ancestros estructurales necesarios para situarla en su sección, sin otras tablas ni secciones

#### Scenario: Editor recorta la propuesta
- **WHEN** un editor desmarca una sección o un subapartado en la vista previa antes de enviar una plantilla completa
- **THEN** el resumen y la versión pendiente contienen exactamente las partes seleccionadas y sus ancestros, sin los nodos desmarcados

#### Scenario: Editor prepara un módulo
- **WHEN** un editor prepara una plantilla de módulo en la vista previa
- **THEN** no puede desmarcar su raíz ni los ancestros necesarios y puede seleccionar sus descendientes; el servidor rechaza un payload manipulado que omita la raíz

#### Scenario: Selección vacía al proponer
- **WHEN** un editor desmarca todas las secciones de una plantilla completa
- **THEN** no puede enviar la propuesta y no se guarda ninguna versión

#### Scenario: Ubicación de la acción de propuesta
- **WHEN** un editor cambia entre **Disponibles**, **Mis propuestas** y, si es administrador, **Pendientes**
- **THEN** **+ Proponer plantilla** aparece solo en **Mis propuestas**

#### Scenario: Envío cancelado o fallido
- **WHEN** el editor cancela el envío o el servidor lo rechaza
- **THEN** el documento activo permanece intacto y no se publica ninguna plantilla

### Requirement: Estructura conservada
La plantilla completa SHALL conservar únicamente las secciones presentes en el documento de origen y su orden, los subapartados, títulos estructurales y bloques; el tipo y orden de cada tabla, fichero o bloque de datos; el número, orden, identificador, tipo y nombre de las columnas; y el estado activado/desactivado de los bloques COBOL. Una plantilla de módulo SHALL conservar solo su raíz elegida y los ancestros necesarios. Cada nodo seleccionable SHALL tener un identificador estable y único dentro de su versión.

#### Scenario: Se propone un documento con estructura personalizada
- **WHEN** un editor prepara una plantilla de un documento con subapartados, tablas y columnas personalizadas
- **THEN** la vista previa y el documento instanciado muestran esa estructura y sus cabeceras en el mismo orden

#### Scenario: El documento fuente ya omite secciones
- **WHEN** se propone una plantilla completa desde un documento que solo contiene 01, 05 y 06
- **THEN** la versión propuesta contiene solo esas secciones y conserva su orden

#### Scenario: Se conserva una fila de ejemplo solo como estructura
- **WHEN** una tabla contiene varias filas con datos
- **THEN** la plantilla puede conservar la cantidad de filas como celdas vacías, pero ningún valor original

### Requirement: Perfil técnico conservado
La plantilla SHALL conservar las tecnologías y operativas seleccionadas y las opciones personalizadas del perfil técnico de **Información del documento** como nodo opcional hijo de 01. El usuario SHALL poder desmarcarlo únicamente cuando 01 permanezca seleccionada. Al desmarcar el perfil o 01, el nuevo documento SHALL vaciar `technicalProfile`, `technicalProfileTags` y `technicalProfileCustomOptions` sin recuperar etiquetas desde el campo legado. Una plantilla de módulo fuera de 01 MUST NOT incluir un nodo de perfil.

#### Scenario: Se usa una plantilla con perfil personalizado
- **WHEN** se instancia una plantilla que incluye opciones técnicas o bancarias añadidas por su autor
- **THEN** esas opciones y selecciones aparecen en el nuevo documento y pueden editarse conforme al rol

#### Scenario: Se omite el perfil técnico
- **WHEN** un editor desmarca **Perfil técnico** antes de crear el documento
- **THEN** no se incorporan las selecciones ni opciones personalizadas de la plantilla y los tres campos de perfil quedan explícitamente vacíos

#### Scenario: Se omite 01
- **WHEN** un editor desmarca 01 durante la importación
- **THEN** **Perfil técnico** queda también desmarcado, no puede seleccionarse de forma aislada y no se muestra ni exporta su información

#### Scenario: Se reimporta un documento sin perfil
- **WHEN** se exporta y reimporta una copia editable con el perfil omitido o con 01 ausente
- **THEN** `technicalProfile`, `technicalProfileTags` y `technicalProfileCustomOptions` siguen vacíos y no reaparecen etiquetas a partir del formato legado

### Requirement: Selección jerárquica previa a la importación
Al preparar una propuesta y antes de crear un documento desde una versión aprobada disponible o cualquier versión propia permitida, el sistema SHALL mostrar la misma previsualización depurada, con casillas interactivas y alineadas para secciones y módulos hijos disponibles, incluido el perfil técnico solo dentro de 01. Todas las partes SHALL empezar seleccionadas. Desmarcar una sección SHALL desmarcar sus descendientes; volver a marcarla SHALL seleccionarlos. Una sección SHALL seguir seleccionada cuando se desmarquen todos sus hijos individualmente. Un padre seleccionado con cualquier hijo desmarcado, incluso si son todos, SHALL mostrar estado indeterminado. En una plantilla de módulo, la raíz y sus ancestros obligatorios SHALL permanecer seleccionados; el usuario podrá elegir los descendientes disponibles. El sistema MUST impedir una selección sin secciones, con IDs ajenos a la versión usada o con perfil seleccionado sin 01.

#### Scenario: Se omite una sección completa
- **WHEN** el editor desmarca 06 en una plantilla completa
- **THEN** sus subapartados y fuentes quedan desmarcados y la previsualización del resultado no incluye 06

#### Scenario: Se omite una tabla pero se conserva su sección
- **WHEN** el editor deja marcada 06 y desmarca una de sus fuentes, o deja marcada 04 y desmarca su tabla estándar
- **THEN** el resultado conserva la sección y los otros módulos seleccionados, pero excluye la tabla desmarcada

#### Scenario: Se selecciona parte de un subapartado
- **WHEN** un subapartado de 06 contiene varias fuentes y solo algunas están marcadas
- **THEN** el subapartado muestra estado indeterminado y el resultado contiene exclusivamente las fuentes marcadas

#### Scenario: Se intenta omitir todo
- **WHEN** el editor desmarca todas las secciones de una plantilla completa
- **THEN** **Crear documento** queda deshabilitado y el documento activo permanece intacto

#### Scenario: Árbol alineado en ambas vistas
- **WHEN** el editor abre la vista previa al proponer y la vista previa al usar una plantilla disponible
- **THEN** ambas muestran el mismo árbol jerárquico, con casillas, etiquetas, niveles y resumen alineados y accesibles en ambos temas

### Requirement: Documento con secciones realmente ausentes
El documento editable SHALL registrar explícitamente el conjunto y orden de secciones presentes. Los documentos nuevos en blanco SHALL contener 01–08. Los documentos editables anteriores sin ese manifiesto SHALL interpretarse con 01–08, mientras que un subconjunto explícito SHALL respetarse. El sistema MUST rechazar manifiestos vacíos, repetidos o con IDs desconocidos. Una sección excluida SHALL estar ausente del cuerpo del documento, índice, navegación, contenido estructural almacenado en la copia editable y exportación HTML/Word/PDF. Si 01 está excluida, **Información del documento**, perfil técnico y toda representación visual o exportada de su título, ticket, autor, fecha, versión y demás metadatos SHALL estar ausentes también fuera del cuerpo; los campos internos mínimos podrán permanecer solo para sostener el estado del editor. Los módulos internos desmarcados SHALL estar ausentes del cuerpo y de esas salidas. El seguimiento del desplazamiento y la sección activa SHALL apuntar solo a secciones presentes.

#### Scenario: Se genera un documento sin 01 y 06
- **WHEN** un editor crea un documento desde una plantilla desmarcando 01 y 06
- **THEN** ninguna de esas secciones aparece en el editor, índice, navegación ni exportaciones; tampoco aparecen **Información del documento**, perfil ni metadatos de 01 en cabecera o documentos exportados, y la copia editable no contiene sus módulos

#### Scenario: Se reimporta una copia editable modular
- **WHEN** se exporta e importa de nuevo un documento con las secciones 03, 05 y 07
- **THEN** se restauran exactamente esas secciones, su orden y sus módulos, sin añadir 01, 02, 04, 06 u 08

#### Scenario: Se importa una copia editable anterior
- **WHEN** una copia anterior válida carece de manifiesto de secciones
- **THEN** se abre con las ocho secciones originales y sus datos conservados

#### Scenario: Navegación tras crear un documento modular
- **WHEN** la sección activa o el subapartado activo anterior no existe en el documento creado
- **THEN** el índice, la selección activa y el desplazamiento pasan a la primera sección presente o a un subapartado existente

### Requirement: Eliminación de contenido específico
La plantilla MUST excluir título, ticket, aplicación, autor, fecha, versión e histórico del documento original; descripciones, resumen, código COBOL y valores de filas o celdas; y nombres específicos de componentes, tablas y ficheros. El servidor MUST aceptar únicamente los campos estructurales permitidos y SHALL rechazar cargas con campos inesperados, formato inválido, nodos/columnas con IDs duplicados, módulos situados en secciones o ranuras incompatibles, perfil sin 01, ancestros faltantes, versiones de esquema desconocidas o tamaño superior al límite establecido.

#### Scenario: Documento original contiene datos sensibles
- **WHEN** se propone una plantilla desde un documento con texto, código, filas y nombres específicos
- **THEN** ninguno de esos valores se guarda en la plantilla ni aparece en su vista previa pública

#### Scenario: Cliente envía contenido no permitido
- **WHEN** una solicitud de propuesta incluye un campo de documento o un valor de celda fuera del esquema permitido
- **THEN** el servidor la rechaza sin crear o modificar la propuesta

### Requirement: Revisión administrativa
Solo un administrador activo SHALL poder aprobar o rechazar una propuesta pendiente. El motivo del rechazo SHALL ser opcional; si se proporciona, SHALL guardarse y mostrarse al autor, y si se deja vacío SHALL registrarse como `NULL` tanto en la versión como en el evento. La decisión y su registro SHALL ser atómicos y SHALL impedir decisiones duplicadas sobre la misma propuesta. Una propuesta oculta por el autor SHALL seguir siendo revisable mientras no tenga `deleted_at`.

#### Scenario: Administrador aprueba
- **WHEN** un administrador activo aprueba una propuesta pendiente
- **THEN** se publica esa versión y se registra quién y cuándo la aprobó

#### Scenario: Administrador rechaza
- **WHEN** un administrador activo rechaza una propuesta pendiente e indica un motivo
- **THEN** la propuesta deja de estar pendiente, el autor ve el motivo y la decisión queda registrada

#### Scenario: Administrador rechaza sin motivo
- **WHEN** un administrador activo confirma el rechazo de una propuesta pendiente con el campo de motivo vacío
- **THEN** la revisión se registra, la versión queda `rejected`, `review_reason` y el motivo del evento son `NULL`, y la interfaz no muestra un bloque de motivo vacío

#### Scenario: Revisión concurrente
- **WHEN** dos administradores intentan resolver la misma propuesta
- **THEN** solo una transición tiene éxito y el otro recibe el estado actualizado

### Requirement: Catálogo y visibilidad por rol
El catálogo SHALL mostrar a los usuarios activos solo la versión vigente y aprobada de cada plantilla no retirada y sin `deleted_at`, aunque su autor la haya ocultado del historial personal. **Mis propuestas** SHALL mostrar al autor sus versiones con `deleted_at` y `author_hidden_at` nulos, con todos sus estados y motivos de rechazo si existen, incluidas versiones de identidades retiradas. **Pendientes** SHALL mostrar a los administradores las propuestas pendientes sin `deleted_at`, aunque estén ocultas por su autor. Usuarios inactivos o sin sesión MUST NOT leer ni modificar plantillas.

#### Scenario: Usuario consulta plantillas disponibles
- **WHEN** un usuario activo abre **Disponibles**
- **THEN** ve únicamente plantillas aprobadas vigentes, identificadas como **Completa** o **Módulo** y con nombre, descripción, categoría, perfil y previsualización estructural

#### Scenario: Lector intenta acceder a la cola administrativa
- **WHEN** un usuario sin rol `admin` solicita propuestas ajenas pendientes o intenta revisarlas
- **THEN** el servidor deniega la operación

#### Scenario: Autor consulta una propuesta propia
- **WHEN** un autor activo abre **Mis propuestas**
- **THEN** puede previsualizar todas sus versiones no ocultas ni borradas, incluidas aprobadas y retiradas, y el motivo de rechazo si existe, pero no ve propuestas ajenas

### Requirement: Uso privado de cualquier versión propia visible
Un `admin` o `editor` activo SHALL poder instanciar exclusivamente sus propias versiones con `deleted_at` y `author_hidden_at` nulos como documentos locales, con selección jerárquica válida, sin importar si están `pending`, `rejected` o `approved`, son versiones anteriores a la publicada o pertenecen a una identidad retirada. Esta acción SHALL reutilizar la transformación, confirmación de cambios sin exportar y limpieza de navegación del uso de plantillas aprobadas. El servidor SHALL comprobar autoría y ambos marcadores inmediatamente antes de devolver la estructura. Instanciar una versión propia MUST NOT aprobarla, publicarla, alterar su estado ni mostrarla a otros usuarios.

#### Scenario: Autor usa propuesta pendiente
- **WHEN** un autor selecciona secciones y subapartados de una propuesta propia pendiente y el servidor confirma que sigue disponible para él
- **THEN** se crea un documento local independiente con solo esas partes; la propuesta sigue pendiente y fuera de **Disponibles**

#### Scenario: Autor usa propuesta rechazada
- **WHEN** un autor usa una propuesta propia rechazada
- **THEN** se crea un documento local con el subconjunto elegido, sin modificar el rechazo ni publicar la propuesta

#### Scenario: Autor usa versión aprobada o retirada
- **WHEN** un autor usa desde **Mis propuestas** una versión propia aprobada anterior, vigente o de una identidad retirada
- **THEN** se crea un documento local con la selección elegida sin cambiar el estado, la retirada, la publicación ni el acceso de otros usuarios

#### Scenario: Intento de uso ajeno, oculto o borrado
- **WHEN** un usuario solicita la estructura de una versión ajena o el autor intenta usar una versión ocultada o con `deleted_at` desde otra pestaña
- **THEN** el servidor deniega la operación y el documento activo no cambia

### Requirement: Ocultación personal de versiones propias
Un `admin` o `editor` activo SHALL poder ocultar cualquier versión propia no borrada de **Mis propuestas**, sin importar estado ni retirada de la identidad. La operación SHALL guardar `author_hidden_at` y un evento `hidden` de forma atómica, sin cambiar `deleted_at`, estado, `published_version_id`, `retired_at`, cola administrativa, catálogo público ni auditoría anterior. La versión oculta SHALL desaparecer del historial del autor y dejar de ser utilizable por la vía privada; seguirá en **Pendientes** si está pendiente y en **Disponibles** si es la aprobada vigente de una identidad no retirada. La ocultación SHALL permanecer tras recarga o nueva sesión; no se requiere restauración en este alcance. Los tombstones `deleted_at` legados SHALL conservar su efecto de exclusión global y no se reactivarán.

#### Scenario: Autor oculta versión pendiente
- **WHEN** el autor confirma **Ocultar de Mis propuestas** en una versión pendiente
- **THEN** sale solo de su historial, permanece en la cola administrativa, la revisión sigue posible y la ocultación no habilita otra propuesta pendiente de la misma identidad

#### Scenario: Autor oculta versión aprobada
- **WHEN** el autor oculta la versión aprobada vigente
- **THEN** desaparece de **Mis propuestas** pero permanece en **Disponibles** para los usuarios autorizados y `published_version_id` no cambia

#### Scenario: Autor oculta versión rechazada o retirada
- **WHEN** el autor oculta una versión rechazada o de una identidad retirada
- **THEN** desaparece de su historial sin borrar la decisión, retirada ni eventos anteriores

#### Scenario: Ocultación denegada
- **WHEN** un usuario intenta ocultar una versión ajena, ya oculta o con `deleted_at`
- **THEN** el servidor deniega la operación sin alterar la versión y la interfaz conserva o actualiza el estado visible

### Requirement: Aprobaciones inmutables y versiones
El contenido de una versión aprobada MUST permanecer inmutable. La identidad de una plantilla de módulo MUST fijar `rootKind`, `sectionId` y `rootSlot` estructural compatible; para una tabla estándar `rootSlot` MUST ser la clave concreta de su tabla. Su autor, si sigue siendo `admin` o `editor` activo, y cualquier administrador activo SHALL poder proponer una nueva versión desde el catálogo. La revisión MUST conservar esos tres atributos y el tipo `full`/`module`. Al aprobarla, esta pasa a ser la vigente sin modificar la versión anterior ni los documentos instanciados.

#### Scenario: Se revisa el tipo de una plantilla
- **WHEN** se propone una nueva versión de una plantilla completa o de módulo
- **THEN** conserva su tipo y, si es de módulo, `rootKind`, `sectionId` y `rootSlot`; para cambiar alguno se debe proponer una plantilla nueva

#### Scenario: Se intenta cambiar la ubicación de una tabla estándar
- **WHEN** una nueva versión de un módulo de tabla `affectedComponents` intenta ubicar su raíz en 07 o cambiar la clave a `testCases`
- **THEN** el servidor rechaza la revisión y conserva vigente la versión anterior

#### Scenario: Se inicia una revisión desde el catálogo
- **WHEN** el autor autorizado o un administrador activo elige **Proponer nueva versión** para una plantilla existente y envía la estructura del documento actual
- **THEN** se crea una versión `pending` asociada a la misma identidad de plantilla, mientras la versión aprobada vigente permanece intacta y disponible

#### Scenario: Usuario sin permiso intenta revisar una plantilla ajena
- **WHEN** un editor que no es el autor o un lector intenta proponer una versión para una plantilla existente
- **THEN** el servidor deniega la acción y no modifica ninguna versión

#### Scenario: Se propone y aprueba una revisión
- **WHEN** un autor autorizado propone una revisión de una plantilla aprobada y el administrador la aprueba
- **THEN** el catálogo ofrece la nueva versión y conserva la anterior para trazabilidad

#### Scenario: Se intenta alterar una versión aprobada
- **WHEN** un cliente intenta actualizar directamente el contenido de una versión aprobada
- **THEN** el servidor lo rechaza

### Requirement: Retirada de plantillas
Un administrador activo SHALL poder retirar una plantilla del catálogo. La retirada MUST impedir nuevas instancias por la vía pública **Disponibles** y conservar las versiones y el registro de revisión para auditoría; el autor SHALL poder seguir usando sus versiones propias visibles por **Mis propuestas**. Los documentos previamente creados MUST permanecer intactos.

#### Scenario: Administrador retira una plantilla
- **WHEN** se retira una plantilla aprobada
- **THEN** deja de ofrecerse en **Disponibles**, el autor puede usar sus versiones no ocultas ni borradas desde **Mis propuestas**, y las copias ya existentes no cambian

### Requirement: Desplazamiento del modal Biblioteca
El modal **Biblioteca** SHALL mantener visibles su cabecera, pestañas y controles superiores al desplazar el listado, árbol o formulario. El contenido SHALL desplazarse en una región interna limitada por la altura de la ventana, sin scroll horizontal ni controles inaccesibles en escritorio o móvil. El comportamiento SHALL funcionar en tema claro y oscuro, con foco y navegación por teclado conservados.

#### Scenario: Biblioteca con contenido largo
- **WHEN** un usuario desplaza un catálogo o árbol que excede la altura disponible
- **THEN** la cabecera, pestañas y controles superiores permanecen visibles y solo se desplaza el contenido interno

#### Scenario: Biblioteca en móvil y ambos temas
- **WHEN** un usuario abre Biblioteca en una pantalla estrecha con tema claro u oscuro
- **THEN** puede alcanzar todo el contenido y los controles con scroll interno, sin desbordamiento horizontal ni pérdida del foco visible

### Requirement: Documento independiente desde plantilla
Instanciar una plantilla SHALL crear una copia local editable solo para `admin` o `editor` activos y a partir de una selección válida de su versión aprobada vigente en **Disponibles** o de cualquier versión propia con `deleted_at` y `author_hidden_at` nulos en **Mis propuestas**. El nuevo documento SHALL recibir el usuario actual como autor, fecha actual, versión inicial y datos identificativos vacíos o genéricos; el histórico inicial SHALL generarse de nuevo únicamente si está seleccionada la tabla de 02, sin datos del documento de origen. Una plantilla de módulo SHALL crear un documento nuevo con la sección contenedora y el módulo seleccionado, sin fusionarlo con el documento activo.

#### Scenario: Editor usa una plantilla
- **WHEN** un editor selecciona **Usar plantilla**
- **THEN** se crea un documento local con solo las secciones y módulos seleccionados de la estructura aprobada, contenido interno vacío e IDs locales nuevos, independiente de la plantilla y de otros documentos

#### Scenario: Editor usa una plantilla de módulo
- **WHEN** un editor usa un módulo de fuente de datos de 06
- **THEN** se crea un documento nuevo que contiene únicamente 06, el subapartado contenedor y esa fuente, con el perfil técnico vacío porque 01 no está presente

#### Scenario: Hay cambios sin exportar
- **WHEN** un editor intenta sustituir un documento local con cambios sin exportar
- **THEN** el sistema pide confirmación y conserva el documento si cancela

#### Scenario: La plantilla se retira antes de usarla
- **WHEN** **Disponibles** estaba abierto y la plantilla deja de estar vigente o se retira antes de instanciarla
- **THEN** la operación falla sin reemplazar el documento actual
