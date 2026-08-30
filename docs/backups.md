# Backups and restoring

There is real data in production now — a personal theatre history, and family
accounts alongside it. This is what exists, what does not, and how to prove a
backup is real before it is needed.

## Where things stand

| | |
| --- | --- |
| Postgres dumps | Scheduled by Coolify, and copied off-host |
| RustFS / S3 objects | Backed up separately from Postgres |
| Restore ever tested | The one thing still outstanding — see below |

Both stores are covered, and the copies leave the machine, which is what makes
them backups rather than snapshots. The specifics — destination, schedule, and
retention — live in the Coolify configuration rather than being restated here,
where they would go stale.

What is not settled is whether any of it restores. That is not pedantry: a
backup nobody has restored is a hope, and the usual way to discover otherwise
is during the emergency.

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

## Photographs are backed up separately, and restore differently

Contributed images live in RustFS/S3 and the database stores only their object
keys, so the two backups are only useful together: a Postgres restore alone
brings back every reference and none of the pictures, and a bucket restore alone
brings back files nothing points at. **Restore both, from around the same
moment.** A database from Tuesday against a bucket from Friday leaves keys with
no object behind them.

Object storage also does not restore point-in-time the way a dump does. An
object deleted from the bucket is gone from any mirror that has since
synchronised, unless versioning or a retention window is switched on at the
bucket itself — worth checking, because it is the difference between a backup
and a copy of the current state.

## What is left to do

- [ ] Run the restore check above at least once, against a real dump, and record
      the date here. This is the only outstanding item, and it is the one that
      turns a backup from a hope into a backup.
- [ ] Confirm bucket versioning or a retention window is on, so a deleted object
      is recoverable rather than propagated to every copy.
