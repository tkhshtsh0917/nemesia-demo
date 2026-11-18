/** Accepts a pointer tap without treating a scroll gesture or stale option as a selection. */
import type { Fragment } from "./fragment.ts";

function optionAt(target: EventTarget | null): number | undefined {
  if (!(target instanceof Element)) return;
  const row = target.closest<HTMLElement>("[data-index]");
  if (row) return Number(row.dataset.index);
}

export function bindOptionSelection(
  list: HTMLElement,
  source: () => Fragment | undefined,
  insert: (option: number) => void,
) {
  let press:
    | {
        pointer: number;
        x: number;
        y: number;
        option: number;
        source: Fragment;
      }
    | undefined;
  list.addEventListener("pointerdown", (event) => {
    const current = source();
    const option = optionAt(event.target);
    if (event.button !== 0 || !current || option === undefined) return;
    if (event.pointerType === "mouse") event.preventDefault();

    press = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      option,
      source: current,
    };
  });
  list.addEventListener("pointercancel", () => {
    press = undefined;
  });
  list.addEventListener("pointerup", (event) => {
    const down = press;
    press = undefined;
    if (
      !down ||
      down.pointer !== event.pointerId ||
      down.source !== source() ||
      down.option !== optionAt(event.target) ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12
    )
      return;
    insert(down.option);
  });
  list.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const option = optionAt(event.target);
    if (option !== undefined) insert(option);
  });
}
