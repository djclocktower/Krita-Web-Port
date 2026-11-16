// Prints a Markdown table (and the list of non-passing functions) from one or more results.json files.
// Usage: node engine/tests/make-table.mjs results.json [more.json ...]
import { readFileSync } from 'node:fs';
const rs = process.argv.slice(2).flatMap(f => JSON.parse(readFileSync(f)).results);
console.log('| Executable | Built | Ran | Status | Exit | Functions pass / fail / skip | QTest rows pass / fail / skip | Wall (s) |\n|---|---|---|---|---|---|---|---|');
for (const r of rs.sort((a, b) => a.name.localeCompare(b.name)))
    console.log(`| ${r.name} | ${r.built ? 'yes' : 'no'} | ${r.ran ? 'yes' : 'no'} | ${r.status} | ${r.exit ?? '-'} | ${r.fnPass ?? 0} / ${r.fnFail ?? 0} / ${r.fnSkip ?? 0} | ${r.passed} / ${r.failed} / ${r.skipped} | ${(r.wallMs / 1000).toFixed(1)} |`);
console.log('\nNon-passing:');
for (const r of rs) for (const f of r.failures) console.log(`- ${r.name}: ${f.kind} ${f.fn} ${f.msg.split('\n').slice(0, 4).join(' | ').slice(0, 300)}`);
