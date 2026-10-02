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
2. Ejecuta, en orden, `supabase/migrations/202609250001_auth_foundation.sql` y `supabase/migrations/202610020001_managed_access.sql` desde el editor SQL.
3. Activa un primer administrador existente y despliega las Edge Functions `request-access` y `review-access-request` siguiendo [`docs/auth-foundation.md`](docs/auth-foundation.md).
4. Habilita Email y, si se desea, Google en `Authentication > Providers`; desactiva **Allow new users to sign up** después de activar el primer administrador.
5. Configura `Authentication > URL Configuration` con la URL pública y las redirecciones de autenticación.

La guía detallada está disponible en [`docs/auth-foundation.md`](docs/auth-foundation.md).

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
- Las solicitudes públicas se limitan a 10 intentos por hora y huella de IP; la IP no se guarda en claro. En producción conviene añadir límites del gateway y CAPTCHA.
- `review-access-request` valida en el servidor el JWT y el perfil de administrador activo antes de usar la clave de servicio.
- Las contraseñas se gestionan exclusivamente mediante Supabase Auth.
- Las tablas remotas utilizan políticas Row Level Security.

Antes de publicar en producción se recomienda configurar SMTP propio, revisar las URLs autorizadas, ajustar la política de contraseñas y validar los roles de los usuarios.

## Estado del proyecto

Versión inicial en desarrollo. El acceso con Microsoft permanece marcado como «Próximamente» hasta disponer de un tenant corporativo de Microsoft Entra ID.
