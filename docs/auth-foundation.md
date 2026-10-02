# Base de autenticación y persistencia

DB DocGen utiliza Supabase para gestionar sesiones, perfiles, documentos y permisos. Si no existen variables de entorno, la aplicación ofrece un modo local de prueba claramente identificado; al configurar Supabase, se habilitan Google y el acceso mediante correo y contraseña. Microsoft permanece visible como «Próximamente» hasta disponer de un tenant corporativo de Microsoft Entra ID.

## 1. Crear el proyecto

1. Crea un proyecto en Supabase.
2. Abre el editor SQL.
3. Ejecuta `supabase/migrations/202609250001_auth_foundation.sql`.
4. Comprueba que existen `profiles`, `documents` y `document_permissions` y que RLS está activado.
5. En **Authentication > Providers**, mantén habilitado Email y configura Google si se utilizará ese proveedor.
6. En **Authentication > URL Configuration**, usa como **Site URL** `https://mstrozza.github.io/CraftLabDB/`.
7. Añade estas URLs exactas en **Redirect URLs** para la versión de GitHub Pages:

   ```text
   https://mstrozza.github.io/CraftLabDB/
   https://mstrozza.github.io/CraftLabDB/?auth=setup
   https://mstrozza.github.io/CraftLabDB/?auth=recovery
   ```

8. Conserva estas redirecciones de desarrollo local:

   ```text
   http://localhost:5173/
   http://localhost:5173/?auth=setup
   http://localhost:5173/?auth=recovery
   ```

9. Si Google está habilitado, su **Authorized redirect URI** en Google Cloud sigue siendo el callback de Supabase indicado en **Authentication > Providers > Google** (`https://<project-ref>.supabase.co/auth/v1/callback`). No lo sustituyas por la URL de GitHub Pages; Supabase redirige después a la raíz de la app.
10. Revisa la política de contraseñas y configura SMTP propio antes de utilizar el proyecto en producción.

## 2. Configurar el entorno local

Copia `.env.example` como `.env.local` y completa únicamente los valores públicos:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

No incluyas nunca una clave secreta ni `service_role` en variables que comiencen por `VITE_`: Vite las incorpora al código del navegador. La integración mantiene compatibilidad con la antigua variable `VITE_SUPABASE_ANON_KEY`, pero se recomienda la clave publishable actual.

## 3. Modelo de permisos

- `admin`: administra usuarios y cualquier documento.
- `editor`: puede crear documentos y editar los propios o compartidos con permiso `edit`.
- `reviewer`: queda preparado para el futuro flujo de revisión.
- `reader`: solo puede leer documentos compartidos.

Los usuarios nuevos se crean como `reader`. Un administrador debe promocionarlos desde un entorno seguro o, durante el desarrollo, desde el panel de Supabase.

## 4. Flujos de acceso

- **Google**: inicia la autenticación OAuth y regresa a la raíz de esta instalación de la aplicación.
- **Correo y contraseña**: utiliza el correo como identificador para los accesos habituales.
- **Primer acceso**: envía un enlace seguro al correo. Al regresar mediante `?auth=setup`, solicita crear y confirmar una contraseña.
- **Contraseña olvidada**: envía un enlace de recuperación. Al regresar mediante `?auth=recovery`, solicita establecer una contraseña nueva.
- **Microsoft**: se mantiene deshabilitado y marcado como «Próximamente».

Las contraseñas se crean y actualizan directamente mediante Supabase Auth. Nunca se guardan en `profiles`, `localStorage` ni en el código de la aplicación.

El enlace presentado como «primer acceso» es también un enlace seguro de autenticación. Para limitar estrictamente su emisión a una única alta sería necesario incorporar un flujo de invitaciones o una validación controlada desde servidor.

La raíz de retorno se calcula con `import.meta.env.BASE_URL`. En localhost es `/`; en el build de GitHub Pages es `/CraftLabDB/`, de modo que OAuth, primer acceso y recuperación regresan a la misma instalación de la app.

## Publicación en GitHub Pages

En el repositorio de GitHub, selecciona **Settings > Pages > Build and deployment > Source: GitHub Actions**. Después crea en **Settings > Secrets and variables > Actions > Variables** las variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. El workflow instala pnpm 11.19.0 y Node.js 20.19.0, ejecuta `pnpm install --frozen-lockfile`, compila con `PAGES_BASE_PATH=/CraftLabDB/` y publica `dist/`.

## 5. Integración incluida

- `src/lib/supabase.js`: cliente público, sesiones persistentes y renovación automática.
- `src/auth/AuthContext.jsx`: estado de sesión, acceso OAuth, correo/contraseña, recuperación, perfil y sesión local de prueba.
- `src/auth/AuthGate.jsx`: formularios de acceso, primer uso, recuperación y protección del editor.
- `src/data/documentRepository.js`: operaciones tipadas por convención para listar, cargar, crear, actualizar y eliminar documentos.
- `supabase/migrations/...sql`: tablas, índices, triggers y políticas RLS.

El nombre obtenido del perfil o del proveedor sustituye al usuario genérico en la cabecera y se utiliza como autor de los documentos nuevos. El menú de usuario permite cerrar la sesión.

## 6. Modo local de prueba

Sin `.env.local`, se solicita nombre y correo y la sesión se guarda únicamente en `localStorage` bajo `db-docgen-demo-user`. Sirve para validar la experiencia, pero no autentica ni protege datos y no debe considerarse una solución de producción.

La interfaz todavía no persiste documentos en el repositorio remoto. Ese será el siguiente paso tras validar la autenticación y la futura biblioteca de documentos.
