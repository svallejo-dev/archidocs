---
status: accepted
---
# Carpeta = módulo = URL

La ruta `artifacts/<modulo>/<submodulo>/<slug>/` define a la vez el módulo de navegación y la URL publicada `/<modulo>/<submodulo>/<slug>/`; el módulo no se guarda en los metadatos. Se eligió frente a URLs planas por ID porque el sitio debe navegarse igual que el repo. Mover un artifact rompe enlaces salvo por los `aliases` que registra `archidocs move` y que el build convierte en redirects; si hay más de ~10 movimientos al mes, se reconsideran las URLs planas.
