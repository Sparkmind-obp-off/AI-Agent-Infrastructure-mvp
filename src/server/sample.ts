export const SAMPLE_CSV = `region,product,revenue,units,satisfaction\nNorth,Atlas,18400,230,4.8\nSouth,Atlas,16900,205,4.6\nWest,Atlas,19700,241,4.9\nNorth,Beacon,11200,190,4.1\nSouth,Beacon,9800,176,3.9\nWest,Beacon,12400,201,4.2\nNorth,Core,14300,150,4.5\nSouth,Core,13800,147,4.4\nWest,Core,15500,161,4.7\n`

// This input boundary intentionally accepts only simple, unquoted CSV with the demo schema.
export function parseCsvInput(csv: string) {
  if (new TextEncoder().encode(csv).byteLength > 65_536 || /["\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(csv)) throw new Error('INVALID_CSV_INPUT')
  const lines = csv.trimEnd().replaceAll('\r\n', '\n').split('\n')
  if (lines.length < 2 || lines.length > 1_001 || lines[0] !== 'region,product,revenue,units,satisfaction') throw new Error('INVALID_CSV_INPUT')
  return lines.slice(1).map((line) => {
    const fields = line.split(',')
    if (fields.length !== 5) throw new Error('INVALID_CSV_INPUT')
    const [region, product, revenueText, unitsText, satisfactionText] = fields
    if (![region, product].every((value) => /^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,79}$/.test(value)) ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(revenueText) || !/^[1-9]\d*$/.test(unitsText) ||
      !/^(?:[0-4](?:\.\d+)?|5(?:\.0+)?)$/.test(satisfactionText)) throw new Error('INVALID_CSV_INPUT')
    const revenue = Number(revenueText); const units = Number(unitsText); const satisfaction = Number(satisfactionText)
    if (!Number.isFinite(revenue) || !Number.isSafeInteger(units) || !Number.isFinite(satisfaction)) throw new Error('INVALID_CSV_INPUT')
    return { region, product, revenue, units, satisfaction }
  })
}
