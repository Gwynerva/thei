import type { BlockTool } from '@editorjs/editorjs';
import { editorIcon } from './editor-icons';

export class ContentDelimiterTool implements BlockTool {
  static isReadOnlySupported = true;

  static toolbox = {
    title: 'Delimiter',
    icon: editorIcon('asterisk'),
  };

  render() {
    const separator = document.createElement('div');
    separator.className = 'content-divider';
    separator.setAttribute('role', 'separator');
    separator.innerHTML = editorIcon('asterisk').repeat(3);
    return separator;
  }

  save() {
    return {};
  }
}
