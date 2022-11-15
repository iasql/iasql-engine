import { ModuleBase } from '../interfaces';
import {
  AvailabilityZoneMapper,
  ElasticIpMapper,
  EndpointGatewayMapper,
  EndpointInterfaceMapper,
  NatGatewayMapper,
  SubnetMapper,
  VpcMapper,
} from './mappers';
import { RouteTableMapper } from './mappers/route_table';

export class AwsVpcModule extends ModuleBase {
  subnet: SubnetMapper;
  vpc: VpcMapper;
  natGateway: NatGatewayMapper;
  elasticIp: ElasticIpMapper;
  endpointGateway: EndpointGatewayMapper;
  endpointInterface: EndpointInterfaceMapper;
  availabilityZone: AvailabilityZoneMapper;
  routeTable: RouteTableMapper;

  constructor() {
    super();
    this.subnet = new SubnetMapper(this);
    this.vpc = new VpcMapper(this);
    this.natGateway = new NatGatewayMapper(this);
    this.elasticIp = new ElasticIpMapper(this);
    this.endpointGateway = new EndpointGatewayMapper(this);
    this.endpointInterface = new EndpointInterfaceMapper(this);
    this.availabilityZone = new AvailabilityZoneMapper(this);
    this.routeTable = new RouteTableMapper(this);
    super.init();
  }
}

export const awsVpcModule = new AwsVpcModule();
