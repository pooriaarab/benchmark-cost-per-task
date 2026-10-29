# Cost per verified task paper

Install Node 20+, Python 3, Tectonic, and Poppler. Run from the repository root:

```sh
npm ci
sh paper/template/reproduce.sh
npm run ci:local
```

The packet builds `paper/cost-per-task-paper.pdf`. PDF files and downloaded styles stay untracked.
The unchanged pilot template pins the official NeurIPS style archive and verifies its hash.
The first build can download TeX packages. Experiments need no network, credentials, or model access.

The study plan precedes results in git. It is not an independent public registration.
The benchmark source commit appears in `config.json`. Provenance records the source and study hashes.
`run.mjs` produces full runner traces, repeated controls, replay probes, accounting fixtures, and the simulated population.
`render.mjs` produces metadata, numerical macros, tables, and figure data. Do not edit generated files.
`verify.mjs` replays all measured baseline and population rows and checks raw-to-summary agreement.
It writes repeatable evidence to `data/verification.generated.json`. Timings and PDF hashes can change between builds.

All costs use assigned tokens and an artificial tariff. No provider bills or learned-model results appear.
The simulated redundant read adds cost but cannot change outcomes. It is a negative control, not a useful verifier.
Wilson intervals describe hypothetical task sampling. Population intervals resample whole simulated seeds.
Repeated runs add no independent tasks. Public generator templates limit claims about generalization.
The error-without-usage accounting convention is not proof of zero provider billing.
Free hosted inference is not configured or probed. No human validation or external replication occurs.

The paper and figures use CC-BY-4.0. Existing code and tasks remain MIT.
The family paper supplies house style and scope context. This paper uses no honesty prose or metrics.
The parent handles publication and merge review. Do not publish this packet automatically.
