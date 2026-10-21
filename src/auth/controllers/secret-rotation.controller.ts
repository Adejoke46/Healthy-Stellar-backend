import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { SecretRotationService } from '../services/secret-rotation.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Admin - Secret Rotation')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('admin/secret-rotation')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SecretRotationController {
  constructor(private readonly secretRotation: SecretRotationService) {}

  /**
   * Unified rotation endpoint.
   * type=jwt  → rotates the JWT signing secret
   * type=database → rotates database credentials
   */
  @Post('rotate/:type')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'type', enum: ['jwt', 'database'] })
  @ApiOperation({
    summary: 'POST /admin/secrets/rotate/:type — zero-downtime secret rotation',
    description:
      'For type=jwt: promotes newSecret as active signing key; old secret stays valid for 1 hour. ' +
      'For type=database: promotes new DB credentials; previous credentials stay live for 1 hour drain window.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newSecret: { type: 'string', minLength: 32, description: 'JWT only' },
        newVersion: { type: 'string', example: 'v2' },
        host: { type: 'string', description: 'DB only' },
        port: { type: 'number', description: 'DB only' },
        username: { type: 'string', description: 'DB only' },
        password: { type: 'string', description: 'DB only' },
        database: { type: 'string', description: 'DB only' },
      },
    },
  })
  rotate(@Param('type') type: string, @Body() body: Record<string, any>) {
    if (type === 'jwt') {
      this.secretRotation.rotateJwtSecret(body.newSecret, body.newVersion);
      return {
        message: 'JWT secret rotated successfully',
        activeVersion: this.secretRotation.activeVersion,
      };
    }

    if (type === 'database') {
      this.secretRotation.rotateDatabaseCredentials({
        version: body.newVersion,
        host: body.host,
        port: body.port,
        username: body.username,
        password: body.password,
        database: body.database,
      });
      return {
        message: 'Database credentials rotated successfully',
        activeVersion: this.secretRotation.activeDbCredentials?.version,
      };
    }

    return { message: `Unknown rotation type: ${type}` };
  }

  /** Legacy endpoint preserved for backwards compatibility. */
  @Post('jwt/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate JWT signing secret at runtime (zero-downtime)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['newSecret', 'newVersion'],
      properties: {
        newSecret: { type: 'string', minLength: 32 },
        newVersion: { type: 'string', example: 'v2' },
      },
    },
  })
  rotateJwtSecret(
    @Body('newSecret') newSecret: string,
    @Body('newVersion') newVersion: string,
  ): { message: string; activeVersion: string } {
    this.secretRotation.rotateJwtSecret(newSecret, newVersion);
    return {
      message: 'JWT secret rotated successfully',
      activeVersion: this.secretRotation.activeVersion,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'List all loaded secret versions and their activation timestamps' })
  status() {
    return {
      jwt: this.secretRotation.status(),
      database: this.secretRotation.dbRotationStatus(),
    };
  }
}
