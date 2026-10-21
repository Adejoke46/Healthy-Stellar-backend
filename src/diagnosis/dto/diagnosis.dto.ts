import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  IsObject,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiagnosisStatus, DiagnosisSeverity } from '../../common/enums';

export class SupportingEvidenceDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  labResults?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  imagingResults?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physicalExamFindings?: string;
}

export class CreateDiagnosisDto {
  @ApiProperty({ description: 'Patient UUID' })
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional({ description: 'Provider UUID' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ description: 'Medical Record UUID' })
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiProperty({ description: 'ICD-10 Code UUID from medical_codes table' })
  @IsUUID()
  icd10CodeId: string;

  @ApiPropertyOptional({ enum: DiagnosisStatus, default: DiagnosisStatus.PRELIMINARY })
  @IsOptional()
  @IsEnum(DiagnosisStatus)
  status?: DiagnosisStatus;

  @ApiPropertyOptional({ enum: DiagnosisSeverity })
  @IsOptional()
  @IsEnum(DiagnosisSeverity)
  severity?: DiagnosisSeverity;

  @ApiProperty({ description: 'Date of diagnosis' })
  @IsDateString()
  diagnosisDate: string;

  @ApiPropertyOptional({ description: 'Date when symptoms first appeared' })
  @IsOptional()
  @IsDateString()
  onsetDate?: string;

  @ApiPropertyOptional({ description: 'Date when diagnosis was resolved' })
  @IsOptional()
  @IsDateString()
  resolvedDate?: string;

  @ApiPropertyOptional({ description: 'Clinical notes about the diagnosis' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clinicalNotes?: string;

  @ApiPropertyOptional({ description: 'Presenting symptoms' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  presentingSymptoms?: string;

  @ApiPropertyOptional({ type: SupportingEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupportingEvidenceDto)
  supportingEvidence?: SupportingEvidenceDto;

  @ApiPropertyOptional({ description: 'Is this the primary diagnosis' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Is this a chronic condition' })
  @IsOptional()
  @IsBoolean()
  isChronic?: boolean;

  @ApiPropertyOptional({ description: 'Laterality (left, right, bilateral)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  laterality?: string;

  @ApiPropertyOptional({ description: 'Body location' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bodyLocation?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateDiagnosisDto {
  @ApiPropertyOptional({ enum: DiagnosisStatus })
  @IsOptional()
  @IsEnum(DiagnosisStatus)
  status?: DiagnosisStatus;

  @ApiPropertyOptional({ enum: DiagnosisSeverity })
  @IsOptional()
  @IsEnum(DiagnosisSeverity)
  severity?: DiagnosisSeverity;

  @ApiPropertyOptional({ description: 'Date when diagnosis was resolved' })
  @IsOptional()
  @IsDateString()
  resolvedDate?: string;

  @ApiPropertyOptional({ description: 'Clinical notes about the diagnosis' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clinicalNotes?: string;

  @ApiPropertyOptional({ description: 'Presenting symptoms' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  presentingSymptoms?: string;

  @ApiPropertyOptional({ type: SupportingEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupportingEvidenceDto)
  supportingEvidence?: SupportingEvidenceDto;

  @ApiPropertyOptional({ description: 'Is this the primary diagnosis' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Is this a chronic condition' })
  @IsOptional()
  @IsBoolean()
  isChronic?: boolean;

  @ApiPropertyOptional({ description: 'Laterality (left, right, bilateral)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  laterality?: string;

  @ApiPropertyOptional({ description: 'Body location' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bodyLocation?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Reason for the change' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string;
}

export class SearchDiagnosisDto {
  @ApiPropertyOptional({ description: 'Patient UUID' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Provider UUID' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ enum: DiagnosisStatus })
  @IsOptional()
  @IsEnum(DiagnosisStatus)
  status?: DiagnosisStatus;

  @ApiPropertyOptional({ enum: DiagnosisSeverity })
  @IsOptional()
  @IsEnum(DiagnosisSeverity)
  severity?: DiagnosisSeverity;

  @ApiPropertyOptional({ description: 'ICD-10 code' })
  @IsOptional()
  @IsString()
  icd10Code?: string;

  @ApiPropertyOptional({ description: 'Only chronic conditions' })
  @IsOptional()
  @IsBoolean()
  isChronic?: boolean;

  @ApiPropertyOptional({ description: 'Only primary diagnoses' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Diagnosis date from' })
  @IsOptional()
  @IsDateString()
  diagnosisDateFrom?: string;

  @ApiPropertyOptional({ description: 'Diagnosis date to' })
  @IsOptional()
  @IsDateString()
  diagnosisDateTo?: string;
}

export class DiagnosisResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  patientId: string;

  @ApiProperty({ required: false })
  providerId?: string;

  @ApiProperty({ required: false })
  medicalRecordId?: string;

  @ApiProperty()
  icd10CodeId: string;

  @ApiProperty({ description: 'ICD-10 code details' })
  icd10Code: {
    code: string;
    description: string;
    codeType: string;
  };

  @ApiProperty({ enum: DiagnosisStatus })
  status: DiagnosisStatus;

  @ApiProperty({ enum: DiagnosisSeverity, required: false })
  severity?: DiagnosisSeverity;

  @ApiProperty()
  diagnosisDate: Date;

  @ApiProperty({ required: false })
  onsetDate?: Date;

  @ApiProperty({ required: false })
  resolvedDate?: Date;

  @ApiProperty({ required: false })
  clinicalNotes?: string;

  @ApiProperty({ required: false })
  presentingSymptoms?: string;

  @ApiProperty({ required: false })
  supportingEvidence?: SupportingEvidenceDto;

  @ApiProperty()
  isPrimary: boolean;

  @ApiProperty()
  isChronic: boolean;

  @ApiProperty({ required: false })
  laterality?: string;

  @ApiProperty({ required: false })
  bodyLocation?: string;

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  createdBy?: string;

  @ApiProperty({ required: false })
  updatedBy?: string;
}
