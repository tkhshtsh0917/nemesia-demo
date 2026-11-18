/** Selects the final word only when editing at the end of the field. */
export type Fragment = { value: string; query: string; offset: number };

export function fragment(input: HTMLInputElement): Fragment | undefined {
  const value = input.value;
  if (
    input.selectionStart !== value.length ||
    input.selectionEnd !== value.length
  )
    return;
  const query = /[^\s\p{White_Space}]+$/u.exec(value)?.[0];
  if (query !== undefined)
    return { value, query, offset: value.length - query.length };
}
