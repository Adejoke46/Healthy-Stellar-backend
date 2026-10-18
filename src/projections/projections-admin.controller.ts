import { Controller, Post, Get, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { ProjectionRebuildService } from './rebuild/projection-rebuild.service';
import { ProjectionStatusDto } from './dto/projection-status.dto';

@ApiTags('projections-admin')
@Controller('admin/projections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class ProjectionsAdminController {
  constructor(private readonly rebuildService: ProjectionRebuildService) { }

  @Post(':name/rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRebuild(@Param('name') name: string): Promise<{ message: string }> {
    await this.rebuildService.triggerRebuild(name);
    return { message: `Rebuild queued for projector: ${name}` };
  }

  @Get(':name/status')
  async getStatus(@Param('name') name: string): Promise<ProjectionStatusDto> {
    return this.rebuildService.getStatus(name);
  }
}
