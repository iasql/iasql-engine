import * as iasql from '../../src/services/iasql';
import {
  defaultRegion,
  execComposeDown,
  execComposeUp,
  finish,
  getPrefix,
  runCommit,
  runInstall,
  runQuery,
} from '../helpers';

const prefix = getPrefix();
const dbAlias = 'memorydbtest';

// MemoryDB has a *very* constrained set of regions
const region = defaultRegion([
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-north-1',
  'eu-west-1',
  'eu-west-2',
  'sa-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
]);
const nonDefaultRegion = 'us-east-1';

const subnetGroupName = `${prefix}${dbAlias}sng`;
const clusterName = `${prefix}${dbAlias}cl`;

const commit = runCommit.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);
const install = runInstall.bind(null, dbAlias);
const modules = ['aws_memory_db'];

jest.setTimeout(1800000);
beforeAll(async () => await execComposeUp());
afterAll(async () => await execComposeDown());

describe('MemoryDB Multi-region Integration Testing', () => {
  it('creates a new test db', done =>
    void iasql.connect(dbAlias, 'not-needed', 'not-needed').then(...finish(done)));

  it('installs the aws_account module', install(['aws_account']));

  it(
    'inserts aws credentials',
    query(
      `
    INSERT INTO aws_credentials (access_key_id, secret_access_key)
    VALUES ('${process.env.AWS_ACCESS_KEY_ID}', '${process.env.AWS_SECRET_ACCESS_KEY}')
  `,
      undefined,
      false,
    ),
  );

  it('syncs the regions', commit());

  it(
    'sets the default region',
    query(`
    UPDATE aws_regions SET is_default = TRUE WHERE region = '${region}';
  `),
  );

  it('installs the memory db module', install(modules));

  it(
    'creates a subnet group',
    query(`
    INSERT INTO subnet_group (subnet_group_name)
    VALUES ('${subnetGroupName}');
  `),
  );

  it('applies the change', commit());

  it(
    'checks the subnet group was added',
    query(
      `
    SELECT *
    FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it(
    'creates a memory db cluster',
    query(`
      INSERT INTO memory_db_cluster (cluster_name, subnet_group_id)
      VALUES ('${clusterName}', (select id from subnet_group where subnet_group_name = '${subnetGroupName}'));
  `),
  );

  it('should fail inserting the memory db cluster security group in the wrong region', done =>
    void query(`
      INSERT INTO memory_db_cluster_security_groups (security_group_id, memory_db_cluster_id, region)
      VALUES ((select id from security_group where group_name = 'default' and region = '${region}'), (select id from memory_db_cluster where cluster_name = '${clusterName}'), '${nonDefaultRegion}');
  `)((e?: any) => {
      console.log({ e });
      try {
        expect(e?.message).toContain('violates foreign key constraint');
      } catch (err) {
        done(err);
        return {};
      }
      done();
      return {};
    }));

  it(
    'inserts the memory db cluster security group',
    query(`
      INSERT INTO memory_db_cluster_security_groups (security_group_id, memory_db_cluster_id, region)
      VALUES ((select id from security_group where group_name = 'default' and region = '${region}'), (select id from memory_db_cluster where cluster_name = '${clusterName}'), '${region}');
    `),
  );

  it('applies the change', commit());

  it(
    'checks the memory db cluster was added',
    query(
      `
    SELECT *
    FROM memory_db_cluster
    WHERE cluster_name = '${clusterName}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it('should fail updating only the memory db cluster without updating the subnet group', done =>
    void query(`
  UPDATE memory_db_cluster
  SET region = '${nonDefaultRegion}'
  WHERE cluster_name = '${clusterName}';
`)((e?: any) => {
      console.log({ e });
      try {
        expect(e?.message).toContain('violates foreign key constraint');
      } catch (err) {
        done(err);
        return {};
      }
      done();
      return {};
    }));

  it('should fail updating security group region being referenced by the memory db cluster', done =>
    void query(`
    UPDATE security_group
    SET region = '${nonDefaultRegion}'
    WHERE group_name = 'default' and region = '${region}';
  `)((e?: any) => {
      console.log({ e });
      try {
        expect(e?.message).toContain('violates foreign key constraint');
      } catch (err) {
        done(err);
        return {};
      }
      done();
      return {};
    }));

  it(
    'changes the region',
    query(`
    WITH updated_subnet_group AS (
      UPDATE subnet_group
      SET region = '${nonDefaultRegion}', subnets = ARRAY(SELECT subnet_id FROM subnet INNER JOIN vpc ON vpc.id = subnet.vpc_id WHERE subnet.region = '${nonDefaultRegion}' AND vpc.is_default = TRUE LIMIT 2)
      WHERE subnet_group_name = '${subnetGroupName}'
    ), updated_memory_db_cluster_security_groups AS (
      UPDATE memory_db_cluster_security_groups
      SET security_group_id = (select id from security_group where group_name = 'default' and region = '${nonDefaultRegion}'), region = '${nonDefaultRegion}'
      WHERE memory_db_cluster_id = (select id from memory_db_cluster where cluster_name = '${clusterName}')
    ) 
    UPDATE memory_db_cluster
    SET region = '${nonDefaultRegion}'
    WHERE cluster_name = '${clusterName}';
  `),
  );

  it('applies the change', commit());

  it(
    'check memory db subnet group changed region',
    query(
      `
    SELECT *
    FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}' and region = '${region}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check memory db subnet group changed region',
    query(
      `
    SELECT *
    FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it(
    'check memory db cluster changed region',
    query(
      `
    SELECT *
    FROM memory_db_cluster
    WHERE cluster_name = '${clusterName}' and region = '${region}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check memory db cluster changed region',
    query(
      `
    SELECT *
    FROM memory_db_cluster
    WHERE cluster_name = '${clusterName}' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it(
    'removes the memory db cluster',
    query(`
    DELETE FROM memory_db_cluster
    WHERE cluster_name = '${clusterName}';
  `),
  );

  it(
    'checks the remaining memory db cluster count',
    query(
      `
    SELECT *
    FROM memory_db_cluster
    WHERE cluster_name = '${clusterName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it('applies the change', commit());

  it(
    'checks the remaining memory db cluster count again',
    query(
      `
    SELECT *
    FROM memory_db_cluster
    WHERE cluster_name = '${clusterName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check subnet group count after uninstall',
    query(
      `
    SELECT *
    FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it(
    'removes the subnet group',
    query(`
    DELETE FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}';
  `),
  );

  it(
    'checks the remaining subnet group count',
    query(
      `
    SELECT *
    FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it('applies the change', commit());

  it(
    'checks the remaining subnet group count again',
    query(
      `
    SELECT *
    FROM subnet_group
    WHERE subnet_group_name = '${subnetGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it('deletes the test db', done => void iasql.disconnect(dbAlias, 'not-needed').then(...finish(done)));
});
