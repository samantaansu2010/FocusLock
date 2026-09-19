const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
    "C:\\Scripts\\FocusLock\\focuslock-engine.js",
    "utf8"
);

const context = {
    console,
    URL,
    globalThis: {}
};

vm.createContext(context);
vm.runInContext(source, context);

const E = context.globalThis.FocusLockEngine;

const input =
    "youtube.com\n" +
    "https://" + "www.example.com/test\n" +
    "reddit.com\n" +
    "youtube.com";

const result = E.parseBulkInput(input);

console.log("COUNT:", result.length);
console.log("RESULT:", JSON.stringify(result, null, 2));
console.log("");
console.log("FUNCTION SOURCE:");
console.log(E.parseBulkInput.toString());
