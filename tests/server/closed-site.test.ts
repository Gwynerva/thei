import { describe, expect, it } from 'vitest';
import { closedSiteRoute } from '../../server/thei/boot/closed-site';

describe('closed site routing', () => {
  it('serves the update screen and its API', () => {
    expect(closedSiteRoute('/update/')).toBe('allow');
    expect(closedSiteRoute('/api/update/progress')).toBe('allow');
    expect(closedSiteRoute('/api/update/retry')).toBe('allow');
  });

  it('asks other API calls to come back later', () => {
    expect(closedSiteRoute('/api/projects')).toBe('unavailable');
    expect(closedSiteRoute('/api/admin/updates')).toBe('unavailable');
    expect(closedSiteRoute('/api/admin/session')).toBe('unavailable');
  });

  it('asks an AI app signing in to come back later, never to the update page', () => {
    expect(closedSiteRoute('/oauth/token')).toBe('unavailable');
    expect(closedSiteRoute('/oauth/authorize')).toBe('unavailable');
    expect(closedSiteRoute('/.well-known/oauth-authorization-server')).toBe(
      'unavailable',
    );
  });

  it('leads every page to the update screen', () => {
    expect(closedSiteRoute('/')).toBe('redirect');
    expect(closedSiteRoute('/admin/')).toBe('redirect');
    expect(closedSiteRoute('/projects/thei/')).toBe('redirect');
    expect(closedSiteRoute('/update')).toBe('redirect');
  });
});
