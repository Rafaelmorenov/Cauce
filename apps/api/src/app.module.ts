import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { HttpException, type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { ZodError } from "zod";
import { TenantGuard } from "./auth.js";
import { HealthController, PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: object) => void };
    }>();
    if (exception instanceof ZodError) {
      return response.status(400).json({
        error: "validation_error",
        issues: exception.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json({
        error: "request_error",
        message: exception.message,
      });
    }
    const message = exception instanceof Error ? exception.message : "Error interno";
    return response.status(500).json({ error: "internal_error", message });
  }
}

@Module({
  controllers: [HealthController, PlatformController],
  providers: [
    PlatformService,
    TenantGuard,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
