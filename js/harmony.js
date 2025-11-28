window.initHarmonyPage = function () {
  const page = document.getElementById("harmony-page");
  if (!page) return;

  const listEl         = page.querySelector("#harmony-chorale-list");
  const detailEl       = page.querySelector("#harmony-detail");
  const scoreContainer = page.querySelector("#harmony-score-container");
  const toggleBtn      = page.querySelector("#harmony-toggle-answer");

  let allChorales = [];
  let filteredChorales = [];
  let selectedId = null;
  let currentCh = null;
  let showAnswer = false;

  let osmd = null;

  function getBassPath(ch) {
    if (ch.musicxml_bass_path) return ch.musicxml_bass_path;
    if (!ch.musicxml_path) return null;

    const original = ch.musicxml_path;
    const dotIdx = original.lastIndexOf(".");
    let base = original;
    let ext = "";
    if (dotIdx !== -1) {
      base = original.slice(0, dotIdx);
      ext  = original.slice(dotIdx);
    }
    base = base.replace("scores/", "scores_bass/");
    return base + "_bass" + ext;
  }

  function updateToggleLabel() {
    if (!toggleBtn) return;
    toggleBtn.textContent = showAnswer ? "Hide Answer" : "Show Answer";
  }

  async function loadChorales() {
    try {
      const res = await fetch("../data/chorales_meta.json");
      allChorales = await res.json();
      allChorales.sort(
        (a, b) => (a.riemenschneider ?? a.id) - (b.riemenschneider ?? b.id)
      );
      filteredChorales = allChorales.slice();
      renderList();
    } catch (err) {
      console.error("Failed to load chorales_meta.json (harmony page)", err);
      detailEl.innerHTML = "<p>Error loading data.</p>";
    }
  }

  function renderList() {
    listEl.innerHTML = "";

    if (filteredChorales.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No chorales found.";
      li.style.color = "#8792a1";
      listEl.appendChild(li);
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
        currentCh = ch;
        showAnswer = false;
        updateToggleLabel();

        renderList();
        renderDetail(ch);
        renderScore(ch);

        if (window.loadAudioForChorale) {
          loadAudioForChorale(ch);
        }
      });

      listEl.appendChild(li);
    });
  }

  function renderDetail(ch) {
    const rows = [];
    rows.push(
      `<div class="detail-row"><span class="detail-label">Riemenschneider: </span>${
        ch.riemenschneider ?? ch.id
      }</div>`
    );
    if (ch.bwv)
      rows.push(`<div class="detail-row"><span class="detail-label">BWV: </span>${ch.bwv}</div>`);
    if (ch.title)
      rows.push(`<div class="detail-row"><span class="detail-label">Title: </span>${ch.title}</div>`);
    if (ch.key_original)
      rows.push(`<div class="detail-row"><span class="detail-label">Key: </span>${ch.key_original}</div>`);
    if (ch.time_signature)
      rows.push(`<div class="detail-row"><span class="detail-label">Meter: </span>${ch.time_signature}</div>`);

    detailEl.innerHTML = rows.join("");
  }

  async function renderScore(ch) {
    const fullPath = ch.musicxml_path;
    const bassPath = getBassPath(ch);
    const pathToLoad = showAnswer ? fullPath : bassPath;

    if (!pathToLoad) {
      scoreContainer.innerHTML = "<p>No score file.</p>";
      return;
    }

    scoreContainer.innerHTML = "";

    const titleDiv = document.createElement("div");
    titleDiv.className = "score-title";
    titleDiv.textContent = `${ch.riemenschneider ?? ch.id}. ${ch.title || ""}${
      showAnswer ? " (Answer)" : " (Figured Bass)"
    }`;
    scoreContainer.appendChild(titleDiv);

    const host = document.createElement("div");
    host.className = "osmd-host";
    scoreContainer.appendChild(host);

    if (!osmd) {
      osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(host, {
        autoResize: true,
        drawTitle: false,
        drawComposer: false,
        drawLyricist: false,
      });
    } else {
      osmd.container = host;
    }

    try {
      await osmd.load(pathToLoad);
      osmd.render();

      const svg = host.querySelector("svg");
      if (svg) {
        svg.querySelectorAll("text").forEach((t) => {
          const s = t.textContent.trim();
          if (/^bwv\d+/i.test(s) || s === "J.S. Bach" || s.includes("Music21")) {
            t.remove();
          }
        });
      }
    } catch (e) {
      console.error("OSMD Error (harmony page):", e);
      scoreContainer.innerHTML = showAnswer
        ? "<p>Error loading answer score.</p>"
        : "<p>Error loading bass score — please check scores_bass folder and filenames.</p>";
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (!currentCh) return;
      showAnswer = !showAnswer;
      updateToggleLabel();
      renderScore(currentCh);
    });
    updateToggleLabel();
  }

  loadChorales();
};
