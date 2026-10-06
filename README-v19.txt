TTC Shift Log v19.0 - Spareboard logging

Regular is the default. Existing shift fields and calculation rules are unchanged.
Spareboard adds shared day details, report/wait/travel periods and operator-entered
guarantee notes. It does not calculate Spareboard pay or guarantee entitlement.
Use Save & Next Piece for additional routes/buses on the same work date.
Use Save day details only for a report-only day; it does not save a work piece.
Dates on duty periods are explicit. Recorded waiting is not added to platform or OT.

Storage: existing ttcShiftRecordsV4 array is retained without adding day records.
Optional metadata is in ttcShiftRecordsV4SpareboardV1 and included in JSON backups.
No old entries are automatically labelled or migrated. No records upload to GitHub.
Version-2 backups include metadata; this app also imports legacy/version-1 backups.
CSV remains the legacy shift-only report. Use JSON for complete Spareboard backups.

ROLLBACK
The pre-change source is on backup/v18.4-before-spareboard at commit
cfe554654c52b580ae2fc61753d0590c9bc6f523. A v18.4 ZIP was also provided.
Before any rollback, export a fresh version-2 JSON backup including new entries.
Revert app code only; retain both local-storage keys. v18.4 can read the unchanged
shift array, but does not display or export Spareboard metadata. Its ordinary
shift operations do not delete that metadata. Never clear website data/reinstall.
Do not import a version-2 backup into v18.4. Do not restore an older data backup
just to roll back code: it could remove shifts entered after that backup.
Publish rollback with a fresh service-worker cache version to avoid cached v19 files.
Reopening v19 can display preserved metadata again. Back up first either way.

Regulations supplied: STA-XX04.3-00, revised August 8, 2022, all 18 pages.
Eight-hour report provisions and waiting pay have exceptions. This release logs
information; it does not enforce detailing, spread, allowances or guarantee rules.
