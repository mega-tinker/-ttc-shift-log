TTC Shift Log v19.1 - optional Holiday assignment

Choose Holiday explicitly for an eligible date. Eligibility and holiday dates are
not inferred. This implements the operator-requested categories, not official
payroll entitlement rules.

No work: enter Date, select Holiday, optionally enter holiday name/notes, then
Save holiday pay only. It adds one 8:00 credit at 1x without a fake shift.
Work: select Holiday and enter each real piece as usual. Save Shift or Save &
Next Piece saves the credit and work. Holiday work uses Overtime Work = Yes,
the existing 1.5x category. Multiple pieces share one credit per entered date.
Late OT remains separate, including the existing daily 10-minute threshold.

Weekly Platform Regular <=8 includes the 8:00 holiday credit. The credit does
not cause platform overtime above 8. A separate explanation shows credited hours.
The Paid / scheduled-hours figure continues to mean actual scheduled work only.
History has holiday credits and linked work cards; the assignment filter includes
Holiday. Holiday Work Summary shows all-time credit and work hours separately.
Removing a holiday credit does not delete work or change its saved 1.5x category.
Existing pieces on a date are not automatically converted to Holiday; edit each
piece explicitly if it should be treated as holiday work.

DATA COMPATIBILITY
Existing ttcShiftRecordsV4 records, field types and core.js are unchanged.
Optional holidays and holidayLinks arrays extend ttcShiftRecordsV4SpareboardV1.
Each credit is {date, minutes:480, notes}; each work link is {id, date}.
No automatic migration or rewriting of existing records happens on startup.
Legacy and version-2 backups remain importable. Holiday JSON backups use schema
version 3 to prevent older apps from silently dropping holiday information.
CSV is shift-only and is not a full holiday/day-details backup.

ROLLBACK
backup/v19.0.1-before-holiday preserves commit
867c8bb117f6b99c0389387367734ebe1c8861a5.
Export a fresh full JSON backup before rollback. Revert code only, with a fresh
service-worker cache version. Never clear website data or import an old data
backup just to revert the app: it could discard newer entries.
Older code can read actual work pieces (Holiday work remains Overtime Work Yes),
but does not show holiday credits. Preserve metadata and the full v3 backup for
returning to v19.1. Version-3 backups require v19.1 or later.
