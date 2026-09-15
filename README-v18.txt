TTC SHIFT LOG v18 — COMPLETE UPDATE

UPDATE YOUR EXISTING GITHUB PAGES APP
1. In your CURRENT app, create a fresh JSON backup. Check that it exists in
   Files. Keep the backup outside the GitHub repository.
2. Unzip this package. Upload the files below into the SAME repository root
   used for your current app, replacing the corresponding files:
     index.html
     styles.css
     app.js
     core.js (NEW — upload this too)
     service-worker.js
     manifest.webmanifest
     icon-192.png
     icon-512.png
     README-v18.txt
   The tests folder and TEST-RESULTS.txt are optional developer references.
   Upload the extracted files, not the ZIP itself. Do not create an extra
   nested app folder. Commit the files together.
3. Wait for GitHub Pages deployment to finish. Open your existing app while
   online. The header should read "Offline personal work record · v18".
   If it still shows the old version, close and reopen it, or refresh the
   original site in Safari while online. Do not clear Safari website data.
4. Compare the shift count, date range, notes and weekly categories with your
   fresh backup/current app. You do not normally need to import anything:
   the storage key remains ttcShiftRecordsV4, and opening v18 does not rewrite
   the stored records.
5. Once v18 has loaded online, check it opens offline. Real iPhone/Safari
   visual and offline testing remains a user-side check (see TEST-RESULTS).

KEEP THE SAME SITE ADDRESS AND EXISTING HOME SCREEN APP
Do not rename/move the repository, change its domain, uninstall the app or
clear website data during this update. Browser records are device/site-local.
If records appear missing, first check that you opened the original app/site.
Your independent JSON backup can be imported after reviewing its preview.
Never upload your JSON/CSV backups or personal shift photos to a public repo.
This ZIP contains app files and synthetic tests, not your personal records.

WHAT CHANGED
- One shared calculation engine for form, History and Summary.
- Earlier actual finishes give zero OT. For a late finish across midnight,
  choose "Next day after scheduled finish". Example: scheduled 23:58,
  actual 00:08, Next day = 0:10 late OT.
- A scheduled finish earlier than the scheduled start means the scheduled
  shift crosses midnight. Actual Finish Day is relative to that scheduled
  finish day, not the shift's start date.
- Older records lack the new finish-day marker. Existing positive stored
  overnight OT is interpreted as next-day intent. Review unusually long
  legacy OT records manually; v18 cannot infer whether old entries were typos.
- Live late-OT preview includes all other pieces on the same work date,
  excluding the record being edited. 9 minutes is unpaid; 10 or more pays
  the entire daily late-OT total at 2x.
- Blank Actual Finish contributes zero OT, without a Pending OT label.
- Paid always means scheduled/platform duration. One weekly scheduled Paid
  total is shown; regular <=8, regular >8 at 1.5x, Overtime Work at 1.5x,
  late OT at 2x and missed step-back at 1x remain separate categories.
  These are time categories, not dollar amounts or multiplied hour totals.
- Daily headers group fully detailed shift cards. Their totals cover all
  pieces for that date, even if a History filter shows only some pieces.
- All-Time drill-down opens exact records. Route filter uses exact route
  tokens (25 does not also select 925); the general search remains flexible.
- Drafts are stored locally, including newly attached compressed photos.
  Reopening offers to restore them. Cancel/Clear protects unfinished changes.
- Duplicate new shifts are blocked. Editing retains existing record IDs and
  additional stored fields. A stale edit is blocked if its saved record changed.
- Proper CSV row breaks; complete versioned JSON backups. Legacy array JSON
  backups still import. CSV is for spreadsheets, not full restore/photos.
- Import preview separates New / Identical / Changed. Changed records default
  to keeping the current record. "Use backup record" replaces the record's
  fields AND photos, retaining its current ID. Inspect both versions first.
  Repeated identical imports do not create extra records.
- Local recovery copy before edits, import changes and deletions. Only the
  latest such copy is retained. Restore Last Deleted Shift also survives reload.
- Invalid data is not silently replaced with an empty array. Backup recovery
  tools can download the stored bytes and accept an explicitly chosen valid
  replacement backup.

BACKUP AND RECOVERY
A download request is not proof that a file was saved. Check Files yourself.
Local recovery and draft copies share browser storage with your records; they
are not independent backups and can also disappear if website data is cleared.
If saving a recovery copy fails due to storage limits, the associated change
is stopped. Export your data before managing photo storage.
Photo cleanup remains manual, for photos older than six months not marked
Keep. Shift records stay. The last recovery copy may still hold deleted photos.
Delete All clears active records while retaining local recovery information.
It is not a secure erase of every stored copy.

ROLLBACK
Keep your v17 package and a fresh pre-update JSON backup. Replacing the app code
with v17 does not normally require replacing data, but v17 has the known bugs.
The new v18 JSON envelope is intended for v18. If an older app needs an array
backup, "Download Stored Data" exports the underlying legacy array. Preserve
both versions before any restore. Restoring an older backup can remove newer
entries, so inspect dates/counts and prefer a reviewed merge where possible.

PAY RULES PRESERVED
Sunday–Saturday work week. One master across years. Normal scheduled pieces
combined per date: first 8 hours regular, remainder 1.5x. Overtime Work=Yes
puts that whole piece's scheduled time into its own 1.5x category, not normal
platform. All daily late OT becomes payable at 2x once the total reaches ten
minutes. Missed step-back is separate at 1x and never changes Actual Finish.
No dollar pay calculation, payday notice, cloud sync or crew-slip OCR added.
