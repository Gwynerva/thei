import { bootResolve } from './promise';

export class BootDecided {
  declare private _brand: never;
}

export interface BootResultBase {
  type: 'error' | 'install' | 'update' | 'ready';
}

export interface BootResultError extends BootResultBase {
  type: 'error';
  message: string;
}

export interface BootResultInstall extends BootResultBase {
  type: 'install';
}

/** Why an update stopped with the site closed. */
export interface BootUpdateFailure {
  reason: 'migration-failed' | 'task-failed' | 'downgrade';
  /** The update step that failed, `migration:<id>` or `task:<id>`. */
  stepId?: string;
  /** Version the content directory was last known to be on. */
  fromVersion: string;
  /** Version of the engine that tried to open it. */
  toVersion: string;
  message: string;
}

/**
 * The site is closed for an update: migrations and tasks are running, or,
 * with a `failure`, one of them stopped and the site stays closed until it
 * succeeds.
 */
export interface BootResultUpdate extends BootResultBase {
  type: 'update';
  failure?: BootUpdateFailure;
}

export interface BootResultReady extends BootResultBase {
  type: 'ready';
}

export type BootResult =
  BootResultError | BootResultInstall | BootResultUpdate | BootResultReady;

export let bootResult: BootResult = new Proxy({} as BootResult, {
  get() {
    throw new Error(
      'Attempted to access boot result before boot process completed!',
    );
  },
});

export function setBootError(message: string): never {
  bootResult = {
    type: 'error',
    message,
  };
  bootResolve();
  throw new BootDecided();
}

/**
 * Closes the site for the update this boot has to finish, and lets requests
 * through to be told so. Unlike the other outcomes the boot goes on: it ends
 * in `setBootReady` once the work is done, or in `setBootUpdate` if it fails.
 */
export function setBootUpdating(): void {
  bootResult = {
    type: 'update',
  };
  bootResolve();
}

export function setBootUpdate(failure: BootUpdateFailure): never {
  bootResult = {
    type: 'update',
    failure,
  };
  bootResolve();
  throw new BootDecided();
}

export function setBootInstall(): never {
  bootResult = {
    type: 'install',
  };
  bootResolve();
  throw new BootDecided();
}

export function setBootReady(): never {
  bootResult = {
    type: 'ready',
  };
  bootResolve();
  throw new BootDecided();
}
