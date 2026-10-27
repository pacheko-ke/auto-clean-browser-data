// Auto Clean Browsing Data - service worker (Manifest V3, works in Edge & Chrome)

const ALARM_PREFIX = "auto-clean:";
const NOTIFICATION_ID = "auto-clean-result";
const MAX_INTERVAL = 525600; // 1 year, in minutes

const LABELS = {
  history: "Browsing history",
  cache: "Cached files",
  cookies: "Cookies",
  downloads: "Download history",
  formData: "Form data",
  passwords: "Passwords",
  localStorage: "Local storage",
  indexedDB: "IndexedDB",
  serviceWorkers: "Service workers",
  cacheStorage: "Cache storage",
  fileSystems: "File system data"
};

// Types the browsingData API can scope with excludeOrigins
const ORIGIN_TYPES = new Set([
  "cookies", "localStorage", "indexedDB", "serviceWorkers", "cacheStorage", "fileSystems"
]);

const DEFAULT_SETTINGS = {
  enabled: false,
  intervalMinutes: 60,      // default interval for every type
  range: "all",             // "all" | "hour" | "day" | "week" | "month"
  notify: false,            // show a notification after each clean
  exclusions: "",           // sites to keep, one per line
  intervals: {},            // optional per-type interval override (minutes)
  types: {
    history: true, cache: true, cookies: false, downloads: false, formData: false,
    passwords: false, localStorage: false, indexedDB: false, serviceWorkers: false,
    cacheStorage: false, fileSystems: false
  }
};

const RANGE_MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 28 * 24 * 60 * 60 * 1000
};

function normalize(raw) {
  raw = raw || {};
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    types: { ...DEFAULT_SETTINGS.types, ...(raw.types || {}) },
    intervals: { ...(raw.intervals || {}) }
  };
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return normalize(settings);
}

const isValidInterval = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL;
const selectedKeys = (s) => Object.keys(s.types).filter((k) => s.types[k]);

function intervalFor(settings, key) {
  const override = settings.intervals[key];
  return isValidInterval(override) ? override : settings.intervalMinutes;
}

// "https://www.Example.com/path" or "example.com" -> "www.example.com"
function parseExclusions(text) {
  return (text || "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[\/?#].*$/, "").replace(/:\d+$/, ""))
    .filter(Boolean);
}

const originsFor = (hosts) => hosts.flatMap((h) => [`https://${h}`, `http://${h}`]);
const isExcluded = (host, hosts) => hosts.some((h) => host === h || host.endsWith("." + h));

// ---------- scheduling: one alarm per selected data type ----------

async function schedule() {
  const settings = await getSettings();

  const existing = await chrome.alarms.getAll();
  await Promise.all(
    existing.filter((a) => a.name.startsWith(ALARM_PREFIX)).map((a) => chrome.alarms.clear(a.name))
  );

  let count = 0;
  if (settings.enabled) {
    for (const key of selectedKeys(settings)) {
      const minutes = intervalFor(settings, key);
      if (!isValidInterval(minutes)) continue;
      chrome.alarms.create(ALARM_PREFIX + key, { delayInMinutes: minutes, periodInMinutes: minutes });
      count++;
    }
  }

  if (count > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
    await chrome.action.setBadgeText({ text: "ON" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

// ---------- cleaning ----------

// History can't be scoped by origin in browsingData, so delete it entry by entry
async function deleteHistoryExcept(since, hosts) {
  const items = await chrome.history.search({ text: "", startTime: since, maxResults: 1000000 });
  for (const item of items) {
    let host = "";
    try { host = new URL(item.url).hostname.toLowerCase(); } catch (_) { /* ignore bad URLs */ }
    if (host && isExcluded(host, hosts)) continue;
    await chrome.history.deleteUrl({ url: item.url });
  }
}

async function notifyResult(result) {
  const names = result.types.map((k) => LABELS[k] || k).join(", ");
  try {
    await chrome.notifications.create(NOTIFICATION_ID, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: result.ok ? "Browsing data cleaned" : "Cleaning failed",
      message: result.ok ? `Cleared: ${names}` : (result.error || "Unknown error")
    });
  } catch (_) { /* notifications may be blocked by the OS */ }
}

async function runClean(keys, settings) {
  if (keys.length === 0) {
    const result = { time: Date.now(), ok: false, error: "No data types selected.", types: [] };
    await chrome.storage.local.set({ lastRun: result });
    return result;
  }

  const hosts = parseExclusions(settings.exclusions);
  const since = settings.range === "all" ? 0 : Date.now() - RANGE_MS[settings.range];

  const originSet = {};
  const plainSet = {};
  let manualHistory = false;

  for (const k of keys) {
    if (k === "history") {
      if (hosts.length) manualHistory = true; else plainSet.history = true;
    } else if (ORIGIN_TYPES.has(k)) {
      originSet[k] = true;
    } else {
      plainSet[k] = true;
    }
  }

  const errors = [];
  const attempt = async (fn) => {
    try { await fn(); } catch (e) { errors.push(String((e && e.message) || e)); }
  };

  if (Object.keys(originSet).length) {
    const opts = hosts.length ? { since, excludeOrigins: originsFor(hosts) } : { since };
    await attempt(() => chrome.browsingData.remove(opts, originSet));
  }
  if (Object.keys(plainSet).length) {
    await attempt(() => chrome.browsingData.remove({ since }, plainSet));
  }
  if (manualHistory) {
    await attempt(() => deleteHistoryExcept(since, hosts));
  }

  const result = { time: Date.now(), ok: errors.length === 0, types: keys };
  if (errors.length) result.error = errors.join("; ");
  await chrome.storage.local.set({ lastRun: result });

  if (settings.notify) await notifyResult(result);
  return result;
}

// ---------- listeners ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const key = alarm.name.slice(ALARM_PREFIX.length);
  const settings = await getSettings();
  if (settings.enabled && settings.types[key]) runClean([key], settings);
});

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) schedule();
});

// Popup -> "Clean now" (uses the form's current values, without saving them)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "clean-now") {
    (async () => {
      const base = await getSettings();
      const settings = msg.settings ? normalize({ ...base, ...msg.settings }) : base;
      sendResponse(await runClean(selectedKeys(settings), settings));
    })();
    return true; // async response
  }
});
