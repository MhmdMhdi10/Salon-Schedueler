const path = require('node:path');
const qaArtifacts = path.resolve(
  process.env.QA_ARTIFACT_DIR ?? path.resolve(process.cwd(), '..', 'artifacts/qa'),
);
const backendArtifacts = path.join(qaArtifacts, 'backend');

module.exports = {
  default: {
    paths: ['features/tests/**/*.feature'],
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/bootstrap/custom.world.ts',
      'features/bootstrap/hooks.ts',
      'features/step_definitions/**/*.ts',
    ],
    format: [
      'progress',
      `json:${path.join(backendArtifacts, 'cucumber-results.json')}`,
      `html:${path.join(backendArtifacts, 'cucumber-report.html')}`,
    ],
    formatOptions: { snippetInterface: 'async-await' },
    parallel: 1,
    timeout: 120000,
    retry: 0,
    failFast: false,
    strict: true,
    tags: 'not @skip',
  },
};
