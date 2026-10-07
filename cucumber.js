const path = require('node:path');
const businessArtifacts = path.join(
  path.resolve(process.env.QA_ARTIFACT_DIR ?? 'artifacts/qa'),
  'business',
);

const args = [
  '--format progress',
  `--format json:${path.join(businessArtifacts, 'cucumber-results.json')}`,
  `--format html:${path.join(businessArtifacts, 'cucumber-report.html')}`,
  '--parallel 1',
  '--require-module ts-node/register/transpile-only',
  '--require features/support/**/*.ts',
  '--require features/step_definitions/**/*.ts',
  '--strict',
];

module.exports = {
  default: args.join(' '),
};
