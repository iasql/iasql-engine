import * as express from 'express'
import jwt from 'express-jwt'
import jwksRsa from 'jwks-rsa'
import { createConnection, } from 'typeorm'

import { AWS, } from '../services/gateways/aws'
import config from '../config'
import { TypeormWrapper, } from '../services/typeorm'
import * as Entities from '../entity'
import * as Mappers from '../mapper'
import { IndexedAWS, } from '../services/indexed-aws'
import { findDiff, } from '../services/diff'
import { Source, } from '../services/source-of-truth'
import { getAwsPrimaryKey, } from '../services/aws-primary-key'
import { lazyLoader, } from '../services/lazy-dep'
import { migrate, populate, newId, getId, delId, getAliases } from '../services/db-manager'

export const db = express.Router();
db.use(express.json());

async function saveEntities(
  orm: TypeormWrapper,
  awsClient: AWS,
  indexes: IndexedAWS,
  mapper: Mappers.EntityMapper,
) {
  const t1 = Date.now();
  const entity = mapper.getEntity();
  const entities = await indexes.toEntityList(mapper, awsClient);
  await orm.save(entity, entities);
  const t2 = Date.now();
  console.log(`${entity.name} stored in ${t2 - t1}ms`);
}

if (config.a0Enabled) {
  const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      jwksUri: `${config.a0Domain}.well-known/jwks.json`,
    }),
    audience: config.a0Audience,
    issuer: config.a0Domain,
    algorithms: ['RS256'],
  });
  db.use(checkJwt);
}

// TODO secure with cors and scope
db.post('/create', async (req, res) => {
  const t1 = Date.now();
  const {dbAlias, awsRegion, awsAccessKeyId, awsSecretAccessKey} = req.body;
  let dbId;
  if (config.a0Enabled) {
    // following the format for this auth0 rule
    // https://manage.auth0.com/dashboard/us/iasql/rules/rul_D2HobGBMtSmwUNQm
    // more context here https://community.auth0.com/t/include-email-in-jwt/39778/4
    const user: any = req.user;
    const email = user[`${config.a0Domain}email`];
    dbId = await newId(dbAlias, email, user.sub);
  } else {
    // just use alias
    dbId = dbAlias;
  }
  let conn1, conn2;
  let orm: TypeormWrapper | undefined;
  try {
    conn1 = await createConnection({
      name: 'base', // If you use multiple connections they must have unique names or typeorm bails
      type: 'postgres',
      username: 'postgres',
      password: 'test',
      host: config.dbHost,
      port: +config.dbPort,
    });
    const resp1 = await conn1.query(`
      CREATE DATABASE "${dbId}";
    `);
    conn2 = await createConnection({
      name: dbId,
      type: 'postgres',
      username: 'postgres',
      password: 'test',
      host: config.dbHost,
      port: +config.dbPort,
      database: dbId,
    });
    await migrate(conn2);
    orm = await TypeormWrapper.createConn(dbId);
    const awsClient = new AWS({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });
    const indexes = new IndexedAWS();
    const t2 = Date.now();
    console.log(`Start populating index after ${t2 - t1}ms`)
    await populate(awsClient, indexes);
    const t3 = Date.now();
    console.log(`Populate indexes in ${t3 - t2}ms`)
    // TODO: Put this somewhere else
    const o: TypeormWrapper = orm;
    console.log(`Populating new db: ${dbId}`);
    const mappers: Mappers.EntityMapper[] = Object.values(Mappers)
      .filter(m => m instanceof Mappers.EntityMapper) as Mappers.EntityMapper[];
    await lazyLoader(mappers.map(m => () => saveEntities(o, awsClient, indexes, m)));
    const t4 = Date.now();
    console.log(`Writing complete in ${t4 - t3}ms`);
    // store credentials
    const region = await orm.findOne(Entities.Region, { where: { name: awsRegion }});
    await orm.query(`
      INSERT INTO aws_credentials VALUES (DEFAULT, '${awsAccessKeyId}', '${awsSecretAccessKey}', '${region.id}');
    `);
    res.end(`created ${dbId} with alias ${dbAlias}: ${JSON.stringify(resp1)}`);
  } catch (e: any) {
    res.status(500).end(`failure to create DB: ${e?.message ?? ''}\n${e?.stack ?? ''}\n${JSON.stringify(e?.metadata ?? [])}\n`);
  } finally {
    await conn1?.close();
    await conn2?.close();
    await orm?.dropConn();
  }
});

db.get('/', async (req, res, next) => {
  const user: any = req.user;
  try {
    const aliases = config.a0Enabled ? await getAliases(user.sub) : [];
    // TODO expose connection string after IaSQL-on-IaSQL
    res.json(aliases);
  } catch(e) {
    next(e);
  }
});

db.get('/delete/:dbAlias', async (req, res) => {
  const user: any = req.user;
  const dbAlias = req.params.dbAlias;
  const dbId = config.a0Enabled ? await getId(dbAlias, user.sub) : dbAlias;
  let conn;
  try {
    conn = await createConnection({
      name: 'base',
      type: 'postgres',
      username: 'postgres',
      password: 'test',
      host: config.dbHost,
      port: +config.dbPort,
    });
    await conn.query(`
      DROP DATABASE ${dbId};
    `);
    if (config.a0Enabled) {
      await delId(dbAlias, user.sub);
    }
    res.end(`delete ${dbId}`);
  } catch (e: any) {
    res.status(500).end(`failure to drop DB: ${e?.message ?? ''}`);
  } finally {
    conn?.close();
  }
});

function colToRow(cols: { [key: string]: any[], }): { [key: string]: any, }[] {
  // Assumes equal length for all arrays
  const keys = Object.keys(cols);
  const out: { [key: string]: any, }[] = [];
  for (let i = 0; i < cols[keys[0]].length; i++) {
    const row: { [key: string]: any, } = {};
    for (const key of keys) {
      row[key] = cols[key][i];
    }
    out.push(row);
  }
  return out;
}

db.get('/check/:dbAlias', async (req, res) => {
  const user: any = req.user;
  const dbAlias = req.params.dbAlias;
  const dbId = config.a0Enabled ? await getId(dbAlias, user.sub) : dbAlias;
  const t1 = Date.now();
  console.log(`Checking ${dbId} with alias ${dbAlias}`);
  let orm: TypeormWrapper | null = null;
  try {
    orm = await TypeormWrapper.createConn(dbId);
    const awsCreds = await orm.findOne(Entities.AWSCredentials);
    const awsClient = new AWS({
      region: awsCreds.region.name,
      credentials: {
        accessKeyId: awsCreds.accessKeyId,
        secretAccessKey: awsCreds.secretAccessKey,
      },
    });
    const indexes = new IndexedAWS();
    const t2 = Date.now();
    console.log(`Setup took ${t2 - t1}ms`);
    let ranFullUpdate = false;
    await populate(awsClient, indexes, Source.DB);
    do {
      ranFullUpdate = false;
      const t3 = Date.now();
      console.log(`AWS record acquisition time: ${t3 - t2}ms`);
      const tables = Object.keys(indexes.get());
      const mappers = tables.map(t => (Mappers as any)[t + 'Mapper']);
      const dbEntities = await Promise.all(tables.map(t => orm?.find((Entities as any)[t])));
      const comparisonKeys = tables.map(t => getAwsPrimaryKey((Entities as any)[t]));
      const t4 = Date.now();
      console.log(`DB Mapping time: ${t4 - t3}ms`);
      let ranUpdate = false;
      do {
        const ta = Date.now();
        ranUpdate = false;
        indexes.flush();
        await populate(awsClient, indexes, Source.DB);
        const awsEntities = await Promise.all(tables.map(t => indexes.toEntityList(
          (Mappers as any)[t + 'Mapper'],
          awsClient,
        )));
        const records = colToRow({
          table: tables,
          mapper: mappers,
          dbEntity: dbEntities,
          awsEntity: awsEntities,
          comparisonKey: comparisonKeys,
        });
        const tb = Date.now();
        console.log(`AWS Mapping time: ${tb - ta}ms`);
        records.forEach(r => {
          r.diff = findDiff(r.table, r.dbEntity, r.awsEntity, r.comparisonKey);
        });
        const t5 = Date.now();
        console.log(`Diff time: ${t5 - tb}ms`);
        const promiseGenerators = records
          .filter(r => ['SecurityGroup', 'Instance', 'RDS', 'Repository', 'RepositoryPolicy', 'TaskDefinition', 'Cluster', 'Service'].includes(r.table)) // TODO: Don't do this
          .map(r => {
            const name = r.table;
            console.log(`Checking ${name}`);
            const outArr = [];
            if (r.diff.entitiesInDbOnly.length > 0) {
              console.log(`${name} has records to create`);
              outArr.push(r.diff.entitiesInDbOnly.map((e: any) => async () => {
                await orm?.save(r.mapper.getEntity(), await r.mapper.createAWS(e, awsClient, indexes));
              }));
            }
            let diffFound = false;
            r.diff.entitiesDiff.forEach((d: any) => {
              const valIsUnchanged = (val: any): boolean => {
                if (val.hasOwnProperty('__type__')) {
                  return val.__type__ === 'unchanged';
                } else if (Array.isArray(val)) {
                  return val.every(v => valIsUnchanged(v));
                } else if (val instanceof Object) {
                  return Object.keys(val).filter(k => k !== 'id').every(v => valIsUnchanged(val[v]));
                } else {
                  return false;
                }
              };
              const unchanged = valIsUnchanged(d);
              if (!unchanged) {
                diffFound = true;
                const entity = r.dbEntity.find((e: any) => e.id === d.id);
                outArr.push(async () => {
                  await r.mapper.updateAWS(entity, awsClient, indexes)
                });
              }
            });
            if (diffFound) console.log(`${name} has records to update`);
            if (r.diff.entitiesInAwsOnly.length > 0) {
              console.log(`${name} has records to delete`);
              outArr.push(r.diff.entitiesInAwsOnly.map((e: any) => async () => {
                await r.mapper.deleteAWS(e, awsClient, indexes);
              }));
            }
            return outArr;
          })
          .flat(9001);
        if (promiseGenerators.length > 0) {
          ranUpdate = true;
          ranFullUpdate = true;
          await lazyLoader(promiseGenerators);
          const t6 = Date.now();
          console.log(`AWS update time: ${t6 - t5}ms`);
        }
      } while (ranUpdate);
    } while (ranFullUpdate);
    const t7 = Date.now();
    res.end(`${dbId} checked and synced, total time: ${t7 - t1}ms`);
  } catch (e: any) {
    console.dir(e, { depth: 6, });
    res.status(500).end(`failure to check DB: ${e?.message ?? ''}`);
  } finally {
    orm?.dropConn();
  }
});
