# DB DocGen

Aplicación web para crear, estructurar y exportar especificaciones técnicas de evolutivos COBOL. La interfaz está inspirada en la identidad visual de Deutsche Bank e incorpora edición modular, tablas configurables, modo claro/oscuro y autenticación mediante Supabase.

## Funcionalidades principales

- Edición de cabecera, histórico, resumen, componentes, detalle técnico y modelo de datos.
- Subapartados y tablas dinámicas con filas y columnas reordenables.
- Campos COBOL activables por subapartado.
- Exportación ajustada al contenido, sin barras de desplazamiento internas.
- Temas claro y oscuro.
- Acceso con Google o mediante correo y contraseña.
- Primer acceso y recuperación de contraseña mediante enlace por correo.
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
2. Ejecuta la migración `supabase/migrations/202609250001_auth_foundation.sql` desde el editor SQL.
3. Habilita el proveedor de correo y, si se desea, Google en `Authentication > Providers`.
4. Configura `Authentication > URL Configuration` con la URL pública y las redirecciones de autenticación.

La guía detallada está disponible en [`docs/auth-foundation.md`](docs/auth-foundation.md).

## Desarrollo

```bash
pnpm dev
```

La aplicación estará disponible normalmente en `http://localhost:5173`.

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
- Las contraseñas se gestionan exclusivamente mediante Supabase Auth.
- Las tablas remotas utilizan políticas Row Level Security.

Antes de publicar en producción se recomienda configurar SMTP propio, revisar las URLs autorizadas, ajustar la política de contraseñas y validar los roles de los usuarios.

## Estado del proyecto

Versión inicial en desarrollo. El acceso con Microsoft permanece marcado como «Próximamente» hasta disponer de un tenant corporativo de Microsoft Entra ID.
