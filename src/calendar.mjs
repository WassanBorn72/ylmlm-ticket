// Work in UTC so month lengths and weekday alignment do not depend on device timezone.
export function calendarDays(month) {
  const [year, number] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - start + 1;
    return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
}
export function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
