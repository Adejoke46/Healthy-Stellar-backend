import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FeatureFlagService, UpsertFeatureFlagDto } from './feature-flag.service';

@ApiTags('feature-flags')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('admin/feature-flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FeatureFlagController {
  constructor(private readonly service: FeatureFlagService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  /**
   * Evaluate a single flag for the given actor/tenant context.
   * Useful for debugging rollout targeting without modifying flags.
   */
  @Get(':key/evaluate')
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  async evaluate(
    @Param('key') key: string,
    @Query('actorId') actorId?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const enabled = await this.service.isEnabled(key, { actorId, tenantId });
    return { key, enabled, actorId, tenantId };
  }

  /**
   * Batch evaluate multiple flags for a context.
   * Body: { keys: string[], actorId?: string, tenantId?: string }
   */
  @Post('evaluate-many')
  async evaluateMany(
    @Body() body: { keys: string[]; actorId?: string; tenantId?: string },
  ) {
    const results = await this.service.evaluateMany(body.keys, {
      actorId: body.actorId,
      tenantId: body.tenantId,
    });
    return results;
  }

  @Post()
  upsert(@Body() dto: UpsertFeatureFlagDto, @Req() req: any) {
    return this.service.upsert(dto, req.user?.id ?? 'system');
  }

  @Patch(':key/rollback')
  rollback(@Param('key') key: string, @Req() req: any) {
    return this.service.rollback(key, req.user?.id ?? 'system');
  }
}
