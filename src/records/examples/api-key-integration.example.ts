import { Get, Controller, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { ApiKeyScopes } from '../auth/decorators/api-key-scopes.decorator';
import { ApiKeyScope } from '../auth/entities/api-key.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Example: Integrating API Key authentication with Records endpoints
 * This shows how to use API keys alongside JWT authentication
 */
@ApiTags('Records')
@Controller('records')
export class RecordsExampleController {
  /**
   * Standard JWT-protected endpoint
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get record by ID (JWT)' })
  @ApiResponse({ status: 200, description: 'Record details' })
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  async getRecordByIdJwt(@Param('id') id: string) {
    return { id, method: 'JWT' };
  }

  /**
   * API Key protected endpoint - requires read:records scope
   */
  @Get(':id/api-key')
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes(ApiKeyScope.READ_RECORDS)
  @ApiOperation({ summary: 'Get record by ID (API Key)' })
  @ApiResponse({ status: 200, description: 'Record details' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient scope' })
  async getRecordByIdApiKey(@Param('id') id: string) {
    return { id, method: 'API_KEY', requiredScope: ApiKeyScope.READ_RECORDS };
  }

  /**
   * API Key protected endpoint - requires write:records scope for updates
   */
  @Get(':id/update')
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes(ApiKeyScope.WRITE_RECORDS)
  @ApiOperation({ summary: 'Update record (API Key only)' })
  @ApiResponse({ status: 200, description: 'Record updated' })
  @ApiResponse({ status: 403, description: 'API key lacks write scope' })
  async updateRecordWithApiKey(@Param('id') id: string) {
    return { id, method: 'API_KEY', requiredScope: ApiKeyScope.WRITE_RECORDS };
  }

  /**
   * Endpoint accepting BOTH JWT and API Key (choose the implementation flow)
   * In real implementation, you'd handle this in the controller logic
   */
  @Get(':id/flexible')
  @ApiOperation({ summary: 'Get record (JWT or API Key)' })
  @ApiResponse({ status: 200, description: 'Record details' })
  async getRecordFlexible(@Param('id') id: string) {
    // In production, you'd check request.user.type to determine authentication method
    // and apply appropriate scope/role checks
    return { id, method: 'JWT_OR_API_KEY' };
  }
}

/**
 * Usage Examples:
 *
 * 1. Create API Key with read scope:
 *    POST /admin/api-keys
 *    Authorization: Bearer <JWT_TOKEN>
 *    Body: {
 *      "name": "Read-Only Key",
 *      "description": "For reading records",
 *      "scopes": ["read:records"]
 *    }
 *
 * 2. Use API Key to read record:
 *    GET /records/123
 *    X-API-Key: <64_char_hex_key>
 *
 * 3. Attempt to update with read-only key (will fail):
 *    GET /records/123/update
 *    X-API-Key: <64_char_hex_key>
 *    -> 403 Forbidden (API key does not have required scope)
 *
 * 4. Create API Key with write scope:
 *    POST /admin/api-keys
 *    Authorization: Bearer <JWT_TOKEN>
 *    Body: {
 *      "name": "Write Key",
 *      "description": "For writing records",
 *      "scopes": ["write:records"]
 *    }
 *
 * 5. Use write key to update:
 *    GET /records/123/update
 *    X-API-Key: <64_char_hex_key>
 *    -> 200 OK
 */