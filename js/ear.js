window.initEarPage = function () {
  const earPage = document.getElementById("ear-page");
  if (!earPage) return;

  const choraleListEl   = earPage.querySelector("#chorale-list");
  const choraleDetailEl = earPage.querySelector("#chorale-detail");
  const scoreContainer  = earPage.querySelector("#score-container");
  const toggleBtn       = earPage.querySelector("#ear-toggle-answer");

  let allChorales = [];
  let filteredChorales = [];
  let selectedId = null;

  let currentCh = null;
  let showAnswer = false;

  let osmd = null;

  let pickupBeatsMap = {};

  function getEarPath(ch) {
    if (ch.musicxml_ear_path) {
      return ch.musicxml_ear_path;
    }
    if (!ch.musicxml_path) return null;

    const original = ch.musicxml_path;
    const dotIdx = original.lastIndexOf(".");
    let base = original;
    let ext = "";

    if (dotIdx !== -1) {
      base = original.slice(0, dotIdx);
      ext  = original.slice(dotIdx);
    }

    base = base.replace("scores/", "scores_ear/");

    return base + "_ear" + ext;
  }

  function updateToggleLabel() {
    if (!toggleBtn) return;
    toggleBtn.textContent = showAnswer ? "Hide Answer" : "Show Answer";
  }

  async function loadChorales() {
    try {
      const [choraleRes, pickupRes] = await Promise.all([
        fetch("/data/chorales_meta.json"),
        fetch("/data/pickup_beats.json").catch(() => null)
      ]);

      allChorales = await choraleRes.json();

      if (pickupRes && pickupRes.ok) {
        pickupBeatsMap = await pickupRes.json();
      } else {
        pickupBeatsMap = {};
        console.warn("Could not load pickup_beats.json (no pickup measure data).");
      }

      allChorales.sort(
        (a, b) => (a.riemenschneider ?? a.id) - (b.riemenschneider ?? b.id)
      );
      filteredChorales = allChorales.slice();

      renderList();
    } catch (err) {
      console.error("Failed to load chorales_meta.json or pickup_beats.json (ear page)", err);
      choraleDetailEl.innerHTML = "<p>Error loading data.</p>";
    }
  }

  function renderList() {
    choraleListEl.innerHTML = "";

    if (filteredChorales.length === 0) {
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

      choraleListEl.appendChild(li);
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
      rows.push(
        `<div class="detail-row"><span class="detail-label">BWV: </span>${ch.bwv}</div>`
      );
    if (ch.title)
      rows.push(
        `<div class="detail-row"><span class="detail-label">Title: </span>${ch.title}</div>`
      );
    if (ch.key_original)
      rows.push(
        `<div class="detail-row"><span class="detail-label">Key: </span>${ch.key_original}</div>`
      );
    if (ch.time_signature)
      rows.push(
        `<div class="detail-row"><span class="detail-label">Meter: </span>${ch.time_signature}</div>`
      );

    let pickupText = "None";

    if (ch.musicxml_path && pickupBeatsMap) {
      const fileName = ch.musicxml_path.split("/").pop();
      const beats = pickupBeatsMap[fileName];

      if (typeof beats === "number") {
        if (Math.abs(beats) < 1e-6) {
          pickupText = "None";
        } else {
          pickupText = `${beats} beat`;
        }
      }
    }

    rows.push(
      `<div class="detail-row"><span class="detail-label">Pickup: </span>${pickupText}</div>`
    );

    choraleDetailEl.innerHTML = rows.join("");
  }

  async function renderScore(ch) {
    const fullPath = ch.musicxml_path;
    const earPath = getEarPath(ch);

    const pathToLoad = showAnswer ? fullPath : earPath;

    if (!pathToLoad) {
      scoreContainer.innerHTML = "<p>No score file.</p>";
      return;
    }

    scoreContainer.innerHTML = "";

    const titleDiv = document.createElement("div");
    titleDiv.className = "score-title";
    titleDiv.textContent = `${ch.riemenschneider ?? ch.id}. ${ch.title || ""}${
      showAnswer ? " (Answer)" : ""
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
      console.error("OSMD Error (ear page):", e);
      scoreContainer.innerHTML = showAnswer
        ? "<p>Error loading answer score.</p>"
        : "<p>Error loading blank ear score — please check scores_ear folder and filenames.</p>";
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
