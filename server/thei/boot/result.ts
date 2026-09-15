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

export interface BootUpdateDetails {
  reason: 'migration-failed' | 'downgrade';
  migrationId?: string;
  /** Version the content directory was last known to be on. */
  fromVersion: string;
  /** Version of the engine that tried to open it. */
  toVersion: string;
  message: string;
}

export interface BootResultUpdate extends BootResultBase, BootUpdateDetails {
  type: 'update';
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

export function setBootUpdate(details: BootUpdateDetails): never {
  bootResult = {
    type: 'update',
    ...details,
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
