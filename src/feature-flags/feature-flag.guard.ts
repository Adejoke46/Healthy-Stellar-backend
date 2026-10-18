import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEY } from './feature-flag.decorator';
import { FeatureFlagService } from './feature-flag.service';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!flagKey) return true;

    // SECURITY: actor and tenant must come from the authenticated principal
    // (JwtAuthGuard sets request.user to the JWT payload: userId + organizationId).
    // Never read x-tenant-id here; a client-supplied header would let callers
    // target per-tenant flags for a tenant they do not belong to.
    const request = context.switchToHttp().getRequest();
    const actorId: string | undefined = request.user?.userId;
    const tenantId: string | undefined = request.user?.organizationId ?? undefined;

    const enabled = await this.featureFlagService.isEnabled(flagKey, { actorId, tenantId });
    if (!enabled) {
      throw new ForbiddenException(`Feature '${flagKey}' is not available`);
    }
    return true;
  }
}
