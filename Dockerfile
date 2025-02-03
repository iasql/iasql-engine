# Base run image
FROM node:lts-bullseye-slim AS base

## Install OS Packages
RUN apt update
RUN apt install --no-install-recommends curl jq gnupg ca-certificates -y \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

## Install Postgres
### Update postgresql APT repository [apt.postgresql.org](https://wiki.postgresql.org/wiki/Apt)
RUN ["bash", "-c", "curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg >/dev/null"]
RUN ["bash", "-c", "echo 'deb http://apt.postgresql.org/pub/repos/apt/ bullseye-pgdg main' > /etc/apt/sources.list.d/postgresql.list"]
RUN apt update
RUN apt upgrade -y
RUN apt install --no-install-recommends postgresql-client-14 postgresql-14 -y \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Delete unnecessary cache files
RUN apt clean

#####################################################################################################################################################

# Base build image
FROM base AS build

## Install OS and Postgres Dev Packages
RUN apt update
RUN apt install build-essential git make g++ postgresql-server-dev-14 libcurl4-openssl-dev -y

#####################################################################################################################################################

# pgsql-http and pg_cron
FROM build AS pgsql-stage
WORKDIR /

RUN git clone --branch v1.5.0 --depth 1 https://github.com/pramsey/pgsql-http
RUN cd pgsql-http && make && make install
RUN git clone --branch v1.4.2 --depth 1 https://github.com/citusdata/pg_cron
RUN cd pg_cron && make && make install

#####################################################################################################################################################

# Dashboard
FROM build AS dashboard-stage

WORKDIR /dashboard

## Install stage dependencies
COPY .yarnrc dashboard/package.json dashboard/yarn.lock ./
RUN yarn install --frozen-lockfile

## Copy files
COPY dashboard/.yarnrc dashboard/.eslintrc.json dashboard/next.config.js dashboard/postcss.config.js dashboard/tailwind.config.js dashboard/tsconfig.json dashboard/tslint.json ./
COPY dashboard/public public
COPY dashboard/src src

## Build
RUN yarn build

#####################################################################################################################################################

# Engine
FROM build AS engine-stage

WORKDIR /engine

## Install stage dependencies
COPY .yarnrc package.json yarn.lock ./
RUN yarn install --frozen-lockfile

## Copy files
COPY ormconfig.js tsconfig.json ./
COPY src src

## Build
RUN yarn build

## Prune dev dependencies
RUN yarn install --production

#####################################################################################################################################################

# Main stage
FROM base AS main-stage

## Copy from pgsql-stage
WORKDIR /
COPY --from=pgsql-stage /usr/lib/postgresql /usr/lib/postgresql
COPY --from=pgsql-stage /usr/share/postgresql /usr/share/postgresql

## Copy files
COPY ./src/scripts/postgresql.conf /etc/postgresql/14/main/postgresql.conf
COPY ./src/scripts/pg_hba.conf /etc/postgresql/14/main/pg_hba.conf
COPY docker-entrypoint.sh /engine/docker-entrypoint.sh
COPY src/scripts /engine/src/scripts

## Copy from engine-stage
WORKDIR /engine
COPY --from=engine-stage /engine/node_modules node_modules
COPY --from=engine-stage /engine/package.json ./
COPY --from=engine-stage /engine/dist dist

## Copy from dashboard-stage
WORKDIR /dashboard
COPY --from=dashboard-stage /dashboard/public ./public
COPY --from=dashboard-stage /dashboard/.next/standalone ./
COPY --from=dashboard-stage /dashboard/.next/static ./.next/static

## Default ENVs that can be overwritten
ARG IASQL_ENV=local
ENV IASQL_ENV=$IASQL_ENV
ARG IASQL_TELEMETRY=on
ENV IASQL_TELEMETRY=$IASQL_TELEMETRY
ARG DB_USER=postgres
ENV DB_USER=$DB_USER
ARG DB_PASSWORD=test
ENV DB_PASSWORD=$DB_PASSWORD
ENV AUTOCOMPLETE_ENDPOINT=

## Ports
EXPOSE 5432
EXPOSE 9876

ENTRYPOINT ["/engine/docker-entrypoint.sh"]
