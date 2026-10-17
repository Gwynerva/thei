<script lang="ts" setup>
import type {
  AiCheckReport,
  AiCheckStatus,
  AiCheckStep,
} from '#layers/thei/shared/ai-check';
import type { IconName } from '#thei/icons';

/**
 * What came of a check of an access key, step by step: what works, and what
 * to fix where an app holding the key would stumble.
 */
defineProps<{ report: AiCheckReport }>();

const statusLook: Record<AiCheckStatus, { icon: IconName; class: string }> = {
  ok: { icon: 'check', class: 'text-text-success' },
  warn: { icon: 'warning', class: 'text-text-warning' },
  fail: { icon: 'close', class: 'text-text-error' },
  skip: { icon: 'minus', class: 'text-text-3' },
};

function describe(step: AiCheckStep): string {
  const data = step.data ?? {};
  const p = phrase.value;
  switch (step.id) {
    // A check runs only while AI is on: this step only ever says so.
    case 'enabled':
      return p.ai_check_enabled_ok;
    case 'handshake':
      return step.status === 'ok'
        ? p.ai_check_handshake_ok(String(data.version ?? ''))
        : p.ai_check_handshake_fail;
    case 'tools':
      return step.status === 'ok'
        ? p.ai_check_tools_ok(Number(data.count ?? 0))
        : p.ai_check_tools_fail;
    case 'read':
      return step.status === 'ok'
        ? p.ai_check_read_ok(
            Number(data.projects ?? 0),
            Number(data.events ?? 0),
            Number(data.diaryEntries ?? 0),
          )
        : p.ai_check_read_fail;
    case 'public':
      return step.status === 'ok'
        ? p.ai_check_public_ok
        : step.status === 'fail'
          ? p.ai_check_public_fail(Number(data.status ?? 0))
          : p.ai_check_public_warn;
    case 'https':
      return step.status === 'ok'
        ? p.ai_check_https_ok
        : step.status === 'warn'
          ? p.ai_check_https_warn
          : p.ai_check_https_skip;
    case 'signin':
      return step.status === 'ok'
        ? p.ai_check_signin_ok
        : step.status === 'fail'
          ? p.ai_check_signin_fail(String(data.where ?? ''))
          : data.where
            ? p.ai_check_public_warn
            : p.ai_check_signin_https;
    case 'clients':
      return step.status === 'ok'
        ? p.ai_check_clients_ok(
            publicText(String(data.label ?? '')),
            String(data.client ?? ''),
          )
        : p.ai_check_clients_warn;
  }
}
</script>

<template>
  <div class="flex flex-col gap-1" aria-live="polite" data-ai-check>
    <code class="text-xs break-all text-text-3">{{ report.endpoint }}</code>
    <ul class="flex flex-col gap-1">
      <li
        v-for="step in report.steps"
        :key="step.id"
        class="flex items-start gap-xs text-sm"
      >
        <Icon
          :name="statusLook[step.status].icon"
          class="mt-0.5 shrink-0"
          :class="statusLook[step.status].class"
        />
        <span
          class="min-w-0 wrap-break-word"
          :class="step.status === 'skip' ? 'text-text-3' : 'text-text-2'"
        >
          {{ describe(step) }}
          <template v-if="step.id === 'clients' && step.data?.at">
            · <TheiTime :datetime="Number(step.data.at)" />
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>
