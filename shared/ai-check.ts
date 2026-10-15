/**
 * The connection check on the AI page: each step an MCP client goes through,
 * tried by the site itself, with what came of it.
 */
export const AI_CHECK_STEPS = [
  /** Whether AI access is on at all. */
  'enabled',
  /** A client of the 2025 protocol shaking hands. */
  'handshake',
  /** A client of the 2026 protocol finding the tools. */
  'tools',
  /** A tool reading the site. */
  'read',
  /** The public address answering from outside, through the proxy. */
  'public',
  /** Whether the public address is HTTPS, which some clients require. */
  'https',
  /** Whether an app can find the sign-in from outside, where it looks. */
  'signin',
  /** Whether a client has connected with a token yet. */
  'clients',
] as const;
export type AiCheckStepId = (typeof AI_CHECK_STEPS)[number];

export type AiCheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface AiCheckStep {
  id: AiCheckStepId;
  status: AiCheckStatus;
  /** What the step found, for the page to put in words. */
  data?: Record<string, string | number>;
}

export interface AiCheckReport {
  endpoint: string;
  steps: AiCheckStep[];
}
