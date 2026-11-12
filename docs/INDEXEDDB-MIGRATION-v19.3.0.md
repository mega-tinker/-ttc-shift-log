# TTC Shift Log v19.3.0 — IndexedDB migration safety plan

Status: planning only; no production code changed.

## Confirmed baseline
- Production app v19.2.1; development branch feature/v19.3.0-indexeddb-storage.
- app.js uses localStorage key `ttcShiftRecordsV4`, draft/recovery/trash keys, and inline base64 photo data.
- spareboard.js writes shift and spareboard metadata with localStorage transaction journal/recovery copies.
- core.js validates photo objects with data URL strings; payroll logic must not change.
- Backup dated 2026-11-12 was structurally checked: 79 records, 2 embedded JPEGs, 1 holiday credit, 0 spareboard days (user confirms only tested Spareboard). Import/restore has not yet been verified.

## Non-negotiable safety requirements
1. No change to production main or GitHub Pages configuration until approval.
2. Test site must use a different origin, not merely a different path on the production origin.
3. Never delete or overwrite legacy localStorage until migration is verified and a full export is possible.
4. Migration must be restartable and idempotent after interruption, with checks for count, IDs, metadata, and photo bytes.
5. Avoid duplicate full-photo snapshots; use IndexedDB transactions for atomic writes.
6. Preserve legacy backup import/export compatibility and TTC calculations.
7. Do not auto-import the user's real backup into a test origin without explicit action.
8. Include failure/rollback tests, offline PWA tests, and browser quota tests.

## Proposed implementation sequence
1. Add IndexedDB schema and adapter with stores for shift records, photo blobs, and spareboard metadata. Keep existing API behavior at UI boundary.
2. Introduce async startup barrier so UI does not read or write before DB initialization/migration.
3. Migrate legacy localStorage data without deleting it. Validate all records and photo payloads before marking migration complete.
4. Update CRUD, recovery, trash, photo display, and import/export paths to use the adapter. Preserve holiday and Spareboard transaction semantics.
5. Add tests for fresh install, legacy migration, interrupted migration, low quota, edit/delete/undo, JSON roundtrip, holidays, and payroll.
6. Review via CodeRabbit and deploy isolated preview. Only after verified testing propose merge to main.

## Risks to resolve during coding
- Existing UI functions are synchronous; IndexedDB is asynchronous, requiring careful refactor.
- Photos are currently inline data URLs and core validation expects them; use conversion at adapter boundary or update validation with backward compatibility.
- iOS Safari/PWA storage may be evicted; IndexedDB is not unlimited. Backups remain essential.
- Service worker cache/version must be updated alongside assets so old/new JS files are not mixed.
