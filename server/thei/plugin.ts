import { bootTheiServer } from './boot/process';

export default defineNitroPlugin(async (nitroApp) => {
  THEI_SERVER.console.log('Server plugin started.');
  await bootTheiServer();
});
