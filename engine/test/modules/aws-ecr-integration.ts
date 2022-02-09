import * as iasql from '../../src/services/iasql'
import { getPrefix, runQuery, runApply, finish, execComposeUp, execComposeDown, } from '../helpers'

jest.setTimeout(240000);

beforeAll(execComposeUp);

afterAll(execComposeDown);

const prefix = getPrefix();
const dbAlias = 'ecrtest';
const repositoryName = prefix + dbAlias;
const pubRepositoryName = 'public' + prefix + dbAlias;
const policyMock = '{ "Version": "2012-10-17", "Statement": [ { "Sid": "DenyPull", "Effect": "Deny", "Principal": "*", "Action": [ "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer" ] } ]}';
const updatePolicyMock = '{ "Version": "2012-10-17", "Statement": [ { "Sid": "DenyPull", "Effect": "Deny", "Principal": "*", "Action": [ "ecr:BatchGetImage" ] } ]}';
const apply = runApply.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);

describe('ECR Integration Testing', () => {
  it('creates a new test db', (done) => void iasql.add(
    dbAlias,
    'us-west-2',
    process.env.AWS_ACCESS_KEY_ID ?? 'barf',
    process.env.AWS_SECRET_ACCESS_KEY ?? 'barf',
    'not-needed').then(...finish(done)));

  it('installs the ecr module', (done) => void iasql.install(
    ['aws_ecr'],
    dbAlias,
    'not-needed').then(...finish(done)));

  describe('private repository', () => {
    it('adds a new repository', query(`
      INSERT INTO aws_repository (repository_name, scan_on_push, image_tag_mutability)
      VALUES ('${repositoryName}', false, 'MUTABLE');
    `));
  
    it('check aws_repository insertion', query(`
      SELECT *
      FROM aws_repository
      WHERE repository_name = '${repositoryName}';
    `, (res: any[]) => expect(res.length).toBe(1)));

    it('applies adds a new repository', apply);
  
    it('tries to update a repository autogenerated field', query(`
      UPDATE aws_repository SET repository_arn = '${repositoryName}arn' WHERE repository_name = '${repositoryName}';
    `));

    it('applies tries to update a repository autogenerated field', apply);

    it('tries to update a repository field', query(`
      UPDATE aws_repository SET scan_on_push = true WHERE repository_name = '${repositoryName}';
    `));
  
    it('applies tries to update a repository field', apply);
  
    it('adds a new repository policy', query(`
      INSERT INTO aws_repository_policy (repository_id, policy_text)
      SELECT id, '${policyMock}'
      FROM aws_repository
      WHERE repository_name = '${repositoryName}';
    `));
  
    it('applies adds a new repository policy', apply);

    it('check aws_repository_policy insertion', query(`
      SELECT aws_repository_policy.*
      FROM aws_repository_policy
      INNER JOIN aws_repository ON aws_repository.id = aws_repository_policy.repository_id
      WHERE aws_repository.repository_name = '${repositoryName}';
    `, (res: any[]) => expect(res.length).toBe(1)));

    it('tries to update a repository policy autogenerated field', query(`
      UPDATE aws_repository_policy AS arp
      SET registry_id = '${repositoryName}registry'
      FROM aws_repository AS ar
      WHERE ar.repository_name = '${repositoryName}' AND ar.id = arp.repository_id;
    `));

    it('applies tries to update a repository policy autogenerated field', apply);

    it('tries to update a repository field', query(`
      UPDATE aws_repository_policy AS arp
      SET policy_text = '${updatePolicyMock}'
      FROM aws_repository AS ar
      WHERE ar.repository_name = '${repositoryName}' AND ar.id = arp.repository_id;
    `));
  
    it('applies tries to update a repository field', apply);

    it('deletes the repository policy', query(`
      DELETE FROM aws_repository_policy AS arp
      USING aws_repository AS ar
      WHERE ar.repository_name = '${repositoryName}' AND ar.id = arp.repository_id;
    `));

    // it('applies deletes the repository policy', apply);

    it('deletes the repository', query(`
      DELETE FROM aws_repository
      WHERE repository_name = '${repositoryName}';
    `));
  
    // it('applies deletes the repository', apply);
  });

  describe('public repository', () => {
    it('adds a new public repository', query(`
      INSERT INTO aws_public_repository (repository_name)
      VALUES ('${pubRepositoryName}');
    `));
  
    it('check aws_public_repository insertion', query(`
      SELECT *
      FROM aws_public_repository
      WHERE repository_name = '${pubRepositoryName}';
    `, (res: any[]) => expect(res.length).toBe(1)));

    it('applies adds a new public repository', apply);
  
    it('tries to update a public repository autogenerated field', query(`
      UPDATE aws_public_repository SET repository_arn = '${pubRepositoryName}arn' WHERE repository_name = '${pubRepositoryName}';
    `));

    it('applies tries to update a public repository autogenerated field', apply);
  
    it('deletes the public repository', query(`
      DELETE FROM aws_public_repository
      WHERE repository_name = '${pubRepositoryName}';
    `));
  
    // it('applies the log group change (last time)', apply);
  });

  it('deletes the test db', (done) => void iasql
    .remove(dbAlias, 'not-needed')
    .then(...finish(done)));
});
