# TTC Shift Log — CodeRabbit Review Checklist

## Purpose

This document defines the safety and correctness requirements for reviewing the TTC Shift Log progressive web application (PWA).

## Critical review priorities
1. Preserve all historical records and backward compatibility. Never silently delete, overwrite, or invalidate existing entries.
2. Verify TTC paid hours, platform time, the configured 10-minute overtime threshold, aggregation across multiple shifts on the same day, and correct classification of regular versus 2× overtime. Check rounding and Work Summary totals.
3. Verify the 8-hour holiday credit separately from actual holiday work paid at 1.5×. Check worked and non-worked holidays, correct totals, chronological display, and prevention of double-counting or misleading descriptions.
4. Verify Spareboard and Regular entries can be created, edited, displayed, and deleted correctly without affecting unrelated records.
5. Ensure History displays entries and holiday credits in correct chronological order.
6. Check weekly work summaries and pay calculations. TTC payroll is weekly, with a two-week payment delay; do not treat it as biweekly payroll.
7. Check browser storage, migrations, import/export, and PWA offline behavior for data-loss risks, particularly on iPhone Safari.
8. Check for JavaScript errors, invalid time parsing, date/time-zone errors, and mobile UI regressions.
9. Require tests for calculation changes and data migrations, including old-entry compatibility.
10. Flag security, privacy, accessibility, and performance problems when supported by the code.

## Review expectations
- Prioritize concrete bugs and regressions over cosmetic suggestions.
- Explain the affected code, reproduction steps, expected behavior, and severity.
- Never assume TTC payroll rules that are not documented or verified in the repository.
- Recommend minimal, reversible fixes.
- Do not automatically merge, deploy, delete data, or rewrite existing records.

## Scope limitation
This checklist describes what to inspect when relevant code changes are reviewed. Adding this document alone does not constitute a full audit of the existing application.
