import { requireAiOn } from '../../../thei/ai-on';
import { withRefusals } from '../../../thei/ai/refusals';
import { askAtField } from '../../../thei/ai/field-ask';
import { chosenModel } from '../../../thei/ai/model/settings';
import { markReadOnlyRequest } from '../../../thei/read-only-request';
import { rememberOrigin } from '../../../thei/ai/runner/background-event';

/**
 * The owner asks at a field's ✦: `ref` the entity or file, `place` the
 * field as its form names it, `text` the words, `current` what the form
 * holds there unsaved, `label` the field as the form names it. A session
 * answers it in the background; what it proposes waits at the field.
 */
export default defineEventHandler((event) =>
  withRefusals(async () => {
    requireAiOn();
    markReadOnlyRequest(event);
    // The turn this asks for writes addresses where the owner is.
    rememberOrigin(event);
    const body = (await readBody<Record<string, unknown>>(event)) ?? {};
    const model = chosenModel(body.model);
    return askAtField({
      ref: body.ref,
      place: body.place,
      text: body.text,
      current: body.current,
      label: body.label,
      ...(model ? { model } : {}),
    });
  }),
);
