import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { cloudId } from '../../../services/cloud-id';
import { AwsRegions } from '../../aws_account/entity';

/**
 * @enum
 * Different states for a certificate. A valid certificate should be in ISSUED state
 */
export enum certificateStatusEnum {
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
  INACTIVE = 'INACTIVE',
  ISSUED = 'ISSUED',
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  REVOKED = 'REVOKED',
  VALIDATION_TIMED_OUT = 'VALIDATION_TIMED_OUT',
}

/**
 * @enum
 * Specifies if the certificate has been generated by AWS or has been imported
 */

export enum certificateTypeEnum {
  AMAZON_ISSUED = 'AMAZON_ISSUED',
  IMPORTED = 'IMPORTED',
  // TODO: add private certs support
  // PRIVATE = "PRIVATE",
}

/**
 * @enum
 * Specifies if the certificate is available to be renewed or not
 */
export enum certificateRenewalEligibilityEnum {
  ELIGIBLE = 'ELIGIBLE',
  INELIGIBLE = 'INELIGIBLE',
}

/**
 * Table to query for all AWS certificates in the system, managed by AWS ACM.
 * Certificates can be read and deleted, but not created or modified. Instead certificates can be created
 * by using RPCs.
 *
 * @example
 * ```sql
 *   SELECT * FROM certificate WHERE domain_name = '${domainName}';
 * ```
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
 * @see https://aws.amazon.com/certificate-manager
 *
 */
@Entity()
export class Certificate {
  /**
   * @private
   * Internal ID field for storing accounts
   */
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * @public
   * ARN for the generated certificate
   */
  @Column({
    nullable: true,
    unique: true,
  })
  @cloudId
  arn?: string;

  /**
   * @public
   * Internal ID for the certificate
   */
  @Column({
    nullable: true,
  })
  certificateId?: string;

  /**
   * @public
   * Domain name to which the certificate was issued
   */
  @Column()
  domainName: string;

  /**
   * @public
   * Type of certificate
   */
  @Column({
    nullable: true,
    type: 'enum',
    enum: certificateTypeEnum,
  })
  certificateType?: certificateTypeEnum;

  /**
   * @public
   * Status of the certificate
   */
  @Column({
    nullable: true,
    type: 'enum',
    enum: certificateStatusEnum,
  })
  status?: certificateStatusEnum;

  /**
   * @public
   * Specifies if the certificate can be renewed or not
   */
  @Column({
    nullable: true,
    type: 'enum',
    enum: certificateRenewalEligibilityEnum,
  })
  renewalEligibility?: certificateRenewalEligibilityEnum;

  /**
   * @public
   * Specifies if the certificate is already in use
   */
  @Column({
    default: false,
  })
  inUse: boolean;

  /**
   * @public
   * Region to where the certificate was
   */
  @Column({
    type: 'character varying',
    nullable: false,
    default: () => 'default_aws_region()',
  })
  @ManyToOne(() => AwsRegions, { nullable: false })
  @JoinColumn({ name: 'region' })
  region: string;
}
