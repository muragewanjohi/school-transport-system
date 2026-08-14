export const STOPS_STAGES_PATH = "/routes/stops";

export type StopSaveAction = "created" | "updated";

export function stopsPageAfterSave(action: StopSaveAction): string {
  return `${STOPS_STAGES_PATH}?${action}=1`;
}

export function noticeFromStopsSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("created") === "1") {
    return "Stop created successfully.";
  }
  if (params.get("updated") === "1") {
    return "Stop updated successfully.";
  }
  return null;
}

export function friendlyStopSaveError(raw: string | undefined): string {
  const message = raw ?? "";
  if (
    message.includes("unique_route_stop_sequence") ||
    /duplicate key value violates unique constraint/i.test(message)
  ) {
    return "This stop may already exist on the route. Open Stops & Stages to continue instead of saving again.";
  }
  return message || "Failed to save stop";
}
