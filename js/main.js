document.addEventListener("DOMContentLoaded", () => {
  const pages = {
    home:    document.getElementById("home-page"),
    chorale: document.getElementById("chorale-page"),
    cadence: document.getElementById("cadence-page"),
    soprano: document.getElementById("soprano-page"),
    ear:     document.getElementById("ear-page"),
    harmony: document.getElementById("harmony-page"),
  };

  const initFlags = {
    chorale: false,
    ear: false,
    soprano: false,
    cadence: false,
    harmony: false,
  };

  function activateNavButton(name) {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      if (btn.dataset.page === name) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function showPage(name) {
    Object.values(pages).forEach((p) => p && p.classList.remove("active"));
    const pageEl = pages[name];
    if (pageEl) pageEl.classList.add("active");

    activateNavButton(name);

    switch (name) {
      case "chorale":
        if (!initFlags.chorale && typeof window.initChoralePage === "function") {
          window.initChoralePage();
          initFlags.chorale = true;
        }
        break;

      case "ear":
        if (!initFlags.ear && typeof window.initEarPage === "function") {
          window.initEarPage();
          initFlags.ear = true;
        }
        break;

      case "soprano":
        if (!initFlags.soprano && typeof window.initSopranoPage === "function") {
          window.initSopranoPage();
          initFlags.soprano = true;
        }
        break;

      case "cadence":
        if (!initFlags.cadence && typeof window.initCadencePage === "function") {
          window.initCadencePage();
          initFlags.cadence = true;
        }
        break;

      case "harmony":
        if (!initFlags.harmony && typeof window.initHarmonyPage === "function") {
          window.initHarmonyPage();
          initFlags.harmony = true;
        }
        break;

      default:
        break;
    }
  }

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pageName = btn.dataset.page;
      showPage(pageName);
    });
  });

  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const pageName = card.dataset.page;
      showPage(pageName);
    });
  });

  showPage("home");
});
