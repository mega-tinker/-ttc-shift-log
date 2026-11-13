# TTC Shift Log v19.2.2

Version advances from 19.2.1 to 19.2.2. The previously tested IndexedDB preview was labelled 19.3.0; that preview label is not the production release number.

## Existing users

Open the existing app while online to receive the update. Close all open app windows/tabs and reopen while online to let the new offline version activate. Keep the existing installation and website data; uninstalling or clearing site data is not required.

The first v19.2.2 startup automatically copies the existing shift history, embedded photos, Spareboard/holiday information, drafts, deleted-item recovery and local recovery copies into IndexedDB. There is no production prompt offering an empty database. Migration validates active records and metadata, verifies photo roundtrips, commits atomically, and compares the hydrated result with the source. An interrupted or failed migration preserves the original data and can retry. The existing localStorage copy is retained as a recovery safeguard; subsequent saves and edits use IndexedDB, not the limited localStorage store.

Payroll calculations in core.js are unchanged. JSON import/export remains compatible with prior backups. Merging a backup containing existing matching records adds no duplicates. Exporting a full JSON backup remains available and recommended; no private backup is uploaded by this release.

## Storage and failure behavior

The database name includes the app's directory, separating the original site from the test site. Records and all related metadata commit in one transaction. Content-addressed binary photo blobs are shared by current entries, drafts and recovery snapshots. Stale-tab writes and queued writes following a failed save are rejected. A save failure leaves the unfinished form on screen. There is no write fallback to localStorage. Unreferenced photo blobs and legacy data are retained; no automatic cleanup is introduced.

The service worker caches a consistent set of 19.2.2 files, handles only its own scope and does not delete old caches. It waits for existing windows to close before activation. Available device storage still limits IndexedDB; this release removes the old localStorage bottleneck, not all possible storage exhaustion.

## Validation

Automated release checks: eight migration/integration groups, camera/history/holiday/Spareboard regression suites, actual browser IndexedDB and offline save/edit/reload, and an upgrade from the actual v19.2.1 app and service worker. The upgrade check uses a phone-size Android browser profile, 79 synthetic old records, two embedded photos and a holiday credit; it verifies byte-identical migration, unchanged legacy values, offline restart and saving an additional record alongside the full history. These are synthetic records, not the user's private backup.

The user separately confirmed the preceding storage preview on an installed iPhone app: offline use, offline editing and persistence, photo persistence, JSON export/import merge, and delete/undo with the note and photo retained. Physical Android behavior was not confirmed; browser emulation is not a claim of physical-device testing. No further user testing is required for the authorized deployment.

## Review and rollback

Manual review covers every storage mutation, awaited success path, legacy migration, asset versions, namespaces, atomic abort behavior, backward-compatible backups and unchanged calculations. External CodeRabbit approval is only established if an actual review is returned on the release PR.

Pre-release production commit: a34de8c8f00f4eb5be17f482cb25e21d03b44ec5. Before any rollback, export the current IndexedDB history as full JSON. The untouched legacy copy contains the pre-migration history, not later edits. Reverting code alone would display that older copy; later records must be restored from the exported compatible JSON. Keep both stores and caches when rolling back. Do not clear website data.
