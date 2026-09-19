const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
    "C:\\Scripts\\FocusLock\\focuslock-engine.js",
    "utf8"
);

const context = { console, URL, globalThis: {} };

vm.createContext(context);
vm.runInContext(source, context);

const E = context.globalThis.FocusLockEngine;

const value = "https://" + "example.com/private/test";

console.log("INPUT:", value);
console.log("normalizeUrl:", E.normalizeUrl(value));
console.log(
    "normalizeRule:",
    E.normalizeRule({
        id: "test-url-rule",
        type: "url",
        value: value,
        action: "block"
    })
);

