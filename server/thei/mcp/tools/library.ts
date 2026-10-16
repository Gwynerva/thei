import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { AssetType } from '#layers/thei/shared/asset';
import type { AssetPlacement } from '#layers/thei/shared/asset-library';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { issueDownloadTicket } from '../files';
import { FILES_META, guardTool, McpToolError, toolResult } from '../result';
import { aboutFileDescription } from '../text-about';
import { siteUrl } from '../../site-url';
import { getAssetUsages, listLibraryAssets } from '../../assets/library';
import { readAssetDescription } from '../../assets/descriptions';
import { libraryFile, modelFiles } from '../../ai/sessions/files';
import type { StreamFile } from '../../ai/model/stream';

/**
 * The library for an app and for Thei's own model: files found by what they
 * show — their descriptions, the captions and titles of their places — read
 * with their description and their places, looked at, or downloaded once by
 * an app that reads a file itself. A description is changed by proposing
 * `describe`.
 */

const KINDS: Record<AssetType, string> = {
  [AssetType.Image]: 'picture',
  [AssetType.Video]: 'video',
  [AssetType.Audio]: 'recording',
  [AssetType.Other]: 'file',
};

function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What a file is, on one line: its kind, format, size and measures. */
function fileLine(file: AssetVariantInfo): string {
  const meta = (file.meta ?? {}) as {
    width?: number;
    height?: number;
    duration?: number;
  };
  const parts = [
    KINDS[file.type],
    file.extension.toUpperCase(),
    size(file.size),
    ...(meta.width && meta.height ? [`${meta.width}×${meta.height}`] : []),
    ...(meta.duration ? [`${Math.round(meta.duration)} s`] : []),
  ];
  return parts.join(', ');
}

/** Where a file is placed, as a ref and in words. */
function placeLine(place: AssetPlacement): string {
  const { source } = place;
  const ref =
    source.type === 'profile'
      ? 'profile'
      : source.type === 'diary-entry'
        ? `diary-entry:${source.title}`
        : source.type === 'ai-session'
          ? `the AI session ${source.id}`
          : `${source.type}:${source.id}`;
  const title =
    source.type === 'diary-entry' || source.type === 'profile'
      ? ''
      : source.title
        ? ` — ${source.title}`
        : '';
  return `- ${ref}${title}: ${place.role}${place.count > 1 ? ` ×${place.count}` : ''}${place.isPrivate ? ' [private]' : ''}`;
}

/** Whether a stranger sees the file anywhere. */
function shownPublicly(places: readonly AssetPlacement[]): boolean {
  return places.some(
    (place) => !place.isPrivate && place.source.type !== 'ai-session',
  );
}

/** A library file, or a refusal the model can act on. */
function requireFile(assetUuid: string): AssetVariantInfo {
  return (
    libraryFile(assetUuid) ??
    (() => {
      throw new McpToolError(
        `There is no file ${assetUuid} in the library; find_files finds one.`,
      );
    })()
  );
}

/** A file read whole: what it is, its description, its places. */
function fileFacts(assetUuid: string): string {
  const file = requireFile(assetUuid);
  const usages = getAssetUsages(assetUuid);
  const description = readAssetDescription(assetUuid);
  const lines = [
    `# File ${file.assetUuid}`,
    fileLine(file),
    '',
    '## Description',
    aboutFileDescription(shownPublicly(usages.placements)),
    '',
    description?.text
      ? description.text
      : '_(none yet: propose one with describe)_',
    '',
    '## Places',
    ...(usages.placements.length
      ? usages.placements.map(placeLine)
      : [
          usages.inHistory
            ? 'Used nowhere now; a version of some text still shows it.'
            : 'Used nowhere: cleanup takes it a day after it was last touched.',
        ]),
  ];
  return lines.join('\n');
}

/** A block of a file as MCP carries it to an app. */
function mcpContent(
  assetUuid: string,
  block: StreamFile,
): CallToolResult['content'][number] {
  switch (block.kind) {
    case 'image':
      return { type: 'image', data: block.data, mimeType: 'image/jpeg' };
    case 'audio':
      return { type: 'audio', data: block.data, mimeType: 'audio/mpeg' };
    case 'pdf':
      return {
        type: 'resource',
        resource: {
          uri: `thei:file/${assetUuid}`,
          mimeType: 'application/pdf',
          blob: block.data,
        },
      };
    case 'text':
      return { type: 'text', text: block.text };
  }
}

export function registerLibraryTools(
  server: McpServer,
  context: McpCallContext,
) {
  server.registerTool(
    'find_files',
    {
      title: 'Find files',
      description:
        'Finds files of the library by what they show — their descriptions ' +
        '— and by the captions and titles of the places they are in, the one ' +
        'touched last first. Each comes with its id, what it is and its ' +
        'description: read_file reads one with its places.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Words to find'),
        type: z
          .enum([
            AssetType.Image,
            AssetType.Video,
            AssetType.Audio,
            AssetType.Other,
          ])
          .optional()
          .describe('Only files of this kind'),
        page: z.number().int().min(1).optional(),
      }),
      annotations: READS,
    },
    ({ query, type, page }) =>
      guardTool(() => {
        const found = listLibraryAssets({ q: query, type, page });
        if (!found.items.length) return toolResult({}, 'Nothing found.');
        const descriptions = new Map(
          found.items.map((item) => [
            item.asset.assetUuid,
            readAssetDescription(item.asset.assetUuid)?.text ?? '',
          ]),
        );
        return toolResult(
          {},
          [
            `${found.total} found; page ${found.page} of ${found.pageCount}.`,
            ...found.items.map((item) => {
              const text = descriptions.get(item.asset.assetUuid);
              return `- ${item.asset.assetUuid} — ${fileLine(item.asset)}${item.entityCount ? `, in ${item.entityCount} place${item.entityCount === 1 ? '' : 's'}` : ', unused'}\n  ${text ? text.replace(/\s+/g, ' ') : '(no description)'}`;
            }),
          ].join('\n'),
        );
      }),
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read a file',
      description:
        'A library file: what it is, its description — what it shows or is ' +
        'about, one for the file and its variants — and every place it is ' +
        'in. look_at_file shows it to you; describe proposes its ' +
        'description.',
      inputSchema: z.object({
        file: z.string().describe('The file id, a-…'),
      }),
      annotations: READS,
    },
    ({ file }) => guardTool(() => toolResult({}, fileFacts(file))),
  );

  server.registerTool(
    'look_at_file',
    {
      title: 'Look at a file',
      description:
        'Shows you a library file as your service takes it: a picture, a ' +
        'drawing or a video by its frame, a recording and a video’s sound, ' +
        'a PDF, a text. What could not be shown is said so: never describe ' +
        'a file you were not shown by guess. Comes with what read_file says.',
      inputSchema: z.object({
        file: z.string().describe('The file id, a-…'),
      }),
      annotations: READS,
    },
    ({ file }, ctx) =>
      guardTool(async () => {
        const facts = fileFacts(file);
        // A stopped call stops making the file ready: an encode is killed.
        const blocks =
          (
            await modelFiles(
              [{ role: 'tool', files: [file] }],
              new Map(),
              ctx?.mcpReq?.signal,
            )
          ).get(file) ?? [];
        return {
          content: [
            {
              type: 'text',
              text: blocks.length
                ? `${facts}\n\nThe file itself follows.`
                : `${facts}\n\nThis file cannot be shown: it is of a kind no model reads, or too large. Do not describe it by guess.`,
            },
            ...blocks.map((block) => mcpContent(file, block)),
          ],
          // Thei's own model is shown the file as its service takes it.
          ...(blocks.length ? { _meta: { [FILES_META]: [file] } } : {}),
        };
      }),
  );

  server.registerTool(
    'download_file',
    {
      title: 'Download a file',
      description:
        'Opens a one-time address to download a library file as stored — ' +
        'for an app that reads or describes a file with means of its own. ' +
        'GET it within 15 minutes; it serves one download.',
      inputSchema: z.object({
        file: z.string().describe('The file id, a-…'),
      }),
      annotations: READS,
    },
    ({ file }) =>
      guardTool(() => {
        const found = requireFile(file);
        const { ticket, expiresAt } = issueDownloadTicket(
          context.principal,
          found.assetUuid,
        );
        const url = siteUrl(context.event, `/api/mcp/download/${ticket}`);
        return toolResult(
          { url, expiresAt },
          `GET ${url} before ${new Date(expiresAt).toISOString()}: ${fileLine(found)}, e.g.\ncurl --fail -o '${found.assetUuid}.${found.extension}' '${url}'`,
        );
      }),
  );
}
