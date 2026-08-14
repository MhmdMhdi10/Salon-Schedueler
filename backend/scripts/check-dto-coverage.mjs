import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');
const routePattern = /router\.(get|post|patch|put|delete)\s*\(\s*['"]([^'"]+)['"]/g;
const dtoPattern = /route\(\s*'([^']+)'\s*,\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*'([^']+)'/g;

const controllerFiles = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.controller.ts')) controllerFiles.push(fullPath);
  }
};
visit(sourceRoot);

const controllers = [];
for (const file of controllerFiles) {
  const source = readFileSync(file, 'utf8');
  let match;
  while ((match = routePattern.exec(source))) {
    const path = match[2] === '/healthz' ? '/healthz' : `/api${match[2]}`;
    controllers.push(`${match[1].toUpperCase()} ${path}`);
  }
}

const dtoDefinitions = [];
const dtoIds = new Set();
const dtoFiles = [];
const collectDtoFiles = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collectDtoFiles(fullPath);
    else if (entry.isFile() && entry.name.endsWith('-controller.dto.ts')) dtoFiles.push(fullPath);
  }
};
collectDtoFiles(sourceRoot);

for (const file of dtoFiles) {
  const source = readFileSync(file, 'utf8');
  const controller = source.match(
    /controllerRouteDto\.bind\(null,\s*['"]([^'"]+)['"]\)/,
  )?.[1];
  if (!controller) {
    console.error(`Missing controller owner in DTO file: ${file}`);
    process.exitCode = 1;
    continue;
  }
  let match;
  while ((match = dtoPattern.exec(source))) {
    const [, id, method, path] = match;
    if (dtoIds.has(id)) {
      console.error(`Duplicate controller DTO id: ${id}`);
      process.exitCode = 1;
    }
    dtoIds.add(id);
    dtoDefinitions.push({ controller, id, key: `${method} ${path}` });
  }
}

const count = (items) => {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
};
const controllerCounts = count(controllers);
const dtoCounts = count(dtoDefinitions.map(({ key }) => key));
const missing = [];
for (const [key, required] of controllerCounts) {
  const actual = dtoCounts.get(key) ?? 0;
  if (actual < required) missing.push(`${key} (${actual}/${required})`);
}
const extra = [];
for (const [key, actual] of dtoCounts) {
  const required = controllerCounts.get(key) ?? 0;
  if (actual > required) extra.push(`${key} (${actual}/${required})`);
}
const invalidController = dtoDefinitions.filter(({ controller }) => !/Controller$/.test(controller));

console.log(`Controller methods: ${controllers.length}`);
console.log(`Feature-local controller DTO files: ${dtoFiles.length}`);
console.log(`DTO definitions: ${dtoDefinitions.length}`);
console.log(`DTO endpoint coverage: ${controllers.length === dtoDefinitions.length && missing.length === 0 && extra.length === 0 ? '100.00%' : 'FAILED'}`);
if (missing.length) console.error(`Missing DTOs: ${missing.join(' | ')}`);
if (extra.length) console.error(`Extra DTOs: ${extra.join(' | ')}`);
if (invalidController.length) console.error(`Invalid controller names: ${invalidController.map(({ id }) => id).join(' | ')}`);
if (controllers.length !== dtoDefinitions.length || missing.length || extra.length || invalidController.length) {
  process.exitCode = 1;
}
