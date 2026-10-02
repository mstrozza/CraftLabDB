# Base de autenticación y persistencia

DB DocGen utiliza Supabase para gestionar sesiones, perfiles, solicitudes de alta, documentos y permisos. Si no existen variables de entorno, la aplicación ofrece un modo local de prueba claramente identificado. Microsoft permanece visible como «Próximamente» hasta disponer de un tenant corporativo de Microsoft Entra ID.

## 1. Crear el proyecto

1. Crea un proyecto en Supabase.
2. Abre el editor SQL.
3. Ejecuta en este orden `supabase/migrations/202609250001_auth_foundation.sql` y `supabase/migrations/202610020001_managed_access.sql`. Si la primera ya está aplicada, ejecuta sólo la segunda.
4. Comprueba que existen `profiles`, `access_requests`, `documents` y `document_permissions` y que RLS está activado. La segunda migración deja inactivos por defecto sólo a los perfiles nuevos; no cambia el estado de los ya existentes.
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
10. Activa el primer administrador antes de desactivar el alta libre. En el editor SQL, sustituye el correo de ejemplo por el de un usuario ya existente:

   ```sql
   update public.profiles
   set role = 'admin', is_active = true
   where id = (select id from auth.users where lower(email) = lower('admin@ejemplo.com'));
   ```

   Comprueba que se actualizó exactamente un perfil. Si todavía no hay cuentas, crea o invita la primera desde el panel de Supabase antes de cerrar el registro.
11. En **Authentication > Providers > Email**, desactiva **Allow new users to sign up**. Google puede permanecer habilitado: cualquier cuenta nueva que llegue a existir tendrá perfil inactivo y no verá el editor hasta la aprobación.
12. Revisa la política de contraseñas y configura SMTP propio antes de utilizar el proyecto en producción.

## 2. Desplegar las funciones de alta

Con Supabase CLI autenticado y el proyecto enlazado, aplica la migración pendiente y despliega ambas funciones:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy request-access
supabase functions deploy review-access-request
```

Si las migraciones se ejecutaron manualmente en SQL Editor, no las vuelvas a ejecutar con `db push`; comprueba el historial antes. `supabase/config.toml` deja accesible la función pública y desactiva la validación JWT de plataforma para la función de revisión, que valida el token de usuario mediante Supabase Auth y comprueba el perfil de administrador activo en el servidor. La clave `SUPABASE_SERVICE_ROLE_KEY` se utiliza exclusivamente dentro de las funciones; nunca la añadas a `.env.local`, GitHub Variables ni a ninguna variable `VITE_`.

Las funciones sólo aceptan orígenes `http://localhost:5173` y `https://mstrozza.github.io` y eligen internamente la raíz de retorno correspondiente (`/` o `/CraftLabDB/`). No aceptan URLs de retorno enviadas por el navegador. Si publicas otra instalación, configura en las funciones `DB_DOCGEN_APP_URLS` con sus URLs raíz HTTPS, separadas por comas y terminadas en `/`; después autoriza sus redirecciones exactas en Supabase.

`request-access` es pública: normaliza y deduplica el correo, registra una solicitud y devuelve una respuesta genérica. No crea una cuenta ni envía correo. La función limita de forma persistente a **10 intentos por hora y huella de IP** mediante una operación SQL atómica. Guarda sólo SHA-256 de IP y sal, nunca la IP en claro. Puedes definir la sal estable `DB_DOCGEN_RATE_LIMIT_SALT` como secreto de la función; si falta, se usa la clave de servicio del entorno como sal de respaldo. Rotar esa clave reinicia efectivamente los buckets. La función espera una IP válida en las cabeceras del proxy de Supabase: prefiere `cf-connecting-ip` y, en su ausencia, toma la última IP válida de `x-forwarded-for` o `x-real-ip`. Si el gateway no proporciona ninguna, responde genéricamente y **no registra la solicitud**. Para una exposición pública, añade límites del gateway y Turnstile/CAPTCHA.

## 3. Configurar el entorno local

Copia `.env.example` como `.env.local` y completa únicamente los valores públicos:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

No incluyas nunca una clave secreta ni `service_role` en variables que comiencen por `VITE_`: Vite las incorpora al código del navegador. La integración mantiene compatibilidad con la antigua variable `VITE_SUPABASE_ANON_KEY`, pero se recomienda la clave publishable actual.

## 4. Modelo de permisos

- `admin`: administra usuarios y cualquier documento.
- `editor`: puede crear documentos y editar los propios o compartidos con permiso `edit`.
- `reviewer`: queda preparado para el futuro flujo de revisión.
- `reader`: solo puede leer documentos compartidos.

Los usuarios nuevos se crean como `reader` e inactivos. Sólo un administrador activo puede leer las solicitudes; el navegador no puede insertarlas, modificarlas ni aprobarlas directamente. La función de revisión acepta únicamente un JWT válido de administrador activo y usa una transición condicional para que una solicitud ya revisada no genere otra invitación. El reintento se habilita tras **15 minutos** para `invite_failed` o una operación `processing` vencida; la pantalla muestra el tiempo restante.

La función conserva `auth_user_id` en cuanto conoce la identidad. Aun así, Supabase Auth no ofrece una clave de idempotencia para el envío de invitaciones o recuperaciones: si acepta el correo y la función falla antes de persistir el resultado, un reintento puede generar un segundo mensaje. El panel advierte de ello. No se marca ninguna solicitud como `invited` antes de que Auth confirme el envío y se active el perfil.

## 5. Flujos de acceso

- **Google**: inicia la autenticación OAuth y regresa a la raíz de esta instalación de la aplicación.
- **Correo y contraseña**: utiliza el correo como identificador para los accesos habituales.
- **Solicitar acceso**: registra el correo sin crear `auth.users` ni enviar mensajes. Un administrador revisa la solicitud desde su menú de usuario.
- **Aprobación**: si no existe usuario, envía una invitación de Supabase con retorno `?auth=setup`; si ya existe, envía un enlace de recuperación con retorno `?auth=recovery`. Después activa el perfil. Rechazar no envía correo.
- **Primer acceso aprobado**: al abrir la invitación, solicita crear y confirmar una contraseña.
- **Contraseña olvidada**: envía un enlace de recuperación. Al regresar mediante `?auth=recovery`, solicita establecer una contraseña nueva.
- **Sesión inactiva**: puede solicitar revisión, comprobar de nuevo el estado y cerrar sesión; no ve el editor. Esto también cubre cuentas nuevas de Google.
- **Microsoft**: se mantiene deshabilitado y marcado como «Próximamente».

Las contraseñas se crean y actualizan directamente mediante Supabase Auth. Nunca se guardan en `profiles`, `localStorage` ni en el código de la aplicación.

El enlace de recuperación sigue disponible sin aprobación administrativa para titulares de cuentas existentes. La aprobación no modifica la identidad existente ni duplica el usuario.

La raíz de retorno se calcula con `import.meta.env.BASE_URL`. En localhost es `/`; en el build de GitHub Pages es `/CraftLabDB/`, de modo que OAuth, primer acceso y recuperación regresan a la misma instalación de la app.

## 6. Publicación en GitHub Pages

En el repositorio de GitHub, selecciona **Settings > Pages > Build and deployment > Source: GitHub Actions**. Después crea en **Settings > Secrets and variables > Actions > Variables** las variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. El workflow instala pnpm 11.19.0 y Node.js 20.19.0, ejecuta `pnpm install --frozen-lockfile`, compila con `PAGES_BASE_PATH=/CraftLabDB/` y publica `dist/`.

## 7. Integración incluida

- `src/lib/supabase.js`: cliente público, sesiones persistentes y renovación automática.
- `src/auth/AuthContext.jsx`: estado de sesión, solicitud de alta, acceso OAuth, correo/contraseña, recuperación, perfil y sesión local de prueba.
- `src/auth/AuthGate.jsx`: formularios de acceso, solicitud, recuperación y protección del editor frente a perfiles inactivos.
- `supabase/functions/`: solicitud pública y revisión administrativa de altas.
- `src/data/documentRepository.js`: operaciones tipadas por convención para listar, cargar, crear, actualizar y eliminar documentos.
- `supabase/migrations/...sql`: tablas, índices, triggers y políticas RLS.

El nombre obtenido del perfil o del proveedor sustituye al usuario genérico en la cabecera y se utiliza como autor de los documentos nuevos. El menú de usuario permite cerrar la sesión.

## 8. Modo local de prueba

Sin `.env.local`, se solicita nombre y correo y la sesión se guarda únicamente en `localStorage` bajo `db-docgen-demo-user`. Sirve para validar la experiencia, pero no autentica ni protege datos y no debe considerarse una solución de producción.

La interfaz todavía no persiste documentos en el repositorio remoto. Ese será el siguiente paso tras validar la autenticación y la futura biblioteca de documentos.
