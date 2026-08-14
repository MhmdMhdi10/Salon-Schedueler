const args = [
  '--format progress',
  '--format json:artifacts/cucumber-results.json',
  '--parallel 1',
  '--require-module ts-node/register/transpile-only',
  '--require features/support/**/*.ts',
  '--require features/step_definitions/**/*.ts',
  '--strict',
];

module.exports = {
  default: args.join(' '),
};
