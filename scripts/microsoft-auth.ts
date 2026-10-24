import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { loadLocalEnv, requireEnv, writeEnvValues } from "./microsoft-env.js";

const redirectUri = "http://localhost:8400";
const scopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Mail.Read",
  "Calendars.Read",
].join(" ");

function openBrowser(url: string): void {
  const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function waitForCallback(server: Server): Promise<URL> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("La autorización expiró. Vuelve a ejecutar npm run auth:microsoft"));
    }, 5 * 60 * 1000);
    server.on("request", (request, response) => {
      const current = new URL(request.url ?? "/", redirectUri);
      if (!current.searchParams.has("code") && !current.searchParams.has("error")) {
        response.writeHead(204).end();
        return;
      }
      clearTimeout(timeout);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<p>Autorización recibida. Puede cerrar esta ventana y volver a Cursor.</p>");
      server.close();
      resolve(current);
    });
  });
}

async function main(): Promise<void> {
  loadLocalEnv();
  const tenantId = requireEnv("MICROSOFT_TENANT_ID");
  const clientId = requireEnv("MICROSOFT_CLIENT_ID");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const authorize = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(8400, "127.0.0.1", () => resolve());
  });
  const callback = waitForCallback(server);
  openBrowser(authorize.toString());
  console.log("Se abrió el navegador. Inicia sesión en HCSoftware y acepta los permisos.");

  const redirected = await callback;
  if (redirected.searchParams.get("state") !== state) throw new Error("La respuesta de Microsoft no coincide con esta autorización");
  const oauthError = redirected.searchParams.get("error_description") ?? redirected.searchParams.get("error");
  if (oauthError) throw new Error(oauthError);
  const code = redirected.searchParams.get("code");
  if (!code) throw new Error("Microsoft no devolvió el código de autorización");

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const body = await response.json() as { refresh_token?: string; error?: string; error_description?: string };
  if (!response.ok || !body.refresh_token) {
    const detail = (body.error_description ?? body.error ?? "Microsoft no entregó el token")
      .replace(/access_token|refresh_token|client_secret|code_verifier/gi, "[redacted]");
    throw new Error(detail);
  }
  writeEnvValues({ MICROSOFT_REFRESH_TOKEN: body.refresh_token });
  console.log("Refresh token guardado en .env. Ejecuta npm run smoke:microsoft");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
