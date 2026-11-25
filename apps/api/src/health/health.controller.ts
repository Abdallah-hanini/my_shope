import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthReportDto, LivenessDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller({ path: 'health' })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ operationId: 'getLiveness', summary: 'Process liveness. Does not check dependencies.' })
  @ApiOkResponse({ type: LivenessDto })
  live(): LivenessDto {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({
    operationId: 'getReadiness',
    summary: 'Readiness: PostgreSQL, cache Redis and queue Redis.',
  })
  @ApiOkResponse({ type: HealthReportDto })
  @ApiServiceUnavailableResponse({ type: HealthReportDto, description: 'At least one dependency is down' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReportDto> {
    const report = await this.health.ready();
    res.setHeader('Cache-Control', 'no-store');
    if (report.status !== 'up') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
