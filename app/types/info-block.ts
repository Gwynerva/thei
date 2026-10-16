export type InfoBlockValue = string | number | null | undefined;
export type InfoBlockTone = 'neutral' | 'good' | 'bad';
export type InfoBlockComparisonValue = {
  previous: InfoBlockValue;
  current: InfoBlockValue;
  tone?: InfoBlockTone;
};
export type InfoBlockRowValue =
  InfoBlockValue | [InfoBlockValue, InfoBlockValue] | InfoBlockComparisonValue;

export interface InfoBlockRow {
  label: string;
  value?: InfoBlockRowValue;
  uppercase?: boolean;
}
