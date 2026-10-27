const TYPE_OPTIONS = [
  { key: "history", label: "Browsing history" },
  { key: "cache", label: "Cached images and files" },
  { key: "cookies", label: "Cookies and site data", warn: "Signs you out of most websites." },
  { key: "downloads", label: "Download history", note: "Removes the list only, not the files." },
  { key: "formData", label: "Autofill form data" },
  { key: "passwords", label: "Saved passwords", warn: "Permanently deletes saved passwords." },
  { key: "localStorage", label: "Local storage" },
  { key: "indexedDB", label: "IndexedDB" },
  { key: "serviceWorkers", label: "Service workers" },
  { key: "cacheStorage", label: "Cache storage" },
  { key: "fileSystems", label: "File system data" }
];
const LABELS = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.key, o.label]));
const MAX_INTERVAL = 525600;

const DEFAULTS = {
  enabled: false,
  notify: false,
  intervalMinutes: 10,
  range: "all",
  exclusions: "",
  types: { history: true, cache: true },
  intervals: {}
};

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const validInterval = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL;

function renderTypes(selected, intervals) {
  const container = $("types");
  container.innerHTML = "";
  for (const opt of TYPE_OPTIONS) {
    const row = document.createElement("div");
    row.className = "typeRow";

    const label = document.createElement("label");
    label.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = opt.key;
    cb.checked = !!selected[opt.key];
    label.append(cb, document.createTextNode(opt.label));

    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "tint";
    inp.min = "1";
    inp.step = "1";
    inp.placeholder = "default";
    inp.title = "Interval for this data type, in minutes (blank = default)";
    inp.dataset.key = opt.key;
    if (intervals && intervals[opt.key] != null) inp.value = intervals[opt.key];

    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "min";

    row.append(label, inp, unit);
    container.appendChild(row);

    const hint = opt.warn || opt.note;
    if (hint) {
      const h = document.createElement("div");
      h.className = opt.warn ? "warn" : "note";
      h.textContent = hint;
      container.appendChild(h);
    }
  }
}

// Returns { settings } or { error }
function readForm() {
  const types = {};
  document.querySelectorAll("#types input[type=checkbox]").forEach((cb) => {
    types[cb.dataset.key] = cb.checked;
  });

  const intervals = {};
  for (const inp of document.querySelectorAll("#types input.tint")) {
    if (inp.value.trim() === "") continue;
    const n = Number(inp.value);
    if (!validInterval(n)) {
      return { error: `Interval for "${LABELS[inp.dataset.key]}" must be a whole number of minutes (1 or more).` };
    }
    intervals[inp.dataset.key] = n;
  }

  return {
    settings: {
      enabled: $("enabled").checked,
      notify: $("notify").checked,
      intervalMinutes: Number($("interval").value),
      range: $("range").value,
      exclusions: $("exclusions").value,
      types,
      intervals
    }
  };
}

function showMessage(text, cls) {
  statusEl.innerHTML = "";
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  statusEl.appendChild(d);
}

async function refreshStatus(prefix) {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  const alarms = (await chrome.alarms.getAll()).filter((a) => a.name.startsWith("auto-clean:"));
  statusEl.innerHTML = "";

  const add = (text, cls) => {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = text;
    statusEl.appendChild(d);
  };

  if (prefix) add(prefix.text, prefix.cls);

  if (alarms.length) {
    alarms.sort((a, b) => a.scheduledTime - b.scheduledTime);
    const next = alarms[0];
    const key = next.name.slice("auto-clean:".length);
    add(`Next clean: ${new Date(next.scheduledTime).toLocaleTimeString()} (${LABELS[key] || key})`);
  }
  if (lastRun) {
    const when = new Date(lastRun.time).toLocaleString();
    if (lastRun.ok) add(`Last clean: ${when}`);
    else add(`Last attempt failed (${when}): ${lastRun.error}`, "err");
  }
}

async function load() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = { ...DEFAULTS, ...(settings || {}) };
  $("enabled").checked = s.enabled;
  $("notify").checked = s.notify;
  $("interval").value = s.intervalMinutes;
  $("range").value = s.range;
  $("exclusions").value = s.exclusions || "";
  renderTypes(s.types || {}, s.intervals || {});
  refreshStatus();
}

$("save").addEventListener("click", async () => {
  const { settings: s, error } = readForm();
  if (error) return showMessage(error, "err");

  if (!validInterval(s.intervalMinutes)) {
    return showMessage("Enter a whole number of minutes (1 or more) for the default interval.", "err");
  }
  if (s.enabled && !Object.values(s.types).some(Boolean)) {
    return showMessage("Select at least one type of data to delete.", "err");
  }

  await chrome.storage.local.set({ settings: s });
  // Let the background worker reschedule before reading the alarms
  setTimeout(() => refreshStatus({ text: "Saved.", cls: "ok" }), 300);
});

$("clean").addEventListener("click", async () => {
  const { settings: s, error } = readForm();
  if (error) return showMessage(error, "err");
  if (!Object.values(s.types).some(Boolean)) {
    return showMessage("Select at least one type of data to delete.", "err");
  }
  showMessage("Cleaning…");
  const result = await chrome.runtime.sendMessage({ type: "clean-now", settings: s });
  refreshStatus(result && result.ok
    ? { text: "Cleaned.", cls: "ok" }
    : { text: "Clean failed: " + ((result && result.error) || "unknown error"), cls: "err" });
});

function setAll(value) {
  document.querySelectorAll("#types input[type=checkbox]").forEach((cb) => (cb.checked = value));
}
$("selectAll").addEventListener("click", (e) => { e.preventDefault(); setAll(true); });
$("selectNone").addEventListener("click", (e) => { e.preventDefault(); setAll(false); });

load();
