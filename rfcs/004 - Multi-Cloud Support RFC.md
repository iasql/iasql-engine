# 004 - Multi-Cloud Support RFC

## Current Status

### Proposed

2022-09-15

### Accepted

YYYY-MM-DD

#### Approvers

- Luis Fernando de Pombo <luisfer@iasql.com>
- Alejandro Guillen <alejandro@iasql.com>
- Yolanda Robla <yolanda@iasql.com>

### Implementation

- [ ] Implemented: [One or more PRs](https://github.com/iasql/iasql-engine/some-pr-link-here) YYYY-MM-DD
- [ ] Revoked/Superceded by: [RFC ###](./000 - RFC Template.md) YYYY-MM-DD

## Author(s)

- David Ellis <david@iasql.com>

## Summary

Before we hit `v0.1` we want to make sure that supporting cloud providers other than AWS will not require any significant refactoring that may produce user-visible UX changes. So this RFC walks through several options for how to handle multiple cloud providers (and will be edited to select one of the options as our preferred path forward), but actual work on this front will begin post-v0.1.

## Proposal

None selected yet.

### Alternatives Considered

Currently all modules in IaSQL are "equal" though some are a more equal than others (oink, oink). The `iasql_platform`, `iasql_functions`, and `aws_account` modules are given special treatment by the engine.

All modules excepting `iasql_platform` *must* depend on `iasql_platform`, and it sets up the tables necessary for IaSQL's acyclic directed graph migration system and is automatically installed on a `/v1/db/connect` REST call to the `iasql-engine`.

`iasql_functions` provides the Postgresql functions for manipulating the data in the `iasql_platform` and performing database-wide operations, such as `iasql_apply`, `iasql_sync`, and `iasql_upgrade`. No other modules should need to depend on this module, but the user cannot do anything meaningful to an IaSQL database without it.

`aws_account` is the only module where records deleted from it can't be fully restored via an `iasql_sync` call, as it contains user-provided information on the configuration and access of their AWS account. All of the various AWS modules depend on this module, as it provides them with the `getAwsClient` context method to actually perform AWS operations with, utilizing the data housed in its tables.

Nothing can be done about the "special-ness" of the `iasql_*` modules, but the `aws_account` specialness needs to be addressed to allow us to add similar such modules like `azure_account`, `heroku_account`, etc.

#### Providers

While `iasql_platform` is the "true root" of the module system tree, `aws_account` is the "effective root" for all other modules currently in the module system. One solution is to simply "promote" `aws_account` into its own category of "providers" that have different behaviors. While still participating in the tree, they would not be installable through the normal `iasql_install` approach, because of the extra information they need that is currently hackily added as part of the initialization process.

They could be installed and removed through new functions, such as `iasql_add_provider(provider_name, optional_provider_arg_1, optional_provider_arg_2, ...)` and `iasql_remove_provider(provider_name)`, where the special-cased configuration is passed in up front, and special `initProvider`, `destructProvider` methods are called on them. For upgrading needs there would also need to be a method `getInitArgs` so the `iasql_upgrade` logic can extract the current metadata and provide it to the next version.

There would be similar tooling for metadata around these providers, such as `iasql_list_providers()` that returns a listing of providers and instructions (likely some JSON metadata) on what args are necessary and how to populate them, and perhaps some visual metadata like an icon to represent them, etc. These would be pulled from the new interface standard for providers.

If the providers only store the configuration data users have chosen for their account, it would be clearer for them to be separated from any actual cloud manipulation. Therefore the current dual-purpose behavior of `aws_account` would be split, with the `aws_regions` table given to a new module (likely named `aws_regions`) that most other AWS modules (but not all) would depend upon.

#### Provider-Modules

Rather than creating a separate class of "providers" that are similar to but not quite the same as modules, the Provider-Module concept instead adds the capabilities of a provider to all modules, but makes them optional. A module can choose to also implement the provider interface and then be a provider, as well.

Installation of these provider-modules would fail if installed in the classic `iasql_install(module_name)` still, because extra installation arguments are necessary, but a new `iasql_install` function that takes a variadic number of string arrays, such that it would be called as `iasql_install([provider_like_module_name, optional_arg_1, optional_arg_2, ...], [regular_module_name], ...)` should minimally impact installation needs.

The `iasql_list_providers()` function would still be necessary for better integration purposes, as well as for users to know ahead-of-time which modules will fail in the "short" install syntax, but that is the only new function required in this form.

The provider-modules, being standard modules *plus* more, would be able to blur the line between module and configuration and `aws_account` would be able to retain its `aws_regions` table.

#### DB-Only Source Tables

A module-level distinction adds limits to what can be done here, and forces a focus on cloud-account-configuration. Sometimes there is information that is relevant for utilization of the cloud APIs that has no source from the cloud APIs themselves. Usually that is access credentials, but there is no reason why that has to be the only such data.

The Mappers in the modules have the concept of a `source` that is usually `db`, but can sometimes be switched to `cloud` to indicate that the underlying table should be treated as read-only for the users. Adding a new `dbOnly` type and eliminating the `cloud` CRUD instance from the mapper would make it clear that the table has nothing to do with the cloud APIs directly, but may be used by other tables or context functions or etc.

The column types and table constraints would bound the data in the table, though there may be a hint with a `minRowCount` field for these "mappers" to prevent `iasql_apply`/`iasql_sync` from working if not filled in.

For user clarity, a new column in the `iasql_platform` module's `iasql_tables` table would be added to indicate these tables from the rest, perhaps simply pushing the `source` enum into the database itself, and possibly the `minRowCount`, as well, as a nullable column.

The `iasql_install` logic would consider any module with a `dbOnly` table as a "stop point" because modules that depend on a module with such a table may not install correctly without the data pushed in there. User-friendly integration here would simply be checking the `iasql_tables` table before and after install, and prompting for data to be inserted into these tables, and then continuing on.

For `aws_account` this would be to insert the credentials into the `aws_credentials` table. Whether done as a bare `insert into ...` or a web form is up to the integration.

To make these sorts of things less unexpected, the `iasql_list_installed_modules`/`iasql_list_all_modules` functions would gain an `iasql_list_db_only_modules` function to determine which modules would potentially run into this situation, which a UI can similarly use to handle the install flow of said module differently.

#### Hardcoding "Forever"

Everything listed so far is a lot of effort for essentially one module. While it is true that other modules with the needs of `aws_account` will come in the future, the near-term scope puts that count at only 1-3 in the next 6 months, and the total number of cloud services out there is smaller than the number of modules we have currently implemented for AWS.

Just accepting that there will be special-cased logic for these modules that lives in our UI, in the `/v1/db/connect` REST endpoint, and in the `iasql_upgrade` function may simply be the right choice.

## Expected Semver Impact

Cannot determine this until we have a chosen solution.

## Affected Components

Cannot determine this until we have a chosen solution.

## Expected Timeline

Cannot determine this until we have a chosen solution.
