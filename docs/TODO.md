# To Do

## Pendientes funcionales

- [x] Evitar la pérdida de cambios al cambiar de pestaña o ventana.
  - La aplicación debe poder actualizar permisos y sesión al recuperar el foco sin recargar, reinicializar ni sobrescribir el documento en edición.
  - Los cambios todavía no guardados deben conservarse al salir temporalmente de la pestaña y volver a ella.

- [x] Eliminar el mensaje `Reintento disponible en xx min` de las solicitudes de acceso.
  - El contador actual es interno de la aplicación y no representa el límite real de correo de Supabase.
  - Mantener el estado de error y la posibilidad de reintentar sin mostrar una espera estimada engañosa.

- [ ] Habilitar `Continuar con Microsoft` mediante Microsoft Entra ID.
  - Mantenerlo como `Próximamente` hasta disponer de un tenant corporativo.
  - Configurar OAuth/SSO y validar el acceso corporativo cuando el tenant esté disponible.
