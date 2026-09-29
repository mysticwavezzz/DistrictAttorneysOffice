# Railway SQLite backup and restore

The production database is SQLite. Railway volume backups are separate from the application's configuration snapshots; keep both.

## Configure backups

1. In Railway, open the database-owning service and attach a persistent volume mounted at `/data`.
2. Set `DATABASE_URL` to `file:/data/prod.db` and deploy. Do not put the SQLite file on the ephemeral application filesystem.
3. Open the service's **Backups** tab and configure a daily schedule (and longer-retention weekly/monthly schedules if available). Keep enough history to cover the expected detection window. Create a manual backup before database migrations or other high-risk maintenance.
4. Confirm the latest backup timestamp after the next scheduled run. A green application health check does not prove that a backup exists.

## Restore

1. Announce a maintenance window and stop writes by enabling the site's maintenance mode.
2. In Railway, open the volume's **Backups** tab, select the known-good snapshot and choose **Restore**. Railway stages the restored volume; follow its UI to deploy the staged restore. Keep the previous volume/snapshot intact until validation is complete.
3. Verify `DATABASE_URL` still points to `/data/prod.db`, then start the service.
4. Check the admin health page (`/98981/status`), sign in, inspect representative cases, roster, settings, and recent activity, and confirm expected records are present.
5. If validation fails, stop writes and restore the prior volume/snapshot. Do not copy a live SQLite file while the application is writing to it.
6. Disable maintenance mode only after the restored service is verified. Record the restore time and snapshot in the operational log.

Application configuration backups in `/98981` contain `SiteSettings` and `SiteConfiguration` only. They are not a substitute for Railway volume backups, and they do not restore case, user, roster, or notification records.

See Railway's current [volume backup guide](https://docs.railway.com/volumes/backups) and [volume guide](https://docs.railway.com/volumes) for platform-specific UI and retention behavior.
