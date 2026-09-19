async function load() {
  const state = await browser.runtime.sendMessage({
    type: "GET_STATE"
  });

  const timer = document.getElementById("timer");
  const sites = document.getElementById("sites");

  sites.textContent =
    (state.allowedSites || []).join("  •  ");

  function tick() {
    if (!state.focusActive || !state.focusEndsAt) {
      timer.textContent = "--";
      return;
    }

    const remaining = Math.max(
      0,
      state.focusEndsAt - Date.now()
    );

    const seconds = Math.ceil(remaining / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      timer.textContent =
        `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(secs).padStart(2, "0")}`;
    } else {
      timer.textContent =
        `${String(minutes).padStart(2, "0")}:` +
        `${String(secs).padStart(2, "0")}`;
    }

    if (remaining <= 0) {
      location.reload();
    }
  }

  tick();
  setInterval(tick, 250);
}

load();
