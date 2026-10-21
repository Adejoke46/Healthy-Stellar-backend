import { Controller, Get, Post, Body, Patch, Param, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';

@ApiTags('users')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('staff')
  @Roles(UserRole.ADMIN)
  createStaff(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createStaff(createUserDto);
  }

  @Post('patients')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  createPatient(@Body() createPatientDto: CreatePatientDto) {
    return this.usersService.createPatient(createPatientDto);
  }

  @Patch(':id/verify-license')
  @Roles(UserRole.ADMIN)
  verifyLicense(@Param('id') id: string, @Body('verifiedBy') verifiedBy: string) {
    return this.usersService.verifyMedicalLicense(id, verifiedBy);
  }

  @Patch(':id/revoke-access')
  @Roles(UserRole.ADMIN)
  revokeAccess(@Param('id') id: string, @Body('reason') reason: string) {
    return this.usersService.revokeAccess(id, reason);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.PATIENT)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Req() req: any) {
    this.assertSelfOrAdmin(req, id);
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.PATIENT)
  findOne(@Param('id') id: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, id);
    return this.usersService.findOne(id);
  }

  private assertSelfOrAdmin(req: any, id: string): void {
    const user = req?.user;
    if (user?.role === UserRole.ADMIN) {
      return;
    }
    if (user?.id !== id) {
      throw new ForbiddenException('You are not allowed to access this user');
    }
  }
}
