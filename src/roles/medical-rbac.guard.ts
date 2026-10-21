import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUDIT_RESOURCE_KEY,
  EMERGENCY_OVERRIDE_KEY,
  MEDICAL_DEPARTMENT_KEY,
  MEDICAL_PERMISSIONS_KEY,
  MEDICAL_ROLES_KEY,
  MEDICAL_SPECIALTY_KEY,
} from './medical-rbac.decorator';
import {
  AuditAction,
  MedicalDepartment,
  MedicalPermission,
  MedicalRole,
  MedicalSpecialty,
} from '../enums/medical-roles.enum';
import { MedicalUser } from '../interfaces/medical-rbac.interface';
import { EmergencyOverrideService } from './emergency-override.service';
import { MedicalAuditService } from './medical-audit.service';
import { MedicalPermissionsService } from './medical-permissions.service';

/**
 * JWT tokens carry the account-level `UserRole` (lowercase) in a single `role`
 * claim. Map each one onto the medical roles the permission map is keyed on.
 */
const JWT_ROLE_CLAIM_MAP: Record<string, MedicalRole[]> = {
  admin: [MedicalRole.ADMIN],
  super_admin: [MedicalRole.ADMIN],
  physician: [MedicalRole.DOCTOR],
  surgeon: [MedicalRole.DOCTOR],
  nurse: [MedicalRole.NURSE],
};

@Injectable()
export class MedicalRbacGuard implements CanActivate {
  private readonly logger = new Logger(MedicalRbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: MedicalPermissionsService,
    private readonly auditService: MedicalAuditService,
    private readonly emergencyOverrideService: EmergencyOverrideService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: MedicalUser | undefined =
      request.medicalUser ?? this.toMedicalUser(request.user);

    if (!user) {
      throw new UnauthorizedException('No authenticated medical user found');
    }

    // Persist the hydrated user so @CurrentMedicalUser can read it.
    request.medicalUser = user;

    const requiredRoles = this.reflector.getAllAndOverride<MedicalRole[]>(MEDICAL_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<MedicalPermission[]>(
      MEDICAL_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredDepartments = this.reflector.getAllAndOverride<MedicalDepartment[]>(
      MEDICAL_DEPARTMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredSpecialties = this.reflector.getAllAndOverride<MedicalSpecialty[]>(
      MEDICAL_SPECIALTY_KEY,
      [context.getHandler(), context.getClass()],
    );

    const allowEmergencyOverride = this.reflector.getAllAndOverride<boolean>(
      EMERGENCY_OVERRIDE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const auditResource = this.reflector.getAllAndOverride<string>(AUDIT_RESOURCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const patientId = request.params?.patientId ?? request.body?.patientId;
    const ipAddress = request.ip;
    const resourceName = auditResource ?? context.getHandler().name;

    // Check roles
    if (requiredRoles?.length) {
      const hasRole = requiredRoles.some((r) => user.roles.includes(r));
      if (!hasRole) {
        await this.denyAccess(user, resourceName, 'Insufficient role', ipAddress, patientId);
        throw new ForbiddenException('Insufficient medical role');
      }
    }

    // Check permissions
    if (requiredPermissions?.length) {
      const hasPermissions = this.permissionsService.hasAllPermissions(user, requiredPermissions);
      if (!hasPermissions) {
        await this.denyAccess(user, resourceName, 'Insufficient permissions', ipAddress, patientId);
        throw new ForbiddenException('Insufficient medical permissions');
      }
    }

    // Check department access
    if (requiredDepartments?.length) {
      const canAccess = requiredDepartments.some((dept) =>
        this.permissionsService.canAccessDepartment(user, dept),
      );

      if (!canAccess) {
        // Check emergency override
        if (allowEmergencyOverride && patientId) {
          const hasOverride = await this.emergencyOverrideService.hasActiveOverride(
            user.id,
            patientId,
          );

          if (hasOverride) {
            request.emergencyOverrideContext = { userId: user.id, patientId };
            await this.logAccess(user, resourceName, patientId, ipAddress, true);
            return true;
          }
        }

        await this.denyAccess(user, resourceName, 'Department access denied', ipAddress, patientId);
        throw new ForbiddenException('Department access denied');
      }
    }

    // Check specialty
    if (requiredSpecialties?.length && user.roles.includes(MedicalRole.DOCTOR)) {
      const hasSpecialty = user.specialties?.some((s) => requiredSpecialties.includes(s));
      if (!hasSpecialty) {
        await this.denyAccess(
          user,
          resourceName,
          'Required specialty not found',
          ipAddress,
          patientId,
        );
        throw new ForbiddenException('Required medical specialty not present');
      }
    }

    // Log successful access
    await this.logAccess(user, resourceName, patientId, ipAddress, false);
    return true;
  }

  /**
   * Builds a MedicalUser from the JWT payload attached by JwtAuthGuard.
   */
  private toMedicalUser(payload: any): MedicalUser | undefined {
    if (!payload) {
      return undefined;
    }

    return {
      id: payload.userId ?? payload.id,
      staffId: payload.staffId,
      roles: JWT_ROLE_CLAIM_MAP[payload.role] ?? [],
      department: payload.department,
      specialties: payload.specialties,
    } as MedicalUser;
  }

  private async logAccess(
    user: MedicalUser,
    resource: string,
    patientId: string | undefined,
    ipAddress: string | undefined,
    isEmergencyOverride: boolean,
  ): Promise<void> {
    await this.auditService.log({
      userId: user.id,
      staffId: user.staffId,
      action: AuditAction.READ,
      resource,
      patientId,
      department: user.department,
      isEmergencyOverride,
      ipAddress,
      success: true,
      timestamp: new Date(),
    });
  }

  private async denyAccess(
    user: MedicalUser,
    resource: string,
    reason: string,
    ipAddress: string | undefined,
    patientId: string | undefined,
  ): Promise<void> {
    await this.auditService.log({
      userId: user.id,
      staffId: user.staffId,
      action: AuditAction.PERMISSION_DENIED,
      resource,
      patientId,
      department: user.department,
      isEmergencyOverride: false,
      ipAddress,
      success: false,
      failureReason: reason,
      timestamp: new Date(),
    });
  }
}
