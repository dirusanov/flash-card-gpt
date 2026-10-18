/** Values can quote source forms; grammar labels must use the reader's writing system. */
export function grammarLabelsUseOutputScript(note: string, language: string): boolean {
  const code = language.toLowerCase().split('-')[0];
  const script = ['ru','uk','be','bg','mk'].includes(code) ? /\p{Script=Cyrillic}/u
    : ['en','de','es','it','fr','pt','nl','pl','tr','vi','sv','da','no','fi','cs','sk','ro','hu','id'].includes(code) ? /\p{Script=Latin}/u
    : code === 'zh' ? /\p{Script=Han}/u
    : code === 'ja' ? /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
    : code === 'ko' ? /\p{Script=Hangul}/u
    : code === 'ar' ? /\p{Script=Arabic}/u
    : code === 'he' ? /\p{Script=Hebrew}/u : null;
  return !script || note.split('\n').filter(line => line.trim())
    .every(line => script.test(line.split(':')[0]));
}
