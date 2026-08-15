/**
 * Headless self-check: loads geometry+rules without a browser.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const store = {};
const sandbox = {
  window: {},
  localStorage: {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
  },
  Math,
  Object,
  Array,
  Boolean,
  JSON,
  console,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
}

load("src/geometry.js");
load("src/rules.js");

const results = sandbox.window.ObvodRules.runSelfChecks();
for (const item of results) {
  console.log(item.ok ? `OK  ${item.name}` : `FAIL ${item.name}: ${item.error}`);
}
const failed = results.filter((item) => !item.ok).length;
if (failed) {
  console.log(`\nПровалено: ${failed}`);
  process.exit(1);
}
console.log(`\nВсе ${results.length} проверок прошли.`);
