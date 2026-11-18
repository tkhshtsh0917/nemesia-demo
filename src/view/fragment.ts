/** Selects the final word for insertion or for an IME preview. */
export type Fragment = { value: string; query: string; offset: number };

export function atEnd(input: HTMLInputElement): boolean {
  return (
    input.selectionStart === input.value.length &&
    input.selectionEnd === input.value.length
  );
}

export function fragment(
  input: HTMLInputElement,
  composing = false,
): Fragment | undefined {
  const value = input.value;
  if (!composing && !atEnd(input)) return;

  const query = /[^\s\p{White_Space}]+$/u.exec(value)?.[0];
  if (query === undefined) return;

  const offset = value.length - query.length;
  if (composing && (input.selectionStart ?? -1) < offset) return;
  return { value, query, offset };
}
