import { describe, expect, it } from 'vitest';
import {
  type UpdateProgress,
  type UpdateRunView,
  updateScreenState,
} from '../../shared/api/update-progress';

function run(status: UpdateRunView['status']): UpdateRunView {
  return {
    status,
    steps: [],
    fromVersion: '0.1.0',
    toVersion: '0.2.0',
    startedAt: 0,
  };
}

function progress(overrides: Partial<UpdateProgress>): UpdateProgress {
  return { site: 'open', version: '0.2.0', admin: true, ...overrides };
}

describe('update screen state', () => {
  it('waits while the server does not answer', () => {
    expect(updateScreenState(undefined, false)).toBe('offline');
    expect(updateScreenState(progress({ run: run('restarting') }), true)).toBe(
      'offline',
    );
  });

  it('shows progress before the restart and while the site is closed', () => {
    expect(updateScreenState(progress({ run: run('running') }), false)).toBe(
      'progress',
    );
    expect(
      updateScreenState(
        progress({ site: 'updating', run: run('running') }),
        false,
      ),
    ).toBe('progress');
  });

  it('is done once the site is open and the run ended well', () => {
    expect(updateScreenState(progress({ run: run('done') }), false)).toBe(
      'done',
    );
    expect(updateScreenState(progress({}), false)).toBe('done');
  });

  it('tells a closed failure from one the previous version survived', () => {
    expect(
      updateScreenState(
        progress({ site: 'failed', run: run('failed') }),
        false,
      ),
    ).toBe('failed');
    expect(updateScreenState(progress({ run: run('failed') }), false)).toBe(
      'failed-open',
    );
  });
});
