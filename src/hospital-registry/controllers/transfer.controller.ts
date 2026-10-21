import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { TransferService } from '../services/transfer.service';
import { CreateTransferDto } from '../dto/create-transfer.dto';
import { AcceptTransferDto } from '../dto/accept-transfer.dto';
import { RejectTransferDto } from '../dto/reject-transfer.dto';
import { CancelTransferDto } from '../dto/cancel-transfer.dto';
import { TransferStatus } from '../entities/patient-transfer.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiTags('Hospital Registry - Transfers')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospital-registry/transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a patient transfer request' })
  @ApiResponse({ status: 201, description: 'Transfer initiated successfully' })
  @ApiResponse({ status: 409, description: 'Patient already has a pending transfer' })
  initiateTransfer(
    @Body() dto: CreateTransferDto,
    @Query('initiatedBy') initiatedBy: string,
    @Query('fromHospitalId') fromHospitalId: string,
  ) {
    return this.transferService.initiateTransfer(dto, initiatedBy, fromHospitalId);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept a pending transfer request' })
  @ApiResponse({ status: 200, description: 'Transfer accepted and completed' })
  @ApiResponse({ status: 400, description: 'Transfer is not in pending status' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  acceptTransfer(@Param('id') id: string, @Body() dto: AcceptTransferDto) {
    return this.transferService.acceptTransfer(id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending transfer request' })
  @ApiResponse({ status: 200, description: 'Transfer rejected successfully' })
  @ApiResponse({ status: 400, description: 'Transfer is not in pending status' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  rejectTransfer(@Param('id') id: string, @Body() dto: RejectTransferDto) {
    return this.transferService.rejectTransfer(id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending transfer request' })
  @ApiResponse({ status: 200, description: 'Transfer cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Transfer is not in pending status' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  cancelTransfer(@Param('id') id: string, @Body() dto: CancelTransferDto) {
    return this.transferService.cancelTransfer(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer details' })
  @ApiResponse({ status: 200, description: 'Transfer details' })
  getTransfer(@Param('id') id: string) {
    return this.transferService.getTransfer(id);
  }

  @Get()
  @ApiOperation({ summary: 'List transfers with optional filters' })
  @ApiResponse({ status: 200, description: 'List of transfers' })
  listTransfers(
    @Query('patientId') patientId?: string,
    @Query('fromHospitalId') fromHospitalId?: string,
    @Query('toHospitalId') toHospitalId?: string,
    @Query('status') status?: TransferStatus,
  ) {
    return this.transferService.listTransfers({
      patientId,
      fromHospitalId,
      toHospitalId,
      status,
    });
  }
}
