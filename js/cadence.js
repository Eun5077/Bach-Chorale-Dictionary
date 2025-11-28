window.initCadencePage = function () {
  console.log("initCadencePage called");

  const groupListEl = document.getElementById("cadence-group-list");
  const detailEl = document.getElementById("cadence-detail");
  const scoreContainer = document.getElementById("cadence-score-container");
  const toggleFullBtn = document.getElementById("cadence-toggle-full");

  const voiceSelect = document.getElementById("cadence-voice-select");
  const matchModeSelect = document.getElementById("cadence-melody-match-mode");
  const pitchSelect = document.getElementById("cadence-melody-pitch");
  const durSelect = document.getElementById("cadence-melody-duration");
  const btnMelodyAdd = document.getElementById("cadence-melody-add");
  const btnMelodyClear = document.getElementById("cadence-melody-clear");
  const btnMelodySearch = document.getElementById("cadence-melody-search");
  const melodyDisplayEl = document.getElementById("cadence-melody-display");
  const melodyResultsEl = document.getElementById("cadence-melody-results");

  const keyModeSelect = document.getElementById("cadence-key-mode");
  const keyRootSelect = document.getElementById("cadence-key-root");
  const cadenceTypeSelect = document.getElementById("cadence-filter-type");
  const finalRoleSelect = document.getElementById("cadence-filter-final-role");
  const sortSelect = document.getElementById("cadence-sort-by");

  if (!groupListEl || !detailEl || !scoreContainer) {
    console.error("[Cadence] Required DOM elements missing.");
    return;
  }

  let allCadences = [];
  let filteredGroups = [];

  let selectedGroupId = null;
  let selectedCadenceId = null;
  let currentCadence = null;
  let showFullChorale = false;

  const melodyPattern = [];
  let melodyFilterSet = null;

  let currentSort = "default";

  let osmdCadence = null;

  function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function parseKeyString(keyStr) {
    if (!keyStr || typeof keyStr !== "string") return { root: null, mode: null };
    const parts = keyStr.trim().split(/\s+/);
    const root = parts[0] || null;
    const mode = parts[1] ? parts[1].toLowerCase() : null;
    return { root, mode };
  }

  function pitchNameToPc(name) {
    if (!name) return null;
    const pcMap = {
      C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6,
      G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
    };
    const upper = name.toUpperCase();
    return pcMap[upper] ?? null;
  }

  function pcToName(pc) {
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const n = ((pc % 12) + 12) % 12;
    return names[n] || `PC${pc}`;
  }

  function durToLabel(d) {
    const v = Number(d);
    if (v === 0.25) return "16th";
    if (v === 0.5) return "8th";
    if (v === 1.0) return "¼";
    if (v === 2.0) return "½";
    if (v === 4.0) return "1";
    return String(d);
  }

  async function loadCadences() {
    try {
      console.log("[Cadence] loading cadences_meta.json...");
      const res = await fetch("./data/cadences_meta.json");
      if (!res.ok) {
        detailEl.innerHTML = "<p>Error loading cadences (fetch failed)</p>";
        return;
      }
      const json = await res.json();
      allCadences = Array.isArray(json) ? json : Object.values(json);

      applyFiltersGroupAndSort();

      if (filteredGroups.length > 0) {
        const g0 = filteredGroups[0];
        selectedGroupId = g0.groupId;
        const c0 = g0.cadences[0];
        selectedCadenceId = c0.id;
        currentCadence = c0;
        renderGroupList();
        renderDetail(g0, c0);
        renderScore(c0);
        updateToggleButton();
      }
    } catch (err) {
      detailEl.innerHTML = "<p>Error loading cadences (JSON parse failed)</p>";
    }
  }

  function refreshMelodyDisplay() {
    if (!melodyDisplayEl) return;
    if (melodyPattern.length === 0) {
      melodyDisplayEl.textContent = "(No melody entered)";
      return;
    }
    melodyDisplayEl.textContent = melodyPattern
      .map((n) => `${pcToName(n.pitch)}(${durToLabel(n.dur)})`)
      .join(" – ");
  }

  function performMelodySearch() {
    if (!voiceSelect) return;

    const voiceName = voiceSelect.value || "soprano";
    const matchMode = (matchModeSelect && matchModeSelect.value) || "absolute";
    const L = melodyPattern.length;

    if (L === 0) {
      melodyFilterSet = null;
      if (melodyResultsEl) melodyResultsEl.textContent = "";
      applyFiltersGroupAndSort();
      return;
    }

    const targetP = melodyPattern.map((n) => n.pitch);
    const targetD = melodyPattern.map((n) => n.dur);

    let targetInt = null;
    if (matchMode === "relative" && L >= 2) {
      targetInt = [];
      for (let i = 0; i < L - 1; i++) {
        targetInt.push((targetP[i + 1] - targetP[i] + 12) % 12);
      }
    }

    const resultIds = new Set();

    allCadences.forEach((c) => {
      const v = (c.voices || {})[voiceName];
      if (!v) return;

      const Praw = Array.isArray(v.midi) ? v.midi.map(Number) : [];
      const Draw = Array.isArray(v.durations) ? v.durations.map(Number) : [];
      if (Praw.length !== Draw.length || Praw.length < L) return;

      const PC = Praw.map((p) => ((p % 12) + 12) % 12);
      const D = Draw;
      let matched = false;

      if (matchMode === "absolute" || !targetInt) {
        for (let start = 0; start <= PC.length - L; start++) {
          let ok = true;
          for (let k = 0; k < L; k++) {
            if (PC[start + k] !== targetP[k]) { ok = false; break; }
            if (safeNumber(D[start + k]) !== targetD[k]) { ok = false; break; }
          }
          if (ok) { matched = true; break; }
        }
      } else {
        const I = [];
        for (let i = 0; i < PC.length - 1; i++) {
          I.push((PC[i + 1] - PC[i] + 12) % 12);
        }

        for (let start = 0; start <= PC.length - L; start++) {
          let ok = true;
          for (let k = 0; k < L; k++) {
            if (safeNumber(D[start + k]) !== targetD[k]) { ok = false; break; }
          }
          if (!ok) continue;
          for (let k = 0; k < L - 1; k++) {
            if (I[start + k] !== targetInt[k]) { ok = false; break; }
          }
          if (ok) { matched = true; break; }
        }
      }

      if (matched) resultIds.add(c.id);
    });

    melodyFilterSet = resultIds;
    if (melodyResultsEl) {
      const cnt = resultIds.size;
      const voiceLabel = voiceName[0].toUpperCase() + voiceName.slice(1);
      melodyResultsEl.textContent = `${cnt} cadences found in ${voiceLabel}.`;
    }

    applyFiltersGroupAndSort();
  }

  function clearMelodyPatternAndFilter() {
    melodyPattern.length = 0;
    melodyFilterSet = null;
    refreshMelodyDisplay();
    if (melodyResultsEl) melodyResultsEl.textContent = "";
    applyFiltersGroupAndSort();
  }

  function passKeyFilter(c) {
    const modeVal = keyModeSelect?.value;
    const rootVal = keyRootSelect?.value;
    if (!modeVal && !rootVal) return true;

    const { root, mode } = parseKeyString(c.key_original);
    if (modeVal && mode !== modeVal) return false;
    if (rootVal && root !== rootVal) return false;
    return true;
  }

  function passCadenceTypeFilter(c) {
    const val = cadenceTypeSelect?.value;
    if (!val) return true;
    return (c.cadence_type || "") === val;
  }

  function passFinalRoleFilter(c) {
    const val = finalRoleSelect?.value;
    if (!val) return true;
    const r = c.final_soprano_role;
    if (val === "other") {
      return !(r === "root" || r === "third" || r === "fifth");
    }
    return r === val;
  }

  function passMelodyFilter(c) {
    if (!melodyFilterSet) return true;
    return melodyFilterSet.has(c.id);
  }

  function buildGroups(arr) {
    const map = new Map();
    arr.forEach((c) => {
      const sig = c.soprano_signature || "__NO_SIG__" + c.id;
      if (!map.has(sig)) map.set(sig, []);
      map.get(sig).push(c);
    });

    const groups = [];
    let idx = 0;

    map.forEach((list, sig) => {
      if (list.length <= 1) return;
      list.sort((a, b) => {
        const ra = a.riemenschneider ?? a.id;
        const rb = b.riemenschneider ?? b.id;
        return ra < rb ? -1 : ra > rb ? 1 : 0;
      });

      const rep = list[0];
      const groupId = "grp_" + String(idx).padStart(4, "0");
      idx++;

      groups.push({
        groupId,
        signature: sig,
        size: list.length,
        cadences: list,
        rep,
      });
    });

    return groups;
  }

  function sortGroups(groups) {
    const m = currentSort;

    if (m === "default") {
      groups.sort((a, b) => {
        const ra = a.rep.riemenschneider ?? a.rep.id;
        const rb = b.rep.riemenschneider ?? b.rep.id;
        return ra < rb ? -1 : ra > rb ? 1 : 0;
      });
      return;
    }

    if (m === "final-soprano") {
      const rank = { root: 0, third: 1, fifth: 2 };
      groups.sort((a, b) => {
        const ra = rank[a.rep.final_soprano_role] ?? 3;
        const rb = rank[b.rep.final_soprano_role] ?? 3;
        if (ra !== rb) return ra - rb;
        const na = a.rep.riemenschneider ?? a.rep.id;
        const nb = b.rep.riemenschneider ?? b.rep.id;
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
      return;
    }

    if (m === "cadence-type") {
      const R = {
        authentic: 0,
        "plagal/half": 1,
        deceptive: 2,
        phrygian: 3,
        other: 4,
      };
      groups.sort((a, b) => {
        const ta = (a.rep.cadence_type || "").toLowerCase();
        const tb = (b.rep.cadence_type || "").toLowerCase();
        const ra = R.hasOwnProperty(ta) ? R[ta] : 4;
        const rb = R.hasOwnProperty(tb) ? R[tb] : 4;
        if (ra !== rb) return ra - rb;
        const na = a.rep.riemenschneider ?? a.rep.id;
        const nb = b.rep.riemenschneider ?? b.rep.id;
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
      return;
    }

    if (m === "soprano-line") {
      groups.sort((a, b) => {
        const sa = a.signature || "";
        const sb = b.signature || "";
        if (sa !== sb) return sa < sb ? -1 : 1;
        const na = a.rep.riemenschneider ?? a.rep.id;
        const nb = b.rep.riemenschneider ?? b.rep.id;
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
      return;
    }

    if (m === "bass-line") {
      groups.sort((a, b) => {
        const sa = a.rep.bass_signature || "";
        const sb = b.rep.bass_signature || "";
        if (sa !== sb) return sa < sb ? -1 : 1;
        const na = a.rep.riemenschneider ?? a.rep.id;
        const nb = b.rep.riemenschneider ?? b.rep.id;
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
      return;
    }
  }

  function applyFiltersGroupAndSort() {
    const filteredCadences = allCadences.filter((c) => {
      if (!passKeyFilter(c)) return false;
      if (!passCadenceTypeFilter(c)) return false;
      if (!passFinalRoleFilter(c)) return false;
      if (!passMelodyFilter(c)) return false;
      return true;
    });

    let groups = buildGroups(filteredCadences);
    sortGroups(groups);

    filteredGroups = groups;
    renderGroupList();
  }

  function renderGroupList() {
    groupListEl.innerHTML = "";

    if (!filteredGroups.length) {
      const li = document.createElement("li");
      li.textContent = "No results";
      li.style.color = "#8792a1";
      groupListEl.appendChild(li);
      detailEl.innerHTML = "Select a cadence group from the list.";
      scoreContainer.innerHTML = "";
      currentCadence = null;
      return;
    }

    filteredGroups.forEach((g) => {
      const li = document.createElement("li");
      li.dataset.groupId = g.groupId;

      const rep = g.rep;
      const numLabel = rep.riemenschneider ?? rep.id;
      const titleLabel = rep.chorale_title || "";

      const measures =
        rep.start_measure != null && rep.end_measure != null
          ? rep.start_measure === rep.end_measure
            ? `m.${rep.start_measure}`
            : `m.${rep.start_measure}–${rep.end_measure}`
          : "";

      li.innerHTML = `
        <div class="list-main-line">${titleLabel}</div>
        <div class="list-sub-line">
          Cadences: ${g.size} &nbsp;·&nbsp;
          Example: ${numLabel} ${measures}
        </div>
      `;

      if (selectedGroupId === g.groupId) li.classList.add("active");

      li.addEventListener("click", () => {
        selectedGroupId = g.groupId;
        const first = g.cadences[0];
        selectedCadenceId = first.id;
        currentCadence = first;
        showFullChorale = false;

        renderGroupList();
        renderDetail(g, first);
        renderScore(first);
        updateToggleButton();
      });

      groupListEl.appendChild(li);
    });

    if (!selectedGroupId && filteredGroups.length > 0) {
      const g0 = filteredGroups[0];
      selectedGroupId = g0.groupId;
      const c0 = g0.cadences[0];
      selectedCadenceId = c0.id;
      currentCadence = c0;
      showFullChorale = false;
      renderGroupList();
      renderDetail(g0, c0);
      renderScore(c0);
      updateToggleButton();
    }
  }

  function renderDetail(group, cadence) {
    if (!group || !cadence) {
      detailEl.innerHTML = "Select a cadence group from the list.";
      return;
    }

    const c = cadence;
    const rows = [];
    const numLabel = c.riemenschneider ?? c.id;
    const titleLabel = c.chorale_title || "";

    rows.push(`<div class="detail-row"><span class="detail-label">Cadence:</span> ${numLabel}. ${titleLabel}</div>`);

    if (c.cadence_type) {
      rows.push(`<div class="detail-row"><span class="detail-label">Cadence Type:</span> ${c.cadence_type}</div>`);
    }

    if (c.key_original) {
      rows.push(`<div class="detail-row"><span class="detail-label">Key:</span> ${c.key_original}</div>`);
    }

    if (c.time_signature) {
      rows.push(`<div class="detail-row"><span class="detail-label">Meter:</span> ${c.time_signature}</div>`);
    }

    const srcParts = [];
    if (c.riemenschneider) srcParts.push(`Riem. ${c.riemenschneider}`);
    if (c.bwv) srcParts.push(`BWV ${c.bwv}`);
    if (c.chorale_title) srcParts.push(`"${c.chorale_title}"`);
    if (c.start_measure != null && c.end_measure != null) {
      if (c.start_measure === c.end_measure) {
        srcParts.push(`m.${c.start_measure}`);
      } else {
        srcParts.push(`m.${c.start_measure}–${c.end_measure}`);
      }
    }

    if (srcParts.length > 0) {
      rows.push(`<div class="detail-row"><span class="detail-label">Source:</span> ${srcParts.join(" · ")}</div>`);
    }

    if (c.final_soprano_name || c.final_bass_name) {
      const info = [];
      if (c.final_soprano_name) {
        info.push(`S: ${c.final_soprano_name}${c.final_soprano_role ? " (" + c.final_soprano_role + ")" : ""}`);
      }
      if (c.final_bass_name) info.push(`B: ${c.final_bass_name}`);
      rows.push(`<div class="detail-row"><span class="detail-label">Final chord:</span> ${info.join(" / ")}</div>`);
    }

    const listHtml = (group.cadences || [])
      .map((cad) => {
        const active = cad.id === selectedCadenceId;
        const cls = active ? "phrase-item active" : "phrase-item";
        let meas = "";
        if (cad.start_measure != null && cad.end_measure != null) {
          meas = cad.start_measure === cad.end_measure
            ? `m.${cad.start_measure}`
            : `m.${cad.start_measure}–${cad.end_measure}`;
        }
        const labelNum = cad.riemenschneider ?? cad.id;
        return `<div class="${cls}" data-cad-id="${cad.id}">
          ${labelNum} ${meas} &nbsp;–&nbsp; ${cad.chorale_title || ""}
        </div>`;
      })
      .join("");

    rows.push(`
      <div class="detail-block">
        <div class="detail-label">Cadences in this group:</div>
        ${listHtml}
      </div>
    `);

    detailEl.innerHTML = rows.join("");

    detailEl.querySelectorAll(".phrase-item").forEach((el) => {
      el.addEventListener("click", () => {
        const cid = el.dataset.cadId;
        selectedCadenceId = cid;
        const target = group.cadences.find((x) => x.id === cid);
        if (target) {
          currentCadence = target;
          showFullChorale = false;
          renderDetail(group, target);
          renderScore(target);
          updateToggleButton();
        }
      });
    });
  }

  async function renderScore(c) {
    if (!c) {
      scoreContainer.innerHTML = "<p>No cadence selected.</p>";
      return;
    }

    scoreContainer.innerHTML = "";

    const titleDiv = document.createElement("div");
    titleDiv.className = "score-title";

    const numLabel = c.riemenschneider ?? c.id;
    const labelTitle = c.chorale_title || "";

    titleDiv.textContent = showFullChorale
      ? `Full chorale of ${numLabel}. ${labelTitle}`
      : `Cadence from ${numLabel}. ${labelTitle}`;

    scoreContainer.appendChild(titleDiv);

    const host = document.createElement("div");
    host.className = "osmd-host";
    scoreContainer.appendChild(host);

    let xmlPath = null;
    if (showFullChorale) {
      xmlPath = c.source_musicxml || c.musicxml_path;
    } else {
      xmlPath = c.musicxml_path;
    }


    console.log("[Cadence] loading score:", xmlPath);

    if (!osmdCadence) {
      osmdCadence = new opensheetmusicdisplay.OpenSheetMusicDisplay(host, {
        autoResize: true,
        drawTitle: false,
        drawComposer: false,
        drawLyricist: false,
      });
    } else {
      osmdCadence.container = host;
    }

    try {
      await osmdCadence.load(xmlPath);
      osmdCadence.render();

      const svg = host.querySelector("svg");
      if (svg) {
        svg.querySelectorAll("text").forEach((t) => {
          const s = t.textContent.trim();
          if (/^bwv\d+/i.test(s) || s === "J.S. Bach" || s.toLowerCase().includes("music21")) {
            t.remove();
          }
        });
      }
    } catch (e) {
      console.error("[Cadence] OSMD Error:", e);
      scoreContainer.innerHTML = "<p>Score load error</p>";
    }
  }

  function updateToggleButton() {
    if (!toggleFullBtn) return;
    if (!currentCadence) {
      toggleFullBtn.disabled = true;
      toggleFullBtn.textContent = "Show Full Chorale";
    } else {
      toggleFullBtn.disabled = false;
      toggleFullBtn.textContent = showFullChorale
        ? "Show Cadence Only"
        : "Show Full Chorale";
    }
  }

  if (btnMelodyAdd && pitchSelect && durSelect) {
    btnMelodyAdd.addEventListener("click", () => {
      const pc = pitchNameToPc(pitchSelect.value);
      const dur = safeNumber(durSelect.value);
      if (pc == null || dur == null) return;
      melodyPattern.push({ pitch: pc, dur });
      refreshMelodyDisplay();
    });
  }

  if (btnMelodyClear) {
    btnMelodyClear.addEventListener("click", () => {
      clearMelodyPatternAndFilter();
    });
  }

  if (btnMelodySearch) {
    btnMelodySearch.addEventListener("click", () => {
      performMelodySearch();
    });
  }

  if (keyModeSelect) keyModeSelect.addEventListener("change", applyFiltersGroupAndSort);
  if (keyRootSelect) keyRootSelect.addEventListener("change", applyFiltersGroupAndSort);
  if (cadenceTypeSelect) cadenceTypeSelect.addEventListener("change", applyFiltersGroupAndSort);
  if (finalRoleSelect) finalRoleSelect.addEventListener("change", applyFiltersGroupAndSort);

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSort = sortSelect.value || "default";
      applyFiltersGroupAndSort();
    });
  }

  if (toggleFullBtn) {
    toggleFullBtn.addEventListener("click", () => {
      if (!currentCadence) return;
      showFullChorale = !showFullChorale;
      updateToggleButton();
      renderScore(currentCadence);
    });
  }

  refreshMelodyDisplay();
  updateToggleButton();
  loadCadences();
};
