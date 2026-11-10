---
status: accepted
---
# El HTML del autor se sirve en un iframe sandbox con origen opaco

Todos los artifacts comparten un origen y el HTML admite JS arbitrario, así que un artifact podría leer y exfiltrar el resto del sitio privado con la sesión del lector. GitHub Pages no permite cabeceras propias (no hay CSP `sandbox`), por eso el HTML del autor nunca se sirve como `.html` del sitio: una página contenedora con la barra común lo carga en `<iframe sandbox="allow-scripts …" srcdoc>`, sin `allow-same-origin`. Coste: no hay `localStorage` y hacen falta `<base>` y `target="_top"`. Si más del 10 % de los HTML del PoC se rompen, la alternativa es servir el contenido en un origen separado.
