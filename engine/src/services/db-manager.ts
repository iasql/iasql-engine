// Currently just a collection of independent functions for user database management. May eventually
// grow into something more.

import { randomBytes } from 'crypto'
import config from '../config';
import * as fs from 'fs'

import { Connection, } from 'typeorm'

import { IronPlans, } from './gateways/ironplans'

type IPMetadata = { dbId: string, dbUser: string };

// We only want to do this setup once, then we re-use it. First we get the list of files
const migrationFiles = fs
  .readdirSync(`${__dirname}/../migration`)
  .filter(f => !/\.map$/.test(f));
// Then we construct the class names stored within those files (assuming *all* were generated with
// `yarn gen-sql some-name`
const migrationNames = migrationFiles.map(f => {
  const components = f.replace(/\.(js|ts)/, '').split('-');
  const tz = components.shift();
  for (let i = 1; i < components.length; i++) {
    components[i] = components[i].replace(/^([a-z])(.*$)/, (_, p1, p2) => p1.toUpperCase() + p2);
  }
  return [...components, tz].join('');
});
// Then we dynamically `require` the migration files and construct the inner classes
const migrationObjs = migrationFiles
  .map(f => require(`${__dirname}/../migration/${f}`))
  .map((c, i) => c[migrationNames[i]])
  .map(M => new M());
// Finally we use this in this function to execute all of the migrations in order for a provided
// connection, but without the migration management metadata being added, which is actually a plus
// for us.
export async function migrate(conn: Connection) {
  const qr = conn.createQueryRunner();
  await qr.connect();
  for (const m of migrationObjs) {
    await m.up(qr);
  }
  await qr.release();
}

function randomHexValue() {
  return randomBytes(8)
    .toString('hex')
    .toLowerCase()
}

function toUserKey(dbAlias: string) {
  return `user:${dbAlias}`;
}

function toDbKey(dbAlias: string) {
  return `db:${dbAlias}`;
}

function fromDbKey(dbAlias: string) {
  return dbAlias.substr('db:'.length);
}

function isDbKey(dbAlias: string) {
  return dbAlias.startsWith('db:');
}

// returns aliases or an empty array if no auth
export async function getAliases(user: any) {
  if (!config.a0Enabled) return undefined;
  const email = user[`${config.a0Domain}email`];
  const ipUser = await IronPlans.getNewOrExistingUser(email, user.sub);
  const metadata: any = await IronPlans.getTeamMetadata(ipUser.teamId);
  return Object.keys(metadata).filter(isDbKey).map(fromDbKey);
}

// returns db user and generates unique db id or returns default if no auth
export async function setMetadata(dbAlias: string, dbUser: string, user: any): Promise<IPMetadata> {
  if (!config.a0Enabled) return { dbId: dbAlias, dbUser: config.dbUser };
  const email = user[`${config.a0Domain}email`];
  const ipUser = await IronPlans.getNewOrExistingUser(email, user.sub);
  const dbId = `_${randomHexValue()}`;
  const metadata: any = await IronPlans.getTeamMetadata(ipUser.teamId);
  const key = toDbKey(dbAlias);
  if (metadata.hasOwnProperty(key)) {
    throw new Error(`db with alias ${dbAlias} already defined`)
  }
  metadata[key] = dbId;
  const dbUserKey = toUserKey(dbAlias);
  if (metadata.hasOwnProperty(dbUserKey)) {
    throw new Error(`user ${dbUser} already defined`)
  }
  metadata[dbUserKey] = dbUser;
  await IronPlans.setTeamMetadata(ipUser.teamId, metadata);
  return { dbId, dbUser };
}

// returns db metadata or defaults if no auth
export async function getMetadata(dbAlias: string, user: any): Promise<IPMetadata> {
  if (!config.a0Enabled) return { dbId: dbAlias, dbUser: config.dbUser };
  // following the format for this auth0 rule
  // https://manage.auth0.com/dashboard/us/iasql/rules/rul_D2HobGBMtSmwUNQm
  // more context here https://community.auth0.com/t/include-email-in-jwt/39778/4
  const email = user[`${config.a0Domain}email`];
  const ipUser = await IronPlans.getNewOrExistingUser(email, user.sub);
  const metadata: any = await IronPlans.getTeamMetadata(ipUser.teamId);
  console.dir(metadata, {depth:2});
  return { dbId: metadata[toDbKey(dbAlias)], dbUser: metadata[toUserKey(dbAlias)] };
}

// returns deleted db id or db alias if no auth
export async function delMetadata(dbAlias: string, user: any): Promise<IPMetadata> {
  if (!config.a0Enabled) return { dbId: dbAlias, dbUser: config.dbUser };
  const email = user[`${config.a0Domain}email`];
  const ipUser = await IronPlans.getNewOrExistingUser(email, user.sub);
  const metadata: any = await IronPlans.getTeamMetadata(ipUser.teamId);
  const dbId = metadata[toDbKey(dbAlias)];
  const dbUser = metadata[toUserKey(dbAlias)];
  delete metadata[toDbKey(dbAlias)];
  delete metadata[toUserKey(dbAlias)];
  await IronPlans.setTeamMetadata(ipUser.teamId, metadata);
  return { dbId, dbUser };
}
