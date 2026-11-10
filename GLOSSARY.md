# Archidocs

Publicación de documentos (HTML o Markdown) escritos con agentes LLM, versionados en git y servidos como sitio estático privado.

## Lenguaje

**Artifact**:
Un documento publicado (HTML o Markdown) con metadatos, identificado por su ruta.
_Evitar_: página, archivo, doc

**Tipo**:
La clase de documento de un artifact (`adr`, `rfc`, `prd`, `design-doc`, `runbook`, `report`, `explainer`, `note`); guía su plantilla, no su formato.
_Evitar_: categoría, plantilla

**Plantilla**:
Esqueleto opcional de secciones para un tipo y un formato.

**Módulo**:
Carpeta bajo `artifacts/` con un `README.md` que describe qué guarda; agrupa artifacts y define su URL y su navegación.
_Evitar_: sección, proyecto, categoría

**Slug**:
Último segmento de la ruta de un artifact; único dentro de su módulo.

**Alias**:
Ruta anterior de un artifact movido; el build la convierte en redirect.

**Estándar**:
El contrato de metadatos, tipos, plantillas y UI (`standard/`) que comparten skills, CLI y build. Tiene versión (`standard_version`).

**Normalización**:
Transformación de un HTML del autor para que cumpla el estándar: determinista (metadatos, `ui.css`) y por LLM (aspecto visual).
_Evitar_: limpieza, formateo

**Original**:
El HTML tal como lo entregó el autor (`source.html`), guardado junto a la copia normalizada.

**Fidelidad**:
Proporción del texto visible del original que conserva la copia normalizada.

**Sección generada**:
Sección o metadato que la skill completó por análisis, marcada como tal.

**Contenedor**:
Página del sitio con la barra común que muestra el HTML del autor dentro de un iframe sandbox.
_Evitar_: wrapper, shell

**Cuarentena**:
Estado de un artifact que rompe el build: se publica una página de error en su lugar y el resto del sitio se despliega.

**Plataforma**:
Las rutas que definen cómo funciona Archidocs (`.github/`, `build/`, `skills/`, `standard/`, `install.sh`), por oposición al contenido (`artifacts/`).

**Destino**:
Un hosting al que el build despliega (GitHub Pages, Cloudflare).

**Espacio**:
Un repo de Archidocs con su propia audiencia (diferido; ver design doc §11).
