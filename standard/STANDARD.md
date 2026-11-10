# Estándar Archidocs (v1)

Contrato que siguen las skills, el CLI y el build. Si algo de aquí choca con otra instrucción, gana este documento.

## Artifact

Un documento **Markdown** (`.md`) o **HTML completo** (`.html`), identificado por su ruta `artifacts/<módulo>/…/<slug>/`. La ruta es la URL: no se cambia a la ligera.

- `slug`: minúsculas, números y guiones; sin tildes ni espacios. Ej.: `adr-0003-cache-de-sesiones`.
- Cualquier **tipo** puede escribirse en MD o en HTML. Elige MD para texto estructurado; HTML cuando el valor es visual o interactivo (reportes, explicaciones con gráficos).

## Tipos

| Tipo | Para qué |
|---|---|
| `adr` | Una decisión de arquitectura: contexto, decisión, alternativas, consecuencias |
| `rfc` | Una propuesta abierta a comentarios antes de decidir |
| `prd` | Problema, objetivos, alcance, métricas y preguntas abiertas de un producto o feature |
| `design-doc` | Diseño de un sistema o componente |
| `runbook` | Pasos operativos para una tarea o incidente |
| `report` | Análisis o resultados, normalmente con datos |
| `explainer` | Explicación de un concepto o sistema, normalmente visual |
| `note` | Cualquier otra cosa; sin plantilla |

Las plantillas (`archidocs template <tipo>`) son **guía, no obligación**. Un documento que no sigue la plantilla es válido.

## Metadatos

Obligatorios: `type`, `title`, `author`, `created`, `updated`, `status`. Opcionales: `tags`, `aliases`, `generated_sections`.

- `status`: `draft` · `review` · `accepted` · `superseded` · `archived`.
- El CLI completa `author` (desde git), `created`, `updated` y `standard_version`. La skill aporta `type`, `title` y `status`.
- **Markdown**: frontmatter YAML al inicio.
- **HTML**: etiquetas `<meta name="artifact:<campo>" content="…">` dentro de `<head>`; listas separadas por comas.

```markdown
---
type: adr
title: "ADR-0003: Cache de sesiones en Redis"
status: draft
tags: [sesiones, rendimiento]
---
```

```html
<meta name="artifact:type" content="report">
<meta name="artifact:title" content="Reporte de conversión Q3">
<meta name="artifact:status" content="accepted">
<meta name="artifact:tags" content="conversión, checkout">
```

### Secciones generadas

Si la skill completa una sección que el autor no escribió (porque el tipo la espera), la lista en `generated_sections` y la marca en el cuerpo:

- MD: una alerta al inicio de la sección: `> [!NOTE]\n> Sección completada por IA a partir del resto del documento.`
- HTML: `<div class="ad-callout">Sección completada por IA a partir del resto del documento.</div>`

Nunca inventes datos, cifras ni decisiones: si no se pueden deducir del documento, deja la sección con preguntas abiertas.

## Módulos

Un módulo es una carpeta con `README.md`; puede tener submódulos sin límite de profundidad. Su frontmatter dice qué guarda:

```yaml
---
title: Pagos
description: Cobros, reembolsos y conciliación con pasarelas.
includes:
  - Decisiones y diseño del flujo de cobro y reembolsos
excludes:
  - Facturación fiscal → finanzas/facturacion
owners: [nombre]
---
```

**Elegir módulo** (artifact nuevo): consulta `archidocs modules --json`, elige el módulo **más específico** cuyo `includes` encaje con el contenido; si un `excludes` aplica, sigue su flecha. Propón el módulo con una línea de justificación y **pide confirmación** antes de publicar. Si ninguno encaja, propone crear uno (título, descripción, includes) y créalo con `archidocs module create` solo tras la confirmación. Publicar en un módulo inexistente está bloqueado.

## Diagramas

Siempre en **Mermaid**.

- MD: bloque ` ```mermaid `; se renderiza en el navegador.
- HTML: diagramas con archify (fase 3 del PoC). Mientras tanto, usa SVG inline o un bloque `<pre class="mermaid">` con `mermaid.min.js` desde `https://cdn.jsdelivr.net/npm/mermaid@<versión exacta>/dist/mermaid.min.js`.

## Estándar visual del HTML

El sitio inyecta `ui.css` v1 al principio de `<head>`: da tipografía, colores claro/oscuro y componentes. **No lo enlaces tú.** Para que un HTML cumpla el mínimo:

1. Documento completo: `<!doctype html>`, `<html lang="es">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>`.
2. Metadatos `artifact:*` en `<head>`.
3. Contenido dentro de `<main>`; un único `<h1>`; `<h2>` para secciones.
4. Colores mediante las variables de `ui.css` (no hex fijos), para que funcionen en claro y oscuro:
   `--ad-bg`, `--ad-bg-subtle`, `--ad-bg-muted`, `--ad-fg`, `--ad-fg-muted`, `--ad-border`, `--ad-accent`, `--ad-success`, `--ad-attention`, `--ad-danger`, `--ad-done` (y sus `-subtle`).
5. Componentes disponibles:
   - `.ad-grid` + `.ad-card`: rejilla de tarjetas.
   - `.ad-kpi` con `.ad-kpi__label`, `.ad-kpi__value`, `.ad-kpi__delta--up|--down`.
   - `.ad-callout` (+ `--success`, `--warning`, `--danger`) con `.ad-callout__title`.
   - `.ad-badge` (+ `--accent`, `--success`, `--attention`, `--done`).
   - `.ad-figure` + `figcaption`; `.ad-diagram` para un diagrama embebido.
   - `.ad-num` para cifras alineadas; `.ad-muted` para texto secundario.
6. Estilo sobrio y profesional: sin gradientes llamativos, sombras fuertes ni fuentes externas.
7. Scripts externos solo desde `cdnjs.cloudflare.com`, `cdn.jsdelivr.net` o `unpkg.com`, con versión exacta.
8. Enlaces a otros artifacts con rutas relativas (`../otro-artifact/`).

El HTML se muestra en un iframe aislado: no hay `localStorage` ni acceso al resto del sitio.

### Normalizar un HTML existente

Al adaptar un HTML de otra fuente, la copia normalizada debe conservar **todo el texto, las cifras y el comportamiento** del original: solo cambian estructura y estilos. El CLI compara el texto visible de ambos (`--original`) y rechaza la publicación si se pierde más del 2 %.
