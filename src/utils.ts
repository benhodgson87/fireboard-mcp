export function maskUuid(uuid: string): string {
  const parts = uuid.split("-");
  if (parts.length !== 5) return "xxxx";
  return `${parts[0]}-xxxx-xxxx-xxxx-${parts[4]}`;
}
