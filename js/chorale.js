let allChorales = [];
let filteredChorales = [];
let selectedId = null;

let melodyIndex = [];
let melodyPattern = [];
let melodySearchHits = null;

const choraleListEl = document.getElementById("chorale-list");
const choraleDetailEl = document.getElementById("chorale-detail");

const inputNumber = document.getElementById("search-number");
const inputTitle = document.getElementById("search-title");
const selectKey = document.getElementById("filter-key");
const selectMeter = document.getElementById("filter-meter");

const melodyDurationSelect = document.getElementById("melody-duration");
const melodyPitchSelect = document.getElementById("melody-pitch");
const btnMelodyAdd = document.getElementById("btn-melody-add");
const btnMelodyClear = document.getElementById("btn-melody-clear");
const btnMelodySearch = document.getElementById("btn-melody-search");
const melodyDisplayEl = document.getElementById("melody-display");
const melodyMatchModeSelect = document.getElementById("melody-match-mode");

let osmd = null;

function noteNameToMidi(name) {
  const base = {
    "C": 60, "C#": 61, "Db": 61,
    "D": 62, "D#": 63, "Eb": 63,
    "E": 64,
    "F": 65, "F#": 66, "Gb": 66,
    "G": 67, "G#": 68, "Ab": 68,
    "A": 69, "A#": 70, "Bb": 70,
    "B": 71
  };
  return base[name];
}

async function loadChorales() {
  try {
    const res = await fetch("./data/chorales_meta.json");
    allChorales = await res.json();

    allChorales.sort(
      (a, b) => (a.riemenschneider ?? a.id) - (b.riemenschneider ?? b.id)
    );

    filteredChorales = allChorales.slice();
    setupFilters();
    renderList();
  } catch (e) {
    choraleDetailEl.innerHTML = "<p>Error loading data.</p>";
    console.error("Chorales load error:", e);
  }
}

async function loadMelodyIndex() {
  try {
    const res = await fetch("./data/melody_index.json");
    melodyIndex = await res.json();
    console.log("melodyIndex loaded:", melodyIndex.length);
  } catch (e) {
    console.error("Failed to load melody_index.json", e);
  }
}

function setupFilters() {
  const keySet = new Set();
  const meterSet = new Set();

  allChorales.forEach((ch) => {
    if (ch.key_original) keySet.add(ch.key_original);
    if (ch.time_signature) meterSet.add(ch.time_signature);
  });

  [...keySet].sort().forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    selectKey.appendChild(opt);
  });

  [...meterSet].sort().forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    selectMeter.appendChild(opt);
  });
}

function applyFilter() {
  melodySearchHits = null;

  const numVal = inputNumber.value.trim();
  const titleVal = inputTitle.value.trim().toLowerCase();
  const keyVal = selectKey.value;
  const meterVal = selectMeter.value;

  filteredChorales = allChorales.filter((ch) => {
    let ok = true;
    const chNum = ch.riemenschneider ?? ch.id;

    if (numVal !== "" && Number(numVal) !== chNum) ok = false;
    if (ok && titleVal && !(ch.title || "").toLowerCase().includes(titleVal)) ok = false;
    if (ok && keyVal && ch.key_original !== keyVal) ok = false;
    if (ok && meterVal && ch.time_signature !== meterVal) ok = false;

    return ok;
  });

  renderList();
}

function renderList() {
  choraleListEl.innerHTML = "";

  if (!filteredChorales || filteredChorales.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No chorales found.";
    li.style.color = "#8792a1";
    choraleListEl.appendChild(li);
    return;
  }

  filteredChorales.forEach((ch) => {
    const li = document.createElement("li");
    li.dataset.id = ch.id;

    const num = ch.riemenschneider ?? ch.id;
    li.textContent = `${num}. ${ch.title || "(Untitled)"}`;

    if (selectedId === ch.id) li.classList.add("active");

    li.addEventListener("click", () => {
      selectedId = ch.id;
      renderList();
      renderDetail(ch);
      renderScore(ch);
      if (window.loadAudioForChorale) loadAudioForChorale(ch);
    });

    choraleListEl.appendChild(li);
  });
}

function renderDetail(ch) {
  const rows = [];

  rows.push(
    `<div class="detail-row"><span class="detail-label">Riemenschneider:</span> ${ch.riemenschneider ?? ch.id}</div>`
  );
  if (ch.bwv) {
    rows.push(
      `<div class="detail-row"><span class="detail-label">BWV:</span> ${ch.bwv}</div>`
    );
  }
  if (ch.title) {
    rows.push(
      `<div class="detail-row"><span class="detail-label">Title:</span> ${ch.title}</div>`
    );
  }
  if (ch.key_original) {
    rows.push(
      `<div class="detail-row"><span class="detail-label">Key:</span> ${ch.key_original}</div>`
    );
  }
  if (ch.time_signature) {
    rows.push(
      `<div class="detail-row"><span class="detail-label">Meter:</span> ${ch.time_signature}</div>`
    );
  }

  const riemNum = ch.riemenschneider ?? ch.id;
  if (melodySearchHits && melodySearchHits[riemNum]) {
    const hits = melodySearchHits[riemNum];
    const byVoice = {};
    hits.forEach((h) => {
      if (!byVoice[h.voice]) byVoice[h.voice] = [];
      if (h.measure != null) byVoice[h.voice].push(h.measure);
    });

    let html = `<div class="detail-block">
      <div class="detail-label">Melody matches:</div>`;

    Object.entries(byVoice).forEach(([voiceName, measures]) => {
      const uniqueMeasures = [...new Set(measures)];
      html += `<div>${voiceName}: m.${uniqueMeasures.join(", ")}</div>`;
    });

    html += `</div>`;
    rows.push(html);
  }

  choraleDetailEl.innerHTML = rows.join("");
}

async function renderScore(ch) {
  const scoreContainer = document.querySelector("#chorale-page #score-container");
  if (!scoreContainer) {
    console.error("Could not find #score-container inside #chorale-page.");
    return;
  }

  if (!ch.musicxml_path) {
    scoreContainer.innerHTML = "<p>No score file.</p>";
    return;
  }

  scoreContainer.innerHTML = "";

  const titleDiv = document.createElement("div");
  titleDiv.className = "score-title";
  titleDiv.textContent = `${ch.riemenschneider ?? ch.id}. ${ch.title || ""}`;
  scoreContainer.appendChild(titleDiv);

  const host = document.createElement("div");
  host.className = "osmd-host";
  scoreContainer.appendChild(host);

  if (!osmd) {
    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(host, {
      autoResize: true,
      drawTitle: false,
      drawComposer: false,
      drawLyricist: false
    });
  } else {
    osmd.container = host;
  }

  try {
    await osmd.load(ch.musicxml_path);
    osmd.render();
  } catch (e) {
    scoreContainer.innerHTML = "<p>Score load error.</p>";
    console.error("OSMD Error:", e);
  }
}

function searchMelodyPattern(pattern, mode = "absolute") {
  const { intervals: targetInt, durations: targetDur, pitches: targetPitch } = pattern;
  const L = targetDur.length;

  if (L < 2) return [];
  if (!Array.isArray(melodyIndex)) {
    console.warn("melodyIndex not loaded");
    return [];
  }

  const results = [];

  melodyIndex.forEach((entry) => {
    const riem = entry.riem;
    const bwv = entry.bwv;

    (entry.parts || []).forEach((part) => {
      const P = part.pitches;
      const D = part.durations;
      const I = part.intervals;
      const M = part.measures;
      const voice = part.name;

      if (!D || D.length < L) return;

      const maxStart = D.length - L;

      for (let i = 0; i <= maxStart; i++) {
        let ok = true;

        if (mode === "relative") {
          for (let k = 0; k < L - 1; k++) {
            if (I[i + k] !== targetInt[k]) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          for (let k = 0; k < L; k++) {
            if (D[i + k] !== targetDur[k]) {
              ok = false;
              break;
            }
          }
        } else {
          for (let k = 0; k < L; k++) {
            const pcEntry = P[i + k] % 12;
            const pcTarget = targetPitch[k] % 12;
            if (pcEntry !== pcTarget || D[i + k] !== targetDur[k]) {
              ok = false;
              break;
            }
          }
        }

        if (!ok) continue;

        results.push({
          riem,
          bwv,
          measure: M ? M[i] : null,
          voice
        });
      }
    });
  });

  return results;
}

function updateMelodyDisplay() {
  if (melodyPattern.length === 0) {
    melodyDisplayEl.textContent = "(No melody entered)";
    return;
  }
  melodyDisplayEl.textContent = melodyPattern
    .map((x) => `${x.pitchName}(${x.dur})`)
    .join(" – ");
}

inputNumber.addEventListener("input", applyFilter);
inputTitle.addEventListener("input", applyFilter);
selectKey.addEventListener("change", applyFilter);
selectMeter.addEventListener("change", applyFilter);

btnMelodyAdd.addEventListener("click", () => {
  const pitchName = melodyPitchSelect.value;
  const pitch = noteNameToMidi(pitchName);
  const dur = Number(melodyDurationSelect.value);

  melodyPattern.push({ pitch, pitchName, dur });
  updateMelodyDisplay();
});

btnMelodyClear.addEventListener("click", () => {
  melodyPattern = [];
  melodySearchHits = null;
  updateMelodyDisplay();

  filteredChorales = allChorales.slice();
  renderList();
});

btnMelodySearch.addEventListener("click", () => {
  if (melodyPattern.length < 2) {
    alert("Melody must contain at least 2 notes.");
    return;
  }

  const durations = melodyPattern.map((n) => n.dur);
  const pitches   = melodyPattern.map((n) => n.pitch);
  const intervals = [];

  for (let i = 0; i < melodyPattern.length - 1; i++) {
    intervals.push(melodyPattern[i + 1].pitch - melodyPattern[i].pitch);
  }

  const pattern = { intervals, durations, pitches };

  const mode = melodyMatchModeSelect
    ? melodyMatchModeSelect.value
    : "relative";

  const results = searchMelodyPattern(pattern, mode);

  const hitsByRiem = {};
  results.forEach((r) => {
    if (!hitsByRiem[r.riem]) hitsByRiem[r.riem] = [];
    hitsByRiem[r.riem].push({ voice: r.voice, measure: r.measure });
  });
  melodySearchHits = hitsByRiem;

  const hitRiemSet = new Set(Object.keys(hitsByRiem).map((x) => Number(x)));

  filteredChorales = allChorales.filter((ch) => {
    const riemNum = ch.riemenschneider ?? ch.id;
    return hitRiemSet.has(riemNum);
  });

  renderList();

  if (results.length === 0) {
    choraleDetailEl.innerHTML = "<p>No chorales contain this melody.</p>";
  } else {
    choraleDetailEl.innerHTML = "<p>Select a chorale from the list to view melody matches.</p>";
  }
});

loadChorales();
loadMelodyIndex();
updateMelodyDisplay();
