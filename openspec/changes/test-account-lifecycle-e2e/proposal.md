# Proposal

## Why

El ciclo de alta y recuperación combina interfaz, funciones Supabase, Auth y correo, pero el proyecto aún no tiene un framework de pruebas automatizadas. Los fallos de invitación pueden aparecer sólo después de aprobar una solicitud, y repetir pruebas manuales con el SMTP gratuito consume su cuota. Hace falta una verificación reproducible que no dependa de envíos reales para el trabajo cotidiano.

## What Changes

- Incorporar una capa E2E determinista con Playwright y un arnés de respuestas de Supabase simuladas para recorrer solicitud pública, aprobación administrativa, recepción simulada del enlace de invitación, creación de contraseña, acceso por correo y contraseña, y recuperación/restablecimiento.
- Documentar y habilitar una prueba de humo real, opcional y aislada, contra un proyecto Supabase de staging con SMTP de pruebas y buzón capturable. No ejecutarla contra producción ni contra el SMTP gratuito predeterminado.
- Definir datos y limpieza de prueba, requisitos de entorno y criterios para distinguir fallos de interfaz de fallos de Auth/correo. No cambiar el comportamiento de autenticación existente.

## Capabilities

### New Capabilities

- `account-lifecycle-verification`: verifica de forma reproducible el ciclo de cuenta completo y ofrece una comprobación real opcional de los límites entre aplicación, Supabase Auth y correo.

### Modified Capabilities

Ninguna.

## Impact

Se añadirían configuración, dependencias y scripts de Playwright, pruebas y documentación; podrían ajustarse controles de automatización del entorno de pruebas sin alterar el flujo de usuario. El recorrido abarca `src/auth/`, `supabase/functions/request-access`, `supabase/functions/review-access-request` y los retornos `?auth=setup`/`?auth=recovery`. La prueba de humo requiere credenciales de staging, buzón capturable y aislamiento de datos; Docker y Supabase CLI no son requisitos para la capa determinista.
