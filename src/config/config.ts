export interface ConfigInterface {
  // Configuration for the http server itself
  http: {
    port: number;
  };
  // Configuration for the postgres database
  db: {
    host: string;
    user: string; // For the server's own user
    password: string; // For the server's own user
    port: number;
    forceSSL: boolean;
  };
  // Configuration for server logging
  logger: {
    debug: boolean; // Whether or not debug logging is enabled (does `logger.debug` do anything)
    test: boolean; // Whether or not a special test logger is enabled (bypass weirdness with Jest)
  }
  // Configuration for auth0 access control
  auth0?: { // Not including this sub-object implies it is not enabled
    domain: string;
    audience: string;
  };
  // Configuration for sentry error reporting
  sentry?: { // Not including this sub-object implies it is not enabled
    dsn: string;
  };
  // Configuration for graphql access
  graphql?: { // Not including this sub-object implies it is not enabled
    withGraphiql: boolean; // Enable web-based GraphiQL UI access
  };
};

export const throwError = (message: string): never => { throw new Error(message); };
