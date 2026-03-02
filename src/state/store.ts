import fs from "node:fs";
import path from "node:path";
import type { AppState, EventMapping } from "../types.js";

const DEFAULT_STATE: AppState = {
  lastProcessedInternalDate: 0,
  eventKeys: {},
};

const STATE_DIR = path.resolve(process.cwd(), "data");
const STATE_PATH = path.join(STATE_DIR, "state.json");

let _state: AppState | null = null;

export function loadState(): AppState {
  if (_state) return _state;

  if (fs.existsSync(STATE_PATH)) {
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    _state = { ...DEFAULT_STATE, ...JSON.parse(raw) } as AppState;
  } else {
    _state = { ...DEFAULT_STATE };
  }

  return _state!;
}

export function saveState(state: AppState): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  _state = state;
}

export function getEventMapping(
  eventKey: string
): EventMapping | undefined {
  const state = loadState();
  return state.eventKeys[eventKey];
}

export function upsertEventMapping(
  eventKey: string,
  mapping: EventMapping
): void {
  const state = loadState();
  state.eventKeys[eventKey] = mapping;
  saveState(state);
}

export function updateCursor(internalDate: number): void {
  const state = loadState();
  if (internalDate > state.lastProcessedInternalDate) {
    state.lastProcessedInternalDate = internalDate;
    saveState(state);
  }
}

export function getCursor(): number {
  return loadState().lastProcessedInternalDate;
}
