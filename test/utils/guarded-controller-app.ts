/**
 * Builds a minimal Nest app around a single controller for authz e2e tests.
 *
 * - JwtAuthGuard is replaced by a guard that reads the caller from the
 *   `x-test-user` header (401 when absent), so no JWT/session infra is needed.
 * - RolesGuard and TenantGuard are the real implementations; TenantService is
 *   stubbed so that tenant slug === tenant id and every tenant is active.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Provider,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { UserRole } from '../../src/auth/entities/user.entity';
import { TenantService } from '../../src/tenant/services/tenant.service';

export const TEST_TENANT = 'tenant-a';
export const OTHER_TENANT = 'tenant-b';

export interface TestUser {
  userId: string;
  role: UserRole;
  organizationId?: string;
}

class HeaderJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (!raw) {
      throw new UnauthorizedException('No token provided');
    }
    req.user = JSON.parse(raw);
    return true;
  }
}

export async function createGuardedControllerApp(
  controller: Type<unknown>,
  providers: Provider[],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [controller],
    providers: [
      ...providers,
      {
        provide: TenantService,
        useValue: {
          findBySlug: jest.fn(async (slug: string) => ({ id: slug, slug, status: 'active' })),
        },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(new HeaderJwtGuard())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/** Request headers authenticating `user` against `tenant` (defaults to the user's own tenant). */
export function asUser(user: TestUser, tenant = TEST_TENANT): Record<string, string> {
  return {
    'x-test-user': JSON.stringify({ organizationId: TEST_TENANT, ...user }),
    'x-tenant-id': tenant,
  };
}
