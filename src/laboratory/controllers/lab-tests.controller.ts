import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { LabTestsService } from '../services/lab-tests.service';
import { CreateLabTestDto } from '../dto/create-lab-test.dto';
import { TestStatus } from '../entities/lab-test.entity';

@ApiTags('Laboratory - Tests')
@Controller('laboratory/tests')
// @UseGuards(JwtAuthGuard, RolesGuard) // Uncomment when auth is ready
// @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class LabTestsController {
  constructor(private readonly labTestsService: LabTestsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lab test' })
  @ApiResponse({ status: 201, description: 'Lab test created successfully' })
  @ApiResponse({ status: 409, description: 'Test code already exists' })
  create(@Body() createDto: CreateLabTestDto, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labTestsService.create(createDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all lab tests' })
  @ApiResponse({ status: 200, description: 'Lab tests retrieved successfully' })
  findAll(
    @Query('category') category?: string,
    @Query('status') status?: TestStatus,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.labTestsService.findAll({
      category,
      status,
      search,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lab test by ID' })
  @ApiResponse({ status: 200, description: 'Lab test retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Lab test not found' })
  findOne(@Param('id') id: string) {
    return this.labTestsService.findOne(id);
  }

  @Get('code/:testCode')
  @ApiOperation({ summary: 'Get lab test by test code' })
  @ApiResponse({ status: 200, description: 'Lab test retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Lab test not found' })
  findByCode(@Param('testCode') testCode: string) {
    return this.labTestsService.findByCode(testCode);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lab test' })
  @ApiResponse({ status: 200, description: 'Lab test updated successfully' })
  @ApiResponse({ status: 404, description: 'Lab test not found' })
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateLabTestDto>,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.labTestsService.update(id, updateDto, userId);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate lab test' })
  @ApiResponse({ status: 200, description: 'Lab test activated successfully' })
  activate(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labTestsService.activate(id, userId);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate lab test' })
  @ApiResponse({ status: 200, description: 'Lab test deactivated successfully' })
  deactivate(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labTestsService.deactivate(id, userId);
  }

  @Post(':id/parameters')
  @ApiOperation({ summary: 'Add parameter to lab test' })
  @ApiResponse({ status: 201, description: 'Parameter added successfully' })
  addParameter(@Param('id') id: string, @Body() parameterDto: any, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labTestsService.addParameter(id, parameterDto, userId);
  }

  @Patch('parameters/:parameterId')
  @ApiOperation({ summary: 'Update lab test parameter' })
  @ApiResponse({ status: 200, description: 'Parameter updated successfully' })
  updateParameter(
    @Param('parameterId') parameterId: string,
    @Body() updateDto: any,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.labTestsService.updateParameter(parameterId, updateDto, userId);
  }

  @Delete('parameters/:parameterId')
  @ApiOperation({ summary: 'Delete lab test parameter' })
  @ApiResponse({ status: 200, description: 'Parameter deleted successfully' })
  deleteParameter(@Param('parameterId') parameterId: string) {
    return this.labTestsService.deleteParameter(parameterId);
  }
}
