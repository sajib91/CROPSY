import { notFound } from 'next/navigation';
import { getDictionary } from './index';

export function requireDictionary(locale) {
  const dictionary = getDictionary(locale);
  if (!dictionary) notFound();
  return dictionary;
}
