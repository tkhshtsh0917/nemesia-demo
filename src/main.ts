import "./styles.css";
import type { Reply, Request } from "./protocol.ts";
import type { Suggestion } from "./types.ts";
import { Combobox } from "./view/combobox.ts";
import { atEnd, type Fragment, fragment } from "./view/fragment.ts";
import { showSearch } from "./view/host-search.ts";
import { bindOptionSelection } from "./view/option-selection.ts";

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element ${id}`);
  return node as T;
}

const input = required<HTMLInputElement>("query");
const list = required("suggestions");
const status = required("status");
const restart = required<HTMLButtonElement>("restart");
const combo = new Combobox(input, list);

type Pending = { id: number; fragment: Fragment; start: number };
let serial = 0;
let worker: Worker | undefined;
let loadId = 0;
let generation: string | undefined;
let running: Pending | undefined;
let pending: Pending | undefined;
let shown: { source: Fragment; hits: Suggestion[] } | undefined;
let composing = false;
let caretAtEnd = atEnd(input);

function send(message: Request) {
  worker?.postMessage(message);
}

function invalidate() {
  serial++;
  pending = undefined;
  shown = undefined;
  combo.render([]);
}

function pump() {
  if (running || !pending || !generation) return;
  running = pending;
  pending = undefined;
  send({
    kind: "query",
    id: running.id,
    query: running.fragment.query,
    generation,
  });
}

function schedule() {
  invalidate();
  caretAtEnd = atEnd(input);
  if (document.activeElement !== input) return;

  const item = fragment(input, composing);
  if (!item) return;
  pending = { id: serial, fragment: item, start: performance.now() };
  pump();
}

function accept(reply: Reply) {
  if (reply.kind === "ready") {
    if (reply.id !== loadId) return;
    generation = reply.generation;
    status.textContent = "補完できます。";
    schedule();
    return;
  }
  if (reply.kind === "load-error") {
    if (reply.id !== loadId) return;
    status.textContent = "索引を読み込めませんでした。";
    restart.hidden = false;
    return;
  }
  const request = running;
  if (!request || request.id !== reply.id) return;
  running = undefined;
  pump();
  if (request.id !== serial || reply.generation !== generation) return;

  const workerMs = performance.now() - request.start;
  requestAnimationFrame(() => {
    if (request.id !== serial || reply.generation !== generation) return;
    if (reply.kind === "query-error") {
      status.textContent = "この入力を補完できませんでした。";
      return;
    }
    shown = { source: request.fragment, hits: reply.hits };
    combo.render(reply.hits);
    status.textContent = reply.hits.length ? "" : "補完候補はありません。";
    window.dispatchEvent(
      new CustomEvent("nemesia:render", {
        detail: {
          id: reply.id,
          inputMs: performance.now() - request.start,
          wasmMs: reply.wasmMs,
          workerMs,
        },
      }),
    );
  });
}

function start() {
  worker?.terminate();
  generation = undefined;
  running = undefined;
  invalidate();
  restart.hidden = true;
  status.textContent = "補完を準備しています。";
  loadId = ++serial;
  const current = new Worker(new URL("./worker/search.ts", import.meta.url), {
    type: "module",
  });
  worker = current;
  current.onmessage = (event: MessageEvent<Reply>) => {
    if (worker === current) accept(event.data);
  };
  current.onerror = () => {
    if (worker !== current) return;
    current.terminate();
    worker = undefined;
    running = undefined;
    generation = undefined;
    invalidate();
    restart.hidden = false;
    status.textContent = "補完が停止しました。";
  };
  send({
    kind: "load",
    id: loadId,
    url: new URL("./generated/current.json", document.baseURI).href,
  });
}

function insert(index: number) {
  if (composing || !shown) return;
  const current = fragment(input);
  const hit = shown.hits[index];
  if (
    !current ||
    current.value !== shown.source.value ||
    current.offset !== shown.source.offset ||
    !hit
  )
    return;
  input.value = current.value.slice(0, current.offset) + hit.text;
  input.focus();
  invalidate();
}

input.addEventListener("input", schedule);
input.addEventListener("compositionstart", () => {
  composing = true;
  schedule();
});
input.addEventListener("compositionend", () => {
  composing = false;
  schedule();
});
input.addEventListener("blur", invalidate);
document.addEventListener("selectionchange", () => {
  if (document.activeElement !== input || composing) return;

  const next = atEnd(input);
  if (next === caretAtEnd) return;

  if (next) {
    schedule();
  } else {
    caretAtEnd = false;
    invalidate();
  }
});
input.addEventListener("keydown", (event) => {
  if (composing || event.isComposing || event.keyCode === 229) {
    return;
  }
  if (event.key === "Escape" && (shown || running || pending)) {
    event.preventDefault();
    invalidate();
  } else if (
    shown?.hits.length &&
    (event.key === "ArrowDown" || event.key === "ArrowUp")
  ) {
    event.preventDefault();
    combo.move(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter" && combo.selection >= 0) {
    event.preventDefault();
    insert(combo.selection);
  }
});
bindOptionSelection(list, () => shown?.source, insert);
required<HTMLFormElement>("search").addEventListener("submit", (event) => {
  event.preventDefault();
  if (composing) return;
  invalidate();
  showSearch(input.value, required("search-summary"), required("results"));
});
restart.addEventListener("click", () => {
  input.focus();
  start();
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) worker?.terminate();
});
start();
