import { getStorageVisuals, type Visuals } from '../scripts/visuals';

export const useVisuals = () => {
  if (import.meta.server) {
    const serverReadThrowProxy = new Proxy(
      {},
      {
        get() {
          throw new Error('Cannot read visuals state on the server side!');
        },
      },
    );

    return serverReadThrowProxy as Ref<Visuals>;
  }

  return useState<Visuals>('visuals', () => getStorageVisuals());
};
