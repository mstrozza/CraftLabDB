# DB DocGen

Aplicación web para crear, estructurar y exportar especificaciones técnicas de evolutivos COBOL. La interfaz está inspirada en la identidad visual de Deutsche Bank e incorpora edición modular, tablas configurables, modo claro/oscuro y autenticación mediante Supabase.

## Funcionalidades principales

- Edición de cabecera, histórico, resumen, componentes, detalle técnico y modelo de datos.
- Subapartados y tablas dinámicas con filas y columnas reordenables.
- Campos COBOL activables por subapartado.
- Exportación ajustada al contenido, sin barras de desplazamiento internas.
- Temas claro y oscuro.
- Acceso con Google o mediante correo y contraseña.
- Solicitud de acceso revisada por un administrador antes de enviar la invitación.
- Primer acceso aprobado y recuperación de contraseña mediante enlace por correo.
- Perfiles, roles y permisos preparados en Supabase.
- Gestión de usuarios y roles por administradores; `reader` y el rol heredado `reviewer` sólo pueden consultar, copiar y exportar.

## Requisitos

- Node.js 20.19 o posterior.
- pnpm 11.19 o una versión compatible.
- Un proyecto de Supabase para utilizar autenticación y persistencia remota.

## Instalación local

```bash
pnpm install
```

Copia `.env.example` como `.env.local` y completa los valores públicos de Supabase:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

No añadas claves secretas ni la clave `service_role` a variables que comiencen por `VITE_`.

## Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta las migraciones de `supabase/migrations/` en orden de nombre, hasta `202610030003_reactivation_flow.sql`. Si las primeras ya están aplicadas, ejecuta sólo las pendientes. `202610030002_reactivation_kind.sql` y `202610030003_reactivation_flow.sql` son archivos separados porque PostgreSQL no permite usar el nuevo valor enum `reactivated` antes de confirmar la transacción que lo añade.
3. Activa al menos un administrador existente **antes** de publicar la gestión de usuarios. Despliega las Edge Functions `request-access`, `review-access-request`, `manage-user-access` y `request-reactivation` siguiendo [`docs/auth-foundation.md`](docs/auth-foundation.md); las tres últimas exigen una sesión verificada y, para revisión/gestión, un perfil admin activo.
4. Habilita Email y, si se desea, Google en `Authentication > Providers`; desactiva **Allow new users to sign up** después de activar el primer administrador.
5. Configura `Authentication > URL Configuration` con la URL pública y las redirecciones de autenticación.

La guía detallada está disponible en [`docs/auth-foundation.md`](docs/auth-foundation.md).

### Usuarios y roles

Un administrador activo abre el menú de usuario y elige **Usuarios y roles** para ver nombre, correo, rol y estado de los perfiles existentes. Allí puede asignar `admin`, `editor` o `reader`, y activar/desactivar otras cuentas. `reviewer` es un rol heredado de sólo lectura y no se puede asignar. No es posible quitarse a uno mismo el rol admin ni desactivar la propia cuenta; la base de datos impide además dejar el sistema sin administradores activos. **Solicitudes de acceso** es un diálogo distinto que muestra por separado las altas iniciales y las reactivaciones.

Una cuenta ya autenticada, con perfil existente, inactivo y marcado como previamente activo, puede pulsar **Solicitar reactivación** en la pantalla de acceso pendiente. La función obtiene su identidad del JWT, comprueba el perfil y registra una solicitud `reactivation` sin crear otra cuenta ni enviar correo. Repetir una solicitud pendiente devuelve el mismo resultado sin modificar fechas ni consumir otro intento del límite; una solicitud terminada se puede reabrir. Una alta inicial que ya está `processing` se informa como conflicto, no como reactivación recibida. En la cola admin, aprobar la reactivación activa ese perfil y marca la solicitud `reactivated` en una sola transacción, sin invitación ni restablecimiento de contraseña. Rechazarla mantiene el perfil inactivo. Activar directamente al usuario desde **Usuarios y roles** también cierra una solicitud pendiente de reactivación en la misma transacción. Una cuenta existente pero nunca activada conserva **Solicitar acceso** y el enlace inicial por correo. Si no se puede cargar el perfil, la pantalla sólo permite volver a comprobarlo o cerrar sesión, no enviar solicitudes. Para perfiles antiguos ya inactivos, la migración sólo puede identificar una activación previa si existe un historial de invitación completada; revisa los casos activados fuera del flujo antes de clasificarlos.

Secuencia de despliegue: confirma primero que existe un administrador activo, aplica las migraciones de roles y reactivación (que cierran el UPDATE directo de `profiles` para clientes autenticados), despliega las funciones y por último el frontend. Prueba con cuentas admin, editor, reader, una cuenta reviewer heredada y una cuenta inactiva antes de darlo por terminado. Para revertir la interfaz, retira primero el frontend y las funciones; **no restaures** la política ni el permiso de UPDATE directo sobre `profiles` sin revisar la autorización y preparar una migración compensatoria. El valor enum `reactivated` tampoco se puede eliminar sin tratar antes las filas que lo utilicen.

El editor actual conserva el documento sólo en estado local del navegador; todavía no guarda su contenido en la tabla remota `documents`. La vista de sólo lectura bloquea cambios locales, creación e importación, pero mantiene navegación, selección/copia, apariencia y exportación. Las políticas RLS de la migración protegen por separado la API de documentos existente: reader/reviewer no pueden escribir aunque sean propietarios o tengan permisos `edit` antiguos. Al recuperar el foco de la pestaña se vuelve a comprobar el perfil y se bloquea la edición mientras se carga. Comprueba en navegador que reader/reviewer no alteran campos, filas, columnas ni subapartados y sí pueden exportar; admin/editor deben poder editar. Comprueba también con la API que reader/reviewer no pueden escribir y que admin/editor mantienen sus permisos existentes.

## Desarrollo

```bash
pnpm dev
```

La aplicación estará disponible normalmente en `http://localhost:5173`.

## Publicación en GitHub Pages

La URL prevista para el repositorio `mstrozza/CraftLabDB` es **https://mstrozza.github.io/CraftLabDB/**. El workflow `.github/workflows/deploy.yml` publica `dist/` al actualizar `main` o al ejecutarse manualmente desde Actions.

1. En GitHub, selecciona **Settings > Pages > Build and deployment > Source: GitHub Actions**.
2. En **Settings > Secrets and variables > Actions > Variables**, crea estas dos variables de repositorio con los valores públicos del proyecto Supabase:

   ```text
   VITE_SUPABASE_URL
   VITE_SUPABASE_PUBLISHABLE_KEY
   ```

3. En Supabase, configura **Authentication > URL Configuration**: Site URL `https://mstrozza.github.io/CraftLabDB/` y añade las redirecciones exactas de raíz, primer acceso y recuperación indicadas en [`docs/auth-foundation.md`](docs/auth-foundation.md). Conserva también las redirecciones de localhost para desarrollo.
4. Si utilizas Google, conserva en Google Cloud el callback de Supabase que muestra **Authentication > Providers > Google**. El retorno final a `/CraftLabDB/` se configura en Supabase.

El build para Pages establece `PAGES_BASE_PATH=/CraftLabDB/`; el build local continúa usando `/`. El workflow falla de forma explícita si falta alguna variable pública. No se debe introducir una clave `service_role` en GitHub Variables.

## Comprobaciones y compilación

```bash
pnpm build
pnpm preview
```

`pnpm build` genera la versión optimizada en `dist/`. Esta carpeta no se incluye en el repositorio.

## Estructura básica

```text
src/                  Aplicación React y estilos
src/auth/             Contexto y pantallas de autenticación
src/data/             Acceso a documentos en Supabase
supabase/migrations/  Esquema, triggers y políticas RLS
docs/                 Documentación técnica
```

## Seguridad

- `.env.local` está excluido de Git.
- El navegador utiliza únicamente la clave pública de Supabase.
- `request-access` registra solicitudes sin crear usuarios ni enviar correos. Sólo la revisión aprobada envía la invitación o el enlace de contraseña.
- `request-reactivation` verifica una sesión existente, deriva la identidad de Auth y nunca envía correo. Se limita por huella de IP sólo al crear o reabrir una solicitud; espera cabeceras IP fiables del proxy de Supabase. Para producción se recomiendan también límites del gateway y CAPTCHA.
- Las solicitudes públicas se limitan a 10 intentos por hora y huella de IP; la IP no se guarda en claro. En producción conviene añadir límites del gateway y CAPTCHA.
- `review-access-request` valida en el servidor el JWT y el perfil de administrador activo antes de usar la clave de servicio.
- Las contraseñas se gestionan exclusivamente mediante Supabase Auth.
- Las tablas remotas utilizan políticas Row Level Security.

Antes de publicar en producción se recomienda configurar SMTP propio, revisar las URLs autorizadas, ajustar la política de contraseñas y validar los roles de los usuarios.

## Estado del proyecto

Versión inicial en desarrollo. El acceso con Microsoft permanece marcado como «Próximamente» hasta disponer de un tenant corporativo de Microsoft Entra ID.
