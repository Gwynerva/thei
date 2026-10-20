// Personas and studies, read from their files: presets in
// `tests/lab/personas/`, studies kept in `tests/lab/studies/` (with the
// owner's agreement) and studies of the moment in `.lab/studies/`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { paths } from '../config';
import type { Persona, StudyDefinition, Viewport } from '../types';

export function loadPersonas(): Map<string, Persona> {
  const personas = new Map<string, Persona>();
  for (const name of readdirSync(paths.personas).filter((file) =>
    file.endsWith('.md'),
  )) {
    const text = readFileSync(join(paths.personas, name), 'utf8').replace(
      /\r\n?/g,
      '\n',
    );
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (!match) throw new Error(`personas/${name} has no frontmatter`);
    const data = parseYaml(match[1]!) as Record<string, unknown>;
    const persona: Persona = {
      id: String(data.id),
      name: String(data.name),
      lens: data.lens === 'designer' ? 'designer' : 'persona',
      ...(data.role ? { role: data.role as Persona['role'] } : {}),
      ...(data.experience
        ? { experience: data.experience as Persona['experience'] }
        : {}),
      devices: (data.devices as Viewport[] | undefined) ?? ['desktop', 'phone'],
      ...(data.reads ? { reads: data.reads as string[] } : {}),
      about: match[2]!.trim(),
    };
    if (persona.id !== name.replace(/\.md$/, ''))
      throw new Error(`personas/${name} says it is ${persona.id}`);
    personas.set(persona.id, persona);
  }
  return personas;
}

export interface StudyPlace {
  id: string;
  dir: string;
  kept: boolean;
}

export function studyPlaces(): StudyPlace[] {
  const places: StudyPlace[] = [];
  for (const [root, kept] of [
    [paths.keptStudies, true],
    [paths.studies, false],
  ] as const)
    if (existsSync(root))
      for (const id of readdirSync(root))
        if (existsSync(join(root, id, 'study.ts')))
          places.push({ id, dir: join(root, id), kept });
  return places;
}

export async function loadStudy(
  id: string,
): Promise<StudyDefinition & { place: StudyPlace }> {
  const place = studyPlaces().find((item) => item.id === id);
  if (!place)
    throw new Error(
      `No study "${id}": ${
        studyPlaces()
          .map((item) => item.id)
          .join(', ') || 'none yet'
      } (bun run lab new-study <id>).`,
    );
  const module = await import(pathToFileURL(join(place.dir, 'study.ts')).href);
  const study = (module.default ?? module.study) as StudyDefinition;
  if (!study?.scenarios)
    throw new Error(
      `${place.dir}/study.ts exports no study (export default defineStudy({ … })).`,
    );
  if (study.id !== id)
    throw new Error(`${place.dir}/study.ts says it is "${study.id}"`);
  return { ...study, place };
}
