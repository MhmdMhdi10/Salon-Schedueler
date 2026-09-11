const args = [
  '--format progress',
  '--format json:artifacts/cucumber-results.json',
  '--format html:artifacts/cucumber-report.html',
  '--parallel 1',
  '--require-module ts-node/register/transpile-only',
  '--require features/support/**/*.ts',
  '--require features/step_definitions/**/*.ts',
  '--strict',
];

module.exports = {
  default: args.join(' '),
};
