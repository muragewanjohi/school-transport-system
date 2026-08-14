export type TripRunStatus =
  | "Scheduled"
  | "Active"
  | "Completed"
  | "Delayed"
  | "Missed"
  | "Cancelled";

export function tripStatusStyles(status: string): {
  background: string;
  color: string;
  border: string;
} {
  switch (status) {
    case "Active":
      return {
        background: "rgba(16, 185, 129, 0.15)",
        color: "var(--accent-primary)",
        border: "1px solid rgba(16, 185, 129, 0.3)",
      };
    case "Completed":
      return {
        background: "rgba(59, 130, 246, 0.15)",
        color: "#3B82F6",
        border: "1px solid rgba(59, 130, 246, 0.3)",
      };
    case "Delayed":
      return {
        background: "rgba(245, 158, 11, 0.15)",
        color: "var(--state-warning)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
      };
    case "Missed":
      return {
        background: "rgba(239, 68, 68, 0.15)",
        color: "var(--state-error)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
      };
    case "Cancelled":
    default:
      return {
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
      };
  }
}

export function tripStatusIconColor(status: string): string {
  switch (status) {
    case "Active":
      return "var(--accent-primary)";
    case "Completed":
      return "#3B82F6";
    case "Delayed":
      return "var(--state-warning)";
    case "Missed":
      return "var(--state-error)";
    case "Cancelled":
    default:
      return "var(--text-primary)";
  }
}
