---
status: accepted
---
# Las skills se fijan a un tag de release, en un checkout separado del contenido

Las skills se enlazan por symlink en todos los agentes de cada autor. Si apuntaran al mismo checkout que el contenido, un commit roto en `skills/` llegaría a todos con el siguiente pull, y un rebase atascado dejaría inservibles las skills que deberían repararlo. Por eso `install.sh` crea dos checkouts en `~/.cache/archidocs/`: `skills/` fijado a un tag y `content/` siguiendo `main`. Actualizar skills es explícito (`archidocs update`); esto sustituye la idea inicial de "un `git pull` lo actualiza todo".
