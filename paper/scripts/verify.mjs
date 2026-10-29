import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { score, addEfficiency } from '../../dist/index.js';
import { wilson } from '../template/stats.mjs';
const read = n => readFile(`paper/data/${n}.generated.json`,'utf8').then(JSON.parse);
const hash = x => createHash('sha256').update(x).digest('hex');
const [s,runs,repeats,probes,pop,accounting,provenance] = await Promise.all(['summary','runs','repeat','probes','population','accounting','provenance'].map(read));
const catalog = { source:'SIMULATED fixed tariff, not a provider price', retrievedAt:'2026-10-29', models:[{id:'simulated',promptUsdPerToken:.000001,completionUsdPerToken:.000002}] };
const semantic = r => r.rows.map(({ taskId, score, reason, submission, episode, usage, attempts }) => ({ taskId, score, reason, submission, episode, usage, attempts }));
let replayed = 0;
for (const {report} of [...runs,...pop]) {
  for (const row of report.rows) { assert.equal((await score(row.taskId,row.submission)).score,row.score); replayed++; }
  assert.deepEqual((await addEfficiency(report,{catalog})).efficiency,report.efficiency);
}
for (const [i,x] of runs.entries()) {
  assert.deepEqual(s.baseline[i].success,wilson(x.report.rows.filter(r=>r.score===1).length,x.report.rows.length));
  assert.equal(hash(JSON.stringify(semantic(x.report))),repeats[i].sha256);
  assert.equal(hash(JSON.stringify(semantic(repeats[i].repeat))),repeats[i].sha256);
  assert.ok(x.report.rows.every(r=>r.score===(i===0?1:0)));
}
for (const p of probes) { assert.equal((await score(p.taskId,p.submission)).score,p.result.score); assert.equal(p.result.score,0); }
for (const cell of s.sweep) {
  const rows=pop.filter(x=>x.p===cell.p&&x.control===cell.control).flatMap(x=>x.report.rows);
  assert.equal(rows.length,cell.n); assert.equal(rows.filter(x=>x.score===1).length,cell.successes);
  const cost=pop.filter(x=>x.p===cell.p&&x.control===cell.control).reduce((a,x)=>a+x.report.efficiency.totalCostUsd,0);
  assert.ok(Math.abs(cost/cell.successes-cell.cost.value)<1e-12);
  const twin=s.sweep.find(x=>x.p===cell.p&&x.control!==cell.control); assert.equal(cell.successes,twin.successes);
}
for (const x of s.contrasts) { assert.equal(x.successDelta.value,0); assert.ok(Math.abs(x.extraCostPerTask.value-.0012)<1e-12); }
const eff = n => accounting.find(x=>x.condition===n).report.efficiency;
assert.equal(eff('positive').costSource,'provider'); assert.equal(eff('zero').costSource,'estimated');
for (const n of ['absent','unknown']) assert.equal(eff(n).totalCostUsd,null);
assert.equal(eff('error').totalCostUsd,0); assert.equal(eff('no-success').costPerVerifiedSuccess,null);
for (const [f,digest] of Object.entries(provenance.hashes)) assert.equal(hash(await readFile(f)),digest);
const meta=JSON.parse(await readFile('paper/meta.json')); assert.ok(/^[\x00-\x7f]*$/.test(meta.abstract)&&meta.abstract.length<=1920);
assert.equal(meta.license,'CC-BY-4.0'); assert.ok((await readFile('CITATION.cff','utf8')).includes(meta.title));
const text=execFileSync('pdftotext',['paper/'+meta.artifact_name,'-'],{encoding:'utf8'}), pages=text.split('\f').length-1;
assert.ok(pages>=8); assert.ok(!text.includes('—')); assert.ok(!text.includes('[?]'));
assert.ok(!/Overfull|undefined references|undefined citations/.test(await readFile('paper/paper.log','utf8')));
const evidence={status:'passed',pages,replayedRows:replayed,invalidTraces:probes.length,repeatPolicies:runs.length,simulatedEpisodes:pop.reduce((a,x)=>a+x.report.rows.length,0),pdfSha256:hash(await readFile('paper/'+meta.artifact_name))};
await writeFile('paper/data/verification.generated.json',JSON.stringify(evidence,null,2)+'\n'); console.log(JSON.stringify(evidence));
