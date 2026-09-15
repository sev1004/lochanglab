import fs from 'node:fs';
const files = ['src/app/globals.css', 'src/app/simulator-editor.css', 'src/app/ui-layout.css'];
const failures = [];
for (const file of files) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bzoom\s*:/.test(css)) failures.push(`${file}: zoom is forbidden`);
  if (/\bscale(?:X|Y|3d)?\s*\(/i.test(css)) failures.push(`${file}: scale must not size layout`);
  if (/56\.13/.test(css)) failures.push(`${file}: stale viewport correction`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('UI source rules passed. Run DOM audit separately for layout verification.');
