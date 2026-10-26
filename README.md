# BENISAT · Panel de control

Panel de gestión del equipo CanSat BENISAT para la temporada 2026–2027. Aplicación estática en HTML, CSS y JavaScript, sin servidor, cuenta de usuario, API ni base de datos.

## Empezar
Abre `index.html` directamente con un navegador moderno. También puede publicarse como sitio estático con GitHub Pages, sin proceso de compilación.

## Datos locales
La aplicación guarda los datos en `localStorage` del navegador actual. Por tanto:
- Los datos no se envían a ningún servidor ni se sincronizan con otros ordenadores.
- Si se borra el almacenamiento del navegador, se puede perder la información.
- Usa **Datos locales y copias** para descargar copias de seguridad JSON y restaurarlas.
- Los movimientos económicos también se pueden exportar a CSV.

No guardes información sensible ni confíes en el almacenamiento del navegador como única copia.

## Módulos iniciales
- Inicio y resumen.
- Tareas con prioridad, área y fecha límite.
- Hitos y calendario editable.
- Registro de documentación y enlaces.
- Cuaderno de notas científicas.
- Presupuesto con gastos, aportaciones y exportación CSV.
- Ideas de difusión y estado de publicación.
- Copia de seguridad e importación de datos.

## Fechas CanSat
Las fechas incluidas son de referencia inicial y deben verificarse con las comunicaciones oficiales de la convocatoria 2026–2027.

## Tecnología
HTML5, CSS3 y JavaScript nativo. Sin dependencias de compilación. Las tipografías web pueden recurrir a Google Fonts cuando haya conexión; el resto de la aplicación funciona sin conexión con las fuentes locales de reserva.