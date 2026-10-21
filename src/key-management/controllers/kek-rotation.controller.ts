import { Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { KekRotationService } from '../services/kek-rotation.service';

@ApiTags('key-management')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('key-management/kek')
export class KekRotationController {
  constructor(private readonly kekRotation: KekRotationService) {}

  @Post('rotate')
  @ApiOperation({ summary: 'Trigger on-demand KEK rotation and re-encryption of all DEKs' })
  async rotate(@Request() req: { user?: { id?: string } }) {
    return this.kekRotation.rotate(req.user?.id ?? 'api');
  }

  @Get('rotation-status')
  @ApiOperation({ summary: 'Get current KEK rotation status and progress' })
  getStatus() {
    return this.kekRotation.getStatus();
  }
}
