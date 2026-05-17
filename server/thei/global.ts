import { H3Event } from 'h3';
import { sn } from 'unslash';
import { version } from '#thei/static-public';
import { projectPath, theiPath } from '#thei/static';
import { bootResult as _bootResult } from './boot/result';
import { makeLogger, tag } from './logger';
import { currentLanguage, getCurrentLanguagePhrases } from './language';
import { theiConfig } from './config/index';
import { getTheiDbContext } from './db/global';
import { countProjects } from './projects/repository/count';
import { countEvents } from './events/repository/count';
import { getPublicAdminSessions } from './admin-session/repository/publicSessions';
import { getCurrentAdminSession } from './admin-session';

export const THEI_SERVER = {
  version,
  theiPath(...parts: string[]) {
    return sn(theiPath, ...parts);
  },
  projectPath(...parts: string[]) {
    return sn(projectPath, ...parts);
  },
  contentPath(...parts: string[]) {
    return sn(projectPath, 'content', ...parts);
  },
  get language() {
    return currentLanguage!;
  },
  get config() {
    return theiConfig!;
  },
  useDb() {
    return getTheiDbContext();
  },
  get phrase() {
    return getCurrentLanguagePhrases();
  },
  async getAdmin(event: H3Event) {
    return await getCurrentAdminSession(event);
  },
  async isAdmin(event: H3Event) {
    const session = await getCurrentAdminSession(event);
    return Boolean(session);
  },
  console: {
    ...makeLogger(),
    tag,
  },
  projects: {
    count: countProjects,
  },
  events: {
    count: countEvents,
  },
  adminSessions: {
    getPublic: getPublicAdminSessions,
  },
};
