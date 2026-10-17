import type { McpServer } from '@modelcontextprotocol/server';
import { READS } from '../annotations';
import { z } from 'zod';
import { dayInput } from '../inputs';
import { isLifeDay } from '#layers/thei/shared/life';
import type { McpCallContext } from '../context';
import { documentTouches, loadDocuments } from '../documents';
import { formatPeriod } from '../render';
import { guardTool, McpToolError, toolResult } from '../result';

const MAX_DAYS = 62;

function dayNumber(day: string) {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

/**
 * A stretch of the owner's life, day by day: the diary entry of each day,
 * and the events and project stages that start, end or happen on it.
 */
export function registerTimelineTool(
  server: McpServer,
  context: McpCallContext,
) {
  void context;
  server.registerTool(
    'life_timeline',
    {
      title: 'Days of a period',
      description:
        "The owner's life between two days: each day's diary entry with " +
        'its opening words, and the events and project stages that start, ' +
        'end or happen on it; what runs through the whole stretch is listed ' +
        `once. At most ${MAX_DAYS} days.`,
      inputSchema: z.object({
        from: dayInput,
        to: dayInput,
      }),
      annotations: READS,
    },
    ({ from, to }) =>
      guardTool(() => {
        if (!isLifeDay(from) || !isLifeDay(to) || from > to)
          throw new McpToolError('from and to must be real days, in order.');
        if (dayNumber(to) - dayNumber(from) + 1 > MAX_DAYS)
          throw new McpToolError(`At most ${MAX_DAYS} days at once.`);

        const documents = loadDocuments([
          'diary-entry',
          'event',
          'project-section',
        ]).filter((document) => documentTouches(document, from, to));
        const projectTitles = new Map(
          loadDocuments(['project']).map((project) => [
            project.ref,
            project.title,
          ]),
        );
        const name = (document: (typeof documents)[number]) =>
          document.project
            ? `${document.title} (stage of ${projectTitles.get(document.project) ?? document.project})`
            : document.title;

        type Mark = { ref: string; title: string; mark: string };
        const days = new Map<
          string,
          { diary?: { ref: string; opening: string }; marks: Mark[] }
        >();
        const dayOf = (date: string) => {
          let day = days.get(date);
          if (!day) days.set(date, (day = { marks: [] }));
          return day;
        };
        const ongoing: { ref: string; title: string; when: string }[] = [];

        for (const document of documents) {
          if (document.kind === 'diary-entry') {
            dayOf(document.date!).diary = {
              ref: document.ref,
              opening: document.text.replace(/\s+/g, ' ').slice(0, 200),
            };
            continue;
          }
          for (const period of document.periods ?? []) {
            if (period.endDate < from || period.startDate > to) continue;
            const mark = (date: string, what: string) =>
              dayOf(date).marks.push({
                ref: document.ref,
                title: name(document),
                mark: `${what}${period.label ? ` "${period.label}"` : ''}`,
              });
            if (period.startDate === period.endDate)
              mark(period.startDate, 'happens');
            else {
              if (period.startDate >= from) mark(period.startDate, 'starts');
              if (period.endDate <= to) mark(period.endDate, 'ends');
              if (period.startDate < from && period.endDate > to)
                ongoing.push({
                  ref: document.ref,
                  title: name(document),
                  when: formatPeriod(period),
                });
            }
          }
        }

        const sorted = [...days.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, day]) => ({ date, ...day }));
        const text = [
          ...(ongoing.length
            ? [
                'Running through the whole stretch:',
                ...ongoing.map(
                  (item) => `- ${item.ref} — ${item.title} (${item.when})`,
                ),
                '',
              ]
            : []),
          ...sorted.flatMap((day) => [
            `## ${day.date}`,
            ...(day.diary
              ? [`- diary ${day.diary.ref}: ${day.diary.opening}`]
              : []),
            ...day.marks.map(
              (mark) => `- ${mark.mark}: ${mark.ref} — ${mark.title}`,
            ),
          ]),
        ];
        return toolResult(
          text.length ? text.join('\n') : 'Nothing on these days.',
        );
      }),
  );
}
