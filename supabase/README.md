# Supabase para el panel BENISAT

Esta carpeta contiene la base de datos propuesta para compartir el panel de gestión de BENISAT entre dispositivos. La aplicación actual de `index.html` guarda los datos en `localStorage`; **añadir este esquema no conecta todavía la interfaz a Supabase**. La integración del cliente se hará en una fase separada para que los cambios no se confundan con una sincronización ya activa.

## Qué incluye

- `schema.sql`: tablas para tareas, hitos, documentos, notas científicas, movimientos de presupuesto, publicaciones y miembros.
- Acceso solo para usuarios autenticados que tengan una fila activa en `team_members`.
- Roles `admin`, `editor` y `viewer`: los lectores pueden consultar; editores y administradores pueden escribir; solo administradores gestionan miembros.
- Políticas RLS en todas las tablas expuestas.
- Base de datos inicialmente vacía; no se importan datos guardados en los navegadores.

## Instalación

1. Abre el proyecto BENISAT en el panel de Supabase y entra en **SQL Editor**.
2. Revisa y ejecuta el contenido de [`schema.sql`](./schema.sql) una sola vez en el proyecto nuevo.
3. En **Authentication → Users**, invita al primer usuario administrador. Desactiva el registro público si no quieres que cualquiera pueda crear una cuenta.
4. Cuando ese usuario aparezca en Authentication, copia su UUID de usuario y ejecuta en SQL Editor, sustituyendo el UUID:

   ```sql
   insert into public.team_members (user_id, role, active)
   values ('UUID-DEL-USUARIO-ADMIN', 'admin', true);
   ```

5. Invita a cada miembro desde Authentication y añade su UUID a `team_members` con rol `editor` o `viewer`, según corresponda. No compartas cuentas.
6. No pongas nunca la clave `service_role` en HTML, JavaScript del navegador, GitHub ni mensajes. La web solo necesitará la URL del proyecto y la clave pública `publishable`/anon, junto con autenticación; RLS es obligatoria.

## Importante antes de conectar la interfaz

- El esquema usa fechas SQL (`date`), mientras que el frontend actual formatea algunas fechas como texto español. La capa de datos deberá convertirlas al leer/escribir.
- La interfaz actual presenta mensajes como “guardado localmente”. Esos mensajes y la etiqueta “GUARDADO LOCAL” deberán cambiar cuando el servidor confirme cada operación.
- La versión actual incluye hitos de referencia en el código. Como elegiste empezar con una base vacía, el SQL no los inserta automáticamente; podremos añadirlos explícitamente si decides conservarlos.
- Mantén exportación JSON/CSV como copia de seguridad, pero no la confundas con sincronización.
- Antes de publicar, prueba con una cuenta admin/editor y otra viewer; comprueba que el viewer no pueda insertar, editar ni borrar ni siquiera llamando directamente a la API.
- Configura las URL de redirección de Auth para el dominio real de la web cuando sepamos dónde se publica.

## Siguiente fase

Conectar el frontend existente a Supabase Auth y sustituir las lecturas/escrituras síncronas de `localStorage` por operaciones asíncronas contra estas tablas, con estados de carga, error y reintento. El frontend no debe mostrar éxito hasta recibir confirmación del servidor.
