const sopranoGroupListEl    = document.getElementById("soprano-group-list");
const sopranoDetailEl       = document.getElementById("soprano-detail");
const sopranoScoreContainer = document.getElementById("soprano-score-container");

const sopranoSearchNumberEl = document.getElementById("soprano-search-number");
const sopranoSearchTitleEl  = document.getElementById("soprano-search-title");

const sopranoToggleFullBtn   = document.getElementById("soprano-toggle-full");

let allSopranoGroups      = [];
let filteredSopranoGroups = [];
let selectedGroupId       = null;
let selectedPhraseId      = null;

let currentPhraseForScore = null;
let sopranoShowFull       = false;

let sopranoOsmd = null;

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function safeSum(arr) {
  return arr.reduce((acc, v) => acc + (typeof v === "number" ? v : 0), 0);
}

const SOPRANO_PITCH_TO_MIDI = {
  "C": 60,
  "C#": 61,
  "D": 62,
  "D#": 63,
  "E": 64,
  "F": 65,
  "F#": 66,
  "G": 67,
  "G#": 68,
  "A": 69,
  "A#": 70,
  "B": 71,
};

function pitchNameToMidi(name) {
  return SOPRANO_PITCH_TO_MIDI[name] ?? NaN;
}

function midiToName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return names[pitchClass] + octave;
}

function durToSymbol(d) {
  if (d === 1 || d === 1.0) return "¼";
  if (d === 0.5) return "⅛";
  if (d === 2 || d === 2.0) return "½";
  return d.toString();
}

function extractRiemNumberFromTitle(title) {
  if (!title) return null;
  const m = title.match(/^(\d+)\s*\./);
  if (!m) return null;
  return Number(m[1]);
}

async function loadSopranoGroups() {
  try {
    const res  = await fetch("./data/soprano_groups.json");
    const data = await res.json();

    let groups = data.groups || [];

    groups = groups.filter(g => {
      const sizeFromField  = g.size || 0;
      const sizeFromArray  = (g.phrases || []).length;
      const size = sizeFromField || sizeFromArray;
      return size > 1;
    });

    groups.sort(
      (a, b) =>
        (b.size || (b.phrases || []).length || 0) -
        (a.size || (a.phrases || []).length || 0)
    );

    allSopranoGroups      = groups;
    filteredSopranoGroups = groups.slice();
    renderSopranoGroupList();
  } catch (err) {
    console.error("Failed to load soprano_groups.json", err);
    sopranoDetailEl.innerHTML = "<p>Data load error</p>";
  }
}

function applySopranoFilters() {
  const numValRaw = (sopranoSearchNumberEl?.value || "").trim();
  const titleVal  = (sopranoSearchTitleEl?.value || "").trim().toLowerCase();

  const numVal = numValRaw === "" ? null : Number(numValRaw);

  let groups = allSopranoGroups.slice();

  if (numVal !== null || titleVal) {
    groups = groups.filter((g) => {
      const phrases = g.phrases || [];
      return phrases.some((ph) => {
        const t = ph.title || "";
        const lowerT = t.toLowerCase();
        let ok = true;

        if (numVal !== null) {
          const n = extractRiemNumberFromTitle(t);
          ok = n === numVal;
        }

        if (ok && titleVal) {
          ok = lowerT.includes(titleVal);
        }

        return ok;
      });
    });
  }

  groups.sort(
    (a, b) =>
      (b.size || (b.phrases || []).length || 0) -
      (a.size || (a.phrases || []).length || 0)
  );

  filteredSopranoGroups = groups;
  renderSopranoGroupList();
}

function renderSopranoGroupList() {
  sopranoGroupListEl.innerHTML = "";

  if (!filteredSopranoGroups.length) {
    const li = document.createElement("li");
    li.textContent = "No phrase groups share the same soprano melody as the selected chorale.";
    li.style.color = "#8792a1";
    sopranoGroupListEl.appendChild(li);
    sopranoDetailEl.innerHTML = "Select a phrase group from the list.";
    sopranoScoreContainer.innerHTML = "";
    currentPhraseForScore = null;
    return;
  }

  filteredSopranoGroups.forEach((g) => {
    const li = document.createElement("li");
    li.dataset.groupId = g.groupId;

    const phrases = g.phrases || [];
    const size    = g.size || phrases.length || 0;
    const first   = phrases[0] || {};

    const title    = first.title || first.pieceId || g.groupId;
    const measures = first.measures || "";

    li.innerHTML = `
      <div class="list-main-line">${title}</div>
      <div class="list-sub-line">
        Phrases: ${size} &nbsp;·&nbsp;
        Example: ${first.pieceId || ""} ${measures}
      </div>
    `;

    if (selectedGroupId === g.groupId) {
      li.classList.add("active");
    }

    li.addEventListener("click", () => {
      selectedGroupId  = g.groupId;
      selectedPhraseId = first.id || null;
      currentPhraseForScore = first;
      sopranoShowFull = false;

      renderSopranoGroupList();
      renderSopranoDetail(g, first);
      renderSopranoScore(first);
      updateSopranoToggleButton();
    });

    sopranoGroupListEl.appendChild(li);
  });

  if (!selectedGroupId && filteredSopranoGroups.length > 0) {
    const g0    = filteredSopranoGroups[0];
    const first = (g0.phrases || [])[0];

    if (first) {
      selectedGroupId       = g0.groupId;
      selectedPhraseId      = first.id;
      currentPhraseForScore = first;
      sopranoShowFull       = false;
      renderSopranoGroupList();
      renderSopranoDetail(g0, first);
      renderSopranoScore(first);
      updateSopranoToggleButton();
    }
  }
}

function renderSopranoDetail(group, phrase) {
  if (!group || !phrase) {
    sopranoDetailEl.innerHTML = "Select a phrase group from the list.";
    return;
  }

  const durs      = group.durations || [];
  const totalDur  = safeSum(durs);
  const approxBars = totalDur / 4.0;

  const rows = [];

  rows.push(
    `<div class="detail-row"><span class="detail-label">Group ID:</span> ${group.groupId}</div>`
  );
  rows.push(
    `<div class="detail-row"><span class="detail-label">Group size:</span> ${group.size || group.phrases.length} phrases</div>`
  );
  rows.push(
    `<div class="detail-row"><span class="detail-label">Approx. length:</span> ${approxBars.toFixed(
      2
    )} bars (assuming 4/4)</div>`
  );
  rows.push(
    `<div class="detail-row"><span class="detail-label">Intervals:</span> ${(group.intervals || []).join(
      ", "
    )}</div>`
  );
  rows.push(
    `<div class="detail-row"><span class="detail-label">Example:</span> ${phrase.title || ""} (${phrase.pieceId ||
      ""}, ${phrase.measures || ""})</div>`
  );

  const phraseListHtml = (group.phrases || [])
    .map((ph) => {
      const active = ph.id === selectedPhraseId;
      const cls = active ? "phrase-item active" : "phrase-item";
      return `<div class="${cls}" data-phrase-id="${ph.id}">
        ${ph.pieceId || ""} ${ph.measures || ""} &nbsp;–&nbsp; ${ph.title || ""}
      </div>`;
    })
    .join("");

  rows.push(
    `<div class="detail-block">
       <div class="detail-label">Phrases in this group:</div>
       ${phraseListHtml}
     </div>`
  );

  sopranoDetailEl.innerHTML = rows.join("");

  sopranoDetailEl.querySelectorAll(".phrase-item").forEach((el) => {
    el.addEventListener("click", () => {
      const pid = el.dataset.phraseId;
      selectedPhraseId = pid;

      const target = (group.phrases || []).find((ph) => ph.id === pid);
      if (target) {
        currentPhraseForScore = target;
        sopranoShowFull       = false;
        renderSopranoDetail(group, target);
        renderSopranoScore(target);
        updateSopranoToggleButton();
      }
    });
  });
}

async function renderSopranoScore(phrase) {
  if (!phrase) {
    sopranoScoreContainer.innerHTML = "<p>No phrase selected.</p>";
    return;
  }

  let xmlPath   = phrase.xmlPath;
  let titleText = "";

  if (sopranoShowFull) {
    xmlPath = `xml/scores/${phrase.pieceId}.musicxml`;
    titleText = `${phrase.title || ""} – full chorale (${phrase.pieceId})`;
    if (phrase.measures) {
      titleText += ` · phrase ${phrase.measures}`;
    }
  } else {
    xmlPath = phrase.xmlPath;
    titleText = `${phrase.title || ""}`;
    if (phrase.measures) {
      titleText += ` – ${phrase.measures}`;
    }
  }

  sopranoScoreContainer.innerHTML = "";

  const titleDiv = document.createElement("div");
  titleDiv.className = "score-title";
  titleDiv.textContent = titleText;
  sopranoScoreContainer.appendChild(titleDiv);

  const host = document.createElement("div");
  host.className = "osmd-host";
  sopranoScoreContainer.appendChild(host);

  if (!sopranoOsmd) {
    sopranoOsmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(host, {
      autoResize: true,
      drawTitle: false,
      drawComposer: false,
      drawLyricist: false,
    });
  } else {
    sopranoOsmd.container = host;
  }

  try {
    await sopranoOsmd.load(xmlPath);
    sopranoOsmd.render();

    const svg = host.querySelector("svg");
    if (svg) {
      svg.querySelectorAll("text").forEach((t) => {
        const s = t.textContent.trim();
        if (
          /^bwv\d+/i.test(s) ||
          s === "J.S. Bach" ||
          s.toLowerCase().includes("music21")
        ) {
          t.remove();
        }
      });
    }
  } catch (e) {
    console.error("OSMD Error:", e);
    sopranoScoreContainer.innerHTML = "<p>Score load error</p>";
  }
}

function updateSopranoToggleButton() {
  if (!sopranoToggleFullBtn) return;
  if (!currentPhraseForScore) {
    sopranoToggleFullBtn.disabled = true;
    sopranoToggleFullBtn.textContent = "Show Full Chorale";
  } else {
    sopranoToggleFullBtn.disabled = false;
    sopranoToggleFullBtn.textContent = sopranoShowFull
      ? "Show Phrase Only"
      : "Show Full Chorale";
  }
}

if (sopranoSearchNumberEl) {
  sopranoSearchNumberEl.addEventListener("input", applySopranoFilters);
}
if (sopranoSearchTitleEl) {
  sopranoSearchTitleEl.addEventListener("input", applySopranoFilters);
}

if (sopranoToggleFullBtn) {
  sopranoToggleFullBtn.addEventListener("click", () => {
    if (!currentPhraseForScore) return;
    sopranoShowFull = !sopranoShowFull;
    updateSopranoToggleButton();
    renderSopranoScore(currentPhraseForScore);
  });
}

loadSopranoGroups();
updateSopranoToggleButton();
