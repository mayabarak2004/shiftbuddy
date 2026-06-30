# ShiftBuddy | Hourly Pay Tracker & Shift Manager

ShiftBuddy is a lightweight, clean, and 100% local Shift Ledger web application designed to help hourly workers track their jobs, log shifts, and view real-time earnings metrics. 

## Features

* **Multi-Job Management**: Create, edit, and delete multiple jobs with customized job titles, varying hourly rates, and support for multiple currencies (₪, \$, €, £).
* **Smart Minimum Wage Alert**: Dynamically verifies entered pay scales against regional rules based on user age to prevent underpayment compliance issues.
* **Live Punch Clock & Timer**: Visual, real-time stopwatch keeping precise track of shift duration and dynamic ongoing earnings down to the exact second.
* **Manual Log Framework**: Back-up capability to register historic shift entry structures with manual date inputs.
* **Privacy-First Architecture**: 100% client-side execution keeping data isolated entirely in the browser storage ecosystem.

---

## Technical Stack

* **Markup**: Semantic HTML5 with Google Material Symbols
* **Styling**: Modern CSS3 using modern Grid layouts, Custom Variables (CSS variables), Flexbox structures, and adaptive design architecture
* **Typography**: Inter Font Ecosystem

---

## File Structure

```text
├── index.html   # Main dashboard skeleton markup
├── style.css    # Clean theme parameters, variables & typography rules 
└── script.js    # Client side shift ledger computation logic
```

---

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   ```
2. **Launch the platform:**
   Open `index.html` directly in any web browser. No compilation, local servers, or database instances required.

---

## Usage Workflow

1. **Set Up Jobs**: Input your unique Job details, user age, and local currency rates in the **Job Management** module.
2. **Clock In**: Click **Clock In** as your shift starts. The running readout tracker reflects cumulative earnings automatically.
3. **Finish Shift**: Tap **Clock Out** to conclude data tracking sessions or switch job context headers interchangeably.
