type LogLevel = "info" | "warn" | "error";

export function logOnboarding(
  step: string,
  data: Record<string, unknown> = {},
  level: LogLevel = "info",
): void {
  const entry = {
    service: "pncl-onboarding",
    step,
    ...data,
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
