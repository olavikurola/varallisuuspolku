'use strict';
/* Etusivun JSON-LD-FAQ = näkyvä UKK (fi + en). Lähde: tyokalut/ukk-synkka.js.
   Ajo: node testit/ukk-synkka.test.js */
const { spawnSync } = require('child_process');
const path = require('path');

const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tyokalut', 'ukk-synkka.js'), '--tarkista'], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
console.log(r.status === 0 ? '  ✓ JSON-LD-FAQ vastaa näkyvää UKK:ta' : '  ✗ JSON-LD-FAQ ei vastaa näkyvää UKK:ta');
process.exit(r.status === 0 ? 0 : 1);
