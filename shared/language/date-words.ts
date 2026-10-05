import type { LanguageCode } from './types';

/**
 * The words a day is written with, by language, for reading a day typed into
 * a search: «12 мая 2024», «May 12th, 2024».
 *
 * `months` holds every whole form of each month, January first, lowercase and
 * with «ё» read as «е». A short form — «янв», «сент», «sept» — is the start of
 * a whole one and needs no entry of its own. `fillers` are the words that go
 * along with a day without naming any part of it: «2024 г.», «12-го», «in
 * May».
 *
 * Every language is read whatever the site's language, since a life is rarely
 * written in one language only; a new language adds its words here.
 */
export const dateWords: Record<
  LanguageCode,
  { months: readonly (readonly string[])[]; fillers: readonly string[] }
> = {
  en: {
    months: [
      ['january'],
      ['february'],
      ['march'],
      ['april'],
      ['may'],
      ['june'],
      ['july'],
      ['august'],
      ['september'],
      ['october'],
      ['november'],
      ['december'],
    ],
    fillers: ['st', 'nd', 'rd', 'th', 'of', 'the', 'in', 'on', 'year'],
  },
  ru: {
    months: [
      ['январь', 'января', 'январе'],
      ['февраль', 'февраля', 'феврале'],
      ['март', 'марта', 'марте'],
      ['апрель', 'апреля', 'апреле'],
      ['май', 'мая', 'мае'],
      ['июнь', 'июня', 'июне'],
      ['июль', 'июля', 'июле'],
      ['август', 'августа', 'августе'],
      ['сентябрь', 'сентября', 'сентябре'],
      ['октябрь', 'октября', 'октябре'],
      ['ноябрь', 'ноября', 'ноябре'],
      ['декабрь', 'декабря', 'декабре'],
    ],
    fillers: [
      'г',
      'гг',
      'год',
      'года',
      'году',
      'го',
      'е',
      'ое',
      'в',
      'во',
      'числа',
    ],
  },
};
