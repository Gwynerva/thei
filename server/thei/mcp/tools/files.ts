import type { McpServer } from '@modelcontextprotocol/server';
import { ADDS, READS } from '../annotations';
import { z } from 'zod';
import { siteUrl } from '../../site-url';
import type { McpCallContext } from '../context';
import {
  fileSettings,
  importFile,
  issueUploadTicket,
  reprocessFile,
} from '../files';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { fileJob, runFileJob, type FileJob } from '../file-jobs';
import { guardTool, McpToolError, toolResult } from '../result';
import { requireScope, spendWrite } from '../scope';
import { placeAppFile } from '../../ai/sessions/files';
import { sessionForCall } from '../../ai/sessions/app';

/**
 * Files for an editor token: brought in from the client or the web, and
 * re-encoded. A file is then put in place with an update action (icon, banner,
 * showcaseFiles, files) or in a text as ::media{asset=<id>}. Each new file is
 * kept in the app's session, shown in the library there, for as long as the
 * session lives.
 */

/**
 * Runs a file's making as a job of the call's session, keeping what it
 * makes there — unless the job was cancelled meanwhile.
 */
function runInSession(
  context: McpCallContext,
  what: string,
  make: (signal: AbortSignal) => Promise<AssetUploadResponse>,
) {
  const sessionUuid = sessionForCall(context);
  return runFileJob(context.principal, sessionUuid, what, async (signal) => {
    const file = await make(signal);
    signal.throwIfAborted();
    placeAppFile(sessionUuid, file.assetUuid);
    return file;
  });
}

/** A file job as a model is told of it: the file, or where it stands. */
function jobResult(
  job: FileJob,
  done: (file: NonNullable<FileJob['file']>) => string,
) {
  if (job.status === 'done' && job.file)
    return toolResult({ ...job.file, job: job.job }, done(job.file));
  if (job.status === 'failed')
    throw new McpToolError(`${job.what}: ${job.error ?? 'it failed'}.`);
  if (job.status === 'cancelled')
    throw new McpToolError(
      `${job.what}: cancelled — the owner archived the session, or turned AI off. Nothing was kept.`,
    );
  return toolResult(
    { job: job.job, status: 'running' },
    `${job.what} is still on its way. Ask file_status with job ${job.job} in a minute; nothing else waits for it.`,
  );
}

const settingsInput = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'How to store it. Left out, the file is kept as it is (its metadata ' +
      'stripped). A picture: { type: "image-transform", quality: 10–100, ' +
      'format?: "webp" | "avif" | "jpeg" | "png", dimensions: { width?, ' +
      'height? }, crop?: { x, y, width, height } }. A video: { type: ' +
      '"video-transform", quality, dimensions, stripAudio, fastConversion }. ' +
      'Sound: { type: "audio-transform", quality, mono }. Any other file: ' +
      '{ type: "file-zip" } to pack it.',
  );

export function registerFileTools(server: McpServer, context: McpCallContext) {
  server.registerTool(
    'upload_file',
    {
      title: 'Upload a file',
      description:
        'Opens a one-time address for one file of yours: PUT its raw bytes ' +
        'there — curl --upload-file photo.jpg <url> — within 15 minutes, and ' +
        'the answer gives the new file id. For files on your side; a file on ' +
        'the web is for import_file. A new file is kept in your session for ' +
        'as long as it lives, used or not.',
      inputSchema: z.object({
        name: z.string().describe('The file name, with its extension'),
        settings: settingsInput,
      }),
      annotations: ADDS,
    },
    ({ name, settings }) =>
      guardTool(() => {
        requireScope(context, 'edit', 'upload files');
        spendWrite(context);
        const { ticket, expiresAt } = issueUploadTicket(
          context.principal,
          name,
          fileSettings(settings),
          sessionForCall(context),
        );
        const url = siteUrl(context.event, `/api/mcp/upload/${ticket}`);
        return toolResult(
          { url, method: 'PUT', expiresAt },
          `PUT the bytes of ${name} to ${url} before ${new Date(expiresAt).toISOString()}, e.g.\ncurl --fail --upload-file '${name}' '${url}'\nThe answer is the new file id.`,
        );
      }),
  );

  server.registerTool(
    'import_file',
    {
      title: 'Import a file from the web',
      description:
        'Downloads a file from a public address into the library and gives ' +
        'its id — or, for a large one still on its way, a job for ' +
        'file_status. Addresses inside the server’s own network are refused.',
      inputSchema: z.object({
        url: z.string(),
        name: z
          .string()
          .optional()
          .describe(
            'A file name with its extension, when the address has none',
          ),
        settings: settingsInput,
      }),
      annotations: { ...ADDS, openWorldHint: true },
    },
    ({ url, name, settings }) =>
      guardTool(async () => {
        requireScope(context, 'edit', 'import files');
        spendWrite(context);
        const job = await runInSession(context, url, (signal) =>
          importFile(url, name, fileSettings(settings), signal),
        );
        return jobResult(
          job,
          (file) =>
            `Imported as ${file.file} (${file.type}, ${file.size} bytes).`,
        );
      }),
  );

  server.registerTool(
    'reprocess_file',
    {
      title: 'Re-encode a file',
      description:
        'Makes a new variant of a library file with other settings — ' +
        'smaller, cropped, another format — and gives its id. The file it ' +
        'was made from stays where it is: put the new one in its place with ' +
        'an update action, or in a text. A video takes minutes: then the answer ' +
        'is a job for file_status.',
      inputSchema: z.object({
        file: z.string().describe('The file id, a-…'),
        settings: settingsInput.unwrap(),
      }),
      annotations: ADDS,
    },
    ({ file, settings }) =>
      guardTool(async () => {
        requireScope(context, 'edit', 're-encode files');
        spendWrite(context);
        const job = await runInSession(context, file, (signal) =>
          reprocessFile(file, fileSettings(settings), signal),
        );
        return jobResult(job, (made) =>
          made.created
            ? `Made ${made.file} (${made.type}, ${made.size} bytes).`
            : `The same variant already exists: ${made.file}.`,
        );
      }),
  );

  server.registerTool(
    'file_status',
    {
      title: 'Where a file stands',
      description:
        'Whether a file import_file or reprocess_file is still working on is ' +
        'ready: its id once it is, or why it failed. Jobs are kept an hour.',
      inputSchema: z.object({
        job: z.string().describe('The job an earlier answer gave, fj-…'),
      }),
      annotations: READS,
    },
    ({ job }) =>
      guardTool(() => {
        requireScope(context, 'edit', 'work with files');
        const found = fileJob(job, context.principal.tokenUuid);
        if (!found)
          throw new McpToolError(
            `There is no job ${job} of yours; jobs are kept an hour.`,
          );
        return jobResult(
          found,
          (made) => `Ready: ${made.file} (${made.type}, ${made.size} bytes).`,
        );
      }),
  );
}
