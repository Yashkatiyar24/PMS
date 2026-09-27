/** Build a CSV text safely (quotes, commas, and a guard against spreadsheet formula injection). */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(cell).join(",")).join("\n")
}

function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value)
  // A leading =, +, - or @ would run as a formula when opened in a spreadsheet.
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}
