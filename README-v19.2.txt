TTC Shift Log v19.2 — Spareboard editing and recovery

History: each Spareboard day now has an Edit button visible even when collapsed.
Edit loads the existing shared day information. Update Spareboard Day saves it;
Cancel Edit returns to History, asking before discarding changes.

Delete Spareboard Day is available inside the day editor only.
For a day with linked pieces, choose either details only (keeps every shift and
pay setting) or the day plus its linked pieces. Confirmation lists affected work.
Regular and Holiday entries on the date are not deleted. If work is deleted,
late-OT classification is recalculated only for the affected date.

Backup > Recover deleted Spareboard days restores the day and any pieces removed
with it. Recovery survives closing the app. Conflicting current records are never
overwritten. Recovery items are local; restore wanted items before exporting a
normal full JSON backup. Multiple deleted days can be recovered.

No existing shift or metadata migration runs on launch. Existing storage keys,
record fields, pay formulas and JSON import formats are preserved. New recovery
items use ttcShiftRecordsV4SpareboardV1DeletedDaysV1. Recovery is saved before
deletion; a failed storage write blocks deletion.

Rollback source: backup/v19.1.1-before-spareboard-edit, commit
706aff9e4b30e0ffce0eeb8ab24f23fb60ac6286. Rollback changes app code, not user data.
Export a current full JSON backup before updating or rolling back.
Do not clear website data or uninstall the app to update.

Verified with simulated DOM workflows: edit/cancel, both deletion scopes,
reload recovery, stale-editor refusal, full-storage refusal, old records,
Spareboard and Holiday regression checks. Physical iPhone rendering not verified.
