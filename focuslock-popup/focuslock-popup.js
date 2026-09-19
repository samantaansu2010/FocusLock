let state = null;

let sites = [];

let activeTimerHandle = null;

let currentFocusWebsiteMode = "allow-only";
let currentFocusSearchEngineAllowed = true;

const $ = id =>
  document.getElementById(id);


/* ============================================================
   GENERAL
   ============================================================ */

function showSetup() {
  $("setupView").hidden = false;
  $("activeView").hidden = true;
  $("statusDot").classList.remove("active");

  const button =
    $("stopSession");

  if (button) {
    button.hidden = true;
  }
}


function showActive() {
  $("setupView").hidden = true;
  $("activeView").hidden = false;
  $("statusDot").classList.add("active");
}


function setError(id, message) {
  const element = $(id);

  if (element) {
    element.textContent =
      message || "";
  }
}


async function send(message) {
  return browser.runtime.sendMessage(
    message
  );
}


/* ============================================================
   DURATION
   ============================================================ */

function sanitizeFocusMinutes(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const integer =
    Math.trunc(number);

  if (integer < 1) {
    return null;
  }

  return Math.min(
    integer,
    1440
  );
}


async function saveDuration() {
  const input =
    $("duration");

  const minutes =
    sanitizeFocusMinutes(
      input.value
    );

  if (input.value === "") {
    return;
  }

  if (!minutes) {
    setError(
      "startError",
      "Duration must be between 1 and 1440 minutes."
    );

    return;
  }

  input.value =
    String(minutes);

  await send({
    type:
      "SET_DURATION",
    minutes
  });

  setError(
    "startError",
    ""
  );
}


function changeDuration(delta) {
  const input =
    $("duration");

  let current =
    sanitizeFocusMinutes(
      input.value
    );

  if (!current) {
    if (delta < 0) {
      return;
    }

    current = 0;
  }

  const next =
    Math.max(
      1,
      Math.min(
        1440,
        current + delta
      )
    );

  input.value =
    String(next);

  saveDuration();
}


/* ============================================================
   DOMAIN LIST
   ============================================================ */

function renderSites() {
  const list =
    $("siteList");

  list.textContent =
    "";

  $("siteCount")
    .textContent =
      String(
        sites.length
      );

  $("emptySites")
    .style.display =
      sites.length
        ? "none"
        : "flex";


  sites.forEach(
    (domain, index) => {

      const item =
        document.createElement(
          "li"
        );

      item.className =
        "site-item";


      const number =
        document.createElement(
          "span"
        );

      number.className =
        "site-number";

      number.textContent =
        String(
          index + 1
        );


      const domainText =
        document.createElement(
          "span"
        );

      domainText.className =
        "site-domain";

      domainText.textContent =
        domain;


      const remove =
        document.createElement(
          "button"
        );

      remove.className =
        "remove-site";

      remove.type =
        "button";

      remove.textContent =
        "×";

      remove.title =
        `Remove ${domain}`;


      remove.addEventListener(
        "click",
        async () => {

          const nextSites =
            sites.filter(
              (
                _domain,
                itemIndex
              ) =>
                itemIndex !==
                index
            );

          const response =
            await send({
              type:
                "SET_ALLOWED_SITES",

              sites:
                nextSites
            });

          if (!response?.ok) {
            setError(
              "siteError",
              response?.error ||
                "Could not update domains."
            );

            return;
          }

          sites =
            response.sites ||
            [];

          renderSites();
        }
      );


      item.append(
        number,
        domainText,
        remove
      );

      list.appendChild(
        item
      );
    }
  );
}


async function addSite() {
  const input =
    $("siteInput");

  const value =
    input.value.trim();

  if (!value) {
    return;
  }

  setError(
    "siteError",
    ""
  );


  const response =
    await send({
      type:
        "SET_ALLOWED_SITES",

      sites: [
        ...sites,
        value
      ]
    });


  if (!response?.ok) {
    setError(
      "siteError",
      response?.error ||
        "Invalid domain."
    );

    return;
  }


  sites =
    response.sites ||
    [];

  input.value =
    "";

  renderSites();

  input.focus();
}


/* ============================================================
   WEBSITE BEHAVIOR
   ============================================================ */

function selectFocusWebsiteMode(
  mode
) {
  currentFocusWebsiteMode =
    mode === "block-list"
      ? "block-list"
      : "allow-only";


  $("focusAllowOnlyChoice")
    .classList.toggle(
      "active",
      currentFocusWebsiteMode ===
        "allow-only"
    );


  $("focusBlockSelectedChoice")
    .classList.toggle(
      "active",
      currentFocusWebsiteMode ===
        "block-list"
    );
}


/* ============================================================
   SEARCH ENGINE
   ============================================================ */

function updateSearchEngineToggle() {
  const button =
    $("searchEngineToggle");

  if (!button) {
    return;
  }

  button.textContent =
    currentFocusSearchEngineAllowed
      ? "Allowed"
      : "Blocked";


  button.setAttribute(
    "aria-pressed",
    String(
      currentFocusSearchEngineAllowed
    )
  );
}


function toggleSearchEngine() {
  currentFocusSearchEngineAllowed =
    !currentFocusSearchEngineAllowed;

  updateSearchEngineToggle();
}


/* ============================================================
   SAVED SETS
   ============================================================ */

function renderSavedSets() {
  const container =
    $("savedSets");

  container.textContent =
    "";

  const savedSets =
    state?.savedSets ||
    [];


  $("emptySets")
    .style.display =
      savedSets.length
        ? "none"
        : "flex";


  for (const set of savedSets) {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "saved-set";


    const info =
      document.createElement(
        "div"
      );


    const name =
      document.createElement(
        "div"
      );

    name.className =
      "saved-set-name";

    name.textContent =
      set.name;


    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "saved-set-meta";

    meta.textContent =
      `${set.domains.length} domain${
        set.domains.length === 1
          ? ""
          : "s"
      }`;


    info.append(
      name,
      meta
    );


    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "saved-set-actions";


    const use =
      document.createElement(
        "button"
      );

    use.className =
      "set-use";

    use.type =
      "button";

    use.textContent =
      "Use";


    use.addEventListener(
      "click",
      async () => {

        sites =
          [...set.domains];


        await send({
          type:
            "SET_ALLOWED_SITES",

          sites
        });


        setError(
          "siteError",
          ""
        );

        renderSites();
      }
    );


    const remove =
      document.createElement(
        "button"
      );

    remove.className =
      "set-delete";

    remove.type =
      "button";

    remove.textContent =
      "Delete";


    remove.addEventListener(
      "click",
      async () => {

        const response =
          await send({
            type:
              "DELETE_SET",

            id:
              set.id
          });


        if (!response?.ok) {
          setError(
            "setError",
            response?.error ||
              "Could not delete set."
          );

          return;
        }


        state.savedSets =
          response.savedSets ||
          [];

        renderSavedSets();
      }
    );


    actions.append(
      use,
      remove
    );


    item.append(
      info,
      actions
    );


    container.appendChild(
      item
    );
  }
}


async function saveCurrentSet() {
  const nameInput =
    $("setName");

  const name =
    nameInput.value.trim();


  setError(
    "setError",
    ""
  );


  const response =
    await send({
      type:
        "SAVE_SET",

      name,

      sites
    });


  if (!response?.ok) {
    setError(
      "setError",
      response?.error ||
        "Could not save set."
    );

    return;
  }


  state.savedSets =
    response.savedSets ||
    [];


  nameInput.value =
    "";

  renderSavedSets();
}


/* ============================================================
   START FOCUS
   ============================================================ */

async function startFocus() {
  setError(
    "startError",
    ""
  );


  const minutes =
    sanitizeFocusMinutes(
      $("duration").value
    );


  if (!minutes) {
    setError(
      "startError",
      "Choose a duration first."
    );

    $("duration").focus();

    return;
  }


  if (!sites.length) {
    setError(
      "startError",
      "Add at least one domain."
    );

    $("siteInput").focus();

    return;
  }


  const button =
    $("startFocus");

  button.disabled =
    true;

  button.textContent =
    "Starting...";


  try {

    const response =
      await send({
        type:
          "START_FOCUS",

        minutes,

        sites,

        websiteMode:
          currentFocusWebsiteMode,

        searchEngineAllowed:
          currentFocusSearchEngineAllowed
      });


    if (!response?.ok) {
      setError(
        "startError",
        response?.error ||
          "Could not start Focus Mode."
      );

      return;
    }


    state =
      response.state;

    renderActive();

    showActive();

    startActiveTimer();

  } finally {

    button.disabled =
      false;

    button.textContent =
      "Start Focus Mode";
  }
}


/* ============================================================
   ACTIVE SESSION
   ============================================================ */

function renderActive() {
  const isBlock =
    Boolean(
      state?.blockActive
    );


  $("activeModeLabel")
    .textContent =
      isBlock
        ? "BLOCK MODE"
        : "FOCUS MODE";


  $("activeTitle")
    .textContent =
      "Active";


  const endsAt =
    isBlock
      ? state.blockEndsAt
      : state.focusEndsAt;


  if (endsAt) {

    $("timer").style.display =
      "block";

    $("timerLabel").style.display =
      "block";

  } else {

    $("timer").style.display =
      "none";

    $("timerLabel").textContent =
      "permanent";

    $("timerLabel").style.display =
      "block";
  }


  const title =
    $("activeSitesTitle");


  if (isBlock) {

    title.textContent =
      state.blockMode ===
        "allow-only"
        ? "Allowed websites"
        : "Blocked websites";

  } else {

    title.textContent =
      state.focusWebsiteMode ===
        "block-list"
        ? "Blocked websites"
        : "Allowed websites";
  }


  const list =
    $("activeSiteList");

  list.textContent =
    "";


  const activeSites =
    isBlock
      ? state.blockSites || []
      : state.allowedSites || [];


  for (
    const domain
    of activeSites
  ) {

    const item =
      document.createElement(
        "li"
      );

    item.textContent =
      domain;

    list.appendChild(
      item
    );
  }


  if (isBlock) {

    $("activeModeDescription")
      .textContent =
        state.blockMode ===
          "allow-only"
          ? "Only the selected websites are available."
          : "The selected websites are blocked.";

  } else {

    $("activeModeDescription")
      .textContent =
        state.focusWebsiteMode ===
          "block-list"
          ? "The selected websites are blocked until the timer reaches zero."
          : "Only the selected websites are available until the timer reaches zero.";
  }
}


function formatTime(ms) {
  const totalSeconds =
    Math.max(
      0,
      Math.ceil(
        ms / 1000
      )
    );


  const hours =
    Math.floor(
      totalSeconds / 3600
    );


  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
      60
    );


  const seconds =
    totalSeconds % 60;


  if (hours > 0) {

    return [
      String(hours)
        .padStart(2, "0"),

      String(minutes)
        .padStart(2, "0"),

      String(seconds)
        .padStart(2, "0")
    ].join(":");
  }


  return [
    String(minutes)
      .padStart(2, "0"),

    String(seconds)
      .padStart(2, "0")
  ].join(":");
}


/* ============================================================
   STOP
   ============================================================ */

function updateStopAvailability() {
  const button =
    $("stopSession");

  if (!button) {
    return;
  }


  if (
    !state?.focusActive ||
    state?.blockActive
  ) {
    button.hidden =
      true;

    return;
  }


  const durationMinutes =
    Number(
      state.focusDurationMinutes
    );


  const startedAt =
    Number(
      state.focusStartedAt
    );


  if (
    !Number.isFinite(
      durationMinutes
    ) ||
    !Number.isFinite(
      startedAt
    )
  ) {
    button.hidden =
      true;

    return;
  }


  if (
    durationMinutes <= 60
  ) {
    button.hidden =
      true;

    return;
  }


  const stopUnlockAt =
    startedAt +
    60 * 60 * 1000;


  button.hidden =
    Date.now() <
      stopUnlockAt;
}


function updateActiveTimer() {
  updateStopAvailability();


  if (!state) {
    return;
  }


  const endsAt =
    state.blockActive
      ? state.blockEndsAt
      : state.focusEndsAt;


  if (!endsAt) {
    return;
  }


  const remaining =
    endsAt -
    Date.now();


  $("timer").textContent =
    formatTime(
      remaining
    );


  if (remaining <= 0) {

    clearInterval(
      activeTimerHandle
    );

    activeTimerHandle =
      null;

    loadState();
  }
}


function startActiveTimer() {
  clearInterval(
    activeTimerHandle
  );


  activeTimerHandle =
    setInterval(
      updateActiveTimer,
      250
    );


  updateActiveTimer();
}


async function stopSession() {
  const response =
    await send({
      type:
        "STOP_FOCUS"
    });


  if (!response?.ok) {
    return;
  }


  clearInterval(
    activeTimerHandle
  );

  activeTimerHandle =
    null;


  await loadState();
}


/* ============================================================
   LOAD STATE
   ============================================================ */

async function loadState() {
  const response =
    await send({
      type:
        "GET_STATE"
    });


  if (!response) {
    return;
  }


  state =
    response;


  sites =
    [
      ...(state.allowedSites || [])
    ];


  /*
   * Active session
   */

  if (
    state.blockActive ||
    state.focusActive
  ) {

    renderActive();

    showActive();

    startActiveTimer();

    return;
  }


  /*
   * Setup
   */

  showSetup();


  const duration =
    state.focusDurationMinutes ==
      null
      ? ""
      : String(
          state.focusDurationMinutes
        );


  $("duration").value =
    duration;


  renderSites();

  renderSavedSets();


  currentFocusWebsiteMode =
    state.focusWebsiteMode ===
      "block-list"
      ? "block-list"
      : "allow-only";


  currentFocusSearchEngineAllowed =
    state.focusSearchEngineAllowed !==
      false;


  selectFocusWebsiteMode(
    currentFocusWebsiteMode
  );


  updateSearchEngineToggle();


  const engineName =
    state.defaultSearchEngineName ||
    "Unknown";


  if (
    state.defaultSearchEngineSupported
  ) {

    $("searchEngineStatus")
      .textContent =
        `${engineName} is allowed automatically`;

  } else {

    $("searchEngineStatus")
      .textContent =
        `${engineName} could not be identified automatically`;
  }
}


/* ============================================================
   EVENTS
   ============================================================ */

$("addSite")
  .addEventListener(
    "click",
    addSite
  );


$("siteInput")
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        addSite();
      }
    }
  );


$("duration")
  .addEventListener(
    "input",
    () => {

      setError(
        "startError",
        ""
      );
    }
  );


$("duration")
  .addEventListener(
    "change",
    saveDuration
  );


$("minusDuration")
  .addEventListener(
    "click",
    () => {

      changeDuration(
        -1
      );
    }
  );


$("plusDuration")
  .addEventListener(
    "click",
    () => {

      changeDuration(
        1
      );
    }
  );


$("saveSet")
  .addEventListener(
    "click",
    saveCurrentSet
  );


$("setName")
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        saveCurrentSet();
      }
    }
  );


$("focusAllowOnlyChoice")
  .addEventListener(
    "click",
    () => {

      selectFocusWebsiteMode(
        "allow-only"
      );
    }
  );


$("focusBlockSelectedChoice")
  .addEventListener(
    "click",
    () => {

      selectFocusWebsiteMode(
        "block-list"
      );
    }
  );


const searchEngineToggle =
  $("searchEngineToggle");


if (searchEngineToggle) {

  searchEngineToggle
    .addEventListener(
      "click",
      toggleSearchEngine
    );
}


$("startFocus")
  .addEventListener(
    "click",
    startFocus
  );


$("stopSession")
  .addEventListener(
    "click",
    stopSession
  );


loadState();
