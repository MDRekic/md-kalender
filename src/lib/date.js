export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
export const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
export const addMonths = (date, n) => new Date(date.getFullYear(), date.getMonth() + n, 1);

export function getMonthMatrix(activeDate, weekStartsOn = 1) {
  const start = startOfMonth(activeDate);
  const end = endOfMonth(activeDate);
  const daysInMonth = end.getDate();
  const firstDayIndex = (start.getDay() - weekStartsOn + 7) % 7;
  const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDayIndex + 1;
    const cellDate = new Date(activeDate.getFullYear(), activeDate.getMonth(), dayNum);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    cells.push({ date: cellDate, inMonth });
  }
  return cells;
}
