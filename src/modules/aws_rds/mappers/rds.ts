import {
  CreateDBInstanceCommandInput,
  DBInstance,
  DeleteDBInstanceMessage,
  DescribeDBInstancesCommandInput,
  ModifyDBInstanceCommandInput,
  paginateDescribeDBInstances,
  RDS as AWSRDS,
} from '@aws-sdk/client-rds';
import { createWaiter, WaiterState } from '@aws-sdk/util-waiter';

import { AwsRdsModule } from '..';
import { AWS, crudBuilderFormat, paginateBuilder } from '../../../services/aws_macros';
import { awsSecurityGroupModule } from '../../aws_security_group';
import { awsVpcModule } from '../../aws_vpc';
import { Context, Crud, MapperBase } from '../../interfaces';
import { RDS } from '../entity';

export class RdsMapper extends MapperBase<RDS> {
  module: AwsRdsModule;
  entity = RDS;
  equals = (a: RDS, b: RDS) =>
    Object.is(a.engine, b.engine) &&
    Object.is(a.dbInstanceClass, b.dbInstanceClass) &&
    Object.is(a.availabilityZone?.name, b.availabilityZone?.name) &&
    Object.is(a.dbInstanceIdentifier, b.dbInstanceIdentifier) &&
    Object.is(a.endpointAddr, b.endpointAddr) &&
    Object.is(a.endpointPort, b.endpointPort) &&
    !a.masterUserPassword && // Special case, if master password defined, will update the password
    Object.is(a.masterUsername, b.masterUsername) &&
    Object.is(a.vpcSecurityGroups.length, b.vpcSecurityGroups.length) &&
    (a.vpcSecurityGroups?.every(
      asg => !!b.vpcSecurityGroups.find(bsg => Object.is(asg.groupId, bsg.groupId)),
    ) ??
      false) &&
    Object.is(a.allocatedStorage, b.allocatedStorage) &&
    Object.is(a.backupRetentionPeriod, b.backupRetentionPeriod) &&
    Object.is(a.parameterGroup?.arn, b.parameterGroup?.arn) &&
    Object.is(a.deletionProtection, b.deletionProtection) &&
    Object.is(a.engineVersion, b.engineVersion) &&
    Object.is(a.multiAZ, b.multiAZ) &&
    Object.is(a.publiclyAccessible, b.publiclyAccessible) &&
    Object.is(a.storageEncrypted, b.storageEncrypted) &&
    Object.is(a.subnetGroup?.name, b.subnetGroup?.name) &&
    Object.is(a.databaseName, b.databaseName) &&
    Object.is(a.dbCluster?.dbClusterIdentifier, b.dbCluster?.dbClusterIdentifier);

  async rdsMapper(rds: any, ctx: Context, region: string) {
    const out = new RDS();
    out.allocatedStorage = rds?.AllocatedStorage;
    out.availabilityZone = await awsVpcModule.availabilityZone.db.read(
      ctx,
      awsVpcModule.availabilityZone.generateId({ name: rds?.AvailabilityZone, region }),
    );
    out.dbInstanceClass = rds?.DBInstanceClass;
    out.dbInstanceIdentifier = rds?.DBInstanceIdentifier;
    out.endpointAddr = rds?.Endpoint?.Address;
    out.endpointPort = rds?.Endpoint?.Port;
    if (/aurora/.test(rds?.Engine ?? 'aurora')) return undefined;
    out.engine = rds.Engine;
    out.engineVersion = rds.EngineVersion;
    out.masterUsername = rds?.MasterUsername;
    const vpcSecurityGroupIds = rds?.VpcSecurityGroups?.filter(
      (vpcsg: any) => !!vpcsg?.VpcSecurityGroupId,
    ).map((vpcsg: any) => vpcsg?.VpcSecurityGroupId);
    out.vpcSecurityGroups = [];
    for (const sgId of vpcSecurityGroupIds) {
      const sg =
        (await awsSecurityGroupModule.securityGroup.db.read(
          ctx,
          awsSecurityGroupModule.securityGroup.generateId({ groupId: sgId, region }),
        )) ??
        (await awsSecurityGroupModule.securityGroup.cloud.read(
          ctx,
          awsSecurityGroupModule.securityGroup.generateId({ groupId: sgId, region }),
        ));
      if (sg) out.vpcSecurityGroups.push(sg);
    }
    out.backupRetentionPeriod = rds?.BackupRetentionPeriod ?? 1;

    if (rds.DBParameterGroups?.length) {
      const parameterGroup = rds.DBParameterGroups[0];
      out.parameterGroup =
        (await this.module.parameterGroup.db.read(
          ctx,
          this.module.parameterGroup.generateId({ name: parameterGroup.DBParameterGroupName, region }),
        )) ??
        (await this.module.parameterGroup.cloud.read(
          ctx,
          this.module.parameterGroup.generateId({ name: parameterGroup.DBParameterGroupName, region }),
        ));
      if (!out.parameterGroup) {
        // This is likely an unsupported Aurora instance
        return undefined;
      }
    }

    out.deletionProtection = rds.DeletionProtection ?? false;
    out.publiclyAccessible = rds.PubliclyAccessible ?? false;
    out.multiAZ = rds.MultiAZ ?? false;
    out.storageEncrypted = rds.StorageEncrypted ?? false;

    if (rds.DBSubnetGroup) {
      out.subnetGroup =
        (await this.module.dbSubnetGroup.db.read(
          ctx,
          this.module.dbSubnetGroup.generateId({ name: rds.DBSubnetGroup, region }),
        )) ??
        (await this.module.dbSubnetGroup.cloud.read(
          ctx,
          this.module.dbSubnetGroup.generateId({ name: rds.DBSubnetGroup, region }),
        ));
    }

    if (rds.DBCluster) {
      out.dbCluster =
        (await this.module.dbSubnetGroup.db.read(
          ctx,
          this.module.dbSubnetGroup.generateId({ name: rds.DBCluster, region }),
        )) ??
        (await this.module.dbSubnetGroup.cloud.read(
          ctx,
          this.module.dbSubnetGroup.generateId({ name: rds.DBCluster, region }),
        ));
    }

    out.region = region;
    out.databaseName = rds.DBName;
    return out;
  }
  getDBInstance = crudBuilderFormat<AWSRDS, 'describeDBInstances', DBInstance | undefined>(
    'describeDBInstances',
    DBInstanceIdentifier => ({ DBInstanceIdentifier }),
    res => (res?.DBInstances ?? [])[0],
  );
  getAllDBInstances = paginateBuilder<AWSRDS>(paginateDescribeDBInstances, 'DBInstances');
  getDBInstances = async (client: AWSRDS) =>
    (await this.getAllDBInstances(client))
      .flat()
      .filter(dbInstance => dbInstance.DBInstanceStatus === 'available');
  // TODO: Make a waiter macro
  async createDBInstance(client: AWSRDS, instanceParams: CreateDBInstanceCommandInput) {
    let newDBInstance = (await client.createDBInstance(instanceParams)).DBInstance;
    const input: DescribeDBInstancesCommandInput = {
      DBInstanceIdentifier: instanceParams.DBInstanceIdentifier,
    };
    // TODO: should we use the paginator instead?
    await createWaiter<AWSRDS, DescribeDBInstancesCommandInput>(
      {
        client,
        // all in seconds
        maxWaitTime: 1200,
        minDelay: 1,
        maxDelay: 4,
      },
      input,
      async (cl, cmd) => {
        try {
          const data = await cl.describeDBInstances(cmd);
          for (const dbInstance of data?.DBInstances ?? []) {
            if (dbInstance.DBInstanceStatus !== 'available') return { state: WaiterState.RETRY };
            newDBInstance = dbInstance;
          }
          return { state: WaiterState.SUCCESS };
        } catch (e: any) {
          if (e.Code === 'InvalidInstanceID.NotFound') return { state: WaiterState.RETRY };
          throw e;
        }
      },
    );
    return newDBInstance;
  }
  async updateDBInstance(client: AWSRDS, input: ModifyDBInstanceCommandInput) {
    let updatedDBInstance = (await client.modifyDBInstance(input))?.DBInstance;
    const inputCommand: DescribeDBInstancesCommandInput = {
      DBInstanceIdentifier: input.DBInstanceIdentifier,
    };
    await createWaiter<AWSRDS, DescribeDBInstancesCommandInput>(
      {
        client,
        // all in seconds
        maxWaitTime: 300,
        minDelay: 1,
        maxDelay: 4,
      },
      inputCommand,
      async (cl, cmd) => {
        try {
          const data = await cl.describeDBInstances(cmd);
          if (!data || !data.DBInstances?.length) return { state: WaiterState.RETRY };
          for (const dbInstance of data?.DBInstances ?? []) {
            if (dbInstance.DBInstanceStatus === 'available') return { state: WaiterState.RETRY };
          }
          return { state: WaiterState.SUCCESS };
        } catch (e: any) {
          if (e.Code === 'InvalidInstanceID.NotFound') return { state: WaiterState.RETRY };
          throw e;
        }
      },
    );
    await createWaiter<AWSRDS, DescribeDBInstancesCommandInput>(
      {
        client,
        // all in seconds
        maxWaitTime: 1200,
        minDelay: 1,
        maxDelay: 4,
      },
      inputCommand,
      async (cl, cmd) => {
        try {
          const data = await cl.describeDBInstances(cmd);
          if (!data || !data.DBInstances?.length) return { state: WaiterState.RETRY };
          for (const dbInstance of data?.DBInstances ?? []) {
            if (dbInstance.DBInstanceStatus !== 'available') return { state: WaiterState.RETRY };
            updatedDBInstance = dbInstance;
          }
          return { state: WaiterState.SUCCESS };
        } catch (e: any) {
          if (e.Code === 'InvalidInstanceID.NotFound') return { state: WaiterState.RETRY };
          throw e;
        }
      },
    );
    return updatedDBInstance;
  }
  async deleteDBInstance(client: AWSRDS, deleteInput: DeleteDBInstanceMessage) {
    await client.deleteDBInstance(deleteInput);
    const cmdInput: DescribeDBInstancesCommandInput = {
      DBInstanceIdentifier: deleteInput.DBInstanceIdentifier,
    };
    await createWaiter<AWSRDS, DescribeDBInstancesCommandInput>(
      {
        client,
        // all in seconds
        maxWaitTime: 1200,
        minDelay: 1,
        maxDelay: 4,
      },
      cmdInput,
      async (cl, input) => {
        const data = await cl.describeDBInstances(input);
        for (const dbInstance of data?.DBInstances ?? []) {
          if (dbInstance.DBInstanceStatus === 'deleting') return { state: WaiterState.RETRY };
        }
        return { state: WaiterState.SUCCESS };
      },
    );
  }

  cloud = new Crud({
    create: async (es: RDS[], ctx: Context) => {
      const out = [];
      for (const e of es) {
        const client = (await ctx.getAwsClient(e.region)) as AWS;
        const securityGroupIds =
          e.vpcSecurityGroups?.map(sg => {
            if (!sg.groupId) throw new Error('Security group needs to exist');
            return sg.groupId;
          }) ?? [];
        const instanceParams: CreateDBInstanceCommandInput = {
          AllocatedStorage: e.allocatedStorage,
          AvailabilityZone: e.availabilityZone.name,
          BackupRetentionPeriod: e.backupRetentionPeriod,
          DBInstanceIdentifier: e.dbInstanceIdentifier,
          DBClusterIdentifier: e.dbCluster?.dbClusterIdentifier,
          DBInstanceClass: e.dbInstanceClass,
          DBName: e.databaseName,
          DeletionProtection: e.deletionProtection,
          Engine: e.engine,
          EngineVersion: e.engineVersion,
          MasterUsername: e.masterUsername,
          MasterUserPassword: e.masterUserPassword,
          MultiAZ: e.multiAZ,
          Port: e.endpointPort,
          PubliclyAccessible: e.publiclyAccessible,
          StorageEncrypted: e.storageEncrypted,
          VpcSecurityGroupIds: securityGroupIds,
        };
        if (e.parameterGroup) instanceParams.DBParameterGroupName = e.parameterGroup.name;

        const result = await this.createDBInstance(client.rdsClient, instanceParams);
        // TODO: Handle if it fails (somehow)
        if (!result?.hasOwnProperty('DBInstanceIdentifier')) {
          // Failure
          throw new Error('what should we do here?');
        }
        // Re-get the inserted record to get all of the relevant records we care about
        const newObject = await this.getDBInstance(client.rdsClient, result.DBInstanceIdentifier ?? '');
        // We need to update the parameter groups if its a default one and it does not exists
        const parameterGroupName = newObject?.DBParameterGroups?.[0].DBParameterGroupName;
        if (
          !(await this.module.parameterGroup.db.read(
            ctx,
            this.module.parameterGroup.generateId({ name: parameterGroupName ?? '', region: e.region }),
          ))
        ) {
          const cloudParameterGroup = await this.module.parameterGroup.cloud.read(
            ctx,
            this.module.parameterGroup.generateId({ name: parameterGroupName ?? '', region: e.region }),
          );
          await this.module.parameterGroup.db.create(cloudParameterGroup, ctx);
        }
        // We map this into the same kind of entity as `obj`
        const newEntity = await this.rdsMapper(newObject, ctx, e.region);
        if (!newEntity) continue;
        // We attach the original object's ID to this new one, indicating the exact record it is
        // replacing in the database.
        newEntity.id = e.id;
        // Set password as null to avoid infinite loop trying to update the password.
        // Reminder: Password need to be null since when we read RDS instances from AWS this
        // property is not retrieved
        newEntity.masterUserPassword = undefined;
        // Save the record back into the database to get the new fields updated
        await this.module.rds.db.update(newEntity, ctx);
        out.push(newEntity);
      }
      return out;
    },
    read: async (ctx: Context, id?: string) => {
      const enabledRegions = (await ctx.getEnabledAwsRegions()) as string[];
      if (id) {
        const { dbInstanceIdentifier, region } = this.idFields(id);
        const client = (await ctx.getAwsClient(region)) as AWS;
        const rawRds = await this.getDBInstance(client.rdsClient, dbInstanceIdentifier);
        if (!rawRds) return;
        return await this.rdsMapper(rawRds, ctx, region);
      } else {
        const out: RDS[] = [];
        await Promise.all(
          enabledRegions.map(async region => {
            const client = (await ctx.getAwsClient(region)) as AWS;
            const rdses = await this.getDBInstances(client.rdsClient);
            for (const rds of rdses) {
              const r = await this.rdsMapper(rds, ctx, region);
              if (!r) continue;
              out.push(r);
            }
          }),
        );
        return out;
      }
    },
    update: async (es: RDS[], ctx: Context) => {
      const out = [];
      for (const e of es) {
        const client = (await ctx.getAwsClient(e.region)) as AWS;
        const cloudRecord = ctx?.memo?.cloud?.RDS?.[this.entityId(e)];
        let updatedRecord = { ...cloudRecord };
        if (
          !(
            Object.is(e.dbInstanceClass, cloudRecord.dbInstanceClass) &&
            Object.is(e.engineVersion, cloudRecord.engineVersion) &&
            Object.is(e.allocatedStorage, cloudRecord.allocatedStorage) &&
            !e.masterUserPassword &&
            Object.is(e.vpcSecurityGroups.length, cloudRecord.vpcSecurityGroups.length) &&
            (e.vpcSecurityGroups?.every(
              esg => !!cloudRecord.vpcSecurityGroups.find((csg: any) => Object.is(esg.groupId, csg.groupId)),
            ) ??
              false)
          )
        ) {
          if (!e.vpcSecurityGroups?.filter(sg => !!sg.groupId).length) {
            throw new Error('Waiting for security groups');
          }
          const instanceParams: ModifyDBInstanceCommandInput = {
            AllocatedStorage: e.allocatedStorage,
            DBInstanceClass: e.dbInstanceClass,
            DBInstanceIdentifier: e.dbInstanceIdentifier,
            EngineVersion: e.engineVersion,
            VpcSecurityGroupIds: e.vpcSecurityGroups?.filter(sg => !!sg.groupId).map(sg => sg.groupId!) ?? [],
            BackupRetentionPeriod: e.backupRetentionPeriod,
            ApplyImmediately: true,
          };
          // If a password value has been inserted, we update it.
          if (e.masterUserPassword) {
            instanceParams.MasterUserPassword = e.masterUserPassword;
          }
          const result = await this.updateDBInstance(client.rdsClient, instanceParams);
          const dbInstance = await this.getDBInstance(client.rdsClient, result?.DBInstanceIdentifier ?? '');
          updatedRecord = await this.rdsMapper(dbInstance, ctx, e.region);
        }
        // Restore autogenerated values
        updatedRecord.id = e.id;
        // Set password as null to avoid infinite loop trying to update the password.
        // Reminder: Password need to be null since when we read RDS instances from AWS this
        // property is not retrieved
        updatedRecord.masterUserPassword = null;
        await this.module.rds.db.update(updatedRecord, ctx);
        out.push(updatedRecord);
      }
      return out;
    },
    delete: async (es: RDS[], ctx: Context) => {
      for (const e of es) {
        const client = (await ctx.getAwsClient(e.region)) as AWS;
        const input = {
          DBInstanceIdentifier: e.dbInstanceIdentifier,
          // TODO: do users will have access to this type of config?
          //        probably initially we should play it safe and do not create a snapshot
          //        and do not delete backups if any?
          SkipFinalSnapshot: true,
          // FinalDBSnapshotIdentifier: undefined,
          // DeleteAutomatedBackups: false,
        };
        await this.deleteDBInstance(client.rdsClient, input);
      }
    },
  });

  constructor(module: AwsRdsModule) {
    super();
    this.module = module;
    super.init();
  }
}
