import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSource } from './architecture/rules.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = existsSync(join(root, 'src/modules')) ? 'backend' : 'frontend';
const base = join(root, mode === 'backend' ? 'src' : 'app');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : /\.tsx?$/.test(entry.name) && !/\.(spec|test|d)\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}
const errors = files(base).flatMap((file) => checkSource(relative(root, file), readFileSync(file, 'utf8'), mode));
for (const error of errors) console.error(`${error.file}:${error.line} [${error.rule}] Move to ${error.destination}`);
if (errors.length) process.exitCode = 1;
else console.log(`Architecture check passed (${mode}).`);
