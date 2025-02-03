# 006 - Deleting blocked resources asynchronously

## Current Status

### Proposed

2022-11-22

### Accepted

2022-11-11

#### Approvers

- Luis Fernando De Pombo <luisfer@iasql.com>
- Alejandro Guillen <alejandro@iasql.com>
- Yolanda Robla <yolanda@iasql.com>
- Mohammad Pabandi <mohammad@iasql.com>

### Implementation

- [ ] Implemented: [One or more PRs](https://github.com/iasql/iasql-engine/some-pr-link-here) YYYY-MM-DD
- [ ] Revoked/Superceded by: [RFC ###](./000 - RFC Template.md) YYYY-MM-DD

## Author(s)

- Yolanda Robla <yolanda@iasql.com>

## Summary

When performing deletion of resources, some of them cannot be deleted because they may be locked for some period of time. When a service is deleted, some of their dependencies may be locked for some period of
time - even in the range of 24 hours - until the are totally released and can be removed from the cloud.
This will cause some errors and inconsistencies when managing resources from our engine, and we need to have a way to manage these deletions asynchronously.

## Proposal

We could use the concept of `Garbage collection`, where we can schedule some of those resources for deletion at a certain point of time, and let those be collected regularly by a garbage collector, that will
check if the resource is in a situation to be deleted and perform it.
This can be achieved by using a table to track the resources marked for asynchronously deletion, and a periodicaly process that iterates over this table and triggers the proper deletion. Records of this table will contain:

- module and entity of the resource to be deleted
- mapper for the resource to be deleted
- cloudId for the resource
- expected deletion date
- number of deletion retries

The procedure for deletion could be the following:

1. Try to delete a resource in the regular way, capturing the `DependencyViolation` exception. If that happens, this is a candidate for the async deletion
2. Add an entry on the deletion table, with this resource and initial deletion date of a default time (we can start with minimum period , depending on the frequency where the garbage collector will run)
3. Do not retrigger anymore the deletion, avoiding loops and delays waiting for this resource.

The garbage collector procedure will be executed periodically and do the following:

1. Query for all resources in the table with expected deletion date < current data
2. Identify the module/entity, and the cloud id
3. Trigger a delete for that resource using the mappers
4. If the delete succeeds, remove it from the deletion table
5. If the delete fails, schedule another deletion for the future. We could be using some increasing time (60 minutes, 1 day, etc...). We will also increase the number of deletions.
6. If the resource failed and number of deletions arrived to maximum, delete from this table as well. Additionally we can throw some error/trigger some email to the user informing about this problem, asking to fix manually.

This procedure will also affect the way we sync resources from the database to the cluster: if we have a resource that was removed from the database and failed from the cloud, when we do the sync up we will need to avoid
creating the resources in the database again, by filtering by the deletion table.

### Alternatives Considered

1. Perform retries with some wait period for the affected resources, as the current approach.

**_Pros:_**

We may be able to delete some resources with some specific per-service logic, being more agile and giving better feedback to the user.

**_Cons:_**
This is causing huge wait times for the users, eventually causing the engine to be locked, if the user retries the procedure so many times.

2. Add a `soft delete` column in all entities. A record could be marked for soft deletion and perform the real one after a period of time.

**_Pros:**

This will be a similar approach as the proposed one, but having the field in the table, that could speed up the queries.

**_Cons:_**

Adding columns not relevant to the modules is a problem with user interface and can confuse users.

## Affected Components

- New periodical procedure `garbage-collector` needs to be implemented, potentially implemented with `pg_cron`
- Engine needs to be modified to check entries in the deletion table before syncing to the cloud
- Specific checks needs to be added at service level, to capture these exceptions and react as desired

## Expected Timeline

The initial work could be doable in 3-4 days. Specific logic at service level needs to be handled independently and will take extra 2-3 days.
