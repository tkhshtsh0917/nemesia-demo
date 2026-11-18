/** A ranked suggestion with the original text retained for insertion. */
export interface Suggestion {
  id: number;
  text: string;
  distance: number;
}
