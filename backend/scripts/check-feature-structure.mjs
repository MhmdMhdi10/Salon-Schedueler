import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');
const controllerFeatures = [
  'admin',
  'appointment',
  'auth',
  'bot',
  'card-order',
  'customer',
  'device',
  'health',
  'inbox',
  'payment',
  'platform-admin',
  'qr',
  'referral',
  'registration',
  'salon',
  'subscription',
  'transaction',
  'waitlist',
];
const requiredDirectories = [
  'controllers',
  'dto',
  'schemas',
  'services',
  'models',
  'interfaces',
];
const missing = [];

for (const feature of controllerFeatures) {
  const featureRoot = join(sourceRoot, feature);
  const requiredFiles = [
    `${feature}.module.ts`,
    'index.ts',
    join('dto', `${feature}-controller.dto.ts`),
    ...requiredDirectories.map((directory) => join(directory, 'index.ts')),
  ];
  for (const file of requiredFiles) {
    if (!existsSync(join(featureRoot, file))) missing.push(`${feature}/${file}`);
  }
  const controllers = readdirSync(join(featureRoot, 'controllers'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.controller.ts'));
  if (controllers.length === 0) missing.push(`${feature}/controllers/*.controller.ts`);
  const controllerClasses = [];
  for (const controller of controllers) {
    const source = readFileSync(join(featureRoot, 'controllers', controller.name), 'utf8');
    const className = source.match(/export class (\w+Controller)\b/)?.[1];
    if (!className) {
      missing.push(`${feature}/controllers/${controller.name}: export class *Controller`);
    } else {
      controllerClasses.push(className);
    }
  }
  const services = readdirSync(join(featureRoot, 'services'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.service.ts'));
  if (services.length === 0) missing.push(`${feature}/services/*.service.ts`);
  for (const [directory, suffix] of [
    ['interfaces', '.interface.ts'],
    ['models', '.model.ts'],
    ['schemas', '.schema.ts'],
  ]) {
    const entries = readdirSync(join(featureRoot, directory), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix));
    if (entries.length === 0) missing.push(`${feature}/${directory}/*${suffix}`);
  }
  const moduleSource = readFileSync(join(featureRoot, `${feature}.module.ts`), 'utf8');
  for (const field of ['imports', 'controllers', 'providers', 'exports', 'schemas']) {
    if (!new RegExp(`\\b${field}\\s*:`).test(moduleSource)) {
      missing.push(`${feature}/${feature}.module.ts: ${field}`);
    }
  }
  for (const className of controllerClasses) {
    if (!new RegExp(`\\b${className}\\b`).test(moduleSource)) {
      missing.push(`${feature}/${feature}.module.ts: ${className}`);
    }
  }
  const dtoIndexSource = readFileSync(join(featureRoot, 'dto', 'index.ts'), 'utf8');
  if (!dtoIndexSource.includes(`${feature}-controller.dto.js`)) {
    missing.push(`${feature}/dto/index.ts: ${feature}-controller.dto.js`);
  }
  const controllerDtoSource = readFileSync(
    join(featureRoot, 'dto', `${feature}-controller.dto.ts`),
    'utf8',
  );
  if (!/controllerRouteDto\.bind\(null,/.test(controllerDtoSource)) {
    missing.push(`${feature}/dto/${feature}-controller.dto.ts: controller owner`);
  }
  if (!/satisfies readonly ControllerDtoDefinition\[\]/.test(controllerDtoSource)) {
    missing.push(`${feature}/dto/${feature}-controller.dto.ts: typed definitions`);
  }
}

console.log(`V-House feature structure: ${controllerFeatures.length}/${controllerFeatures.length} features checked`);
console.log(`Required folders per controller feature: ${requiredDirectories.join(', ')}`);
console.log(`Feature-local controller DTO files: ${controllerFeatures.length}/${controllerFeatures.length}`);

if (missing.length) {
  console.error(`Missing feature structure entries: ${missing.join(' | ')}`);
  process.exitCode = 1;
}
