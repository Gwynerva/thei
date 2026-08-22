import { describe, expect, it } from 'vitest';
import {
  buildEventUrl,
  publicIdFromEventUrlPart,
} from '../../shared/event-url';

describe('event URLs', () => {
  it('builds canonical URLs and extracts the public ID', () => {
    expect(buildEventUrl('open-studio', 'Event42')).toBe(
      '/events/open-studio-Event42/',
    );
    expect(publicIdFromEventUrlPart('old-readable-Event42')).toBe('Event42');
    expect(publicIdFromEventUrlPart('Event42')).toBe('Event42');
  });
});
