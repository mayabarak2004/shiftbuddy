/**
 * ShiftBuddy - Core Frontend Application Logic
 * Handles 100% local storage state, live punch clock with crash-recovery,
 * manual logging, overtime pay auditing, and minimum wage rules.
 */

// Global state variables
let appData = {
  activeJobId: null,
  jobs: {}
};

let liveTimerInterval = null;
let isFormDirty = false;

// DOM Elements
const activeJobSelect = document.getElementById('active-job-select');
const createJobForm = document.getElementById('create-job-form');
const newJobTitle = document.getElementById('new-job-title');
const newJobAge = document.getElementById('new-job-age');
const newJobRate = document.getElementById('new-job-rate');
const newJobCurrency = document.getElementById('new-job-currency');
const minWageAlertContainer = document.getElementById('min-wage-alert-container');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const shareLedgerBtn = document.getElementById('share-ledger-btn');
const deleteJobBtn = document.getElementById('delete-job-btn');
const editJobBtn = document.getElementById('edit-job-btn');
const cancelEditJobBtn = document.getElementById('cancel-edit-job-btn');
const createJobSubmitBtn = document.getElementById('create-job-submit-btn');
const createJobIcon = document.getElementById('create-job-icon');
const createJobText = document.getElementById('create-job-text');

let editingJobId = null;

// Clock Elements
const liveTimer = document.getElementById('live-timer');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const clockInBtn = document.getElementById('clock-in-btn');
const clockOutBtn = document.getElementById('clock-out-btn');
const earnedTracker = document.getElementById('earned-tracker');
const shiftRateMeta = document.getElementById('shift-rate-meta');

// Manual Shift Elements
const manualShiftForm = document.getElementById('manual-shift-form');
const manualDate = document.getElementById('manual-date');
const manualStartTime = document.getElementById('manual-start-time');
const manualEndTime = document.getElementById('manual-end-time');

// Stats Elements
const statTotalHours = document.getElementById('stat-total-hours');
const statTotalEarnings = document.getElementById('stat-total-earnings');

// Table Elements
const ledgerTableBody = document.querySelector('#ledger-table tbody');
const ledgerTableFoot = document.querySelector('#ledger-table tfoot');
const ledgerBadgeShifts = document.getElementById('ledger-badge-shifts');
const ledgerBadgeHours = document.getElementById('ledger-badge-hours');
const ledgerMonthPicker = document.getElementById('ledger-month-picker');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const saveManualBtn = document.getElementById('save-manual-btn');
const saveManualIcon = document.getElementById('save-manual-icon');
const saveManualText = document.getElementById('save-manual-text');

let editingShiftId = null;

/* ==========================================================================
   1. Data Storage & Management Layer (LocalStorage)
   ========================================================================== */

/**
 * Loads the application state from local storage.
 * Initializes default empty structures if no key is present.
 */
function loadAppData() {
  const serializedData = localStorage.getItem('wagewise_app_data');
  if (serializedData) {
    try {
      appData = JSON.parse(serializedData);
      // Ensure basic structure integrity
      if (!appData.jobs) appData.jobs = {};
    } catch (e) {
      console.error("Failed to parse wagewise_app_data", e);
      initializeEmptyState();
    }
  } else {
    initializeEmptyState();
  }
}

/**
 * Initializes appData to empty structures and writes to storage.
 */
function initializeEmptyState() {
  appData = {
    activeJobId: null,
    jobs: {}
  };
  saveAppData();
}

/**
 * Persists appData back into browser localStorage.
 */
function saveAppData() {
  localStorage.setItem('wagewise_app_data', JSON.stringify(appData));
}

/* ==========================================================================
   2. Helper Utilities
   ========================================================================== */

/**
 * Formats a currency amount with the appropriate symbol.
 */
function formatMoney(amount, currency) {
  const symbol = currency || '$';
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Formats seconds into HH:MM:SS for the punch timer display.
 */
function formatDuration(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Converts HH:MM string to date format.
 */
function parseTimeInput(timeStr, dateStr) {
  return new Date(`${dateStr}T${timeStr}`);
}

/**
 * Formats date into readable string (e.g. "Oct 24, 2023").
 */
function formatDate(dateObj) {
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

/**
 * Formats Date object into time string (e.g. "09:30 AM").
 */
function formatTime(dateObj) {
  return dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * The Overtime Engine: Models daily labor laws.
 * Hours 1 to 8.6 are computed at the base rate.
 * The next 2 hours are calculated at a premium of 125% (Base Rate * 1.25).
 * Any duration exceeding 10.6 hours is computed at a premium of 150% (Base Rate * 1.50).
 * Returns split hours and final pay.
 */
function calculateShiftPay(durationInHours, baseRate, isShabbat = false) {
  if (isShabbat) {
    // Shabbat shifts in Israel receive a flat 150% rate on all hours
    return {
      regularHours: 0,
      extra125: 0,
      extra150: durationInHours,
      pay: durationInHours * baseRate * 1.50
    };
  }

  const stdLimit = 8.6;
  const extra125Limit = 2.0; // first 2 hours of OT
  
  let regularHours = 0;
  let extra125 = 0;
  let extra150 = 0;
  
  if (durationInHours <= stdLimit) {
    regularHours = durationInHours;
  } else {
    regularHours = stdLimit;
    const overtimeHours = durationInHours - stdLimit;
    
    if (overtimeHours <= extra125Limit) {
      extra125 = overtimeHours;
    } else {
      extra125 = extra125Limit;
      extra150 = overtimeHours - extra125Limit;
    }
  }
  
  const regularPay = regularHours * baseRate;
  const extra125Pay = extra125 * baseRate * 1.25;
  const extra150Pay = extra150 * baseRate * 1.50;
  const totalPay = regularPay + extra125Pay + extra150Pay;
  
  return {
    regularHours,
    extra125,
    extra150,
    pay: totalPay
  };
}

/**
 * Checks if a shift falls inside the Israeli Shabbat window.
 * Shabbat starts Friday evening (at or after 5:00 PM / 17:00)
 * and continues throughout Saturday (ending Saturday night).
 */
function isShabbatShift(dateObj) {
  const day = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hours = dateObj.getHours();
  
  // Saturday is fully Shabbat
  if (day === 6) {
    return true;
  }
  
  // Friday evening after 5:00 PM
  if (day === 5 && hours >= 17) {
    return true;
  }
  
  return false;
}

/**
 * Resolves standard minimum wage threshold based on currency and age.
 */
function getMinimumWage(currency, age) {
  switch (currency) {
    case '₪':
      return age < 18 ? 30.00 : 35.00;
    case '$':
      if (age < 18) return 7.25;
      if (age < 21) return 10.00;
      return 11.44;
    case '€':
      return age < 18 ? 9.00 : 12.00;
    case '£':
      if (age < 18) return 6.40;
      if (age < 21) return 8.60;
      return 11.44;
    default:
      return 0.00;
  }
}

/**
 * Translates age bracket bounds into friendly label strings.
 */
function getAgeBracketLabel(currency, age) {
  if (currency === '₪') {
    return age < 18 ? 'under 18' : 'age 18+';
  } else if (currency === '$') {
    if (age < 18) return 'under 18';
    if (age < 21) return 'age 18-20';
    return 'age 21+';
  } else if (currency === '€') {
    return age < 18 ? 'under 18' : 'age 18+';
  } else if (currency === '£') {
    if (age < 18) return 'under 18';
    if (age < 21) return 'age 18-20';
    return 'age 21+';
  }
  return `age ${age}`;
}

/**
 * Minimum Wage Rule Validator.
 * Triggered on pay creation / inputs.
 */
function isWageBelowMinimum(currency, age, hourlyRate) {
  return hourlyRate < getMinimumWage(currency, age);
}

/* ==========================================================================
   3. Job Management (Creation & Switching)
   ========================================================================== */

/**
 * Validates new job wage input or active job context, and updates warning message.
 * @param {boolean} fromFormInteraction Set true if triggered by user typing in the form.
 */
function checkFormMinimumWage(fromFormInteraction = false) {
  if (fromFormInteraction) {
    isFormDirty = true;
  }

  let currency, age, rate;

  if (isFormDirty) {
    currency = newJobCurrency.value;
    age = parseInt(newJobAge.value) || 0;
    rate = parseFloat(newJobRate.value) || 0;
  } else {
    // Check active job context
    const activeJobId = appData.activeJobId;
    if (!activeJobId || !appData.jobs[activeJobId]) {
      minWageAlertContainer.innerHTML = '';
      return;
    }
    const activeJob = appData.jobs[activeJobId];
    currency = activeJob.currency;
    age = activeJob.age;
    rate = activeJob.rate;
  }

  const minWage = getMinimumWage(currency, age);
  const bracketLabel = getAgeBracketLabel(currency, age);

  if (rate < minWage) {
    minWageAlertContainer.innerHTML = `
      <div class="alert-container" id="mock-alert" style="display: flex;">
        <span class="material-symbols-outlined alert-icon">warning</span>
        <div>
          <p class="alert-title">Minimum Wage Alert</p>
          <p>Note: Entered pay is below the standard minimum wage of ${currency}${minWage.toFixed(2)} for ${bracketLabel}!</p>
        </div>
      </div>
    `;
  } else {
    minWageAlertContainer.innerHTML = '';
  }
}

// Add input event listeners to the job creation form with parameter binding
newJobRate.addEventListener('input', () => checkFormMinimumWage(true));
newJobAge.addEventListener('input', () => checkFormMinimumWage(true));
newJobCurrency.addEventListener('change', () => checkFormMinimumWage(true));
newJobTitle.addEventListener('input', () => checkFormMinimumWage(true));

/**
 * Captures form inputs and creates a new job record.
 */
function handleJobCreation() {
  const title = newJobTitle.value.trim();
  const age = parseInt(newJobAge.value);
  const rate = parseFloat(newJobRate.value);
  const currency = newJobCurrency.value;

  if (!title || isNaN(age) || isNaN(rate)) return;

  if (editingJobId) {
    // Update existing job
    const job = appData.jobs[editingJobId];

    // Ensure all historical shifts store their previous hourly rate explicitly
    if (job.shifts) {
      job.shifts.forEach(shift => {
        if (shift.rate === undefined) {
          shift.rate = job.rate;
        }
      });
    }

    // Check if rate or currency has changed and if shifts exist
    const rateChanged = (rate !== job.rate || currency !== job.currency);
    const hasShifts = (job.shifts && job.shifts.length > 0);

    let updateMode = 'none'; // 'all', 'date-onward', 'date-range', 'none'
    let cutoffDateStr = null;
    let cutoffEndDateStr = null;

    if (rateChanged && hasShifts) {
      const wantToUpdate = confirm(
        `You updated the hourly rate/currency from ${formatMoney(job.rate, job.currency)} to ${formatMoney(rate, currency)}.\n\n` +
        `Do you want to update the pay for any of your existing shifts in this job's history?`
      );

      if (wantToUpdate) {
        const updateAll = confirm(
          `Click 'OK' to update ALL historical shifts.\n` +
          `Click 'Cancel' to specify a date filter (update a range or onward).`
        );

        if (updateAll) {
          updateMode = 'all';
        } else {
          const userStartDate = prompt(
            "Enter the START date in YYYY-MM-DD format (e.g., 2026-06-01) to update shifts from this date onward:",
            new Date().toISOString().split('T')[0]
          );
          if (userStartDate) {
            const parsedStartDate = new Date(userStartDate);
            if (!isNaN(parsedStartDate.getTime())) {
              // Ensure start date is not in the future
              const today = new Date();
              const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
              if (parsedStartDate >= tomorrow) {
                alert("You cannot enter a date in the future.");
                return;
              }

              const onward = confirm(
                `Do you want to update ALL shifts from ${userStartDate} onward?\n\n` +
                `Click 'OK' to update all shifts from ${userStartDate} onward.\n` +
                `Click 'Cancel' to specify a specific END date (update shifts only within a date range).`
              );

              if (onward) {
                updateMode = 'date-onward';
                cutoffDateStr = userStartDate;
              } else {
                const userEndDate = prompt(
                  `Enter the END date in YYYY-MM-DD format (only shifts between ${userStartDate} and this date will be updated):`,
                  userStartDate
                );
                if (userEndDate) {
                  const parsedEndDate = new Date(userEndDate);
                  if (!isNaN(parsedEndDate.getTime())) {
                    // Ensure end date is not in the future
                    if (parsedEndDate >= tomorrow) {
                      alert("You cannot enter a date in the future.");
                      return;
                    }
                    // Ensure end date is chronologically valid
                    if (parsedEndDate < parsedStartDate) {
                      alert("End date cannot be before start date.");
                      return;
                    }
                    updateMode = 'date-range';
                    cutoffDateStr = userStartDate;
                    cutoffEndDateStr = userEndDate;
                  } else {
                    alert("Invalid end date format. No historical shifts will be updated.");
                  }
                }
              }
            } else {
              alert("Invalid start date format. No historical shifts will be updated.");
            }
          }
        }
      }
    }

    job.title = title;
    job.age = age;

    if (updateMode === 'all') {
      // Recalculate all historical shifts
      job.shifts.forEach(shift => {
        const shiftCalc = calculateShiftPay(shift.totalHours, rate, shift.isShabbat);
        shift.pay = shiftCalc.pay;
        shift.rate = rate; // Update the stored rate
      });
      showToast("All historical shifts recalculated successfully!");
    } else if (updateMode === 'date-onward' && cutoffDateStr) {
      // Recalculate shifts starting from cutoffDateStr onward
      let updatedCount = 0;
      job.shifts.forEach(shift => {
        const raw = shift.rawDate || new Date(shift.date).toISOString().split('T')[0];
        if (raw >= cutoffDateStr) {
          const shiftCalc = calculateShiftPay(shift.totalHours, rate, shift.isShabbat);
          shift.pay = shiftCalc.pay;
          shift.rate = rate; // Update the stored rate
          updatedCount++;
        }
      });
      showToast(`Recalculated ${updatedCount} shift(s) from ${cutoffDateStr} onward.`);
    } else if (updateMode === 'date-range' && cutoffDateStr && cutoffEndDateStr) {
      // Recalculate shifts between start and end dates
      let updatedCount = 0;
      job.shifts.forEach(shift => {
        const raw = shift.rawDate || new Date(shift.date).toISOString().split('T')[0];
        if (raw >= cutoffDateStr && raw <= cutoffEndDateStr) {
          const shiftCalc = calculateShiftPay(shift.totalHours, rate, shift.isShabbat);
          shift.pay = shiftCalc.pay;
          shift.rate = rate; // Update the stored rate
          updatedCount++;
        }
      });
      showToast(`Recalculated ${updatedCount} shift(s) between ${cutoffDateStr} and ${cutoffEndDateStr}.`);
    } else {
      showToast("Job details updated successfully!");
    }

    job.rate = rate;
    job.currency = currency;

    editingJobId = null;
    if (createJobText) createJobText.textContent = "Create Job";
    if (createJobIcon) createJobIcon.textContent = "add";
    if (cancelEditJobBtn) cancelEditJobBtn.style.display = "none";
  } else {
    // Generate unique timestamp string ID
    const jobId = 'job_' + Date.now();

    const newJob = {
      id: jobId,
      title: title,
      age: age,
      rate: rate,
      currency: currency,
      activeShiftStart: null,
      shifts: []
    };

    appData.jobs[jobId] = newJob;
    appData.activeJobId = jobId;
    showToast("Job profile created successfully!");
  }

  saveAppData();
  
  // Reset Form and dirty status
  createJobForm.reset();
  isFormDirty = false;
  minWageAlertContainer.innerHTML = '';
  
  // Refresh Layout
  refreshLayout();
}

createJobForm.addEventListener('submit', handleJobCreation);

/**
 * Handle job switcher selections.
 */
activeJobSelect.addEventListener('change', () => {
  const selectedJobId = activeJobSelect.value;
  if (selectedJobId && appData.jobs[selectedJobId]) {
    // Clear live timer interval of current layout before switching
    if (liveTimerInterval) {
      clearInterval(liveTimerInterval);
      liveTimerInterval = null;
    }
    
    // Clear creation form dirty status since user is selecting an active job
    isFormDirty = false;
    
    appData.activeJobId = selectedJobId;
    saveAppData();
    refreshLayout();
  }
});

/* ==========================================================================
   4. Crash-Proof Clock In/Out
   ========================================================================== */

/**
 * Starts the live timer interval and handles updates.
 */
function runLiveTimer(job, startTimestamp) {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
  }

  // Update classes
  statusIndicator.classList.add('active');
  statusText.textContent = 'Active shift running';
  clockInBtn.disabled = true;
  clockInBtn.style.opacity = '0.5';
  clockInBtn.style.pointerEvents = 'none';
  clockOutBtn.disabled = false;
  clockOutBtn.style.opacity = '1';
  clockOutBtn.style.pointerEvents = 'auto';

  const rate = job.rate;
  const currency = job.currency;

  function updateTick() {
    const elapsedMs = Date.now() - startTimestamp;
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    
    // Update Timer display
    liveTimer.textContent = formatDuration(elapsedSeconds);
    
    // Calculate running earnings
    const elapsedHours = elapsedSeconds / 3600;
    const earned = elapsedHours * rate;
    earnedTracker.textContent = `Earned: ${formatMoney(earned, currency)}`;
  }

  // Initial immediate tick
  updateTick();
  
  liveTimerInterval = setInterval(updateTick, 1000);
}

/**
 * Stops live ticking timer and resets states.
 */
function stopLiveTimer() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }
  
  liveTimer.textContent = '00:00:00';
  statusIndicator.classList.remove('active');
  statusText.textContent = 'Shift completed';
  
  clockInBtn.disabled = false;
  clockInBtn.style.opacity = '1';
  clockInBtn.style.pointerEvents = 'auto';
  clockOutBtn.disabled = true;
  clockOutBtn.style.opacity = '0.5';
  clockOutBtn.style.pointerEvents = 'none';
}

/**
 * Handle Clock In click.
 */
clockInBtn.addEventListener('click', () => {
  const activeJobId = appData.activeJobId;
  if (!activeJobId) return;
  
  const job = appData.jobs[activeJobId];
  if (!job) return;

  const now = Date.now();
  job.activeShiftStart = now;
  saveAppData();

  runLiveTimer(job, now);
});

/**
 * Handle Clock Out click. Saves the shifts.
 */
clockOutBtn.addEventListener('click', () => {
  const activeJobId = appData.activeJobId;
  if (!activeJobId) return;
  
  const job = appData.jobs[activeJobId];
  if (!job || !job.activeShiftStart) return;

  const startTimestamp = job.activeShiftStart;
  const endTimestamp = Date.now();
  
  const elapsedMs = endTimestamp - startTimestamp;
  const durationHours = Math.max(0, elapsedMs / 1000 / 3600);

  const shiftDate = new Date(startTimestamp);
  const isShabbat = job.currency === '₪' && isShabbatShift(shiftDate);
  const shiftCalc = calculateShiftPay(durationHours, job.rate, isShabbat);

  // Format details for the ledger
  const shiftDateStr = formatDate(shiftDate);
  const enterTimeStr = formatTime(shiftDate);
  const endTimeStr = formatTime(new Date(endTimestamp));

  // Build shift object
  const newShift = {
    id: 'shift_' + Date.now(),
    date: shiftDateStr,
    rawDate: shiftDate.toISOString().split('T')[0], // For calendar month filtering
    enterTime: enterTimeStr,
    endTime: endTimeStr,
    rate: job.rate, // Store the hourly rate used for calculations
    regularHours: shiftCalc.regularHours,
    extra125: shiftCalc.extra125,
    extra150: shiftCalc.extra150,
    totalHours: durationHours,
    pay: shiftCalc.pay,
    isShabbat: isShabbat
  };

  job.shifts.push(newShift);
  job.activeShiftStart = null;
  saveAppData();

  stopLiveTimer();
  refreshLayout();
});

/* ==========================================================================
   5. Manual Logger Logic
   ========================================================================== */

manualShiftForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const activeJobId = appData.activeJobId;
  if (!activeJobId) {
    alert("Please select or create a job context first.");
    return;
  }
  
  const job = appData.jobs[activeJobId];
  if (!job) return;

  const dateVal = manualDate.value;
  const startVal = manualStartTime.value;
  const endVal = manualEndTime.value;

  if (!dateVal || !startVal || !endVal) return;

  // Construct start and end Date objects
  let startDate = parseTimeInput(startVal, dateVal);
  let endDate = parseTimeInput(endVal, dateVal);

  // If end time is before start time, assume it spans midnight (overnight shift)
  if (endDate < startDate) {
    endDate.setDate(endDate.getDate() + 1);
  }

  // Prevent logging shifts that start or end in the future
  const now = new Date();
  if (startDate > now) {
    alert("You cannot enter a shift starting in the future.");
    return;
  }
  if (endDate > now) {
    alert("You cannot enter a shift ending in the future.");
    return;
  }

  const elapsedMs = endDate - startDate;
  const durationHours = Math.max(0, elapsedMs / 1000 / 3600);

  const isShabbat = job.currency === '₪' && isShabbatShift(startDate);
  const shiftCalc = calculateShiftPay(durationHours, job.rate, isShabbat);

  if (editingShiftId) {
    // Modify existing shift in place
    const index = job.shifts.findIndex(s => s.id === editingShiftId);
    if (index !== -1) {
      job.shifts[index] = {
        ...job.shifts[index],
        date: formatDate(startDate),
        rawDate: dateVal,
        enterTime: formatTime(startDate),
        endTime: formatTime(endDate),
        rate: job.rate, // Store the updated rate used for recalculations
        regularHours: shiftCalc.regularHours,
        extra125: shiftCalc.extra125,
        extra150: shiftCalc.extra150,
        totalHours: durationHours,
        pay: shiftCalc.pay,
        isShabbat: isShabbat
      };
    }
    
    editingShiftId = null;
    if (saveManualText) saveManualText.textContent = "Save Manual Shift";
    if (saveManualIcon) saveManualIcon.textContent = "save";
    if (cancelEditBtn) cancelEditBtn.style.display = "none";
    showToast("Shift updated successfully!");
  } else {
    // Create new shift entry
    const newShift = {
      id: 'shift_' + Date.now(),
      date: formatDate(startDate),
      rawDate: dateVal,
      enterTime: formatTime(startDate),
      endTime: formatTime(endDate),
      rate: job.rate, // Store the hourly rate used for calculations
      regularHours: shiftCalc.regularHours,
      extra125: shiftCalc.extra125,
      extra150: shiftCalc.extra150,
      totalHours: durationHours,
      pay: shiftCalc.pay,
      isShabbat: isShabbat
    };
    job.shifts.push(newShift);
    showToast("Manual shift saved successfully!");
  }

  saveAppData();
  manualShiftForm.reset();
  refreshLayout();
});

/* ==========================================================================
   6. Layout Refresh & View Synchronization
   ========================================================================== */

/**
 * Re-renders the dashboard widgets using current local storage state.
 */
function refreshLayout() {
  const activeJobId = appData.activeJobId;

  // 1. Sync Job Switcher Selector Dropdown
  activeJobSelect.innerHTML = '';
  const jobIds = Object.keys(appData.jobs);
  
  if (jobIds.length === 0) {
    // No jobs present state
    const opt = document.createElement('option');
    opt.textContent = '-- No Jobs Created --';
    opt.value = '';
    activeJobSelect.appendChild(opt);
    
    // Reset stats cards & ledger displays
    statTotalHours.textContent = '0.0h';
    statTotalEarnings.textContent = formatMoney(0, '$');
    
    liveTimer.textContent = '00:00:00';
    statusText.textContent = 'Ready to clock in';
    earnedTracker.textContent = 'Earned: $0.00';
    shiftRateMeta.textContent = 'Base Rate: -';
    
    // Disable clock buttons
    clockInBtn.disabled = true;
    clockInBtn.style.opacity = '0.5';
    clockInBtn.style.pointerEvents = 'none';
    clockOutBtn.disabled = true;
    clockOutBtn.style.opacity = '0.5';
    clockOutBtn.style.pointerEvents = 'none';

    ledgerTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--color-on-surface-variant);">No jobs configured yet. Create a job to begin tracking!</td></tr>`;
    renderTotalsRow(0, 0, 0, 0, '$');
    ledgerBadgeShifts.textContent = '0 Shifts';
    ledgerBadgeHours.textContent = '0 Hours';

    if (deleteJobBtn) {
      deleteJobBtn.disabled = true;
      deleteJobBtn.style.opacity = '0.4';
      deleteJobBtn.style.pointerEvents = 'none';
    }
    if (editJobBtn) {
      editJobBtn.disabled = true;
      editJobBtn.style.opacity = '0.4';
      editJobBtn.style.pointerEvents = 'none';
    }
    return;
  }

  if (deleteJobBtn) {
    deleteJobBtn.disabled = false;
    deleteJobBtn.style.opacity = '1';
    deleteJobBtn.style.pointerEvents = 'auto';
  }
  if (editJobBtn) {
    editJobBtn.disabled = false;
    editJobBtn.style.opacity = '1';
    editJobBtn.style.pointerEvents = 'auto';
  }

  // Populate Active Dropdown select
  jobIds.forEach(id => {
    const job = appData.jobs[id];
    const opt = document.createElement('option');
    opt.value = job.id;
    opt.textContent = `${job.title} (${formatMoney(job.rate, job.currency)} / hr)`;
    if (job.id === activeJobId) {
      opt.selected = true;
    }
    activeJobSelect.appendChild(opt);
  });

  // Get active job details
  const activeJob = appData.jobs[activeJobId] || appData.jobs[jobIds[0]];
  if (!appData.activeJobId) {
    appData.activeJobId = activeJob.id;
    saveAppData();
  }

  // Display metadata rate
  shiftRateMeta.textContent = `Base Rate: ${formatMoney(activeJob.rate, activeJob.currency)}/hr`;

  // 2. Sync Clock State (Crash-Recovery check)
  if (activeJob.activeShiftStart) {
    runLiveTimer(activeJob, activeJob.activeShiftStart);
  } else {
    stopLiveTimer();
    earnedTracker.textContent = `Earned: ${formatMoney(0, activeJob.currency)}`;
  }

  // 3. Render Month Ledger Details
  // Filter shifts that occurred in the SELECTED calendar month
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth(); // 0-indexed

  if (ledgerMonthPicker && ledgerMonthPicker.value) {
    const parts = ledgerMonthPicker.value.split('-');
    targetYear = parseInt(parts[0]);
    targetMonth = parseInt(parts[1]) - 1; // Convert 1-based to 0-based
  }

  const monthlyShifts = (activeJob.shifts || []).filter(shift => {
    // Handle either raw ISO date or formatted text date
    const shiftDate = new Date(shift.rawDate || shift.date);
    return shiftDate.getFullYear() === targetYear && shiftDate.getMonth() === targetMonth;
  });

  // Clear rows
  ledgerTableBody.innerHTML = '';
  
  let totalRegular = 0;
  let total125 = 0;
  let total150 = 0;
  let grandTotalHours = 0;
  let grandTotalPay = 0;

  if (monthlyShifts.length === 0) {
    ledgerTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--color-on-surface-variant);">No shifts recorded for this calendar month. Log manual shifts or clock in above!</td></tr>`;
  } else {
    // Sort shifts chronologically by date
    monthlyShifts.sort((a, b) => new Date(a.rawDate || a.date) - new Date(b.rawDate || b.date));

    monthlyShifts.forEach(shift => {
      totalRegular += shift.regularHours;
      total125 += shift.extra125;
      total150 += shift.extra150;
      grandTotalHours += shift.totalHours;
      grandTotalPay += shift.pay;

      const row = document.createElement('tr');
      const shabbatBadge = shift.isShabbat ? ' <span class="chip chip-sage" style="padding: 2px 6px; font-size: 10px; margin-left: 6px;">Shabbat</span>' : '';
      row.innerHTML = `
        <td class="td-date">${shift.date}${shabbatBadge}</td>
        <td class="td-muted-mono">${shift.enterTime}</td>
        <td class="td-muted-mono">${shift.endTime}</td>
        <td class="td-mono">${formatMoney(shift.rate || activeJob.rate, activeJob.currency)}/hr</td>
        <td class="td-mono">${shift.regularHours.toFixed(2)} h</td>
        <td class="td-mono">${shift.extra125.toFixed(2)} h</td>
        <td class="td-mono">${shift.extra150.toFixed(2)} h</td>
        <td class="td-pay">${formatMoney(shift.pay, activeJob.currency)}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="edit-shift-btn" onclick="editShift('${shift.id}')" title="Modify Shift" style="background: transparent; border: none; color: var(--color-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 4px; border-radius: var(--rounded-sm); transition: background-color var(--transition-fast); margin-right: 4px;">
            <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
          </button>
          <button class="delete-shift-btn" onclick="deleteShift('${shift.id}')" title="Delete Shift" style="background: transparent; border: none; color: var(--color-error); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 4px; border-radius: var(--rounded-sm); transition: background-color var(--transition-fast);">
            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
          </button>
        </td>
      `;
      ledgerTableBody.appendChild(row);
    });
  }

  // Render Pinned totals row
  renderTotalsRow(totalRegular, total125, total150, grandTotalPay, activeJob.currency);

  // Sync ledger stats badge labels
  ledgerBadgeShifts.textContent = `${monthlyShifts.length} Shift${monthlyShifts.length === 1 ? '' : 's'}`;
  ledgerBadgeHours.textContent = `${grandTotalHours.toFixed(1)} Hours`;

  // 4. Update Summary Stats Cards
  statTotalHours.textContent = `${grandTotalHours.toFixed(1)}h`;
  statTotalEarnings.textContent = formatMoney(grandTotalPay, activeJob.currency);

  // 5. Update Minimum Wage Alert context for selected job
  checkFormMinimumWage();

  // 6. Update Print-Only Header values
  const printDate = document.getElementById('print-date');
  const printJobTitle = document.getElementById('print-job-title');
  const printStatementPeriod = document.getElementById('print-statement-period');
  
  if (printDate) {
    printDate.textContent = new Date().toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (printJobTitle && activeJob) {
    printJobTitle.textContent = activeJob.title;
  }
  if (printStatementPeriod && ledgerMonthPicker) {
    const [year, month] = ledgerMonthPicker.value.split('-').map(Number);
    const tempDate = new Date(year, month - 1);
    printStatementPeriod.textContent = tempDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
}

/**
 * Updates table footer totals row.
 */
function renderTotalsRow(regular, ot125, ot150, totalPay, currency) {
  ledgerTableFoot.innerHTML = `
    <tr class="totals-row">
      <td colspan="4" class="td-label">TOTALS</td>
      <td class="td-mono">${regular.toFixed(2)} h</td>
      <td class="td-mono">${ot125.toFixed(2)} h</td>
      <td class="td-mono">${ot150.toFixed(2)} h</td>
      <td class="td-pay">${formatMoney(totalPay, currency)}</td>
      <td></td>
    </tr>
  `;
}

/**
 * Triggers an elegant toast notification.
 */
function showToast(message) {
  let toast = document.getElementById('sb-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sb-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(100px)';
    toast.style.backgroundColor = 'var(--color-primary)';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = 'var(--rounded-md)';
    toast.style.boxShadow = '0 10px 25px rgba(0, 53, 39, 0.2)';
    toast.style.fontFamily = 'var(--font-family)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '600';
    toast.style.zIndex = '1000';
    toast.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s';
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  
  // Trigger animations
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 50);

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(100px)';
  }, 3000);
}

/* ==========================================================================
   7. Application Bootstrapping
   ========================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  // Load data
  loadAppData();

  // Set maximum date picker value to today to prevent choosing future dates
  if (manualDate) {
    manualDate.max = new Date().toISOString().split('T')[0];
  }

  // Initialize Month Picker element to current month
  if (ledgerMonthPicker) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    ledgerMonthPicker.value = `${currentYear}-${currentMonth}`;

    // Attach change listener to reload layout for selected month
    ledgerMonthPicker.addEventListener('change', () => {
      refreshLayout();
    });
  }

  // Draw layout
  refreshLayout();

  // Attach dynamic button event listeners
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      const activeJobId = appData.activeJobId;
      if (!activeJobId || !appData.jobs[activeJobId]) {
        showToast("No active job context to export.");
        return;
      }

      const activeJob = appData.jobs[activeJobId];
      const element = document.querySelector('.ledger-section');
      if (!element) return;

      // Add print formatting class to body
      document.body.classList.add('is-pdf-export');
      showToast("Generating PDF download...");

      // Construct dynamic filename
      const jobTitle = activeJob.title.replace(/[^a-z0-9]/gi, '_');
      const monthVal = ledgerMonthPicker ? ledgerMonthPicker.value : 'Report';
      const filename = `${jobTitle}_Paycheck_Report_${monthVal}.pdf`;

      // html2pdf configurations
      const opt = {
        margin:       [10, 10, 10, 10],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2.5, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // Wait 150ms for repaint, then generate the PDF
      setTimeout(() => {
        html2pdf().set(opt).from(element).save().then(() => {
          document.body.classList.remove('is-pdf-export');
          showToast("PDF downloaded successfully!");
        }).catch(err => {
          console.error("PDF generation failed, falling back to print:", err);
          document.body.classList.remove('is-pdf-export');
          window.print();
        });
      }, 150);
    });
  }

  if (shareLedgerBtn) {
    shareLedgerBtn.addEventListener('click', () => {
      const activeJobId = appData.activeJobId;
      if (!activeJobId || !appData.jobs[activeJobId]) {
        showToast("No active job context to share.");
        return;
      }
      
      const job = appData.jobs[activeJobId];
      let currentYear = new Date().getFullYear();
      let currentMonthIndex = new Date().getMonth();
      let currentMonthName = new Date().toLocaleString('default', { month: 'long' });

      if (ledgerMonthPicker && ledgerMonthPicker.value) {
        const parts = ledgerMonthPicker.value.split('-');
        currentYear = parseInt(parts[0]);
        currentMonthIndex = parseInt(parts[1]) - 1;
        const tempDate = new Date(currentYear, currentMonthIndex);
        currentMonthName = tempDate.toLocaleString('default', { month: 'long' });
      }

      const monthlyShifts = (job.shifts || []).filter(shift => {
        const shiftDate = new Date(shift.rawDate || shift.date);
        return shiftDate.getFullYear() === currentYear && shiftDate.getMonth() === currentMonthIndex;
      });

      let totalHours = 0;
      let totalPay = 0;
      monthlyShifts.forEach(s => {
        totalHours += s.totalHours;
        totalPay += s.pay;
      });

      const shareText = `ShiftBuddy Monthly Summary - ${currentMonthName} ${currentYear}\n` +
                        `-------------------------------------------\n` +
                        `Job: ${job.title}\n` +
                        `Hourly Rate: ${formatMoney(job.rate, job.currency)}/hr\n` +
                        `Total Shifts: ${monthlyShifts.length}\n` +
                        `Total Hours Worked: ${totalHours.toFixed(1)}h\n` +
                        `Total Estimated Pay: ${formatMoney(totalPay, job.currency)}\n` +
                        `-------------------------------------------\n` +
                        `Disclaimer: This information is based only on the user's inputs and usage, and it is not to be used as a formal document.\n` +
                        `Logged locally on ShiftBuddy.`;

      if (navigator.share) {
        navigator.share({
          title: `ShiftBuddy Pay Summary - ${job.title}`,
          text: shareText
        }).catch(err => {
          console.error("Web share failed:", err);
        });
      } else {
        // Fallback: Copy to Clipboard
        navigator.clipboard.writeText(shareText)
          .then(() => {
            showToast(`Ledger summary copied to clipboard!`);
          })
          .catch(err => {
            console.error("Copy to clipboard failed:", err);
            alert("Share Payload:\n\n" + shareText);
          });
      }
    });
  }

  // Attach active job delete handler
  if (deleteJobBtn) {
    deleteJobBtn.addEventListener('click', () => {
      const activeJobId = appData.activeJobId;
      if (!activeJobId || !appData.jobs[activeJobId]) {
        showToast("No active job to delete.");
        return;
      }

      const job = appData.jobs[activeJobId];
      if (!confirm(`Are you sure you want to permanently delete the job "${job.title}"?\nThis will erase all its shift logs and cannot be undone.`)) {
        return;
      }

      // Stop running live timer if active on deletion
      if (job.activeShiftStart) {
        stopLiveTimer();
      }

      // Delete the active job context
      delete appData.jobs[activeJobId];

      // Re-assign active job context
      const remainingIds = Object.keys(appData.jobs);
      if (remainingIds.length > 0) {
        appData.activeJobId = remainingIds[0];
      } else {
        appData.activeJobId = null;
      }

      saveAppData();
      refreshLayout();
      showToast("Job deleted successfully!");
    });
  }

  // Attach active job edit handler
  if (editJobBtn) {
    editJobBtn.addEventListener('click', () => {
      const activeJobId = appData.activeJobId;
      if (!activeJobId || !appData.jobs[activeJobId]) return;

      const job = appData.jobs[activeJobId];
      editingJobId = activeJobId;

      // Pre-fill form inputs
      newJobTitle.value = job.title;
      newJobAge.value = job.age;
      newJobRate.value = job.rate;
      newJobCurrency.value = job.currency;

      // Switch form UI states to Update Job mode
      if (createJobText) createJobText.textContent = "Update Job";
      if (createJobIcon) createJobIcon.textContent = "edit";
      if (cancelEditJobBtn) cancelEditJobBtn.style.display = "inline-flex";

      // Smooth scroll user to job creation form
      createJobForm.scrollIntoView({ behavior: "smooth" });

      // Trigger wage validation display for pre-filled data
      checkFormMinimumWage(true);
    });
  }

  // Attach cancel active job edit handler
  if (cancelEditJobBtn) {
    cancelEditJobBtn.addEventListener('click', () => {
      editingJobId = null;
      createJobForm.reset();
      if (createJobText) createJobText.textContent = "Create Job";
      if (createJobIcon) createJobIcon.textContent = "add";
      cancelEditJobBtn.style.display = "none";
      minWageAlertContainer.innerHTML = '';
      isFormDirty = false;
      showToast("Job edit cancelled.");
    });
  }
});

/**
 * Deletes a shift by its ID from the active job and refreshes layout.
 */
function deleteShift(shiftId) {
  const activeJobId = appData.activeJobId;
  if (!activeJobId || !appData.jobs[activeJobId]) return;

  // Confirm delete action to prevent accidental deletions
  if (!confirm("Are you sure you want to delete this shift log?")) {
    return;
  }

  const job = appData.jobs[activeJobId];
  job.shifts = (job.shifts || []).filter(shift => shift.id !== shiftId);

  saveAppData();
  refreshLayout();
  showToast("Shift deleted successfully!");
}

// Expose deleteShift to global window context for inline onclick triggers
window.deleteShift = deleteShift;

/**
 * Puts the manual shift form into update mode with the target shift's details.
 */
function editShift(shiftId) {
  const activeJobId = appData.activeJobId;
  if (!activeJobId || !appData.jobs[activeJobId]) return;

  const job = appData.jobs[activeJobId];
  const shift = (job.shifts || []).find(s => s.id === shiftId);
  if (!shift) return;

  editingShiftId = shiftId;

  // Pre-fill manual form inputs
  manualDate.value = shift.rawDate || '';
  manualStartTime.value = convertTimeTo24h(shift.enterTime);
  manualEndTime.value = convertTimeTo24h(shift.endTime);

  // Switch form UI state to Update mode
  if (saveManualText) saveManualText.textContent = "Update Shift";
  if (saveManualIcon) saveManualIcon.textContent = "edit";
  if (cancelEditBtn) cancelEditBtn.style.display = "inline-flex";

  // Smooth scroll user to manual form
  manualShiftForm.scrollIntoView({ behavior: "smooth" });
}

/**
 * Helper to convert 12-hour AM/PM time strings to 24-hour HH:MM format for HTML time inputs.
 */
function convertTimeTo24h(time12h) {
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');

  if (hours === '12') {
    hours = '00';
  }

  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).slice(0, 2)}`;
}

// Cancel Edit Button click event handler
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => {
    editingShiftId = null;
    manualShiftForm.reset();
    if (saveManualText) saveManualText.textContent = "Save Manual Shift";
    if (saveManualIcon) saveManualIcon.textContent = "save";
    cancelEditBtn.style.display = "none";
    showToast("Edit cancelled.");
  });
}

// Expose editShift to global window context for inline onclick triggers
window.editShift = editShift;
