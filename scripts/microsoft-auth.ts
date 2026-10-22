import { loadLocalEnv, microsoftJson, requireEnv, writeEnvValues } from "./microsoft-env.js";

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

async function main() {
  loadLocalEnv();
  const tenantId = requireEnv("MICROSOFT_TENANT_ID");
  const clientId = requireEnv("MICROSOFT_CLIENT_ID");
  const device = await microsoftJson<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }>(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope: scopes }),
  });

  console.log(`Abre ${device.verification_uri} e introduce el código ${device.user_code}`);
  const deadline = Date.now() + device.expires_in * 1000;
  let waitMs = Math.max(5, device.interval) * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: device.device_code,
      }),
    });
    const body = await response.json() as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (response.ok && body.refresh_token) {
      writeEnvValues({ MICROSOFT_REFRESH_TOKEN: body.refresh_token });
      console.log("Refresh token guardado en .env. Ejecuta npm run smoke:microsoft");
      return;
    }
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      waitMs += 5_000;
      continue;
    }
    throw new Error(body.error_description ?? body.error ?? "No se pudo autorizar Microsoft");
  }
  throw new Error("El código de Microsoft expiró. Vuelve a ejecutar npm run auth:microsoft");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
