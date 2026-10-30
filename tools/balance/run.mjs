// Runs the balance batches with BALANCE=1 (no shell env syntax needed):
//   node tools/balance/run.mjs [label] [seeds] [towerSeeds] [-t "test name filter"]
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const filterAt = args.indexOf('-t');
const filter = filterAt >= 0 ? args.splice(filterAt, 2)[1] : null;
const [label = 'baseline', seeds, towerSeeds] = args;
const env = { ...process.env, BALANCE: '1', BALANCE_LABEL: label };
if (seeds) env.BALANCE_SEEDS = seeds;
if (towerSeeds) env.BALANCE_TOWER_SEEDS = towerSeeds;
const result = spawnSync('npx', ['vitest', 'run', 'tools/balance', '--testTimeout=0', ...(filter ? ['-t', filter] : [])], { env, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
