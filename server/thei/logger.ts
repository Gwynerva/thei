import pc from 'picocolors';

const PREFIX = pc.gray('[Thei]');

export function makeLogger(extra?: string) {
  const base = extra ? [PREFIX, extra] : [PREFIX];
  return {
    log: (...args: any[]) => console.log(...base, ...args),
    error: (...args: any[]) =>
      console.log(...base, pc.redBright('[Error]'), ...args),
    warn: (...args: any[]) =>
      console.log(...base, pc.yellowBright('[Warning]'), ...args),
    success: (message: string) =>
      console.log(...base, pc.greenBright(pc.bold(message))),
  };
}

export function tag(name: string) {
  return makeLogger(pc.gray(`[${name}]`));
}
