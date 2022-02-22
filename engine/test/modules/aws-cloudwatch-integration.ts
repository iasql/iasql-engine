import * as iasql from '../../src/services/iasql'
import { getPrefix, runQuery, runApply, finish, execComposeUp, execComposeDown, } from '../helpers'

jest.setTimeout(240000);

beforeAll(execComposeUp);

afterAll(execComposeDown);

const prefix = getPrefix();
const dbAlias = 'cwtest';
const apply = runApply.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);

describe('AwsCloudwatch Integration Testing', () => {
  it('creates a new test db', (done) => void iasql.add(
    dbAlias,
    'us-west-2',
    process.env.AWS_ACCESS_KEY_ID ?? 'barf',
    process.env.AWS_SECRET_ACCESS_KEY ?? 'barf',
    'not-needed').then(...finish(done)));

  it('installs the cloudwatch module', (done) => void iasql.install(
    ['aws_cloudwatch@0.0.1'],
    dbAlias,
    'not-needed').then(...finish(done)));

  it('adds a new log group', query(`
    INSERT INTO log_group (log_group_name)
    VALUES ('${prefix}lgtest');
  `));

  it('applies the log group change', apply);


  it('tries to update a log group autogenerated field', query(`
    UPDATE log_group SET log_group_arn = '${prefix}lgtest2' WHERE log_group_name = '${prefix}lgtest';
  `));

  it('applies the log group change which will undo the change', apply);

  it('deletes the log group', query(`
    DELETE FROM log_group
    WHERE log_group_name = '${prefix}lgtest';
  `));

  it('applies the log group change (last time)', apply);

  it('deletes the test db', (done) => void iasql
    .remove(dbAlias, 'not-needed')
    .then(...finish(done)));
});
