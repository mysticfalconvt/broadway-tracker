# Backups and restoring

There is real data in production now — a personal theatre history, and family
accounts alongside it. This is what exists, what does not, and how to prove a
backup is real before it is needed.

## Where things stand

| | |
| --- | --- |
| Postgres dumps | Scheduled by Coolify |
| Where they live | **The same host as the database** |
| Off-host copy | **None** |
| Restore ever tested | Use `scripts/verify-restore.mjs`, below |
| RustFS / S3 objects | Not covered by the Postgres schedule at all |

The gap that matters is the second and third rows together. A scheduled dump on
the same disk as the database protects against a bad migration, a mistaken
`DELETE`, or a corrupted table. It protects against none of the things that
take a host with it: a failed volume, a deleted VM, a ransomware event, or a
provider account problem. Those are the cases people actually keep backups for.

## Proving a dump restores

A backup nobody has restored is a hope. The check below turns one into the
other, and takes a few minutes.

1. **Take or fetch a dump.** From the Postgres container on the host:

   ```sh
   docker exec -t <postgres-container> \
     pg_dump -U <user> -d <database> -Fc > broadway-$(date +%F).dump
   ```

2. **Restore it into a scratch database** — never over the live one:

   ```sh
   docker exec -i <postgres-container> createdb -U <user> broadway_restore_check
   docker exec -i <postgres-container> \
     pg_restore -U <user> -d broadway_restore_check < broadway-$(date +%F).dump
   ```

3. **Check what came back:**

   ```sh
   node scripts/verify-restore.mjs postgres://<user>@<host>/broadway_restore_check
   ```

   It reports every table the migrations create against what the copy actually
   has, how many migrations were applied, a row count per table, and the age of
   the newest recorded night — which is how much would be lost if this copy were
   the one you restored from. It exits non-zero if anything is wrong, so it can
   run unattended on a schedule.

   It refuses to run against `DATABASE_URL`: a green result against production
   proves nothing about a backup and would be actively misleading.

4. **Drop the scratch database** when you are done.

The verifier reads the expected tables out of `src/server/db/migrations/*.sql`
rather than a list kept alongside it, so it cannot drift from the schema.

### What a bad copy looks like

The dangerous failure is not a corrupt dump — that announces itself. It is a
structurally perfect restore of an empty database, which looks like success:

```
  ✓ all 19 tables present
  ✓ 14 of 14 migrations applied
  ✗ empty: shows, outings — this is a valid schema with nothing in it,
    not a restore of a live database
```

## Photographs are not in the Postgres backup

Contributed images live in RustFS/S3, and the database stores only their object
keys. A Postgres restore therefore brings back every reference and none of the
pictures: show pages would render, and every contributed photograph would be a
broken key.

The bucket needs its own copy, on the same schedule as the database and ideally
to the same off-host destination. Until that exists, treat contributed
photographs as **not backed up**, and say so before inviting people to upload
family photographs they have nowhere else.

Object storage restores are also not point-in-time the way a dump is: an object
deleted from the bucket is gone from any mirror that has since synchronised,
unless versioning or a retention window is switched on at the bucket.

## What is left to do

- [ ] Copy Postgres dumps off the host — another machine, or object storage in a
      different account or region. This is the single largest remaining risk.
- [ ] Run the restore check above at least once, and record the date here.
- [ ] Back up the RustFS bucket, or decide in the open that contributed
      photographs are expendable and tell members so.
- [ ] Consider bucket versioning, so a deletion is recoverable rather than
      propagated to every copy.
