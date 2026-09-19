const STORE_KEY = "focuslockState";
const SCHEMA_VERSION = 3;

const RULE_BLOCK = 1;
const RULE_ALLOW_BASE = 1000;

const MAX_FOCUS_DURATION_MINUTES = 1440;
const FOCUS_STOP_LOCK_MINUTES = 60;

const BLOCKED_ABOUT_PATTERNS = [
  /^about:addons/i,
  /^about:debugging/i,
  /^about:config/i,
  /^about:preferences/i,
  /^about:profiles/i,
  /^about:support/i,
  /^about:policies/i,
  /^about:processes/i,
  /^about:crashes/i,
  /^about:memory/i,
  /^about:performance/i,
  /^about:telemetry/i,
  /^about:studies/i,
  /^about:certificate/i,
  /^about:logging/i,
  /^about:networking/i,
  /^about:webrtc/i,
  /^view-source:/i,
  /^reader:/i
];

const PROTECTED_DOMAINS = [
  "addons.mozilla.org",
  "support.mozilla.org",
  "accounts.firefox.com",
  "firefox.com",
  "www.firefox.com",
  "getfirefox.com",
  "www.getfirefox.com",
  "mozilla.org",
  "www.mozilla.org",
  "mozilla.com",
  "www.mozilla.com",
  "addons.cdn.mozilla.net",
  "discovery.addons.mozilla.org",
  "install.mozilla.org"
];

const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,

  focusActive: false,
  focusStartedAt: null,
  focusEndsAt: null,
  focusDurationMinutes: null,
  allowedSites: [],
  savedSets: [],

  /*
   * Block Mode
   *
   * blockMode:
   *   "block-list" = block only the listed websites
   *   "allow-only" = allow only the listed websites
   */
  blockActive: false,
  blockStartedAt: null,
  blockEndsAt: null,
  blockMode: "block-list",
  blockSites: []
};

const LEGACY_EXAMPLE_SITES = [
  "youtube.com",
  "google.com",
  "chatgpt.com"
];

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeDomain(value) {
  if (typeof value !== "string") {
    return null;
  }

  let text = value.trim().toLowerCase();

  if (!text) {
    return null;
  }

  text = text.replace(/^\*\:\/\//, "");
  text = text.replace(/^\*\.\s*/, "");
  text = text.replace(/^https?:\/\//, "");
  text = text.split("/")[0];
  text = text.split("?")[0];
  text = text.split("#")[0];
  text = text.replace(/\.$/, "");

  if (!text) {
    return null;
  }

  if (!/^[a-z0-9.-]+$/.test(text)) {
    return null;
  }

  if (!text.includes(".")) {
    return null;
  }

  if (text.startsWith(".") || text.endsWith(".") || text.includes("..")) {
    return null;
  }

  if (text.includes(" ")) {
    return null;
  }

  return text;
}

function isProtectedDomain(domain) {
  const normalized = normalizeDomain(domain);

  if (!normalized) {
    return false;
  }

  return PROTECTED_DOMAINS.some(
    protectedDomain =>
      normalized === protectedDomain ||
      normalized.endsWith("." + protectedDomain)
  );
}

function normalizeSites(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const result = [];

  for (const value of values) {
    if (
      typeof value !== "string"
    ) {
      continue;
    }

    const raw =
      value.trim();

    if (!raw) {
      continue;
    }

    const rule =
      typeof FocusLockEngine !== "undefined" &&
      FocusLockEngine &&
      typeof FocusLockEngine.normalizeRule === "function"
        ? FocusLockEngine.normalizeRule({
            type: "domain",
            value: raw,
            action: "allow"
          })
        : null;

    if (!rule) {
      continue;
    }

    let normalized;

    if (
      rule.type === "path"
    ) {
      normalized =
        rule.domain +
        rule.path;
    } else {
      normalized =
        rule.scope === "wildcard"
          ? "*." + rule.domain
          : rule.domain;
    }

    if (
      isProtectedDomain(
        rule.domain
      )
    ) {
      continue;
    }

    if (
      !result.includes(normalized)
    ) {
      result.push(normalized);
    }

    if (
      result.length >= 200
    ) {
      break;
    }
  }

  return result;
}

function sameArray(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadState() {
  const stored = await browser.storage.local.get(STORE_KEY);

  let state = {
    ...cloneDefaultState(),
    ...(stored[STORE_KEY] || {})
  };

  if (!Array.isArray(state.allowedSites)) {
    state.allowedSites = [];
  }

  if (!Array.isArray(state.savedSets)) {
    state.savedSets = [];
  }

  if (!Array.isArray(state.blockSites)) {
    state.blockSites = [];
  }

  state.blockMode =
    state.blockMode === "allow-only"
      ? "allow-only"
      : "block-list";

  state.blockSites = normalizeSites(state.blockSites);

  state.allowedSites = normalizeSites(state.allowedSites);

  state.savedSets = state.savedSets
    .filter(set => set && typeof set === "object")
    .map(set => ({
      id: String(set.id || crypto.randomUUID()),
      name: String(set.name || "Saved Set").trim().slice(0, 60),
      domains: normalizeSites(set.domains)
    }))
    .filter(set => set.name && set.domains.length);

  /*
    V0.2 migration.

    The previous version automatically supplied:
      youtube.com
      google.com
      chatgpt.com

    Those are removed because FocusLock must never silently choose
    the user's websites.

    The old duration value is also cleared. This intentionally forces
    the user to select the duration again rather than carrying forward
    the broken 50-minute state.
  */
  if ((state.schemaVersion || 0) < SCHEMA_VERSION) {
    if (sameArray(state.allowedSites, LEGACY_EXAMPLE_SITES)) {
      state.allowedSites = [];
    }

    state.focusDurationMinutes = null;
    state.schemaVersion = SCHEMA_VERSION;

    await browser.storage.local.set({
      [STORE_KEY]: state
    });
  }

  return state;
}

function toEngineState(state) {
  if (
    typeof FocusLockEngine === "undefined" ||
    !FocusLockEngine ||
    typeof FocusLockEngine.normalizeState !== "function"
  ) {
    throw new Error("FocusLockEngine is not available.");
  }

  let activeMode = null;
  let activeStartedAt = null;
  let activeEndsAt = null;
  let policy = null;
  const rules = [];

  if (state.focusActive) {
    activeMode = "focus";
    activeStartedAt = state.focusStartedAt;
    activeEndsAt = state.focusEndsAt;

    for (const domain of state.allowedSites || []) {
      rules.push({
        id: `legacy-allow-${domain}`,
        type: "domain",
        action: "allow",
        domain
      });
    }

    policy = {
      id: "legacy-focus",
      name: "Focus",
      mode: "focus",
      behavior: "allow-only",
      enabled: true,
      profileId: null,
      rules,
      scheduleId: null,
      protection: {}
    };

  } else if (state.blockActive) {
    activeMode = "block";
    activeStartedAt = state.blockStartedAt;
    activeEndsAt = state.blockEndsAt;

    const behavior =
      state.blockMode === "allow-only"
        ? "allow-only"
        : "block-list";

    for (const domain of state.blockSites || []) {
      rules.push({
        id: `legacy-block-${domain}`,
        type: "domain",
        action:
          behavior === "allow-only"
            ? "allow"
            : "block",
        domain
      });
    }

    policy = {
      id: "legacy-block",
      name: "Block",
      mode: "block",
      behavior,
      enabled: true,
      profileId: null,
      rules,
      scheduleId: null,
      protection: {}
    };
  }

  return FocusLockEngine.normalizeState({
    active: {
      mode: activeMode,
      policyId: policy ? policy.id : null,
      startedAt: activeStartedAt,
      endsAt: activeEndsAt
    },
    policies: policy ? [policy] : [],
    rules
  });
}
async function loadEngineState() {
  const state = await loadState();
  return toEngineState(state);
}
async function saveState(state) {
  await browser.storage.local.set({
    [STORE_KEY]: state
  });
}

function searchEngineInfo(name) {
  const value = String(name || "").toLowerCase();

  const engines = [
    {
      names: ["google"],
      domains: [
        "google.com",
        "google.co.in",
        "google.co.uk",
        "google.ca",
        "google.de",
        "google.fr",
        "google.es",
        "google.it",
        "google.com.au",
        "google.co.jp",
        "google.com.br",
        "google.com.mx"
      ],
      filter: "||google."
    },
    {
      names: ["bing"],
      domains: ["bing.com"],
      filter: "||bing.com^"
    },
    {
      names: ["duckduckgo"],
      domains: ["duckduckgo.com"],
      filter: "||duckduckgo.com^"
    },
    {
      names: ["brave"],
      domains: ["search.brave.com"],
      filter: "||search.brave.com^"
    },
    {
      names: ["yahoo"],
      domains: ["search.yahoo.com"],
      filter: "||search.yahoo.com^"
    },
    {
      names: ["ecosia"],
      domains: ["ecosia.org"],
      filter: "||ecosia.org^"
    },
    {
      names: ["startpage"],
      domains: ["startpage.com"],
      filter: "||startpage.com^"
    },
    {
      names: ["kagi"],
      domains: ["kagi.com"],
      filter: "||kagi.com^"
    },
    {
      names: ["qwant"],
      domains: ["qwant.com"],
      filter: "||qwant.com^"
    },
    {
      names: ["yandex"],
      domains: ["yandex.com", "yandex.ru"],
      filter: "||yandex."
    },
    {
      names: ["baidu"],
      domains: ["baidu.com"],
      filter: "||baidu.com^"
    },
    {
      names: ["naver"],
      domains: ["naver.com"],
      filter: "||naver.com^"
    }
  ];

  return engines.find(engine =>
    engine.names.some(searchName =>
      value.includes(searchName)
    )
  ) || null;
}

async function getDefaultSearchEngine() {
  try {
    if (!browser.search || !browser.search.get) {
      return {
        name: "Unknown",
        domains: [],
        filter: null,
        recognized: false
      };
    }

    const engines = await browser.search.get();
    const engine = engines.find(item => item.isDefault);

    if (!engine) {
      return {
        name: "Unknown",
        domains: [],
        filter: null,
        recognized: false
      };
    }

    const name = engine.name || "Unknown";
    const info = searchEngineInfo(name);

    if (!info) {
      return {
        name,
        domains: [],
        filter: null,
        recognized: false
      };
    }

    return {
      name,
      domains: info.domains,
      filter: info.filter,
      recognized: true
    };
  } catch (error) {
    console.warn(
      "FocusLock: unable to detect default search engine",
      error
    );

    return {
      name: "Unknown",
      domains: [],
      filter: null,
      recognized: false
    };
  }
}

function buildRules(state, defaultSearch) {
  const rules = [];

  /*
   * ----------------------------------------------------------
   * BLOCK MODE
   * ----------------------------------------------------------
   */

  if (state.blockActive) {

    /*
     * Allow-only Block Mode:
     * block all HTTP(S) main-frame navigation first,
     * then allow explicitly selected sites.
     */
    if (state.blockMode === "allow-only") {

      rules.push({
        id: RULE_BLOCK,
        priority: 1,
        action: {
          type: "block"
        },
        condition: {
          urlFilter: "|https*",
          resourceTypes: ["main_frame"]
        }
      });

      let ruleId = RULE_ALLOW_BASE;

      for (const domain of state.blockSites) {
        rules.push({
          id: ruleId++,
          priority: 100,
          action: {
            type: "allow"
          },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: ["main_frame"]
          }
        });
      }

      return rules;
    }

    /*
     * Block-list Block Mode:
     * everything remains available except selected domains.
     */
    let ruleId = RULE_ALLOW_BASE;

    for (const domain of state.blockSites) {
      rules.push({
        id: ruleId++,
        priority: 100,
        action: {
          type: "block"
        },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame"]
        }
      });
    }

    return rules;
  }

  /*
   * ----------------------------------------------------------
   * FOCUS MODE
   * ----------------------------------------------------------
   *
   * Existing Focus behavior remains unchanged.
   */

  if (!state.focusActive) {
    return rules;
  }

  rules.push({
    id: RULE_BLOCK,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        extensionPath: "/focuslock-blocked.html"
      }
    },
    condition: {
      urlFilter: "|https*",
      resourceTypes: ["main_frame"]
    }
  });

  let ruleId = RULE_ALLOW_BASE;

  for (const domain of state.allowedSites) {
    rules.push({
      id: ruleId++,
      priority: 100,
      action: {
        type: "allow"
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"]
      }
    });
  }

  /*
   * Default search engine remains automatically available
   * during Focus Mode.
   */
  if (defaultSearch && defaultSearch.filter) {
    rules.push({
      id: ruleId++,
      priority: 110,
      action: {
        type: "allow"
      },
      condition: {
        urlFilter: defaultSearch.filter,
        resourceTypes: ["main_frame"]
      }
    });
  }

  return rules;
}
async function updateBlockingRules(state) {
  const existing =
    await browser.declarativeNetRequest.getSessionRules();

  const removeRuleIds = existing
    .map(rule => rule.id)
    .filter(id => id >= RULE_BLOCK);

  if (!state.focusActive && !state.blockActive) {
    if (removeRuleIds.length) {
      await browser.declarativeNetRequest.updateSessionRules({
        removeRuleIds
      });
    }

    return;
  }

  const defaultSearch =
    state.focusActive
      ? await getDefaultSearchEngine()
      : null;

  const rules =
    buildRules(
      state,
      defaultSearch
    );

  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds,
    addRules: rules
  });
}
function blockedPageUrl() {
  return browser.runtime.getURL("focuslock-blocked.html");
}

function isOwnExtensionPage(url) {
  return typeof url === "string" &&
    url.startsWith(browser.runtime.getURL(""));
}

function isBlockedBrowserPage(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  return BLOCKED_ABOUT_PATTERNS.some(pattern => pattern.test(url));
}

function isOtherExtensionPage(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  if (!url.startsWith("moz-extension://")) {
    return false;
  }

  return !isOwnExtensionPage(url);
}

function isAllowedWebUrl(
  url,
  allowedSites,
  defaultSearch,
  blockActive = false,
  blockMode = "block-list",
  blockSites = []
) {
  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return true;
    }

    const host =
      parsed.hostname.toLowerCase();

    /*
     * Protected Mozilla/Firefox websites remain blocked
     * during Focus Mode.
     */
    if (
      !blockActive &&
      isProtectedDomain(host)
    ) {
      return false;
    }

    /*
     * --------------------------------------------------------
     * BLOCK MODE
     * --------------------------------------------------------
     */

    if (blockActive) {

      if (blockMode === "allow-only") {
        return blockSites.some(domain =>
          host === domain ||
          host.endsWith("." + domain)
        );
      }

      /*
       * Block-list:
       * explicit matching domain = blocked
       * everything else = allowed
       */
      const blocked =
        blockSites.some(domain =>
          host === domain ||
          host.endsWith("." + domain)
        );

      return !blocked;
    }

    /*
     * --------------------------------------------------------
     * FOCUS MODE
     * --------------------------------------------------------
     */

    if (
      allowedSites.some(domain =>
        host === domain ||
        host.endsWith("." + domain)
      )
    ) {
      return true;
    }

    if (
      defaultSearch?.recognized &&
      defaultSearch.domains.some(domain =>
        host === domain ||
        host.endsWith("." + domain)
      )
    ) {
      return true;
    }

    return false;

  } catch {
    return true;
  }
}
function isAllowedByEngine(engineState, url, defaultSearch) {
  try {
    if (!engineState || !FocusLockEngine) {
      return true;
    }

    if (!engineState.active || !engineState.active.mode) {
      return true;
    }

    const activePolicy = engineState.policies.find(
      policy =>
        policy &&
        policy.id === engineState.active.policyId &&
        policy.enabled !== false
    );

    if (!activePolicy) {
      return true;
    }

    const matches = FocusLockEngine.findMatchingRules(
      activePolicy.rules,
      url
    );

    if (activePolicy.behavior === "allow-only") {
      if (
        activePolicy.mode === "focus" &&
        defaultSearch?.recognized
      ) {
        try {
          const parsed = new URL(url);
          const host = parsed.hostname.toLowerCase();

          if (
            defaultSearch.domains.some(domain =>
              host === domain ||
              host.endsWith("." + domain)
            )
          ) {
            return true;
          }
        } catch {
          // Fall through to normal rule evaluation.
        }
      }

      return matches.some(rule => rule.action === "allow");
    }

    if (activePolicy.behavior === "block-list") {
      return !matches.some(rule => rule.action === "block");
    }

    return true;
  } catch {
    return true;
  }
}
async function enforceTabs() {
  const state = await loadState();
  const defaultSearch = await getDefaultSearchEngine();

  if (!state.focusActive && !state.blockActive) {
    return;
  }

  const engineState = toEngineState(state);
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    const url = tab.url || "";

    if (!url) continue;

    if (isOwnExtensionPage(url)) continue;

    if (
      isBlockedBrowserPage(url) ||
      isOtherExtensionPage(url)
    ) {
      try {
        await browser.tabs.update(tab.id, {
          url: blockedPageUrl(),
          loadReplace: true
        });
      } catch {
        // Firefox may reject some privileged tab transitions.
      }
      continue;
    }

    if (
      url.startsWith("http://") ||
      url.startsWith("https://")
    ) {
      const engineAllowed =
        isAllowedByEngine(
          engineState,
          url,
          defaultSearch
        );

      const legacyAllowed =
        isAllowedWebUrl(
          url,
          state.allowedSites,
          defaultSearch,
          state.blockActive,
          state.blockMode,
          state.blockSites
        );

      if (!engineAllowed || !legacyAllowed) {
        try {
          await browser.tabs.update(tab.id, {
            url: blockedPageUrl(),
            loadReplace: true
          });
        } catch {
          // DNR remains the primary protection.
        }
      }
    }
  }
}
async function setBadge(active) {
  try {
    await browser.action.setBadgeText({
      text: active ? "ON" : ""
    });

    if (active) {
      await browser.action.setBadgeBackgroundColor({
        color: "#111111"
      });
    }
  } catch {
    // Badge support is not essential to FocusLock.
  }
}

async function finishBlock() {
  const state = await loadState();

  state.blockActive = false;
  state.blockStartedAt = null;
  state.blockEndsAt = null;
  state.blockSites = [];

  await saveState(state);
  await updateBlockingRules(state);
  await setBadge(false);
}

async function validateBlock() {
  const state = await loadState();

  if (!state.blockActive) {
    return state;
  }

  /*
   * No end time means permanent/manual Block Mode.
   */
  if (!state.blockEndsAt) {
    return state;
  }

  if (Date.now() >= state.blockEndsAt) {
    await finishBlock();
    return await loadState();
  }

  return state;
}

async function scheduleBlockEnd(state) {
  await browser.alarms.clear("focuslock-session-end");

  if (!state.blockActive || !state.blockEndsAt) {
    return;
  }

  const remaining =
    state.blockEndsAt - Date.now();

  if (remaining <= 0) {
    await finishBlock();
    return;
  }

  await browser.alarms.create(
    "focuslock-session-end",
    {
      when: state.blockEndsAt
    }
  );
}

async function startBlockMode(
  mode,
  sites,
  durationMinutes = null
) {
  const state = await validateFocus();

  if (state.focusActive || state.blockActive) {
    return {
      ok: false,
      error:
        "Another FocusLock session is already active."
    };
  }

  const cleanMode =
    mode === "allow-only"
      ? "allow-only"
      : "block-list";

  const cleanSites =
    normalizeSites(sites);

  if (!cleanSites.length) {
    return {
      ok: false,
      error:
        "Add at least one website."
    };
  }

  let endsAt = null;

  if (durationMinutes !== null) {
    const minutes =
      Number(durationMinutes);

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 720
    ) {
      return {
        ok: false,
        error:
          "Duration must be between 1 and 720 minutes."
      };
    }

    endsAt =
      Date.now() +
      minutes * 60 * 1000;
  }

  const startedAt =
    Date.now();

  state.blockActive = true;
  state.blockStartedAt = startedAt;
  state.blockEndsAt = endsAt;
  state.blockMode = cleanMode;
  state.blockSites = cleanSites;

  await saveState(state);
  await updateBlockingRules(state);

  if (endsAt) {
    await scheduleBlockEnd(state);
  }

  await setBadge(true);
  await enforceTabs();

  return {
    ok: true,
    state
  };
}
async function finishFocus() {
  const state = await loadState();

  state.focusActive = false;
  state.focusStartedAt = null;
  state.focusEndsAt = null;

  await saveState(state);
  await updateBlockingRules(state);
  await setBadge(false);
}

async function validateFocus() {
  const state = await loadState();

  if (!state.focusActive) {
    return state;
  }

  if (
    !state.focusEndsAt ||
    Date.now() >= state.focusEndsAt
  ) {
    await finishFocus();
    return await loadState();
  }

  return state;
}

async function scheduleFocusEnd(state) {
  await browser.alarms.clear("focuslock-session-end");

  if (!state.focusActive || !state.focusEndsAt) {
    return;
  }

  const remaining =
    state.focusEndsAt - Date.now();

  if (remaining <= 0) {
    await finishFocus();
    return;
  }

  await browser.alarms.create(
    "focuslock-session-end",
    {
      when: state.focusEndsAt
    }
  );
}

browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== "focuslock-session-end") {
    return;
  }

  const state = await loadState();

  if (state.blockActive) {
    await finishBlock();
    return;
  }

  if (state.focusActive) {
    await finishFocus();
  }
});

browser.tabs.onUpdated.addListener(
  async (tabId, changeInfo, tab) => {
    if (!changeInfo.url) {
      return;
    }

    const state = await loadState();

    if (!state.focusActive && !state.blockActive) {
      return;
    }

    const defaultSearch =
      state.focusActive
        ? await getDefaultSearchEngine()
        : null;

    const engineState = toEngineState(state);
    const url = changeInfo.url;

    if (isOwnExtensionPage(url)) {
      return;
    }

    if (
      isBlockedBrowserPage(url) ||
      isOtherExtensionPage(url)
    ) {
      try {
        await browser.tabs.update(tabId, {
          url: blockedPageUrl(),
          loadReplace: true
        });
      } catch {
        // Privileged browser pages may reject navigation changes.
      }

      return;
    }

    if (
      url.startsWith("http://") ||
      url.startsWith("https://")
    ) {
      const engineAllowed =
        isAllowedByEngine(
          engineState,
          url,
          defaultSearch
        );

      const legacyAllowed =
        isAllowedWebUrl(
          url,
          state.allowedSites,
          defaultSearch,
          state.blockActive,
          state.blockMode,
          state.blockSites
        );

      if (!engineAllowed || !legacyAllowed) {
        try {
          await browser.tabs.update(tabId, {
            url: blockedPageUrl(),
            loadReplace: true
          });
        } catch {
          // DNR handles the network request.
        }
      }
    }
  }
);
browser.runtime.onMessage.addListener(
  async message => {
    const state = await validateFocus();

    switch (message?.type) {
      case "GET_STATE": {
        const search = await getDefaultSearchEngine();

        return {
          ...state,
          defaultSearchEngineName: search.name,
          defaultSearchEngineDomains: search.domains,
          defaultSearchEngineSupported: search.recognized,

          blockActive: state.blockActive,
          blockStartedAt: state.blockStartedAt,
          blockEndsAt: state.blockEndsAt,
          blockMode: state.blockMode,
          blockSites: state.blockSites
        };
      }

      case "SET_DURATION": {
        if (state.focusActive) {
          return {
            ok: false,
            error: "Focus Mode is already active."
          };
        }

        const minutes = Number(message.minutes);

        if (
          !Number.isInteger(minutes) ||
          minutes < 1 ||
          minutes > MAX_FOCUS_DURATION_MINUTES
        ) {
          return {
            ok: false,
            error:
              "Duration must be between 1 and 1440 minutes."
          };
        }

        state.focusDurationMinutes = minutes;

        await saveState(state);

        return {
          ok: true
        };
      }

      case "SET_ALLOWED_SITES": {
        if (state.focusActive) {
          return {
            ok: false,
            error: "Focus Mode is already active."
          };
        }

        state.allowedSites =
          normalizeSites(message.sites);

        await saveState(state);

        return {
          ok: true,
          sites: state.allowedSites
        };
      }

      case "SAVE_SET": {
        if (state.focusActive) {
          return {
            ok: false,
            error: "Focus Mode is already active."
          };
        }

        const name = String(message.name || "")
          .trim()
          .slice(0, 60);

        const domains =
          normalizeSites(message.sites);

        if (!name) {
          return {
            ok: false,
            error:
              "Enter a name for this saved set."
          };
        }

        if (!domains.length) {
          return {
            ok: false,
            error:
              "Add at least one website first."
          };
        }

        const existingIndex =
          state.savedSets.findIndex(
            set =>
              set.name.toLowerCase() ===
              name.toLowerCase()
          );

        const newSet = {
          id:
            existingIndex >= 0
              ? state.savedSets[existingIndex].id
              : crypto.randomUUID(),
          name,
          domains
        };

        if (existingIndex >= 0) {
          state.savedSets[existingIndex] = newSet;
        } else {
          state.savedSets.push(newSet);
        }

        state.savedSets =
          state.savedSets.slice(0, 30);

        await saveState(state);

        return {
          ok: true,
          savedSets: state.savedSets
        };
      }

      case "DELETE_SET": {
        if (state.focusActive) {
          return {
            ok: false,
            error: "Focus Mode is already active."
          };
        }

        const id = String(message.id || "");

        state.savedSets =
          state.savedSets.filter(
            set => set.id !== id
          );

        await saveState(state);

        return {
          ok: true,
          savedSets: state.savedSets
        };
      }

      case "START_FOCUS": {
        if (state.focusActive) {
          return {
            ok: false,
            error: "Focus Mode is already active."
          };
        }

        const minutes =
          Number(message.minutes);

        const sites =
          normalizeSites(message.sites);

        if (
          !Number.isInteger(minutes) ||
          minutes < 1 ||
          minutes > MAX_FOCUS_DURATION_MINUTES
        ) {
          return {
            ok: false,
            error:
              "Focus duration must be between 1 and 1440 minutes."
          };
        }

        if (!sites.length) {
          return {
            ok: false,
            error:
              "Add at least one allowed website."
          };
        }

        const startedAt = Date.now();

        state.focusDurationMinutes = minutes;
        state.allowedSites = sites;
        state.focusActive = true;
        state.focusStartedAt = startedAt;
        state.focusEndsAt =
          startedAt + minutes * 60 * 1000;

        await saveState(state);
        await updateBlockingRules(state);
        await scheduleFocusEnd(state);
        await setBadge(true);
        await enforceTabs();

        return {
          ok: true,
          state
        };
      }

      /*
        Development escape hatch.
        Not exposed in the popup.
      */
      case "START_BLOCK": {
        return startBlockMode(
          message.mode,
          message.sites,
          message.durationMinutes ?? null
        );
      }

      case "STOP_BLOCK": {
        const state = await loadState();

        if (!state.blockActive) {
          return {
            ok: false,
            error: "Block Mode is not active."
          };
        }

        await finishBlock();

        return {
          ok: true,
          state: await loadState()
        };
      }

      case "SET_BLOCK_SITES": {
        const state = await validateBlock();

        if (state.blockActive) {
          return {
            ok: false,
            error:
              "Block Mode is already active."
          };
        }

        state.blockSites =
          normalizeSites(
            message.sites
          );

        await saveState(state);

        return {
          ok: true,
          sites: state.blockSites
        };
      }
      case "STOP_FOCUS": {
        const currentState = await loadState();

        if (!currentState.focusActive) {
          return {
            ok: false,
            error: "Focus Mode is not active."
          };
        }

        const durationMinutes =
          Number(currentState.focusDurationMinutes);

        const startedAt =
          Number(currentState.focusStartedAt);

        if (
          !Number.isFinite(durationMinutes) ||
          !Number.isFinite(startedAt)
        ) {
          return {
            ok: false,
            error: "Focus session state is invalid."
          };
        }

        /*
         * Focus sessions of one hour or less
         * cannot be stopped manually.
         */
        if (
          durationMinutes <=
          FOCUS_STOP_LOCK_MINUTES
        ) {
          return {
            ok: false,
            error:
              "Focus sessions of 60 minutes or less cannot be stopped."
          };
        }

        /*
         * Longer sessions become stoppable only
         * after the first 60 minutes have elapsed.
         */
        const stopUnlockAt =
          startedAt +
          FOCUS_STOP_LOCK_MINUTES * 60 * 1000;

        if (Date.now() < stopUnlockAt) {
          const remaining =
            stopUnlockAt - Date.now();

          const remainingMinutes =
            Math.ceil(
              remaining / 60000
            );

          return {
            ok: false,
            error:
              `Focus Mode cannot be stopped yet. ` +
              `${remainingMinutes} minute(s) remaining in the first-hour lock.`
          };
        }

        await finishFocus();

        return {
          ok: true
        };
      }

      default:
        return {
          ok: false,
          error: "Unknown FocusLock command."
        };
    }
  }
);

async function initialize() {
  const state = await validateFocus();

  if (state.focusActive) {
    await updateBlockingRules(state);
    await scheduleFocusEnd(state);
    await setBadge(true);
    await enforceTabs();

  } else if (state.blockActive) {
    await updateBlockingRules(state);
    await scheduleBlockEnd(state);
    await setBadge(true);
    await enforceTabs();

  } else {
    await updateBlockingRules(state);
    await setBadge(false);
  }
}

browser.runtime.onInstalled.addListener(
  async () => {
    await loadState();
    await initialize();
  }
);

browser.runtime.onStartup.addListener(
  async () => {
    await initialize();
  }
);

initialize();










