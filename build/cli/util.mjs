// Utilidades del CLI: errores tipados con código de salida, configuración, fechas y slugs.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

export const EXIT = { OK: 0, USAGE: 1, VALIDATION: 2, CONFLICT: 3, AUTH: 4, GIT: 5, TIMEOUT: 6, MODULE: 7, PUBLIC: 8, FIDELITY: 9 };

export class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const HOME = process.env.ARCHIDOCS_HOME || join(homedir(), ".cache", "archidocs");
export const CONFIG_FILE = process.env.ARCHIDOCS_CONFIG || join(homedir(), ".config", "archidocs", "config.json");
export const CONTENT_DIR = join(HOME, "content");
export const LOG_FILE = join(HOME, "log.jsonl");

export async function readUserConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function writeUserConfig(cfg) {
  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

export async function logEvent(event) {
  try {
    await mkdir(HOME, { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
  } catch {
    /* el log nunca debe romper una publicación */
  }
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function gitUserName() {
  try {
    return execFileSync("git", ["config", "user.name"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

export function slugFromTitle(title) {
  return String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function checkPath(path, what) {
  const clean = String(path || "").replace(/^\/+|\/+$/g, "");
  if (!clean) throw new CliError(EXIT.USAGE, `${what} vacío`);
  for (const seg of clean.split("/")) {
    if (!SEGMENT.test(seg)) {
      throw new CliError(EXIT.USAGE, `${what} inválido: "${seg}" (solo minúsculas, números y guiones; sin tildes ni espacios)`);
    }
  }
  return clean;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (base) => base / 2 + Math.random() * base;
