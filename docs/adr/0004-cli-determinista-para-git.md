---
status: accepted
---
# Un CLI determinista hace todo el git; el LLM nunca ejecuta git

Las skills aportan juicio (redactar, adaptar el aspecto, completar secciones) y delegan toda la mecánica en el CLI `archidocs` (Node): worktree nuevo por publicación, CAS por ruta (aborta si la ruta cambió en `origin/main`), nunca `--force` ni resolución de conflictos, errores clasificados (desfase → reintento acotado; 401/403 → parar). Junto con un ruleset que bloquea force-push y borrado de `main`, corta la cadena "conflicto o prompt injection → el LLM improvisa → se pierde historial", que rompía el invariante principal. Coste: Node obligatorio en la máquina del autor.

## Opciones consideradas

- Skills que instruyen al LLM a usar git directamente: más simple, pero el comportamiento depende de cada agente y del contenido que lea.
- `gh api` sin clon: un archivo por llamada y dependencia de `gh`.
