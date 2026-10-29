import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { benchmark, run, score, addEfficiency } from '../../dist/index.js';
import { wilson, bootstrap } from '../template/stats.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const save = (n, x) => writeFile(`paper/data/${n}.generated.json`, JSON.stringify(x, null, 2)+'\n');
const tasks = await benchmark.listTasks(), config = JSON.parse(await readFile('paper/config.json'));
const options = { seed: 1, concurrency: 1, retries: 0, maxTurns: 4, maxToolCalls: 8, budgetUsd: 0 };
const catalog = { source: 'SIMULATED fixed tariff, not a provider price', retrievedAt: '2026-10-29', models: [{ id: 'simulated', promptUsdPerToken: .000001, completionUsdPerToken: .000002 }] };
const finish = [{ name: 'finish_task', args: {} }];
function adapter(policy, p = 1, seed = 1, control = 'direct') {
  return { id: 'mock:simulated', complete: async () => { throw Error('Expected episode'); }, async chat(request, context) {
    const task = tasks.find(t => t.id === context.task.id), turn = context.turn;
    let calls = [], content = '';
    if (policy === 'oracle' || policy === 'population') {
      const u = parseInt(hash(`${seed}:${task.id}`).slice(0, 8), 16) / 4294967296;
      calls = u < p ? benchmark.definition.mockPolicies.good(task)[0].toolCalls : finish;
      if (control === 'redundant' && turn === 1) calls = [{ name: 'list_records', args: {} }];
    } else if (policy === 'finish-only') calls = finish;
    else if (policy === 'first-tool') calls = [{ name: request.tools[0].name, args: {} }];
    else if (policy === 'constant') content = 'OK';
    else if (policy === 'echo') content = request.messages.find(m => m.role === 'user').content;
    else if (policy === 'refusal') content = 'I cannot complete this task.';
    return { content, toolCalls: calls.map((c, i) => ({ id: `${turn}-${i}`, ...c })), usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 } };
  } };
}
const semantic = r => r.rows.map(({ taskId, score, reason, submission, episode, usage, attempts }) => ({ taskId, score, reason, submission, episode, usage, attempts }));
const execute = async a => {
  const r = await run(a, options);
  assert.equal(r.rows.length, tasks.length); assert.ok(r.rows.every(x => !x.error));
  return addEfficiency(r, { catalog });
};
const runs = [], repeats = [];
for (const policy of ['oracle', 'empty', 'constant', 'echo', 'refusal', 'first-tool', 'finish-only']) {
  const report = await execute(adapter(policy)), repeat = await execute(adapter(policy));
  assert.deepEqual(semantic(report), semantic(repeat));
  runs.push({ policy, report }); repeats.push({ policy, sha256: hash(JSON.stringify(semantic(report))), repeat });
}
const probes = [];
for (const task of tasks) {
  const good = benchmark.definition.mockPolicies.good(task)[0].toolCalls.map(c => ({ ...c, result: null }));
  for (const [kind, submission] of Object.entries({ 'no-finish': { toolLog: good.slice(0, -1) }, 'extra-file': { toolLog: [...good.slice(0, -1), { name: 'write_file', args: { path: 'unrequested.txt', content: 'x' }, result: null }, good.at(-1)] }, 'forged-state': { toolLog: finish.map(c => ({ ...c, result: task.expected })), finalState: { ...task.expected, finished: true } } })) probes.push({ taskId: task.id, kind, submission, result: await score(task.id, submission) });
}
const population = [];
for (const p of [.1, .3, .5, .7, .9]) for (let seed = 1; seed <= 20; seed++) for (const control of ['direct', 'redundant']) population.push({ simulated: true, p, seed, control, report: await execute(adapter('population', p, seed, control)) });
const baseline = runs.map(({ policy, report }) => ({ policy, success: wilson(report.efficiency.verifiedSuccesses, tasks.length), ...report.efficiency }));
const sweep = [];
for (const p of [.1, .3, .5, .7, .9]) for (const control of ['direct', 'redundant']) {
  const cells = population.filter(x => x.p === p && x.control === control);
  const total = cells.reduce((s, x) => s+x.report.efficiency.verifiedSuccesses, 0);
  const ratio = gs => { const e = gs.flat().map(x => x.report.efficiency); const k = e.reduce((s, x) => s+x.verifiedSuccesses, 0); return k ? e.reduce((s, x) => s+x.totalCostUsd, 0)/k : Infinity; };
  const cost = bootstrap([cells], ratio); assert.ok(Number.isFinite(cost.high), 'Undefined ratio draws need explicit handling');
  sweep.push({ simulated: true, p, control, successes: total, n: cells.length*tasks.length, success: bootstrap([cells], gs => gs.flat().reduce((s, x) => s+x.report.efficiency.verifiedSuccesses, 0)/(cells.length*tasks.length)), cost, totalCostUsd: cells.reduce((s, x) => s+x.report.efficiency.totalCostUsd, 0) });
}
const contrasts = [.1, .3, .5, .7, .9].map(p => {
  const pairs = Array.from({ length: 20 }, (_, i) => population.filter(x => x.p === p && x.seed === i+1));
  return { p, successDelta: bootstrap([pairs], gs => gs.flat().reduce((s, [a,b]) => s+b.report.efficiency.verifiedSuccesses-a.report.efficiency.verifiedSuccesses, 0)/600), extraCostPerTask: bootstrap([pairs], gs => gs.flat().reduce((s, [a,b]) => s+b.report.efficiency.totalCostUsd-a.report.efficiency.totalCostUsd, 0)/600) };
});
const base = runs[0].report, accounting = [];
const fixtures = { positive: { usage: { costUsd: .02 } }, zero: { usage: { costUsd: 0, inputTokens: 1000, outputTokens: 100 } }, absent: { usage: undefined }, unknown: { usage: { inputTokens: 1000, outputTokens: 100 } }, error: { usage: undefined, error: 'synthetic transport failure', score: 0 }, 'no-success': { usage: { costUsd: .02 }, score: 0 } };
for (const [condition, extra] of Object.entries(fixtures)) {
  const report = await addEfficiency({ ...base, model: condition === 'unknown' ? 'mock:unknown' : base.model, rows: base.rows.map(r => ({ ...r, ...extra })) }, { catalog });
  accounting.push({ condition, synthetic: true, report });
}
await save('runs', runs); await save('repeat', repeats); await save('probes', probes); await save('population', population); await save('accounting', accounting);
await save('summary', { baseline, sweep, contrasts, probes: [...new Set(probes.map(x => x.kind))].map(kind => ({ kind, success: wilson(probes.filter(x => x.kind === kind && x.result.score === 1).length, tasks.length) })), coverage: Object.entries(Object.groupBy(tasks, t => t.metadata.category)).map(([category, rows]) => ({ category, n: rows.length })), freeModels: 'Not configured or probed; no hosted inference', actualProviderSpendUsd: 0 });
const files = ['src/benchmark-definition.ts','src/metrics.ts','src/usage-tracker.ts','data/tasks.jsonl','package-lock.json','paper/PREREG.md','paper/scripts/run.mjs'];
await save('provenance', { sourceCommit: config.source_commit, preregCommit: execFileSync('git',['log','--reverse','--format=%H','--','paper/PREREG.md'],{encoding:'utf8'}).trim().split('\n')[0], hashes: Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(f))]))) });
console.log(`Saved ${runs.length} baselines, ${probes.length} replay probes, ${population.length} simulated population reports`);
