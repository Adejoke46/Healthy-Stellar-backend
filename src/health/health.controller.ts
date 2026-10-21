import { Controller, Get, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { Public } from '../common/decorators/public.decorator';
import { RegionalDatabaseService } from '../data-residency/services/regional-database.service';
import { RegionalIpfsService } from '../data-residency/services/regional-ipfs.service';
import { DataResidencyRegion } from '../enums/data-residency.enum';
import { DetailedHealthIndicator } from './indicators/detailed-health.indicator';
import { IpfsHealthIndicator } from './indicators/ipfs.health';
import { QueueHealthIndicator } from './indicators/queue.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StellarHealthIndicator } from './indicators/stellar.health';
import { SyntheticProbeIndicator } from './indicators/synthetic-probe.indicator';

enum DependencyLevel {
  CRITICAL = 'critical', // Must be healthy for system to be ready
  IMPORTANT = 'important', // Can be degraded, system still ready but with warnings
  OPTIONAL = 'optional', // Can be down, system still ready
}

interface DependencyCheck {
  name: string;
  level: DependencyLevel;
  check: () => Promise<HealthCheckResult>;
}

const DATA_RESIDENCY_CACHE_TTL_MS = 30_000;

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private dataResidencyCache?: {
    expiresAt: number;
    result: ReturnType<HealthController['probeDataResidency']>;
  };

  private readonly dependencies: DependencyCheck[] = [
    {
      name: 'database',
      level: DependencyLevel.CRITICAL,
      check: () => this.db.pingCheck('database', { timeout: 3000 }),
    },
    {
      name: 'redis',
      level: DependencyLevel.CRITICAL,
      check: () => this.redis.isHealthy('redis'),
    },
    {
      name: 'stellar',
      level: DependencyLevel.IMPORTANT,
      check: () => this.stellar.isHealthy('stellar'),
    },
    {
      name: 'ipfs',
      level: DependencyLevel.IMPORTANT,
      check: () => this.ipfs.isHealthy('ipfs'),
    },
    {
      name: 'queues',
      level: DependencyLevel.IMPORTANT,
      check: () => this.queues.isHealthy('queues'),
    },
  ];

  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
    private ipfs: IpfsHealthIndicator,
    private queues: QueueHealthIndicator,
    private stellar: StellarHealthIndicator,
    private detailedHealth: DetailedHealthIndicator,
    private syntheticProbe: SyntheticProbeIndicator,
    private circuitBreaker: CircuitBreakerService,
    private regionalDatabase: RegionalDatabaseService,
    private regionalIpfs: RegionalIpfsService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Overall system health (liveness probe)' })
  @ApiResponse({ status: 200, description: 'System is alive' })
  check() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 3000 })]);
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe with dependency degradation modes' })
  @ApiResponse({ status: 200, description: 'System is ready (critical dependencies healthy)' })
  @ApiResponse({ status: 503, description: 'System is not ready (critical dependencies failed)' })
  async checkReadiness() {
    const results: Record<string, HealthCheckResult> = {};
    const degradedServices: string[] = [];
    let criticalFailure = false;

    // Check all dependencies
    for (const dep of this.dependencies) {
      try {
        const result = await dep.check();
        results[dep.name] = result;

        if (!result[dep.name]?.status || result[dep.name].status !== 'up') {
          if (dep.level === DependencyLevel.CRITICAL) {
            criticalFailure = true;
          } else {
            degradedServices.push(dep.name);
          }
        }
      } catch (error) {
        // Health check failed
        if (dep.level === DependencyLevel.CRITICAL) {
          criticalFailure = true;
        } else {
          degradedServices.push(dep.name);
        }
        results[dep.name] = {
          [dep.name]: {
            status: 'down',
            error: error.message,
          },
        };
      }
    }

    // If critical dependencies failed, return 503
    if (criticalFailure) {
      throw new Error('Critical dependencies are down');
    }

    // Return readiness status with degradation info
    return {
      status: 'up',
      details: results,
      degradedServices,
    };
  }

  @Get('detailed')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Detailed admin health diagnostics' })
  @ApiResponse({ status: 200, description: 'Detailed health report' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin only' })
  getDetailedHealth() {
    return this.detailedHealth.getDetailedHealth();
  }

  @Get('circuit-breakers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get circuit breaker states (admin only)' })
  @ApiResponse({ status: 200, description: 'Circuit breaker states retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin only' })
  getCircuitBreakerStates() {
    return {
      states: this.circuitBreaker.getAllStates(),
      details: this.circuitBreaker.getDetailedStats(),
    };
  }

  @Get('data-residency')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regional database and IPFS node connectivity (admin only)' })
  @ApiResponse({ status: 200, description: 'Per-region health status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin only' })
  checkDataResidency() {
    const now = Date.now();

    if (!this.dataResidencyCache || this.dataResidencyCache.expiresAt <= now) {
      const result = this.probeDataResidency();
      this.dataResidencyCache = { expiresAt: now + DATA_RESIDENCY_CACHE_TTL_MS, result };
      result.catch(() => {
        if (this.dataResidencyCache?.result === result) {
          this.dataResidencyCache = undefined;
        }
      });
    }

    return this.dataResidencyCache.result;
  }

  private async probeDataResidency() {
    const regions = Object.values(DataResidencyRegion);

    const [dbHealth, ipfsHealth] = await Promise.all([
      this.regionalDatabase.getRegionalHealthStatus(),
      Promise.all(
        regions.map(async (region) => ({
          region,
          nodes: await this.regionalIpfs.checkRegionalNodesHealth(region),
        })),
      ),
    ]);

    const ipfsResult = Object.fromEntries(ipfsHealth.map(({ region, nodes }) => [region, nodes]));

    return {
      database: dbHealth,
      ipfs: ipfsResult,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('synthetic')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Synthetic probes for critical user journeys' })
  @ApiResponse({ status: 200, description: 'Business-level availability validated' })
  @ApiResponse({ status: 503, description: 'Critical user journey unavailable' })
  async checkSyntheticProbes() {
    return this.health.check([() => this.syntheticProbe.isHealthy('synthetic-probe')]);
  }
}
