export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

