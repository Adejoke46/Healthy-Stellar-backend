import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { HealthCreditContractService } from '../services/health-credit-contract.service';

class MintDto {
  toAccountId: string;
  amount: string; // bigint as string to survive JSON serialisation
}

class TransferDto {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
}

class BurnDto {
  fromAccountId: string;
  amount: string;
}

@ApiTags('Stellar - Health Credits')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('stellar/credits')
export class HealthCreditController {
  constructor(private readonly creditService: HealthCreditContractService) {}

  @Get(':accountId')
  @ApiParam({ name: 'accountId', description: 'Stellar public key of the account' })
  @ApiOperation({ summary: 'Get health credit token balance for an account' })
  getBalance(@Param('accountId') accountId: string) {
    return this.creditService.getBalance(accountId);
  }

  @Post('mint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mint health credits to a recipient account' })
  mint(@Body() dto: MintDto) {
    return this.creditService.mint(dto.toAccountId, BigInt(dto.amount));
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer health credits between accounts' })
  transfer(@Body() dto: TransferDto) {
    return this.creditService.transfer(dto.fromAccountId, dto.toAccountId, BigInt(dto.amount));
  }

  @Post('burn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Burn (redeem) health credits from an account' })
  burn(@Body() dto: BurnDto) {
    return this.creditService.burn(dto.fromAccountId, BigInt(dto.amount));
  }
}
