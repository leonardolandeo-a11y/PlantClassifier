// Load a named dotenv file as data; never execute it or print its values.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
const [file, command, ...args] = process.argv.slice(2);
if (!file || !command) throw new Error('Usage: node scripts/with-lab-env.mjs FILE COMMAND [ARG ...]');
const result = spawnSync(command, args, {stdio:'inherit', env:{...parseEnv(readFileSync(file,'utf8')), ...process.env}});
if (result.error) throw new Error(`Unable to execute ${command}`);
process.exit(result.status ?? 1);
