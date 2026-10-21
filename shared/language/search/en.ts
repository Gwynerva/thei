import { stemEnglish } from '../stemmers/english';
import type { SearchLanguagePack } from './types';

const POSSESSIVE = /['’]s?$/u;

/**
 * English: the Snowball stemmer, and the function words of Snowball's own
 * English list — never a word that could name what a text is about.
 */
export const englishSearch: SearchLanguagePack = {
  script: 'latin',
  stem(word) {
    const bare = word.replace(POSSESSIVE, '');
    return bare.length < 3 ? bare : stemEnglish(bare);
  },
  stopWords: new Set(
    (
      'a an the and or but if then else of at by for with about against ' +
      'between into through during before after above below to from up down ' +
      'in out on off over under again further once here there when where why ' +
      'how all any both each few more most other some such no nor not only ' +
      'own same so than too very can will just should now i me my myself we ' +
      'our ours ourselves you your yours yourself yourselves he him his ' +
      'himself she her hers herself it its itself they them their theirs ' +
      'themselves what which who whom this that these those am is are was ' +
      'were be been being have has had having do does did doing would could ' +
      'ought shall may might must'
    ).split(' '),
  ),
  vagueWords: (
    'that this with from have were will would there their about which what ' +
    'when into than then them they been also just some more very around ' +
    'after before could should other these those where while'
  ).split(' '),
  kindWords: {
    file: ['photo', 'picture', 'image', 'video', 'file', 'scan'],
    'diary-entry': ['diary'],
    project: ['project'],
    'project-section': ['section', 'stage'],
    event: ['event'],
    page: ['page'],
    tag: ['tag'],
  },
  questionWords: new Set('what how when where why who which whose'.split(' ')),
  relativeDays: { today: 0, yesterday: -1 },
};
