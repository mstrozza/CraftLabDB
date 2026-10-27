# Tasks

## 1. Modelo local e importación

- [x] 1.1 Separar identidad, título, activación y numeración en el modelo local (`sectionOrder`, metadatos y bloques propios); verificar con pruebas que mover o desactivar una sección no mezcla su contenido ni deja huecos en los números visibles.
- [x] 1.2 Definir los cuatro bloques propios vacíos y sus operaciones de subapartados, filas y columnas con IDs estables; verificar mediante pruebas la conservación de valores al reordenar y borrar columnas o filas.
- [x] 1.3 Normalizar e importar copias JSON `1.0` y `1.1`, y exportar `1.1` con estado activo/inactivo; verificar ida y vuelta de una copia personalizada, importación heredada y rechazo de datos inválidos sin reemplazar el documento.
- [x] 1.4 Implementar borrado completo de datos por ID y el estado de cero secciones, manteniendo desactivaciones reversibles; verificar mediante pruebas que la copia JSON retiene inactivas y excluye eliminadas.

## 2. Editor, índice y navegación

- [x] 2.1 Añadir **+ Añadir sección** al final del índice y un diálogo accesible con título y cuatro checks, bloqueando nombres vacíos o cero selecciones; verificar creación, cancelación y controles ausentes en solo lectura.
- [x] 2.2 Renderizar las secciones propias con cuadros extensibles, subapartados y tabla configurable usando controles existentes; verificar edición, filas, columnas y visualización correcta en tema claro/oscuro y móvil.
- [x] 2.3 Permitir edición de título solo en cabecera y reflejarla como texto en índice; verificar que el índice no ofrece campos de edición y que un título vacío no queda aplicado.
- [x] 2.4 Implementar arrastre en índice y flechas accesibles en cabeceras sobre el mismo orden; verificar ambos métodos, extremos deshabilitados y numeración consecutiva de tarjetas y subapartados.
- [x] 2.5 Implementar activación independiente del plegado y lista de secciones desactivadas para reactivarlas; verificar que plegar no cambia numeración y reactivar restaura contenido y posición.
- [x] 2.6 Añadir X en la entrada activa del índice y papelera en tarjeta, ambas con confirmación; verificar cancelación, eliminación efectiva, ausencia de controles en solo lectura y estado vacío al borrar la última.
- [x] 2.7 Reconciliar sección/subapartado activo y scroll después de crear, mover, desactivar, reactivar o eliminar; verificar por interacción que el índice siempre apunta a un destino existente.

## 3. Salidas y privacidad del documento

- [x] 3.1 Actualizar Word para iterar secciones activas en orden y renderizar títulos, ordinales y los cuatro bloques propios completos; verificar salida con 01 movida, 05/06 renumeradas y COBOL multilínea.
- [x] 3.2 Actualizar impresión/PDF para incluir solo tarjetas activas, desplegar contenido plegado al imprimir y evitar scroll interno en textos y código; verificar vista previa de impresión con secciones movidas, renombradas e inactivas.
- [x] 3.3 Comprobar que editar secciones no escribe documentos en Supabase ni almacenamiento del navegador; verificar inspección de llamadas/almacenamiento y actualizar la documentación de exportación local.

## 4. Plantillas y validación remota

- [x] 4.1 Proyectar títulos, orden, activación, bloques y cabeceras de secciones propias como estructura de plantilla v2, sin texto, código ni valores; verificar mediante pruebas de transformación que solo viajan campos permitidos.
- [x] 4.2 Instanciar selección total o parcial de plantillas v2 con IDs locales nuevos y datos vacíos, conservando lectura de plantillas v1; verificar pruebas para plantilla completa, módulo propio y versión anterior.
- [x] 4.3 Añadir una migración Supabase con validación v2 de IDs, jerarquía, límites y tipos, conservando el tratamiento v1 y las versiones aprobadas; verificar en entorno de prueba propuestas válidas, cargas maliciosas rechazadas y lectura de una plantilla v1 existente.
- [x] 4.4 Actualizar vista previa y selección modular del catálogo para secciones propias y sus bloques, incluida omisión completa de secciones desmarcadas; verificar prueba de interfaz y actualizar `docs/template-library.md`.

## 5. Integración

- [x] 5.1 Ejecutar compilación, pruebas de modelo, plantillas y recorridos de interfaz relevantes; verificar que todos concluyen sin fallos después de integrar los cuatro grupos.
- [x] 5.2 Revisar manualmente un recorrido con editor y otro en solo lectura: añadir, renombrar, mover, desactivar/reactivar, eliminar, exportar/importar y proponer/usar plantilla; registrar resultados y cualquier limitación antes de dar por completado el cambio.

### Resultado de verificación (26/10/2026)

- Recorrido editor superado en Chrome local: alta con cuatro bloques, renombrado, movimiento, desactivación/reactivación, exportación e importación JSON 1.1, propuesta y creación desde plantilla propia, y eliminación confirmada.
- Recorrido de solo lectura superado: no aparecen controles para añadir, renombrar, mover, desactivar o eliminar secciones; navegación y contenido permanecen visibles.
- Inspección visual de ambos estados sin desbordamiento horizontal ni desajustes estructurales apreciables.
- Limitación controlada: el recorrido se ejecutó contra `MockSupabase` para no alterar usuarios, propuestas o plantillas reales; la migración y los validadores sí se comprobaron por separado en el proyecto real de Supabase.
