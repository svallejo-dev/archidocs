---
name: archidocs-write
description: Escribe un documento para Archidocs (ADR, RFC, PRD, design doc, runbook, reporte, explainer o nota) en Markdown o HTML, siguiendo el estándar y las plantillas del equipo. Úsala cuando el usuario pida redactar, crear o preparar un documento o "artifact" para Archidocs, aunque no diga el tipo. No publica: para eso está archidocs-publish.
---

# Escribir un artifact de Archidocs

Toda la mecánica pasa por el CLI `archidocs`. Si el comando no existe, dile al usuario que ejecute `install.sh` del repo de Archidocs y para.

## Pasos

1. **Lee el estándar** una vez por sesión: `archidocs standard`. Es el contrato; síguelo.
2. **Elige el tipo** (`adr`, `rfc`, `prd`, `design-doc`, `runbook`, `report`, `explainer`, `note`) según lo que pide el usuario. Si dudas entre dos, pregunta con tu recomendación.
3. **Elige el formato**: MD para texto estructurado; HTML cuando el valor es visual o interactivo. Si el usuario no lo dice, usa MD salvo para `report` y `explainer`.
4. **Parte de la plantilla** si existe: `archidocs template <tipo> --format md`. Es una guía: adapta, quita o añade secciones según el contenido real.
5. **Redacta** con el contenido que dio el usuario. Reglas:
   - Metadatos: `type`, `title`, `status` (normalmente `draft`). El CLI completa autor y fechas.
   - Diagramas siempre en Mermaid.
   - No inventes datos, cifras ni decisiones; si faltan, pregunta o deja preguntas abiertas.
   - En HTML, sigue la sección "Estándar visual del HTML" del estándar: componentes `ad-*` y variables `--ad-*`, nada de colores fijos.
6. **Guarda** el archivo en el directorio de trabajo actual (o donde diga el usuario) como `<slug>.md` o `<slug>.html`, y muestra la ruta.
7. **Ofrece publicarlo** con archidocs-publish. No publiques sin que el usuario lo pida.
