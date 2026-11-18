/** Owns the listbox DOM and keyboard selection without moving DOM focus. */
import type { Suggestion } from "../types.ts";

export class Combobox {
  private active = -1;

  constructor(
    private input: HTMLInputElement,
    private list: HTMLElement,
  ) {}

  render(hits: readonly Suggestion[]) {
    this.active = -1;
    this.input.removeAttribute("aria-activedescendant");
    this.input.setAttribute("aria-expanded", String(hits.length > 0));
    this.list.hidden = hits.length === 0;
    this.list.replaceChildren(
      ...hits.map((hit, i) => {
        const row = document.createElement("div");
        row.id = `completion-${hit.id}`;
        row.dataset.index = String(i);
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        row.textContent = hit.text;
        return row;
      }),
    );
  }

  get selection(): number {
    return this.active;
  }

  move(direction: number) {
    const children = this.list.children;
    if (children.length === 0) return;
    children[this.active]?.setAttribute("aria-selected", "false");
    this.active =
      this.active === -1
        ? direction > 0
          ? 0
          : children.length - 1
        : (this.active + direction + children.length) % children.length;
    const item = children[this.active];
    item.setAttribute("aria-selected", "true");
    this.input.setAttribute("aria-activedescendant", item.id);
    item.scrollIntoView({ block: "nearest" });
  }
}
