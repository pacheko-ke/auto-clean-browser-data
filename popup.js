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
  intervalMinutes: 60,
  range: "all",
  exclusions: "",
  types: { history: true, cache: true },
  intervals: {}
};

const CHECK_SVG =
  '<svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>';

const TONE = {
  ok: "text-emerald-600 dark:text-emerald-400",
  err: "text-rose-600 dark:text-rose-400",
  muted: "text-slate-500 dark:text-slate-400"
};

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const validInterval = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL;

function line(text, tone) {
  const d = document.createElement("div");
  d.className = TONE[tone || "muted"];
  d.textContent = text;
  return d;
}

function updateState() {
  const on = $("enabled").checked;
  const el = $("stateText");
  el.textContent = on ? "Automatic cleaning is on" : "Automatic cleaning is off";
  el.className = "text-xs " + (on ? TONE.ok : TONE.muted);
}

function renderTypes(selected, intervals) {
  const container = $("types");
  container.innerHTML = "";

  for (const opt of TYPE_OPTIONS) {
    const item = document.createElement("div");
    item.className = "py-1.5";

    const row = document.createElement("div");
    row.className = "flex items-center gap-2";

    const label = document.createElement("label");
    label.className = "flex flex-1 cursor-pointer items-center gap-2.5";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "cb-input";
    cb.dataset.key = opt.key;
    cb.checked = !!selected[opt.key];

    const box = document.createElement("span");
    box.className = "cb-box";
    box.innerHTML = CHECK_SVG;

    const text = document.createElement("span");
    text.textContent = opt.label;

    label.append(cb, box, text);

    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "1";
    inp.step = "1";
    inp.placeholder = "default";
    inp.className = "tint field h-7 w-[68px] px-1.5 text-center text-xs";
    inp.title = "Interval for this data type, in minutes (blank = default)";
    inp.dataset.key = opt.key;
    if (intervals && intervals[opt.key] != null) inp.value = intervals[opt.key];

    const unit = document.createElement("span");
    unit.className = "w-6 text-[11px] text-slate-400";
    unit.textContent = "min";

    row.append(label, inp, unit);
    item.appendChild(row);

    const hint = opt.warn || opt.note;
    if (hint) {
      const h = document.createElement("div");
      h.className = "ml-[26px] mt-0.5 text-[11px] " + (opt.warn ? "text-rose-500 dark:text-rose-400" : "text-slate-400");
      h.textContent = hint;
      item.appendChild(h);
    }
    container.appendChild(item);
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

function showMessage(text, tone) {
  statusEl.replaceChildren(line(text, tone));
}

async function refreshStatus(prefix) {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  const alarms = (await chrome.alarms.getAll()).filter((a) => a.name.startsWith("auto-clean:"));
  const lines = [];

  if (prefix) lines.push(line(prefix.text, prefix.tone));

  if (alarms.length) {
    alarms.sort((a, b) => a.scheduledTime - b.scheduledTime);
    const next = alarms[0];
    const key = next.name.slice("auto-clean:".length);
    lines.push(line(`Next clean: ${new Date(next.scheduledTime).toLocaleTimeString()} (${LABELS[key] || key})`));
  }
  if (lastRun) {
    const when = new Date(lastRun.time).toLocaleString();
    lines.push(
      lastRun.ok
        ? line(`Last clean: ${when}`)
        : line(`Last attempt failed (${when}): ${lastRun.error}`, "err")
    );
  }
  statusEl.replaceChildren(...lines);
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
  updateState();
  refreshStatus();
}

$("enabled").addEventListener("change", updateState);

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
  setTimeout(() => refreshStatus({ text: "Saved.", tone: "ok" }), 300);
});

$("clean").addEventListener("click", async () => {
  const { settings: s, error } = readForm();
  if (error) return showMessage(error, "err");
  if (!Object.values(s.types).some(Boolean)) {
    return showMessage("Select at least one type of data to delete.", "err");
  }
  showMessage("Cleaning…");
  const result = await chrome.runtime.sendMessage({ type: "clean-now", settings: s });
  refreshStatus(
    result && result.ok
      ? { text: "Cleaned.", tone: "ok" }
      : { text: "Clean failed: " + ((result && result.error) || "unknown error"), tone: "err" }
  );
});

function setAll(value) {
  document.querySelectorAll("#types input[type=checkbox]").forEach((cb) => (cb.checked = value));
}
$("selectAll").addEventListener("click", (e) => { e.preventDefault(); setAll(true); });
$("selectNone").addEventListener("click", (e) => { e.preventDefault(); setAll(false); });

load();
