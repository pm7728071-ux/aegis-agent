'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const bodyParserVersion = require('body-parser/package.json').version;
const [major, minor, patch] = bodyParserVersion.split('.').map(Number);

assert.equal(major, 1, 'Keep the Express 4-compatible body-parser major version');
assert.ok(minor > 20 || (minor === 20 && patch >= 9), `body-parser must be >= 1.20.9; found ${bodyParserVersion}`);

const engine = fs.readFileSync(new URL('../engine.js', `file://${__filename}`), 'utf8');
assert.match(engine, /express\.json\(\{\s*limit:\s*'100kb',\s*inflate:\s*false\s*\}\)/,
  'JSON parsing must reject compressed bodies unless a reviewed compatibility change is made');

console.log(`Dependency security checks passed (body-parser ${bodyParserVersion}; compressed JSON rejected).`);
