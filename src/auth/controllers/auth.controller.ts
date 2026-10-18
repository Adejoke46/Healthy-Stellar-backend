import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Get,
  Req,
  Param,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Request } from 'express';
import { AuthService, AuthResponse } from '../services/auth.service';
import { MfaService } from '../services/mfa.service';
import { SessionManagementService } from '../services/session-management.service';
import { AuthTokenService } from '../services/auth-token.service';
import { RefreshTokenStoreService } from '../services/refresh-token-store.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../services/auth-token.service';
import { RegisterDto, LoginDto, ChangePasswordDto, ResetPasswordDto, ResetPasswordConfirmDto } from '../dto/auth.dto';
import { RefreshTokenDto } from '../dto/session.dto';
import { User, UserRole } from '../entities/user.entity';
import { AuthRateLimit } from '../../common/throttler/throttler.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private mfaService: MfaService,
    private sessionManagementService: SessionManagementService,
    private authTokenService: AuthTokenService,
    private refreshTokenStore: RefreshTokenStoreService,
  ) {}

  /**
   * Register new user (healthcare staff or patient)
   */
  @Post('register')
  @AuthRateLimit() // 10 requests per minute
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() registerDto: RegisterDto, @Req() req: Request): Promise<AuthResponse> {
    return this.authService.register(
      registerDto,
      UserRole.PATIENT,
      this.getIpAddress(req),
      req.get('user-agent'),
    );
  }

  /**
   * Register healthcare staff
   */
  @Post('register/staff')
  @AuthRateLimit() // 10 requests per minute
  @ApiOperation({ summary: 'Register healthcare staff with role' })
  @ApiResponse({ status: 201, description: 'Staff registered successfully' })
  async registerStaff(
    @Body()
    body: RegisterDto & { role: UserRole; npi?: string; licenseNumber?: string },
    @Req() req: Request,
  ): Promise<AuthResponse> {
    if (!body.role || !Object.values(UserRole).includes(body.role)) {
      throw new BadRequestException(I18nContext.current()?.t('errors.INVALID_ROLE') || 'Invalid role');
    }

    if (body.role === UserRole.PATIENT) {
      throw new BadRequestException(I18nContext.current()?.t('errors.USE_REGISTER_ENDPOINT_FOR_PATIENT_REGISTRATION') || 'Use /register endpoint for patient registration');
    }

    const result = await this.authService.register(
      body,
      body.role,
      this.getIpAddress(req),
      req.get('user-agent'),
    );

    // Staff requires MFA setup immediately
    return result;
  }

  /**
   * Login user
   */
  @Post('login')
  @AuthRateLimit() // 10 requests per minute
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.authService.login(loginDto, this.getIpAddress(req), req.get('user-agent'));
  }

  /**
   * Refresh access token — full rotation with reuse detection
   */
  @Post('refresh')
  @AuthRateLimit()
  @ApiOperation({ summary: 'Refresh access token (rotates refresh token)' })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or replayed refresh token' })
  async refreshToken(
    @Body() { refreshToken }: RefreshTokenDto,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    // 1. Verify JWT signature and expiry
    const payload = this.authTokenService.verifyRefreshToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      throw new BadRequestException('Invalid refresh token');
    }

    // 2. Validate against Redis store — detects reuse attacks, marks old token consumed
    await this.refreshTokenStore.consumeAndValidate(payload.sessionId, refreshToken);

    // 3. Load user
    const user = await this.authService.getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new BadRequestException('User not found or inactive');
    }

    // 4. Issue new token pair
    const tokens = this.authTokenService.generateTokenPair(user, payload.sessionId, user.mfaEnabled);

    // 5. Persist new refresh token in Redis and update DB session
    await this.refreshTokenStore.store(payload.sessionId, tokens.refreshToken);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.sessionManagementService.refreshSession(
      payload.sessionId,
      tokens.accessToken,
      tokens.refreshToken,
      expiresAt,
      refreshTokenExpiresAt,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * Revoke all sessions for the authenticated user and clear Redis tokens
   */
  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Revoke all sessions (logout everywhere)' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  async revokeAllSessionsDelete(@Req() req: Request): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    const sessions = await this.sessionManagementService.getUserSessions(user.userId);
    await Promise.all(
      sessions.map((s) =>
        Promise.all([
          this.sessionManagementService.revokeSession(s.id),
          this.refreshTokenStore.revokeSession(s.id),
        ]),
      ),
    );
    return { message: 'All sessions revoked' };
  }

  /**
   * Request password reset — sends token via email; silent on unknown email (enum protection)
   */
  @Post('forgot-password')
  @AuthRateLimit()
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  async forgotPassword(@Body() { email }: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.forgotPassword(email);
    return { message: 'If that email is registered, a reset link has been sent' };
  }

  /**
   * Consume a reset token and set a new password (token is invalidated on first use)
   */
  @Post('reset-password')
  @AuthRateLimit()
  @ApiOperation({ summary: 'Reset password using a valid one-time token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already-used token' })
  async resetPassword(@Body() body: ResetPasswordConfirmDto): Promise<{ message: string }> {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { message: 'Password reset successfully' };
  }

  /**
   * Change password
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    await this.authService.changePassword(user.userId, changePasswordDto, this.getIpAddress(req));
    return { message: 'Password changed successfully' };
  }

  /**
   * Logout user
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Req() req: Request): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    const sessionId = (req as any).sessionId;
    await this.authService.logout(user.userId, sessionId, this.getIpAddress(req));
    return { message: 'Logged out successfully' };
  }

  /**
   * Get current user
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getCurrentUser(@Req() req: Request): Promise<User> {
    const user = req.user as JwtPayload;
    return this.authService.getUserById(user.userId);
  }

  /**
   * Get user sessions
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all active sessions' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved' })
  async getSessions(@Req() req: Request): Promise<any[]> {
    const user = req.user as JwtPayload;
    const sessions = await this.sessionManagementService.getUserSessions(user.userId);
    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceId: session.deviceId,
      lastActive: session.updatedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  /**
   * Terminate a specific session
   */
  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Terminate a specific session' })
  @ApiResponse({ status: 200, description: 'Session terminated' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async deleteSession(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    const session = await this.sessionManagementService.getUserSessions(user.userId).then(
      (sessions) => sessions.find((s) => s.id === id),
    );
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    await Promise.all([
      this.sessionManagementService.revokeSession(id),
      this.refreshTokenStore.revokeSession(id),
    ]);
    return { message: 'Session terminated' };
  }

  /**
   * Revoke session (legacy endpoint)
   */
  @Post('sessions/:sessionId/revoke')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    const session = await this.sessionManagementService.getUserSessions(user.userId).then(
      (sessions) => sessions.find((s) => s.id === sessionId),
    );
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    await Promise.all([
      this.sessionManagementService.revokeSession(sessionId),
      this.refreshTokenStore.revokeSession(sessionId),
    ]);
    return { message: 'Session revoked' };
  }

  /**
   * Revoke all sessions (except current)
   */
  @Post('sessions/revoke-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke all sessions except current' })
  async revokeAllSessions(@Req() req: Request): Promise<{ message: string }> {
    const user = req.user as JwtPayload;
    const currentSessionId = (req as any).sessionId;
    const sessions = await this.sessionManagementService.getUserSessions(user.userId);

    for (const session of sessions) {
      if (session.id !== currentSessionId) {
        await Promise.all([
          this.sessionManagementService.revokeSession(session.id),
          this.refreshTokenStore.revokeSession(session.id),
        ]);
      }
    }

    return { message: 'All other sessions revoked' };
  }

  private getIpAddress(req: Request): string {
    return (req.ip || req.socket.remoteAddress || 'unknown').toString();
  }
}
