import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { cloudId } from '../../../services/cloud-id';
import { Bucket } from './bucket';

/**
 * Table to manage AWS S3 bucket public access.
 *
 * A bucket is a container for objects stored in Amazon S3. You can store any number of objects in a bucket and can have up to 100 buckets in your account.
 *
 * @example
 * ```sql TheButton[Make the S3 Bucket Public]="Make the S3 Bucket Public"
 * UPDATE public_access_block SET BlockPublicAcls = false, IgnorePublicAcls = false, BlockPublicPolicy = false, RestrictPublicBuckets = false WHERE bucket_name = 'mybucketname';
 * ```
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
 */
@Entity()
export class PublicAccessBlock {
  /**
   * @public
   * Block public access to buckets and objects granted through new access control lists (ACLs)
   */
  @Column({
    default: true,
  })
  BlockPublicAcls?: boolean;

  /**
   * @public
   * Block public access to buckets and objects granted through any access control lists (ACLs)
   */
  @Column({
    default: true,
  })
  IgnorePublicAcls?: boolean;

  /**
   * @public
   * Block public access to buckets and objects granted through new public bucket or access point policies
   */
  @Column({
    default: true,
  })
  BlockPublicPolicy?: boolean;

  /**
   * @public
   * Block public and cross-account access to buckets and objects through any public bucket or access point policies
   */
  @Column({
    default: true,
  })
  RestrictPublicBuckets?: boolean;

  /**
   * @public
   * Name of the bucket
   */
  @PrimaryColumn({
    nullable: false,
    type: 'varchar',
  })
  @cloudId
  bucketName: string;

  /**
   * @public
   * Reference for the bucket
   */
  @OneToOne(() => Bucket, bucket => bucket.name, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    {
      name: 'bucket_name',
      referencedColumnName: 'name',
    },
  ])
  bucket: Bucket;
}
