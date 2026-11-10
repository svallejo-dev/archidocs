---
status: accepted
---
# Git como almacenamiento, con push directo a `main`

El repo es la base de datos de los artifacts y git es su API de escritura: no hay servidor ni base de datos. Se publica con push directo a `main`, sin PR ni aprobación, porque el valor buscado es el historial y la recuperación, no el gobierno del contenido. Consecuencias: borrar un artifact no lo elimina del historial (purgar requiere reescribirlo), y la concurrencia se resuelve en el cliente (ver ADR-0004). Se revisa si se superan ~1 publicación por minuto sostenida o si cumplimiento exige borrado real.
