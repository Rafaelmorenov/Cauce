import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { TenantRole } from "@comercial/contracts";
import { jwtVerify } from "jose";

export interface RequestIdentity {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

export const ROLES_KEY = "roles";
export const Roles = (...roles: TenantRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      identity?: RequestIdentity;
    }>();
    const authorization = request.headers.authorization;
    const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    let identity: RequestIdentity;
    if (token) {
      const secret = process.env.JWT_SECRET;
      if (!secret || secret.length < 32) throw new UnauthorizedException("JWT no configurado");
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
          algorithms: ["HS256"],
        });
        identity = {
          userId: String(payload.sub),
          tenantId: String(payload.tenant_id),
          role: String(payload.role) as TenantRole,
        };
      } catch {
        throw new UnauthorizedException("Token inválido");
      }
    } else if (process.env.NODE_ENV !== "production") {
      const tenantId = request.headers["x-tenant-id"];
      const role = request.headers["x-role"];
      identity = {
        userId: "00000000-0000-4000-8000-000000000001",
        tenantId: typeof tenantId === "string" ? tenantId : "00000000-0000-4000-8000-000000000010",
        role: (typeof role === "string" ? role : "admin") as TenantRole,
      };
    } else {
      throw new UnauthorizedException();
    }

    const requiredRoles = this.reflector.getAllAndOverride<TenantRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.includes(identity.role)) {
      throw new ForbiddenException("El rol no tiene permiso para esta operación");
    }
    request.identity = identity;
    return true;
  }
}
