// Plays: scenarios of a study, by persona and variant, recorded step by step
// with the probe after every step.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SiteClient } from '../archive/site-client';
import { labLoopbackOrigin, labPort, paths } from '../config';
import { SCREENS } from '../screens';
import { LAB_CREDENTIALS } from '../site/credentials';
import type { Commands, SiteIndex, StatusLine, VariantCode } from '../types';
import { output, parse, portAnswers } from '../util';
import { play } from './play';
import { VARIANTS } from './store';
import { loadPersonas, studyPlaces } from './studies';

function variantsOf(values: string[] | undefined): VariantCode[] | undefined {
  if (!values?.length) return undefined;
  for (const value of values)
    if (!(value in VARIANTS))
      throw new Error(
        `Variant "${value}" is not one of ${Object.keys(VARIANTS).join(', ')}.`,
      );
  return values as VariantCode[];
}

const STUDY_TEMPLATE = (
  id: string,
) => `// A study of the moment: kept in .lab/studies/, never committed.
import { defineScenario, defineStudy, pickOne } from '../../../tests/lab/run/define';

export default defineStudy({
  id: '${id}',
  title: '…',
  question: 'What should this study learn?',
  personas: ['novice', 'expert', 'designer'],
  variants: ['dd', 'pl'],
  scenarios: [
    defineScenario({
      id: 'first',
      title: '…',
      roles: ['owner'],
      task: 'Open the event {event} and …',
      pick: (index, salt) => ({
        event: pickOne(index, 'event', salt, (entity) => entity.access === 'public', 'a public event'),
      }),
      async run(j) {
        await j.step('Open the event', { open: j.entity('event').publicUrl! });
      },
    }),
  ],
});
`;

export const commands: Commands = {
  studies: {
    summary:
      'List the studies (kept and of the moment) and the persona presets',
    usage: 'studies [--json]',
    async run(args) {
      const { values } = parse(args, { json: { type: 'boolean' } });
      const places = studyPlaces();
      const personas = [...loadPersonas().values()];
      output(values.json ?? false, { studies: places, personas }, () => [
        'Studies:',
        ...(places.length
          ? places.map(
              (place) =>
                `  ${place.id}${place.kept ? '' : ' (of the moment, .lab/studies)'}`,
            )
          : ['  none yet']),
        'Personas:',
        ...personas.map(
          (persona) =>
            `  ${persona.id.padEnd(9)} ${persona.name}${persona.role ? `, ${persona.role === 'owner' ? 'owner' : 'visitor'}` : ''}${
              persona.lens === 'designer' ? ' (a lens)' : ''
            }`,
        ),
      ]);
    },
  },
  play: {
    summary: 'Play scenarios of a study and record them',
    usage:
      'play <study> [--scenario <id>]... [--persona <id>]... [--variant dd|dl|pd|pl]... [--pending] [--target lab|playground] [--allow-network] [--headed]',
    async run(args) {
      const { values, positionals } = parse(args, {
        scenario: { type: 'string', multiple: true },
        persona: { type: 'string', multiple: true },
        variant: { type: 'string', multiple: true },
        pending: { type: 'boolean' },
        target: { type: 'string' },
        'allow-network': { type: 'boolean' },
        headed: { type: 'boolean' },
      });
      const study = positionals[0];
      if (!study) throw new Error('Name the study: bun run lab play <study>');
      const target = values.target === 'playground' ? 'playground' : 'lab';
      if (target === 'lab' && !(await portAnswers(labPort())))
        throw new Error(
          'The lab site is not running: bun run lab up lab --start',
        );
      const results = await play({
        study,
        scenarios: values.scenario,
        personas: values.persona,
        variants: variantsOf(values.variant),
        pending: values.pending,
        target,
        allowNetwork: values['allow-network'],
        headed: values.headed,
      });
      const failed = results.filter((attempt) => attempt.status === 'error');
      return failed.length ? 1 : 0;
    },
  },
  warm: {
    summary:
      'Open every screen once, so a dev server has compiled them before a play',
    usage: 'warm',
    async run() {
      if (!(await portAnswers(labPort())))
        throw new Error(
          'The lab site is not running: bun run lab up lab --start',
        );
      const index = JSON.parse(
        readFileSync(paths.siteIndex, 'utf8'),
      ) as SiteIndex;
      const owner = new SiteClient(labLoopbackOrigin());
      owner.credentials = { ...LAB_CREDENTIALS };
      await owner.signIn();
      for (const screen of SCREENS) {
        let path: string;
        try {
          path = screen.path(index);
        } catch (error) {
          console.log(`  ${screen.id}: ${(error as Error).message}`);
          continue;
        }
        const started = Date.now();
        const answer = await owner.request('GET', path, {
          visitor: screen.role === 'visitor',
          timeoutMs: 180_000,
        });
        console.log(
          `  ${screen.id.padEnd(18)} ${answer.status} ${String(Date.now() - started).padStart(6)} ms  ${path}`,
        );
      }
    },
  },
  'new-study': {
    summary:
      'Start a study in .lab/studies (--keep: in git, only with the owner’s agreement)',
    usage: 'new-study <id> [--keep]',
    async run(args) {
      const { values, positionals } = parse(args, {
        keep: { type: 'boolean' },
      });
      const id = positionals[0];
      if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
        throw new Error('A study id is [a-z0-9-].');
      const dir = join(values.keep ? paths.keptStudies : paths.studies, id);
      if (existsSync(dir)) throw new Error(`${dir} exists already.`);
      mkdirSync(dir, { recursive: true });
      const template = values.keep
        ? STUDY_TEMPLATE(id)
            .replace("'../../../tests/lab/run/define'", "'../../run/define'")
            .replace(
              'A study of the moment: kept in .lab/studies/, never committed.',
              'A study kept in git, with the owner’s agreement.',
            )
        : STUDY_TEMPLATE(id);
      writeFileSync(join(dir, 'study.ts'), template);
      console.log(`Written ${join(dir, 'study.ts')}.`);
    },
  },
};

export async function status(): Promise<StatusLine[]> {
  const places = studyPlaces();
  return places.length
    ? [
        {
          part: 'run',
          ok: true,
          text: `studies: ${places.map((place) => place.id).join(', ')}`,
        },
      ]
    : [];
}
