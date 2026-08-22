import { setTheiDbContext } from './global';
import { loadDbContext } from './utils';

export async function bootTheiDb() {
  const context = await loadDbContext();
  setTheiDbContext(context);
  THEI_SERVER.console.tag('Boot').log('Database ready!');
}
