import { setTheiDbContext } from './global';
import { loadDbContext } from './utils';

export async function bootTheiDb() {
  setTheiDbContext(await loadDbContext());
  THEI_SERVER.console.tag('Boot').log('Database ready!');
}
