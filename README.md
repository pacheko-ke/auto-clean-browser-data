# Auto Clean Browsing Data

A browser extension for Microsoft Edge (and other Chromium browsers) that automatically deletes the browsing data you choose, at an interval you set in minutes.

## Features

- Choose exactly which data to delete: history, cache, cookies, download history, form data, saved passwords, local storage, IndexedDB, service workers, cache storage and file system data
- Set a default interval in minutes, with optional per-type intervals
- Pick a time range: all time, last hour, last 24 hours, last 7 days or last 4 weeks
- List sites to keep (where the browser allows it)
- Optional notification after each clean
- "Clean now" button for an instant cleanup

## Install (unpacked)

1. Download and unzip this folder.
2. Open `edge://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Pin the extension to your toolbar.

## Usage

1. Click the extension icon.
2. Tick the data types you want deleted.
3. Enter the default interval in minutes. To give a type its own interval, type a number in the box beside it.
4. (Optional) Add sites to keep, one per line.
5. Tick **Enable automatic cleaning** and click **Save**.

A green **ON** badge on the icon shows that automatic cleaning is active.

## Good to know

- Nothing is deleted until you enable cleaning and save, or click **Clean now**.
- Deleting cookies signs you out of most websites.
- Deleting saved passwords is permanent.
- Download history removal clears the list only, not the downloaded files.
- Cleaning only runs while the browser is open.
- Sites to keep protects cookies, local storage, IndexedDB, service workers, cache storage, file system data and history. Cache, download history, form data and passwords cannot be protected per site.

## Permissions

| Permission | Used for |
| --- | --- |
| `browsingData` | Deleting the data types you select |
| `history` | Skipping protected sites when deleting history |
| `alarms` | Running cleanups on your schedule |
| `storage` | Saving your settings on your device |
| `notifications` | The optional notification after a clean |

## Privacy

All settings stay on your device. The extension collects no data, sends nothing over the network, and uses no analytics or third-party services.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension configuration (Manifest V3) |
| `background.js` | Scheduling and cleaning logic |
| `popup.html` / `popup.js` | Settings popup |
| `icons/` | Toolbar and store icons |

## Version

1.1.0
