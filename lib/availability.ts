export type Zone = "green" | "yellow" | "red";

export function getZone(startDate: Date): Zone {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (startDate.getTime() - today.getTime()) / 86_400_000;
  if (diffDays < 14) return "red";
  if (diffDays < 30) return "yellow";
  return "green";
}

export function getStatusForZone(zone: Zone): "active" | "pending_approval" {
  if (zone === "yellow") return "pending_approval";
  if (zone === "red")
    throw new Error("Cambios en zona roja solo los puede hacer el admin");
  return "active";
}
