import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { RunbookService } from '../services/runbook.service';
import { CreateRunbookMappingDto, UpdateRunbookMappingDto } from '../dto/runbook-mapping.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

// JwtAuthGuard must run first so AdminGuard sees the verified req.user.
@Controller('admin/runbook-mappings')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RunbookMappingController {
  constructor(private readonly runbookService: RunbookService) {}

  @Post()
  create(@Body() dto: CreateRunbookMappingDto) {
    return this.runbookService.create(dto);
  }

  @Get()
  findAll() {
    return this.runbookService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.runbookService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRunbookMappingDto) {
    return this.runbookService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.runbookService.remove(id);
  }
}
