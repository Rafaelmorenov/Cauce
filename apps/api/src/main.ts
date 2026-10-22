import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header("x-request-id") ?? crypto.randomUUID();
    response.setHeader("x-request-id", requestId);
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("referrer-policy", "no-referrer");
    const started = performance.now();
    response.on("finish", () => {
      console.info(JSON.stringify({
        event: "http.request",
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
        tenantId: request.header("x-tenant-id") ?? "authenticated-token",
      }));
    });
    next();
  });
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "x-tenant-id", "x-role"],
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
