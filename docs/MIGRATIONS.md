# Database migration and deployment upgrade

Flyway owns schema initialization; Hibernate always uses `validate`. Automatic baselining is disabled. No migration drops or truncates a table. Host PostgreSQL defaults to `127.0.0.1:5433`; Compose app-to-database traffic uses `db:5432`.

## Fresh database

Start PostgreSQL, configure credentials, and start Spring. Flyway applies V1 (the original `sensor_data` table and `sensor_data_seq`, increment 50) , V2 (capture and prediction metadata) and V3 (per-sensor sources). Hibernate then validates mappings. Do not set `ddl-auto=create`, `create-drop`, or `update` in production.

## Existing database created by Hibernate

Stop application writes and take a verified backup first (`pg_dump`, without placing passwords on the command line). Inspect the database privately, using its configured credentials:

```sql
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_name IN ('sensor_data', 'flyway_schema_history');
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sensor_data';
SELECT sequencename, increment_by, last_value FROM pg_sequences
WHERE schemaname = 'public' AND sequencename = 'sensor_data_seq';
SELECT count(*), max(id) FROM sensor_data;
```

Only baseline if the schema matches V1: `id bigint` primary key; `ph`, `temperature`, `humidity` non-null double precision; sequence `sensor_data_seq` with increment 50 and no collision with existing IDs. Do not reset the sequence. If actual names/types differ, inspect and prepare an explicit additive migration before continuing. This repository's tests verify the known legacy layout; they do not inspect your production database.

Use an operator-installed Flyway CLI with the PostgreSQL module. Supply `FLYWAY_URL`, `FLYWAY_USER`, `FLYWAY_PASSWORD` through the local environment, not shell history:

```bash
flyway -baselineVersion=1 -baselineDescription='Existing sensor schema reviewed' baseline
```

Then start the updated app. V1 is skipped and V2/V3 add columns while preserving rows and sequence state. **Never baseline an empty database at version 1**: it needs V1 to create the original objects. Do not enable `baseline-on-migrate` globally or use Flyway `clean`.

Legacy measurements retain null `captured_at` and `simulated`, because neither fact can be reconstructed. Their prediction status is `NOT_REQUESTED`. New measurements use the backend reception instant in UTC, not a claimed sensor capture timestamp.

## Capture persistence contract

1. Validate a device reading before persistence.
2. Commit it with status `PENDING` and its reception timestamp.
3. Execute Python outside a database transaction.
4. Commit `SUCCEEDED` plus prediction, or `FAILED` plus a safe error category.

A valid capture whose prediction fails returns HTTP 200 with the saved measurement and explicit `FAILED` status. The dashboard shows partial success. If the initial save fails, return 503 and do not invoke ML. If the final save fails or the process crashes, the first row remains `PENDING`; the request returns an error rather than falsely claiming final persistence. Automatic retry/reclassification of pending rows is not implemented.

Deploy backend and both sketches together: old movement clients lack session/sequence/deadline fields and will be rejected. Old sensor firmware lacks explicit simulation provenance and must be upgraded. Preserve the existing model. Updating the UI requires rebuilding its generated JS/CSS.
