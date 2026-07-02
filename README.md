# ShiftBuddy

A client-side shift management ledger and paycheck reconciliation application. It empowers hourly shift workers, student employees, and freelancers to independently log hours, track multi-job pay tracks, automatically calculate daily overtime legal premiums, and export verified financial audit logs.

## What it does

* **Bento-Grid Multi-Job Hub:** Configure and switch dynamically between separate job profiles, each possessing its own tracking context, user age parameters, custom hourly pay scales, and independent base currencies (`₪`, `$`, `€`, `£`).
* **Crash-Proof Live Punch Clock:** A stateless, timestamp-anchored active tracker that computes working duration and running shift earnings down to the exact second. The state recovers instantly and resumes tracking seamlessly across browser restarts, refreshes, or device power cutouts.
* **Israeli Labor Law Overtime Matrix:** An embedded logical math engine that automatically segments shifts into regular hours (up to 8.6 hours), Tier-1 overtime (the next 2 hours paid at 125%), and Tier-2 overtime (any duration past 10.6 hours paid at 150%). 
* **Automatic Shabbat Flat-Rate Rule:** Intelligently triggers a statutory 150% flat-rate calculation on all logged hours if a shift falls inside the Israeli Shabbat window (Friday evenings starting at 17:00 through Saturday night).
* **Dynamic Age-Based Wage Validator:** A real-time auditing system that cross-references user age and selected currency bounds to flash warning banners if an entered rate falls below statutory regional minimum wage structures (e.g., minor vs. adult minimums).
* **Historical Month Ledger & Totals:** A spreadsheet-style monthly audit interface that organizes shifts chronologically, displaying explicit clock-in/out stamps, overtime tiers, and a pinned bottom totals calculator.
* **Interactive Ledger Management:** Inline operational controls that enable the manual logging of past shifts, updating active job metrics with historical back-dated recalculation choices, and fine-tuning individual historical rows.
* **Reconciled Document Export Suite:** Features a dual-channel sharing system that lets you download a pixel-perfect, printer-formatted PDF copy using client-side `html2pdf.js` processing, or quickly push a clean text summary ledger payload right to your clipboard via the Web Share API.

## Live link

👉 [https://mayabarak2004.github.io/shiftbuddy/](https://mayabarak2004.github.io/shiftbuddy/)

## How to use it

1.  **Onboard a Profile:** Fill out the **Job Management** form by adding a Job Title, your Age, your Hourly Pay, and your Base Currency, then click **Create Job**.
2.  **Log Your Shifts:** Select your active job profile from the context dropdown menu. Click **Clock In** when your shift begins to initiate the real-time tracker, or enter the details into the **Log Manual Shift** module to back-date a past day.
3.  **Audit and Export:** Pick your target calendar month using the built-in month filter to view your compiled table. Use the **Export PDF** or **Share Ledger** utilities at the bottom of the ledger card to download your printable audit summary report.

## Known limitations

* **Browser Storage Dependent:** Data persistence relies entirely on client-side browser space (`localStorage`). Clearing your browser history, clear-wiping cookies, or using aggressive machine cleaners will permanently delete all stored jobs and shift tracking logs.
* **No Multi-Device Synchronization:** Because data lives completely localized in individual web caches, shift entries, and job listings do not sync across different platforms (e.g., your logs will not automatically transfer if you switch between a desktop laptop and a mobile device).
* **Localized Overtime Architecture:** The overtime premium tier thresholds (8.6h base limit, 125% and 150% multipliers) are hardcoded to standard daily frameworks. They do not automatically scale to unique union bargaining agreements, split split-shifts, or complex weekly global rolling contracts.
* **Informational Purposes Only:** As displayed in the application disclaimer banners, all statistics and tables are derived entirely from manual user entries and are intended for personal audit verification and ledger tracking, rather than acting as a legally binding corporate document.
