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

/** What a token's scopes allow, told to the model in its own words. */
export function scopeSummary(scopes: readonly ApiTokenScope[]): string[] {
  const summary = [
    'Read everything on the site, private parts included.',
    'Propose actions to the owner on any entity: fields, texts, tags, ' +
      'relations, periods, new entities and more. Nothing visible changes ' +
      'until one is applied; session_actions says what became of them.',
  ];
  if (mayEdit(scopes))
    summary.push(
      'Apply actions too, as the owner would: propose with apply. Each ' +
        'stays in its session, where the owner sees it and may undo it; a ' +
        'deletion cannot be undone. Apply what the owner has settled — ' +
        'projects, events, relations, public addresses, who sees what — ' +
        'only when the owner asks for it in this conversation; leave your ' +
        'own ideas for those to the owner.',
    );
  else
    summary.push(
      'Change nothing yourself: every change is an action the owner applies ' +
        'or not.',
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
    `This token may not ${what}: it is a reader's, which reads and proposes. Propose it for the owner to apply, or ask the owner for an editor's key, made on the AI page of the site.`,
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
