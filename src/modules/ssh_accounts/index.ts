import SSH2Promise from 'ssh2-promise';

import {
  Context,
  Crud,
  MapperBase,
  ModuleBase,
  PartialContext,
  RpcBase,
  RpcInput,
  RpcResponseObject,
} from '../interfaces';
import { SshCredentials } from './entity';

class CredentialsMapper extends MapperBase<SshCredentials> {
  module: SshAccounts;
  entity = SshCredentials;
  equals = (_a: SshCredentials, _b: SshCredentials) => true;
  cloud = new Crud<SshCredentials>({
    create: async (_e: SshCredentials[], _ctx: Context) => {
      /* Do nothing */
    },
    read: (ctx: Context, name?: string) =>
      ctx.orm.find(
        SshCredentials,
        name
          ? {
              where: {
                name,
              },
            }
          : undefined,
      ),
    update: async (_e: SshCredentials[], _ctx: Context) => {
      /* Do nothing */
    },
    delete: async (_e: SshCredentials[], _ctx: Context) => {
      /* Do nothing */
    },
  });

  constructor(module: SshAccounts) {
    super();
    this.module = module;
    super.init();
  }
}

class SshLs extends RpcBase {
  /**
   * @internal
   */
  module: SshAccounts;
  /**
   * @internal
   */
  outputTable = {
    filename: 'varchar',
    longname: 'varchar', // This is stupid, though, see if I can parse this better
    attrs: 'json',
  } as const;
  /**
   * @internal
   */
  inputTable: RpcInput = {
    serverName: 'varchar',
    path: 'varchar',
  };

  call = async (
    _dbId: string,
    _dbUser: string,
    ctx: Context,
    serverName: string,
    path: string,
  ): Promise<RpcResponseObject<typeof this.outputTable>[]> => {
    const sshClient = await ctx.getSshClient(serverName);
    return await sshClient.sftp().readdir(path);
  }

  constructor(module: SshAccounts) {
    super();
    this.module = module;
    super.init();
  }
}

class SshAccounts extends ModuleBase {
  context: PartialContext = {
    // This function is `async function () {` instead of `async () => {` because that enables the
    // `this` keyword within the function based on the object it is being called from, so the
    // `getAwsClient` function can access the correct `orm` object with the appropriate creds and
    // read out the right AWS creds and create an AWS client also attached to the current context,
    // which will be different for different users. The client cache is based on the region chosen,
    // and it assumes that the credentials do not change mid-operation.
    async getSshClient(serverName: string) {
      if (this.sshClients[serverName]) return this.sshClients[serverName];
      const orm = this.orm;
      const creds = await orm.findOne(SshCredentials, {
        where: {
          name: serverName,
        },
      });
      if (!creds) throw new Error('No credentials found');
      this.sshClients[serverName] = new SSH2Promise({
        host: creds.hostname,
        port: creds.port,
        username: creds.username,
        privateKey: creds.privateKey,
        passphrase: creds.keyPassphrase,
      });
      return this.sshClients[serverName];
    },
    sshClients: {}, // Initializing this cache with no clients. The cache doesn't expire explicitly
    // as we simply drop the context at the end of the execution.
    // This function returns the list of regions that are currently enabled, allowing multi-region
    // aware modules to request which regions they should operate on beyond the default region. The
    // full AwsRegions entities may be optionally returned if there is some special logic involving
    // the default region, perhaps, that is desired.
  };
  sshCredentials: CredentialsMapper;
  sshLs: SshLs;

  constructor() {
    super();
    this.sshCredentials = new CredentialsMapper(this);
    this.sshLs = new SshLs(this);
    super.init();
  }
}

export const sshAccounts = new SshAccounts();
