const AVATAR_GRADIENTS = [
  ["#ff885e", "#ff516a"],
  ["#ffcd6a", "#ffa85c"],
  ["#82b1ff", "#665fff"],
  ["#a0de7e", "#54cb68"],
  ["#53edd6", "#28c9b7"],
  ["#72d5fd", "#2a9ef1"],
  ["#e0a2f3", "#d669ed"],
] as const;

export function avatarGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
  return `linear-gradient(180deg, ${from}, ${to})`;
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export const formatTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const formatDay = (ms: number) =>
  new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export const formatPts = (n: number) => n.toFixed(1);

export const valuePer = (projection: number, salary: number) => (salary > 0 ? projection / salary : 0);

export function isOut(status: string) {
  return ["O", "INJ", "SUSP", "NA", "D"].includes(status.toUpperCase());
}

export function downloadFile(filename: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
