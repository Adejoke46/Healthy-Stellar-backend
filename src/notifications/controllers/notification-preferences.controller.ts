import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationPreferenceCenterService } from '../services/notification-preference-center.service';
import { UpdateCategoryPreferenceDto, CategoryPreferenceResponseDto } from '../dto/notification-category-preference.dto';

@ApiTags('Notification Preferences')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferenceCenter: NotificationPreferenceCenterService) {}

  @Get()
  @ApiOperation({
    summary: 'Get notification preferences',
    description: 'Returns the per-category channel and frequency preferences for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Preferences retrieved', type: [CategoryPreferenceResponseDto] })
  async getPreferences(@Req() req: any) {
    return this.preferenceCenter.getPreferences(req.user.id);
  }

  @Put(':category')
  @ApiOperation({
    summary: 'Update channel/frequency preference for a category',
    description: 'Sets which channels (email, in_app, websocket) a notification category is delivered on, and whether it is immediate or batched into the daily digest',
  })
  @ApiParam({ name: 'category', example: 'access_granted' })
  @ApiResponse({ status: 200, description: 'Preference updated', type: CategoryPreferenceResponseDto })
  async updatePreference(
    @Req() req: any,
    @Param('category') category: string,
    @Body() dto: UpdateCategoryPreferenceDto,
  ) {
    return this.preferenceCenter.updateCategoryPreference(req.user.id, category, dto);
  }
}
