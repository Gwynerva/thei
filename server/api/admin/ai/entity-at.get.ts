import { parseInternalUrl } from '#layers/thei/shared/internal-url';
import { OWNER } from '../../../thei/access-links/viewer';
import { requireAiOn } from '../../../thei/ai-on';
import { findContentEntityByTarget } from '../../../thei/content-entities';
import { entityFace } from '../../../thei/entity-kinds';
import { markReadOnlyRequest } from '../../../thei/read-only-request';

/**
 * The entity a public page shows, by the page's address: the admin bar's ✦
 * offers a session about it there, as it does in the entity's form. The
 * address is the page's route, without the site's base, read as every
 * address of the site is read; one that names no entity — one gone, a
 * section put under another project — offers none.
 */
export default defineEventHandler(async (event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  const { path } = getQuery(event);
  const target =
    typeof path === 'string'
      ? parseInternalUrl(path, { origins: [], base: '/' })
      : undefined;
  const record = target && (await findContentEntityByTarget(target, OWNER));
  const face =
    record && entityFace({ kind: record.entityType, id: record.entityId });
  return { entity: face ? { ref: face.ref, title: face.title } : null };
});
