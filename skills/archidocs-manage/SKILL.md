---
name: archidocs-manage
description: Gestiona la estructura de Archidocs: lista los módulos y lo que guarda cada uno, crea módulos y submódulos con su README y actualiza su descripción. Úsala cuando el usuario quiera ver, crear, describir u organizar módulos o carpetas de Archidocs, o cuando archidocs-publish necesite un módulo que no existe.
---

# Gestionar módulos de Archidocs

Un módulo es una carpeta con `README.md` cuyo frontmatter (`title`, `description`, `includes`, `excludes`, `owners`) le dice al LLM qué documentos van ahí. Pueden anidarse sin límite. **Nunca ejecutes git directamente**: usa el CLI.

## Ver la estructura

`archidocs modules` (o `--json` para leer includes y excludes). Muéstrala como árbol.

## Crear un módulo

1. Comprueba con `archidocs modules --json` que no exista uno equivalente y que el **padre** exista (se crean de arriba hacia abajo).
2. Redacta con el usuario:
   - `ruta`: minúsculas y guiones, p. ej. `plataforma/pagos/pasarelas`.
   - `title` y `description` (una línea).
   - `includes`: qué tipo de documentos van aquí (concretos, para que el LLM pueda decidir).
   - `excludes`: qué no va aquí y a dónde va (`tema → otro/modulo`).
3. Muéstrale la propuesta y **espera su confirmación**.
4. Crea:
   ```sh
   archidocs module create <ruta> --title "<t>" --description "<d>" \
     --include "<i1>" --include "<i2>" --exclude "<e1 → ruta>" --agent <tu-nombre-de-agente>
   ```
5. Devuelve las URLs del módulo.

## Actualizar la descripción

`archidocs module describe <ruta> [--title] [--description] [--include]... [--exclude]...` (las listas se reemplazan completas). Confirma con el usuario antes.

## Fuera de alcance por ahora

Mover, renombrar o borrar módulos y artifacts, ver historial y restaurar versiones llegan en la siguiente fase del PoC. Si el usuario lo pide, díselo y ofrécele ver el historial en GitHub desde el botón "Historial" del artifact.
