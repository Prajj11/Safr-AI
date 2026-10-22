/** Public messages never expose raw database errors, SQL, or credentials. */
export function trackingDatabaseError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (
    ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(String(code))
  ) {
    return "Reunite setup is incomplete on the server. The administrator needs to apply the Reunite database update. Emergency call buttons still work.";
  }
  return "Family coordination is temporarily unavailable. Please retry. Emergency call buttons still work.";
}
