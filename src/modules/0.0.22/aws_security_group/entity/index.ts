import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { cloudId } from '../../../../services/cloud-id';
import { AwsRegions } from '../../aws_account/entity';
import { Vpc } from '../../aws_vpc/entity';

@Unique('UQ_groupNameByVpc', ['groupName', 'vpc'])
@Unique('uq_security_group_region', ['id', 'region'])
@Entity()
export class SecurityGroup {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  description?: string;

  @Column()
  groupName: string;

  @Column({
    nullable: true,
  })
  ownerId?: string;

  @Column({
    nullable: true,
  })
  @cloudId
  groupId?: string;

  @ManyToOne(() => Vpc, { nullable: true, eager: true })
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

  @OneToMany(() => SecurityGroupRule, sgr => sgr.securityGroup)
  securityGroupRules: SecurityGroupRule[];

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

@Unique('UQ_rule', ['isEgress', 'ipProtocol', 'fromPort', 'toPort', 'cidrIpv4', 'securityGroup'])
@Unique('uq_security_group_rule_region', ['id', 'region'])
@Entity()
export class SecurityGroupRule {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({
    nullable: true,
  })
  @cloudId
  securityGroupRuleId?: string;

  @ManyToOne(() => SecurityGroup)
  @JoinColumn([
    {
      name: 'security_group_id',
      referencedColumnName: 'id',
    },
    {
      name: 'region',
      referencedColumnName: 'region',
    },
  ])
  securityGroup: SecurityGroup;

  @Column({
    nullable: false,
  })
  isEgress: boolean;

  @Column({
    nullable: true,
  })
  ipProtocol?: string;

  @Column({
    nullable: true,
    type: 'int',
  })
  fromPort?: number;

  @Column({
    nullable: true,
    type: 'int',
  })
  toPort?: number;

  @Column({
    nullable: true,
    type: 'cidr',
  })
  cidrIpv4?: string;

  @Column({
    nullable: true,
    type: 'cidr',
  })
  cidrIpv6?: string;

  @Column({
    nullable: true,
  })
  prefixListId?: string;

  @Column({
    nullable: true,
  })
  description?: string;

  @Check(
    'Check_security_or_ip_permissions',
    `("source_security_group" IS NULL AND ("from_port" IS NOT NULL AND "to_port" IS NOT NULL AND ("cidr_ipv4" IS NOT NULL OR "cidr_ipv6" IS NOT NULL))) OR ("source_security_group" IS NOT NULL AND (("from_port" IS NULL OR "from_port"=-1) AND ("to_port" IS NULL OR "to_port"=-1) AND ("cidr_ipv4" IS NULL OR "cidr_ipv4"='0.0.0.0/0') AND ("cidr_ipv6" IS NULL)))`,
  )
  @ManyToOne(() => SecurityGroup, { nullable: true, eager: true })
  @JoinColumn({
    name: 'source_security_group',
  })
  sourceSecurityGroup?: SecurityGroup;

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
