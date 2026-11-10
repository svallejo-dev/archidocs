#!/usr/bin/env node
// CLI de Archidocs: la mecánica determinista que usan las skills (ADR-0004).
import { parseArgs } from "node:util";
import * as cmd from "../build/cli/commands.mjs";
import { CliError, EXIT } from "../build/cli/util.mjs";

const HELP = `archidocs <comando> [opciones]

Configuración
  init --remote <url>            Configura el repo de destino y clona el contenido
  doctor                         Diagnostica entorno, acceso, sitios y skills

Estándar
  standard                       Muestra STANDARD.md (contrato de metadatos, tipos y UI)
  template <tipo> [--format md|html]
                                 Muestra la plantilla de un tipo

Módulos
  modules [--json]               Árbol de módulos con descripción, includes y excludes
  module create <ruta> --title <t> --description <d> [--include x]... [--exclude x]... [--owner o] [--body texto]
  module describe <ruta> [--title] [--description] [--include]... [--exclude]... [--owner]... [--body]

Artifacts
  validate <archivo>             Valida un .md o .html contra el estándar
  get <ruta> [--out archivo]     Descarga la versión publicada y su --if-match
  publish <archivo> --module <ruta> [--slug s] [--original f] [--if-match sha | --overwrite]
          [--wait] [--timeout s] [--agent nombre] [--min-fidelity 0.98] [--accept-fidelity]
  log [--limit n]                Últimas operaciones de este equipo

Opciones generales: --json (salida JSON), --help`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    remote: { type: "string" },
    format: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    include: { type: "string", multiple: true },
    exclude: { type: "string", multiple: true },
    owner: { type: "string", multiple: true },
    body: { type: "string" },
    module: { type: "string" },
    slug: { type: "string" },
    original: { type: "string" },
    "if-match": { type: "string" },
    overwrite: { type: "boolean" },
    wait: { type: "boolean" },
    timeout: { type: "string" },
    agent: { type: "string" },
    "min-fidelity": { type: "string" },
    "accept-fidelity": { type: "boolean" },
    out: { type: "string" },
    limit: { type: "string" },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [name, ...rest] = positionals;
const routes = {
  init: () => cmd.init(opts),
  doctor: () => cmd.doctor(opts),
  standard: () => cmd.standard(opts),
  template: () => cmd.template(opts, rest),
  modules: () => cmd.modules(opts),
  module: () => {
    const [sub, ...args] = rest;
    if (sub === "create") return cmd.moduleCreate(opts, args);
    if (sub === "describe") return cmd.moduleDescribe(opts, args);
    throw new CliError(EXIT.USAGE, "Uso: archidocs module create|describe <ruta> ...");
  },
  validate: () => cmd.validate(opts, rest),
  get: () => cmd.get(opts, rest),
  publish: () => cmd.publish(opts, rest),
  log: () => cmd.log(opts),
};

function render(result) {
  if (opts.json) return JSON.stringify(result, null, 2);
  if (result.checks) {
    return result.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n") + `\n\n${result.ok ? "Todo en orden." : "Hay problemas (✗)."}`;
  }
  if (name === "validate") {
    return [
      result.ok ? `✓ ${result.file} cumple el estándar` : `✗ ${result.file} no cumple el estándar`,
      ...result.errors.map((e) => `  error: ${e}`),
      ...result.warnings.map((w) => `  aviso: ${w}`),
    ].join("\n");
  }
  return result.text ?? result.message ?? JSON.stringify(result, null, 2);
}

if (!name || opts.help || !routes[name]) {
  console.log(HELP);
  process.exit(name && !opts.help ? EXIT.USAGE : EXIT.OK);
}

try {
  const result = await routes[name]();
  console.log(render(result));
  const failed = (name === "validate" && !result.ok) || (name === "doctor" && !result.ok);
  process.exit(result.exitCode ?? (failed ? EXIT.VALIDATION : EXIT.OK));
} catch (err) {
  if (err instanceof CliError) {
    if (opts.json) console.log(JSON.stringify({ error: err.message, code: err.code, ...err.details }, null, 2));
    else console.error(`✗ ${err.message}`);
    process.exit(err.code);
  }
  console.error(err.stack || String(err));
  process.exit(EXIT.GIT);
}
