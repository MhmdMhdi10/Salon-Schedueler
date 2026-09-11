import { readFileSync } from 'node:fs';

const resultPath = process.env.CUCUMBER_JSON ?? 'artifacts/cucumber-results.json';

let report;
try {
  report = JSON.parse(readFileSync(resultPath, 'utf8'));
} catch (error) {
  console.error(`Cucumber JSON is missing or invalid: ${resultPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const features = Array.isArray(report) ? report : [];
const scenarios = features.flatMap((feature) =>
  (feature.elements ?? []).filter((element) => element.type === 'scenario'),
);
const steps = scenarios.flatMap((scenario) => scenario.steps ?? []);
const incompleteSteps = steps.filter((step) => !step.result?.status);
const failedSteps = steps.filter((step) =>
  ['failed', 'undefined', 'ambiguous', 'pending'].includes(step.result?.status),
);

console.log(
  `Cucumber JSON: ${features.length} features, ${scenarios.length} scenarios, ${steps.length} steps`,
);
console.log(
  `Cucumber JSON completeness: ${steps.length - incompleteSteps.length}/${steps.length} steps have results`,
);

if (features.length === 0 || scenarios.length === 0) {
  console.error('Cucumber JSON contains no executable scenarios');
  process.exitCode = 1;
}
if (incompleteSteps.length > 0) {
  console.error(`Cucumber JSON has ${incompleteSteps.length} step(s) without a result`);
  process.exitCode = 1;
}
if (failedSteps.length > 0) {
  console.error(`Cucumber JSON has ${failedSteps.length} failed or incomplete step(s)`);
  process.exitCode = 1;
}
