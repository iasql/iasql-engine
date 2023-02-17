import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Vpc } from '.';
import { Policy } from '../../../services/canonical-iam-policy';
import { cloudId } from '../../../services/cloud-id';
import { AwsRegions } from '../../aws_account/entity';

/**
 * @enum
 * Available service types for the endpoint gateway.
 * Only 'dynamodb' and 's3' types are supported
 */
export enum EndpointGatewayService {
  DYNAMODB = 'dynamodb',
  S3 = 's3',
}

/**
 * Table to manage AWS Gateway endpoints.
 * Gateway endpoints provide reliable connectivity to Amazon S3 and DynamoDB without requiring an internet gateway or a NAT device for your VPC.
 * Gateway endpoints do not enable AWS PrivateLink.
 *
 * @see https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html
 */
@Entity()
export class EndpointGateway {
  /**
   * @private
   * Auto-incremented ID field
   */
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * @public
   * AWS ID to identify the gateway
   */
  @Column({ nullable: true })
  @cloudId
  vpcEndpointId?: string;

  /**
   * @public
   * Service type associated to this gateway
   */
  @Column({
    nullable: false,
    type: 'enum',
    enum: EndpointGatewayService,
  })
  service: EndpointGatewayService;

  /**
   * @public
   * Complex type representing the policy associated to this gateway
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies-examples.html
   */
  @Column({ nullable: true, type: 'json' })
  policy?: Policy;

  /**
   * @public
   * Reference to the VPC associated to this gateway
   */
  @ManyToOne(() => Vpc, { nullable: false, eager: true })
  @JoinColumn([
    {
      name: 'vpc_id',
      referencedColumnName: 'id',
    },
    {
      name: 'region',
      referencedColumnName: 'region',
    },
  ])
  vpc?: Vpc;

  /**
   * @public
   * Current state for the gateway
   */
  @Column({ nullable: true })
  state?: string;

  /**
   * @public
   * Complex type representing the route tables associated with this gateway
   * @see https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html#gateway-endpoint-routing
   *
   * @privateRemarks
   * TODO: update to be a reference to a RouteTable entity
   */
  @Column('text', { nullable: true, array: true })
  routeTableIds?: string[];

  /**
   * @public
   * Complex type to provide identifier tags for the instance
   */
  @Column({
    type: 'json',
    nullable: true,
  })
  tags?: { [key: string]: string };

  /**
   * @public
   * Reference to the region where it belongs
   */
  @Column({
    type: 'character varying',
    nullable: false,
    default: () => 'default_aws_region()',
  })
  @ManyToOne(() => AwsRegions, { nullable: false })
  @JoinColumn({ name: 'region' })
  @cloudId
  region: string;
}
