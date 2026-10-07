# Pruebas del ciclo de acceso

## Prueba habitual, sin correo

Requiere Node 20.19 o superior y pnpm 11.19. Ejecuta:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

En este equipo Windows, Playwright utiliza Chrome instalado cuando la descarga de Chromium no está disponible. En CI se instala Chromium. La suite abre Vite en `http://localhost:5187` con la URL inerte `https://test.supabase.invalid` y una clave pública ficticia. El arnés intercepta Auth, Functions y PostgREST, bloquea otros destinos y recrea el estado para cada prueba. Nunca invoca el proyecto Supabase real ni envía correo. Cubre alta pendiente, aprobación, rechazo, ausencia de invitaciones duplicadas, contraseña inicial, login, recuperación y sustitución de contraseña. Dos contextos separados representan al solicitante y al administrador.

La simulación verifica la interfaz y el contrato HTTP que consume. No prueba funciones desplegadas, SQL, RLS, SMTP ni entrega real. El resumen seguro queda en `test-results/safe-summary.json`. Se desactivan trazas y capturas automáticas porque pueden incluir contraseñas o enlaces de un solo uso. No subas los demás archivos de `test-results`.

## Smoke test real, sólo staging

Usa un proyecto Supabase **dedicado de staging**, con SMTP propio conectado a un buzón capturable. No uses el proyecto actual, producción ni el correo integrado gratuito de Supabase. El test crea una dirección única con prefijo `dbdocgen-test-`, solicita acceso, aprueba con una cuenta administradora dedicada, lee los enlaces de invitación y recuperación desde el buzón, establece y reemplaza la contraseña, y comprueba que la anterior deja de funcionar.

Configura en ese staging:

- Las mismas migraciones y cuatro Edge Functions que la aplicación.
- `DB_DOCGEN_APP_URLS=http://localhost:5187/` como secreto de las Edge Functions.
- `http://localhost:5187/`, `http://localhost:5187/?auth=setup` y `http://localhost:5187/?auth=recovery` en Authentication → URL Configuration → Redirect URLs.
- Una cuenta administradora dedicada, con acceso activo.
- Un SMTP de prueba conectado a Mailtrap Email Sandbox. Configura `LIVE_MAILBOX_API_URL` con la lista del sandbox, por ejemplo `https://mailtrap.io/api/accounts/<account_id>/inboxes/4943452/messages` (también se admite `https://mailtrap.io/api/sandboxes/4943452/messages`). El test consulta la lista con `search=<correo>`, filtra por `to_email` y obtiene los cuerpos mediante `html_path`/`txt_path` de los mensajes seleccionados. Acepta tanto rutas numéricas como rutas opacas de `/api/testing_message_parts/` siempre dentro de `mailtrap.io`; rechaza otros orígenes, parámetros y rutas. El token debe tener acceso de lectura a ese sandbox. La API admite `Authorization: Bearer`.
- Se mantiene el adaptador genérico: para otro host HTTPS, `GET <LIVE_MAILBOX_API_URL>?to=<correo>` debe responder `{ "messages": [{ "to": "...", "text": "...", "html": "..." }] }`. Ambos formatos deben contener la URL completa de Supabase Auth o el retorno a la app.

Define las variables siguientes **sólo en el entorno del proceso de pruebas**. Ninguna clave de servicio, contraseña o token debe usar el prefijo `VITE_` ni guardarse en Git:

```text
LIVE_E2E_ENABLED=yes
LIVE_STAGING_PROJECT_REF=<ref de staging>
LIVE_ALLOWED_PROJECT_REFS=<misma ref, allowlist explícita>
LIVE_SUPABASE_URL=https://<ref de staging>.supabase.co
LIVE_SUPABASE_PUBLISHABLE_KEY=<clave pública de staging>
LIVE_SERVICE_ROLE_KEY=<clave de servicio de staging>
LIVE_ADMIN_EMAIL=<administrador dedicado>
LIVE_ADMIN_PASSWORD=<contraseña del administrador>
LIVE_MAILBOX_API_URL=https://mailtrap.io/api/accounts/<account_id>/inboxes/4943452/messages
LIVE_MAILBOX_API_TOKEN=<token API de lectura de Mailtrap>
LIVE_MAILBOX_DOMAIN=<dominio capturable>
LIVE_SMTP_CONFIRMED=captured
```

Después ejecuta `pnpm test:e2e:live`. El comando valida opt-in, referencia allowlisted, URL exacta, dominio y credenciales **antes de lanzar el navegador**. La prueba comprueba que la API del buzón responde antes de la primera escritura. Por seguridad, el proyecto actual está expresamente rechazado. Supabase limita los enlaces de recuperación por usuario durante 60 segundos: el smoke test espera sólo el tiempo restante desde la invitación, más un segundo de margen, antes de solicitar la recuperación. Por ello puede tardar alrededor de un minuto incluso cuando todo funciona.

La limpieza consulta la dirección única y elimina únicamente sus solicitudes por ID/correo y sus usuarios por ID, tras verificar de nuevo el correo de Auth. El limitador por IP es compartido y no se toca. Si la ejecución se interrumpe o una eliminación falla, el informe indica los IDs exactos que requieren revisión manual. Nunca trunques tablas para limpiar una prueba. El smoke test no forma parte de CI y requiere que el equipo de staging y SMTP esté preparado; no se ejecuta automáticamente.

Si falla la suite simulada, investiga el código de interfaz o el contrato del arnés. Si sólo falla staging, revisa las funciones desplegadas, Auth logs, SMTP, URLs de retorno y políticas RLS. El informe automático muestra etapa y código seguro sin claves ni enlaces de un solo uso.
