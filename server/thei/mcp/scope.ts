import type { ApiTokenScope } from '#layers/thei/shared/api-token';
import type { McpCallContext } from './context';
import { spendApiTokenBudget } from '../api-tokens';
import { McpToolError } from './result';

/**
 * What a token may do, decided in one place.
 *
 * Scopes name rights; which change needs which right is answered here and
 * nowhere else, so the rules cannot drift between tools.
 */

/**
 * What a call may do, told to the model in its own words: Thei's own model
 * proposes in its session; an app applies with an editor's key, or only
 * reads with a reader's.
 */
export function scopeSummary(context: McpCallContext): string[] {
  const summary = ['Read everything on the site, private parts included.'];
  if (context.session)
    summary.push(
      'Propose actions to the owner on any entity: fields, texts, tags, ' +
        'relations, periods, new entities and more. Nothing visible changes ' +
        'until the owner applies one; session_actions says what became of them.',
    );
  else if (mayEdit(context.principal.scopes))
    summary.push(
      'Change the archive as the owner would, at once: apply_actions on any ' +
        'entity — fields, texts, tags, relations, periods, new entities, ' +
        'deletions and more. What the owner asks for in this conversation is ' +
        'their consent, and nothing is kept in Thei to decide on or undo; a ' +
        'deletion is final. Change what the owner has settled — projects, ' +
        'events, relations, public addresses, who sees what — only when they ' +
        'ask for it; ask them first about your own ideas for those.',
    );
  else
    summary.push(
      'Change nothing: this key only reads. A change needs an editor’s key, ' +
        'made on the AI page of the site.',
    );
  return summary;
}

/** Whether the token may change anything directly. */
export function mayEdit(scopes: readonly ApiTokenScope[]) {
  return scopes.includes('edit');
}

/** Refuses a change the token's scopes do not allow, saying what would. */
export function requireScope(
  context: McpCallContext,
  scope: ApiTokenScope,
  what: string,
) {
  if (context.principal.scopes.includes(scope)) return;
  throw new McpToolError(
    `This token may not ${what}: it is a reader's, which only reads. Ask the owner for an editor's key, made on the AI page of the site.`,
  );
}

/** Spends one of the token's writes a minute, or refuses with how long to wait. */
export function spendWrite(context: McpCallContext) {
  const wait = spendApiTokenBudget(context.principal.tokenUuid, 'write');
  if (wait)
    throw new McpToolError(
      `Too many changes in a minute; wait ${wait} s before the next one.`,
    );
}
