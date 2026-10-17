import { AI_OWNER_MEMORY_MAX } from './ai';

/**
 * The owner's settings for AI: whether it is on at all, and what every AI
 * should know of the owner — how they write, what to leave alone — read in
 * every session and by every app.
 */
export interface AiSettings {
  enabled: boolean;
  instructions: string;
}

/** Read in every session, so kept short. */
export const AI_INSTRUCTIONS_MAX = AI_OWNER_MEMORY_MAX;
