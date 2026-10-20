// What a study file writes: `export default defineStudy({ … })` with its
// scenarios from `defineScenario({ … })`. Only types; the runner reads them.
import type {
  Ref,
  ScenarioDefinition,
  SiteEntity,
  SiteIndex,
  StudyDefinition,
} from '../types';
import { fnv1a } from '../util';

export function defineStudy(study: StudyDefinition): StudyDefinition {
  return study;
}

export function defineScenario(
  scenario: ScenarioDefinition,
): ScenarioDefinition {
  return scenario;
}

/** The same choice for the same salt, a different one for another. */
export function choose<T>(candidates: T[], salt: string): T | undefined {
  if (!candidates.length) return undefined;
  return candidates[fnv1a(salt) % candidates.length];
}

/** Entities of the index that answer a test, by kind. */
export function entitiesWhere(
  index: SiteIndex,
  kind: SiteEntity['kind'],
  test: (entity: SiteEntity) => boolean = () => true,
): SiteEntity[] {
  return Object.values(index.entities).filter(
    (entity) => entity.kind === kind && test(entity),
  );
}

/** One entity answering a test, or a clear refusal: the archive lacks it. */
export function pickOne(
  index: SiteIndex,
  kind: SiteEntity['kind'],
  salt: string,
  test: (entity: SiteEntity) => boolean,
  what: string,
): Ref {
  const found = choose(entitiesWhere(index, kind, test), salt);
  if (!found) throw new Error(`The archive has no ${what}.`);
  return found.ref;
}
