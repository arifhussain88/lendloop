export function timeAgo(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function activityLabel(a: { kind: string; status: string; at: number }): string {
  const when = timeAgo(a.at);
  if (a.kind === "overdue_reminder") return a.status === "sent" ? `Reminder sent ${when}` : `Reminder failed ${when}`;
  if (a.kind === "status_notification") return a.status === "sent" ? `Notification sent ${when}` : `Notification failed ${when}`;
  return `Automation error ${when}`;
}
