import * as iasql from '../../src/services/iasql';
import {
  getPrefix,
  runQuery,
  runApply,
  finish,
  execComposeUp,
  execComposeDown,
  runSync,
  runInstall,
  runUninstall,
} from '../helpers';

const prefix = getPrefix();
const dbAlias = 'cwtest';
const logGroupName = `${prefix}lgtest`;
const apply = runApply.bind(null, dbAlias);
const sync = runSync.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);
const install = runInstall.bind(null, dbAlias);
const uninstall = runUninstall.bind(null, dbAlias);

const modules = ['aws_cloudwatch'];
jest.setTimeout(240000);
beforeAll(async () => await execComposeUp());
afterAll(async () => await execComposeDown());

describe('AwsCloudwatch Integration Testing', () => {
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

  it('syncs the regions', sync());

  it(
    'sets the default region',
    query(`
    UPDATE aws_regions SET is_default = TRUE WHERE region = '${process.env.AWS_REGION}';
  `),
  );

  it('installs the cloudwatch module', install(modules));

  it(
    'adds a new log group',
    query(`
    INSERT INTO log_group (log_group_name)
    VALUES ('${logGroupName}');
  `),
  );

  it('sync before apply', sync());

  it(
    'check no new log group',
    query(
      `
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'adds a new log group',
    query(`
    INSERT INTO log_group (log_group_name)
    VALUES ('${logGroupName}');
  `),
  );

  it(
    'check adds a new log group',
    query(
      `
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it('applies the log group change', apply());

  it('uninstalls the cloudwatch module', uninstall(modules));

  it('installs the cloudwatch module', install(modules));

  it(
    'tries to update a log group autogenerated field',
    query(`
    UPDATE log_group SET log_group_arn = '${logGroupName}2' WHERE log_group_name = '${logGroupName}';
  `),
  );

  it('applies the log group change which will undo the change', apply());

  it(
    'deletes the log group',
    query(`
    DELETE FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `),
  );

  it('applies the log group change (last time)', apply());

  it(
    'check deletes the log group',
    query(
      `
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'creates a log group in default region',
    query(`
    INSERT INTO log_group (log_group_name)
    VALUES ('${logGroupName}');
  `),
  );

  it(
    'also creates a log group in non-default region with the same name',
    query(`
    INSERT INTO log_group (log_group_name, region)
    VALUES (
        '${logGroupName}', (SELECT region FROM aws_regions WHERE is_default = false and is_enabled = true LIMIT 1)
    );
  `),
  );

  it('applies creation of two log groups with the same name, but different regions', apply());

  it(
    'ARNs and regions for the two log groups with the same name should be different',
    query(
      `
    SELECT *
    FROM log_group;
  `,
      (res: any) => {
        // two log groups
        expect(res.length).toBe(2);
        // have non-empty ARNs (came from the cloud)
        expect(res[0].log_group_arn !== '');
        expect(res[1].log_group_arn !== '');
        // their ARNs are not equal
        expect(res[0].log_group_arn !== res[1].log_group_arn).toBe(true);
        // but they have the same name (AWS does not allow duplicate name for log groups in a region)
        expect(res[0].log_group_name === res[1].log_group_name).toBe(true);
      },
    ),
  );

  it(
    'deletes the log group from the non-default region',
    query(`
    DELETE FROM log_group
    WHERE log_group_name = '${logGroupName}' AND region != default_aws_region();
  `),
  );

  it('syncs the state with the cloud to make sure it gets the resource from non-default region', sync());

  it(
    'checks if the log group from the non-default region is back',
    query(
      `
    SELECT * FROM log_group
    WHERE log_group_name = '${logGroupName}' AND region != default_aws_region();
  `,
      (res: any) => expect(res.length).toBe(1),
    ),
  );

  it(
    'deletes the log group from the non-default region, this time for real',
    query(`
    DELETE FROM log_group
    WHERE log_group_name = '${logGroupName}' AND region != default_aws_region();
  `),
  );

  it('applies the deletion of the log group from the non-default region', apply());

  it('syncs the state with the cloud', sync());

  it(
    'checks if the log group in the default region is still there',
    query(
      `
    SELECT * FROM log_group
    WHERE log_group_name = '${logGroupName}' AND region = default_aws_region();
  `,
      (res: any) => expect(res.length).toBe(1),
    ),
  );

  it(
    'checks if the log group in the non-default region is gone',
    query(
      `
    SELECT * FROM log_group
    WHERE log_group_name = '${logGroupName}' AND region != default_aws_region();
  `,
      (res: any) => expect(res.length).toBe(0),
    ),
  );

  it(
    'deletes the log group in the default region',
    query(`
    DELETE FROM log_group
    WHERE log_group_name = '${logGroupName}' AND region = default_aws_region();
  `),
  );

  it('applies deletion of the log group in the default region', apply());

  it(
    'checks the deletion of all of the log groups',
    query(
      `
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'creates a log group to be moved to another region',
    query(`
    INSERT INTO log_group (log_group_name, region)
    VALUES ('${logGroupName}', 'us-east-1');
  `),
  );

  it('applies creation of the log group to be moved', apply());

  it(
    'moves the log group to a new region',
    query(`
    UPDATE log_group
    SET region = 'us-east-2'
    WHERE log_group_name = '${logGroupName}';
  `),
  );

  it('applies moving the log group to the new region', apply());

  it('syncs the log groups from the cloud', sync());

  it(
    'checks if the log group has been moved to the new region',
    query(
      `
    SELECT * FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `,
      (res: any) => {
        expect(res[0].region).toBe('us-east-2');
      },
    ),
  );

  it(
    'deletes all the log groups for the last time',
    query(`
    DELETE FROM log_group;
  `),
  );

  it('applies deletion of all records', apply());

  it('deletes the test db', done => void iasql.disconnect(dbAlias, 'not-needed').then(...finish(done)));
});

describe('AwsCloudwatch install/uninstall', () => {
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

  it('syncs the regions', sync());

  it(
    'sets the default region',
    query(`
    UPDATE aws_regions SET is_default = TRUE WHERE region = 'us-east-1';
  `),
  );

  it('installs the cloudwatch module', install(modules));

  it('uninstalls the cloudwatch module', uninstall(modules));

  it('installs all modules', done => void iasql.install([], dbAlias, 'postgres', true).then(...finish(done)));

  it(
    'uninstalls the cloudwatch + codebuild + ecs module',
    uninstall([
      'aws_cloudwatch',
      'aws_codebuild',
      'aws_ecs_fargate',
      'aws_ecs_simplified',
      'aws_codepipeline',
    ]),
  );

  it('installs the cloudwatch module', install(modules));

  it('deletes the test db', done => void iasql.disconnect(dbAlias, 'not-needed').then(...finish(done)));
});
