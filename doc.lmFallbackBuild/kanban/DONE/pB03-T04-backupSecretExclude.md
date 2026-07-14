# pB03-T04 — backupSecretExclude

**Part:** B, **Phase:** 3. **Implements:** lmfPlan.md observation (~line 29: backup.ts exports whole settings table → key leak), Phase 3 (~line 264), risk row "Old backups already contain openrouter_api_key".

## Description
Fix **`src/lib/db/backup.ts`** (currently exports the whole `settings` table ~line 18) so secrets can never enter or re-enter the DB via backup:
- Define a `SECRET_SETTING_KEYS` denylist (at minimum `openrouter_api_key`, plus any `lmf.key.*` pattern if ever present, and any future secret setting keys).
- **Export**: filter settings rows through the denylist so no secret is written to the backup JSON.
- **Restore**: also strip denylisted keys on import — old or maliciously-crafted backups must not reintroduce a key into live settings.

**Test file:** `tests/lib/db.test.ts` (or a new `tests/lib/backup.test.ts`) — export omits secret keys; restore of a backup containing `openrouter_api_key` drops it; non-secret settings round-trip intact.

## Dependencies
None (independent of keystore/profile).

## Acceptance criteria
- Typecheck clean; backup tests pass both directions.
- Exported backup JSON contains no secret setting keys.
- Restoring a crafted backup with a secret key does not write it to settings.

## Implementation Notes
`src/lib/db/backup.ts`:
- Added `SECRET_SETTING_KEYS` (exact-match denylist, currently `['openrouter_api_key']`) and `SECRET_SETTING_KEY_PREFIXES` (prefix denylist, currently `['lmf.key.']`) plus an `isSecretSettingKey()` helper. Checked: the keystore work (`pB03-T02-keyStoreImpl`, not yet merged) stores provider keys in expo-secure-store/localStorage, not in the `settings` table, so no `lmf.key.*` rows exist there today — the prefix entry is a forward guard in case that convention is ever reused for a settings-table key, per the card's extensibility ask.
- `stripSecretSettings(rows)` filters an array of settings rows by `isSecretSettingKey(row.key)`, tolerant of malformed rows.
- **Export** (`buildBackup`): after reading the `settings` table, rows are passed through `stripSecretSettings` before being placed in the returned `BackupFile` (and thus before JSON serialization in `exportBackupToFile`).
- **Restore** (`restoreBackup`): the `settings` rows read from the incoming `BackupFile` are passed through `stripSecretSettings` before the insert loop, so a crafted/old backup containing `openrouter_api_key` (or an `lmf.key.*` row) never reaches the `INSERT INTO settings` statement. All other tables are untouched.
- No changes to `BACKUP_TABLES`, table ordering, or non-settings logic.

## Test Plan
New file `tests/lib/backup.test.ts` (mocks `expo-sqlite` the same way `tests/lib/db.test.ts` does):
- `buildBackup`: given `settings` rows containing `openrouter_api_key`, `lmf.key.openrouter`, and `body_type`, asserts the exported backup's `tables.settings` excludes both secret keys and retains `body_type`.
- `restoreBackup`: given a crafted `BackupFile` whose `settings` table includes `openrouter_api_key` alongside `body_type`, asserts the `INSERT INTO settings` calls never carry `openrouter_api_key` as a value while `body_type` is inserted.
- `restoreBackup`: a backup with only a non-secret setting (`body_type: 'male'`) round-trips via an exact `INSERT INTO settings` call assertion (mirrors the `upsertSetting` assertion style in `tests/lib/db.test.ts`).

## Test Results
QA-verified independently (2026-07-13).

- `npx tsc --noEmit -p .` — clean except the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` Node/Buffer type errors (unrelated, pre-existing, confirmed present before this change too).
- `npx jest tests/lib/backup.test.ts` — 3/3 passed (`buildBackup` omits secret keys; `restoreBackup` drops a crafted `openrouter_api_key` row from the actual `INSERT INTO settings` calls while still inserting `body_type`; non-secret settings round-trip via an exact `INSERT INTO settings` call assertion).
- `git diff --stat -- src/lib/db/backup.ts tests/lib/backup.test.ts` — scope confirmed limited to these two files (`backup.ts`: 36 insertions/2 deletions; `backup.test.ts`: new file). No other files touched.
- Read `src/lib/db/backup.ts` in full: `SECRET_SETTING_KEYS` (exact, `openrouter_api_key`) and `SECRET_SETTING_KEY_PREFIXES` (`lmf.key.`) denylists, `isSecretSettingKey`/`stripSecretSettings` helpers, and the `stripSecretSettings` filtering in `buildBackup` and `restoreBackup` all match the Implementation Notes exactly. Filtering is scoped to `t === 'settings'` only in both directions — every other table in `BACKUP_TABLES` is unaffected and round-trips normally.
- Read `tests/lib/backup.test.ts` in full: tests are real, not vacuous — the restore test asserts on the mocked db's actual `runAsync` call arguments (no `INSERT INTO settings` call carries `openrouter_api_key` as a value; `body_type` is present), not merely that the function resolves without error.
- Checked `tests/lib/db.test.ts` for existing backup-related tests — none found (`grep` for `backup|Backup` returned no matches), so this new file doesn't duplicate or stale out existing coverage.
- All three acceptance criteria met: typecheck clean, exported backup JSON excludes secret keys, restore of a crafted backup with a secret key does not write it to settings, non-secret settings round-trip.

**Verdict: PASS.**

## Issues Found
None.
