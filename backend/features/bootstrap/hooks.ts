import { After } from '@cucumber/cucumber';
import { BackendWorld } from './custom.world';

After(async function (this: BackendWorld) {
  await this.close();
});
