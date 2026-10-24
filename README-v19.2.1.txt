TTC Shift Log v19.2.1

History groups Holiday, Spareboard and work pieces under their correct dates,
following Newest first or Oldest first. Holidays without work still appear.
Holiday rows are compact: Holiday + Edit. Remove holiday credit is inside the
Holiday editor and continues to preserve actual work pieces.

Summary > Holidays shows selected-week and all-time counts of unique credited
dates and their credit hours. Multiple work pieces do not multiply holiday counts.
Holiday credit is already included in Platform Regular <= 8.

No saved-data migration, storage-key change or pay calculation change.
Verified date sorting, filters, holiday-only days, unique counts, no load writes,
holiday credit removal and Spareboard edit/delete/recovery using simulated DOM
tests. Physical iPhone rendering remains unverified.

Rollback: backup/v19.2-before-history-order (07adc8b0015d5e5dcced22c7ff700ed80054bea1).
Version policy: 19.2.1 through 19.2.9, then 19.3.0; final digit rolls over at 9.
