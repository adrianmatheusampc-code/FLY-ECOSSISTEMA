import fs from 'node:fs';

const bundlePath = 'assets/fly-timeline-landing.bundle.js';
const source = fs.readFileSync(bundlePath, 'utf8');
const cleaned = source
  .split('\n')
  .map((line) => {
    const withoutTrailing = line.replace(/[ \t]+$/u, '');
    return withoutTrailing.replace(/^[ \t]+/u, (indent) => indent.replace(/ +(?=\t)/gu, ''));
  })
  .join('\n');

fs.writeFileSync(bundlePath, cleaned);
