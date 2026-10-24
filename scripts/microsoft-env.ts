import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env");

export function loadLocalEnv(): void {
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // The caller reports the missing values.
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env`);
  return value;
}

export function writeEnvValues(values: Record<string, string>): void {
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    content = "";
  }
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

export async function microsoftJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = (await response.text()).replace(/access_token|refresh_token|client_secret/gi, "[redacted]").slice(0, 500);
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  if (response.status === 202 || response.status === 204) return undefined as T;
  return await response.json() as T;
}
