const fs = require("fs");
const vm = require("vm");

const enginePath = "C:\\Scripts\\FocusLock\\focuslock-engine.js";

if (!fs.existsSync(enginePath)) {
  throw new Error("Engine file not found: " + enginePath);
}

const source = fs.readFileSync(enginePath, "utf8");

const context = {
  console,
  globalThis: {}
};

vm.createContext(context);
context.URL = URL;
vm.runInContext(source, context);

const E = context.globalThis.FocusLockEngine;

function test(name, condition) {
  if (!condition) {
    throw new Error("FAIL: " + name);
  }

  console.log("PASS: " + name);
}

console.log("========================================");
console.log("FOCUSLOCK ENGINE TEST");
console.log("========================================");

test("Engine exists", !!E);
test("Engine version exists", E.version === 1);
test("createDefaultState exists", typeof E.createDefaultState === "function");
test("normalizeState exists", typeof E.normalizeState === "function");
test("domainMatches exists", typeof E.domainMatches === "function");
test("pathMatches exists", typeof E.pathMatches === "function");
test("ruleMatchesUrl exists", typeof E.ruleMatchesUrl === "function");
test("parseBulkInput exists", typeof E.parseBulkInput === "function");
test("findMatchingRules exists", typeof E.findMatchingRules === "function");

const state = E.createDefaultState();

test("Default schema version is 5", state.schemaVersion === 5);
test("Default engine version is 1", state.engineVersion === 1);
test("Default UI mode is simple", state.settings.uiMode === "simple");
test("No active mode by default", state.active.mode === null);

test(
  "Exact domain matches",
  E.domainMatches("youtube.com", "youtube.com") === true
);

test(
  "Subdomain matches",
  E.domainMatches("www.youtube.com", "youtube.com") === true
);

test(
  "Unrelated domain does not match",
  E.domainMatches("notyoutube.com", "youtube.com") === false
);

test(
  "Exact path matches",
  E.pathMatches("/shorts/abc", "/shorts/abc") === true
);

test(
  "Wildcard path matches",
  E.pathMatches("/shorts/abc", "/shorts/*") === true
);

test(
  "Directory path matches",
  E.pathMatches("/search/results", "/search/*") === true
);

const urlRule = E.normalizeRule({
  id: "test-url-rule",
  type: "url",
  value: "https://example.com/private/*",
  action: "block"
});

test(
  "Wildcard URL rule normalizes",
  !!urlRule &&
  urlRule.pathname === "/private/*"
);

test(
  "Wildcard URL rule matches",
  E.ruleMatchesUrl(
    urlRule,
    "https://example.com/private/test"
  ) === true
);

test(
  "Wildcard URL rule does not match sibling path",
  E.ruleMatchesUrl(
    urlRule,
    "https://example.com/public/test"
  ) === false
);
const familyRule = E.normalizeRule({
  id: "family-youtube",
  type: "domain",
  value: "youtube",
  action: "block"
});

test(
  "Family rule normalizes",
  !!familyRule &&
  familyRule.domain === "youtube" &&
  familyRule.scope === "family"
);

test(
  "Family rule matches youtube.com",
  E.ruleMatchesUrl(
    familyRule,
    "https://youtube.com"
  ) === true
);

test(
  "Family rule matches youtube.in",
  E.ruleMatchesUrl(
    familyRule,
    "https://youtube.in"
  ) === true
);

test(
  "Family rule matches subdomain",
  E.ruleMatchesUrl(
    familyRule,
    "https://m.youtube.in"
  ) === true
);

test(
  "Family rule rejects notyoutube.com",
  E.ruleMatchesUrl(
    familyRule,
    "https://notyoutube.com"
  ) === false
);

test(
  "Family rule rejects myyoutube.com",
  E.ruleMatchesUrl(
    familyRule,
    "https://myyoutube.com"
  ) === false
);


const exactDomainRule = E.normalizeRule({
  id: "exact-youtube",
  type: "domain",
  value: "youtube.com",
  action: "block"
});

test(
  "Explicit domain normalizes",
  !!exactDomainRule &&
  exactDomainRule.domain === "youtube.com" &&
  exactDomainRule.scope === "domain"
);

test(
  "Explicit domain matches subdomain",
  E.ruleMatchesUrl(
    exactDomainRule,
    "https://www.youtube.com"
  ) === true
);

test(
  "Explicit domain rejects other TLD",
  E.ruleMatchesUrl(
    exactDomainRule,
    "https://youtube.org"
  ) === false
);


const wildcardDomainRule = E.normalizeRule({
  id: "wildcard-youtube",
  type: "domain",
  value: "*.youtube.com",
  action: "block"
});

test(
  "Wildcard domain normalizes",
  !!wildcardDomainRule &&
  wildcardDomainRule.domain === "youtube.com" &&
  wildcardDomainRule.scope === "wildcard"
);

test(
  "Wildcard domain matches base domain",
  E.ruleMatchesUrl(
    wildcardDomainRule,
    "https://youtube.com"
  ) === true
);

test(
  "Wildcard domain matches subdomain",
  E.ruleMatchesUrl(
    wildcardDomainRule,
    "https://m.youtube.com"
  ) === true
);

test(
  "Wildcard domain rejects other TLD",
  E.ruleMatchesUrl(
    wildcardDomainRule,
    "https://youtube.org"
  ) === false
);


const familyLetterRule = E.normalizeRule({
  id: "family-a",
  type: "domain",
  value: "a",
  action: "block"
});

test(
  "Single-label family normalizes",
  !!familyLetterRule &&
  familyLetterRule.scope === "family"
);

test(
  "Single-label family matches a.com",
  E.ruleMatchesUrl(
    familyLetterRule,
    "https://a.com"
  ) === true
);

test(
  "Single-label family matches foo.a.org",
  E.ruleMatchesUrl(
    familyLetterRule,
    "https://foo.a.org"
  ) === true
);

test(
  "Single-label family rejects apple.com",
  E.ruleMatchesUrl(
    familyLetterRule,
    "https://apple.com"
  ) === false
);


const familyFacebookRule = E.normalizeRule({
  id: "family-facebook",
  type: "domain",
  value: "facebook",
  action: "block"
});

test(
  "Facebook family matches facebook.com",
  E.ruleMatchesUrl(
    familyFacebookRule,
    "https://facebook.com"
  ) === true
);

test(
  "Facebook family matches m.facebook.in",
  E.ruleMatchesUrl(
    familyFacebookRule,
    "https://m.facebook.in"
  ) === true
);

test(
  "Facebook family rejects myfacebook.com",
  E.ruleMatchesUrl(
    familyFacebookRule,
    "https://myfacebook.com"
  ) === false
);

const shortsRule = E.normalizeRule({
  id: "shorts-path",
  type: "domain",
  value: "youtube.com/shorts",
  action: "block"
});

test(
  "Domain path normalizes to PATH rule",
  !!shortsRule &&
  shortsRule.type === "path" &&
  shortsRule.domain === "youtube.com" &&
  shortsRule.path === "/shorts"
);

test(
  "Domain path matches exact path",
  E.ruleMatchesUrl(
    shortsRule,
    "https://youtube.com/shorts"
  ) === true
);

test(
  "Domain path matches child path",
  E.ruleMatchesUrl(
    shortsRule,
    "https://youtube.com/shorts/feed"
  ) === true
);

test(
  "Domain path rejects sibling path",
  E.ruleMatchesUrl(
    shortsRule,
    "https://youtube.com/watch"
  ) === false
);

test(
  "Domain path rejects partial sibling",
  E.ruleMatchesUrl(
    shortsRule,
    "https://youtube.com/shorts2"
  ) === false
);

const shortsWildcardRule = E.normalizeRule({
  id: "shorts-wildcard",
  type: "domain",
  value: "youtube.com/shorts/*",
  action: "block"
});

test(
  "Wildcard domain path normalizes",
  !!shortsWildcardRule &&
  shortsWildcardRule.type === "path" &&
  shortsWildcardRule.domain === "youtube.com" &&
  shortsWildcardRule.path === "/shorts/*"
);

test(
  "Wildcard domain path matches child",
  E.ruleMatchesUrl(
    shortsWildcardRule,
    "https://youtube.com/shorts/abc"
  ) === true
);

test(
  "Wildcard domain path rejects sibling",
  E.ruleMatchesUrl(
    shortsWildcardRule,
    "https://youtube.com/feed"
  ) === false
);
const normalized = E.normalizeState({
  schemaVersion: 1,
  settings: {},
  active: null,
  profiles: [],
  policies: [],
  schedules: [],
  rules: []
});

test("State normalization succeeds", !!normalized);
test("Normalized state has settings", !!normalized.settings);
test("Normalized state has active state", !!normalized.active);

const bulk = E.parseBulkInput(`
youtube.com
https://www.example.com/test
reddit.com
youtube.com
`);

test("Bulk parser returns entries", Array.isArray(bulk));
test("Bulk parser removes duplicates", bulk.length === 3);

const rules = [
  {
    id: "rule-1",
    type: "domain",
    domain: "youtube.com",
    action: "block",
    enabled: true
  }
];

const matches = E.findMatchingRules(
  rules,
  "https://www.youtube.com/watch?v=test"
);

test("findMatchingRules returns matches", matches.length === 1);

console.log("");
console.log("========================================");
console.log("ALL ENGINE TESTS PASSED");
console.log("========================================");
console.log("");
console.log("The new engine is isolated.");
console.log("Existing FocusLock backend was not modified.");






