import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WaitlistService } from '../services/waitlist.service';
import { JoinWaitlistDto } from '../dto/waitlist.dto';

@ApiTags('Appointments – Waitlist')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('appointments/waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @ApiOperation({ summary: 'Join the waitlist for an earlier slot with a given provider' })
  @ApiResponse({ status: 201, description: 'Waitlist entry created' })
  join(@Req() req: any, @Body() dto: JoinWaitlistDto) {
    return this.waitlistService.join(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List your active waitlist entries' })
  list(@Req() req: any) {
    return this.waitlistService.listForPatient(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Leave a waitlist entry' })
  @ApiResponse({ status: 200, description: 'Removed from waitlist' })
  leave(@Req() req: any, @Param('id') id: string) {
    return this.waitlistService.leave(req.user.id, id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept a slot offer from the waitlist' })
  @ApiResponse({ status: 200, description: 'Offer accepted' })
  accept(@Req() req: any, @Param('id') id: string) {
    return this.waitlistService.acceptOffer(req.user.id, id);
  }
}
