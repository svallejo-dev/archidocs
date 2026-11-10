#!/bin/sh
# Instala el CLI y las skills de Archidocs para los agentes de esta máquina.
#   ./install.sh            clona la última release (tag) en ~/.cache/archidocs/skills
#   ./install.sh --dev      usa este checkout tal cual (para desarrollar Archidocs)
set -eu

HOME_DIR="${ARCHIDOCS_HOME:-$HOME/.cache/archidocs}"
BIN_DIR="$HOME/.local/bin"
SKILLS="archidocs-write archidocs-publish archidocs-manage"

say() { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || fail "Falta git."
command -v node >/dev/null || fail "Falta Node.js 18 o superior."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || fail "Node.js debe ser 18 o superior."

SELF_DIR=$(cd "$(dirname "$0")" && pwd -P)
REMOTE=$(git -C "$SELF_DIR" remote get-url origin 2>/dev/null || true)

if [ "${1:-}" = "--dev" ]; then
  CODE_DIR="$SELF_DIR"
  say "Modo desarrollo: $CODE_DIR"
else
  [ -n "$REMOTE" ] || fail "No encuentro el remoto de este repo."
  CODE_DIR="$HOME_DIR/skills"
  TAG=$(git ls-remote --tags --sort=-v:refname "$REMOTE" 'v*' | head -n1 | sed 's#.*refs/tags/##; s#\^{}##')
  [ -n "$TAG" ] || fail "El repo no tiene releases (tags v*). Usa --dev o crea un tag."
  if [ -d "$CODE_DIR/.git" ]; then
    git -C "$CODE_DIR" fetch --quiet --tags origin
  else
    mkdir -p "$HOME_DIR"
    git clone --quiet "$REMOTE" "$CODE_DIR"
  fi
  git -C "$CODE_DIR" -c advice.detachedHead=false checkout --quiet "$TAG"
  say "Release $TAG en $CODE_DIR"
fi

(cd "$CODE_DIR" && npm ci --no-audit --no-fund --silent)

link() { # link <destino> <enlace>
  if [ -e "$2" ] && [ ! -L "$2" ]; then say "  omitido $2 (existe y no es un enlace)"; return; fi
  ln -sfn "$1" "$2"
  say "  $2 → $1"
}

mkdir -p "$BIN_DIR"
link "$CODE_DIR/bin/archidocs" "$BIN_DIR/archidocs"

# Carpeta compartida por varios agentes + carpetas propias de cada agente que exista en esta máquina.
for dir in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills" "$HOME/.copilot/skills"; do
  case "$dir" in
    "$HOME/.agents/skills"|"$HOME/.claude/skills") mkdir -p "$dir" ;;
    *) [ -d "$dir" ] || continue ;;
  esac
  for s in $SKILLS; do link "$CODE_DIR/skills/$s" "$dir/$s"; done
done

case ":$PATH:" in *":$BIN_DIR:"*) ;; *) say "Añade $BIN_DIR a tu PATH para usar el comando archidocs." ;; esac

if [ ! -f "${ARCHIDOCS_CONFIG:-$HOME/.config/archidocs/config.json}" ] && [ -n "$REMOTE" ]; then
  "$CODE_DIR/bin/archidocs" init --remote "$REMOTE"
fi
"$CODE_DIR/bin/archidocs" doctor || true
