import * as iasql from '../../src/services/iasql'
import { getPrefix, runQuery, runApply, finish, execComposeUp, execComposeDown, runSync, runInstall, runUninstall } from '../helpers'

const prefix = getPrefix();
const dbAlias = 'cwtest';
const logGroupName = `${prefix}lgtest`
const apply = runApply.bind(null, dbAlias);
const sync = runSync.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);
const install = runInstall.bind(null, dbAlias);
const uninstall = runUninstall.bind(null, dbAlias);

const modules = ['aws_cloudwatch'];
jest.setTimeout(240000);
beforeAll(async () => await execComposeUp());
afterAll(async () => await execComposeDown()));

describe('AwsCloudwatch Integration Testing', () => {
  it('creates a new test db', (done) => void iasql.connect(
    dbAlias,
    'not-needed', 'not-needed').then(...finish(done)));

  it('installs the aws_account module', install(['aws_account']));

  it('inserts aws credentials', query(`
    INSERT INTO aws_account (region, access_key_id, secret_access_key)
    VALUES ('${process.env.AWS_REGION}', '${process.env.AWS_ACCESS_KEY_ID}', '${process.env.AWS_SECRET_ACCESS_KEY}')
  `));

  it('installs the cloudwatch module', install(modules));

  it('adds a new log group', query(`
    INSERT INTO log_group (log_group_name)
    VALUES ('${logGroupName}');
  `));

  it('sync before apply', sync());

  it('check no new log group', query(`
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `, (res: any[]) => expect(res.length).toBe(0)));
  
  it('adds a new log group', query(`
    INSERT INTO log_group (log_group_name)
    VALUES ('${logGroupName}');
  `));

  it('check adds a new log group', query(`
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `, (res: any[]) => expect(res.length).toBe(1)));

  it('applies the log group change', apply());

  it('uninstalls the cloudwatch module', uninstall(modules));

  it('installs the cloudwatch module', install(modules));

  it('tries to update a log group autogenerated field', query(`
    UPDATE log_group SET log_group_arn = '${logGroupName}2' WHERE log_group_name = '${logGroupName}';
  `));

  it('applies the log group change which will undo the change', apply());

  it('deletes the log group', query(`
    DELETE FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `));

  it('applies the log group change (last time)', apply());

  it('check deletes the log group', query(`
    SELECT *
    FROM log_group
    WHERE log_group_name = '${logGroupName}';
  `, (res: any[]) => expect(res.length).toBe(0)));

  it('deletes the test db', (done) => void iasql
    .disconnect(dbAlias, 'not-needed')
    .then(...finish(done)));
});

describe('AwsCloudwatch install/uninstall', () => {
  it('creates a new test db', (done) => void iasql.connect(
    dbAlias,
    'not-needed', 'not-needed').then(...finish(done)));

  it('installs the aws_account module', install(['aws_account']));

  it('inserts aws credentials', query(`
    INSERT INTO aws_account (region, access_key_id, secret_access_key)
    VALUES ('us-east-1', '${process.env.AWS_ACCESS_KEY_ID}', '${process.env.AWS_SECRET_ACCESS_KEY}')
  `));

  it('installs the cloudwatch module', install(modules));

  it('uninstalls the cloudwatch module', uninstall(modules));

  it('installs all modules', (done) => void iasql.install(
    [],
    dbAlias,
    'postgres',
    true).then(...finish(done)));

  it('uninstalls the cloudwatch + ecs module', uninstall(['aws_cloudwatch', 'aws_ecs_fargate']));

  it('installs the cloudwatch module', install(modules));

  it('deletes the test db', (done) => void iasql
    .disconnect(dbAlias, 'not-needed')
    .then(...finish(done)));
});
