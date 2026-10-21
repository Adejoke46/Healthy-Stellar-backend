import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { ProjectionRebuildService, RebuildStatus } from '../services/projection-rebuild.service';

@ApiTags('Admin - Projections')
@Controller('admin/projections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class ProjectionsAdminController {
  constructor(private readonly rebuildService: ProjectionRebuildService) {}

  @Post(':name/rebuild')
  @ApiOperation({ summary: 'Trigger a full projection rebuild (background)' })
  async rebuild(@Param('name') name: string): Promise<{ message: string }> {
    await this.rebuildService.enqueueRebuild(name);
    return { message: `Rebuild of ${name} enqueued` };
  }

  @Get(':name/status')
  @ApiOperation({ summary: 'Get projection rebuild status' })
  getStatus(@Param('name') name: string): RebuildStatus {
    return this.rebuildService.getStatus(name);
  }
}
