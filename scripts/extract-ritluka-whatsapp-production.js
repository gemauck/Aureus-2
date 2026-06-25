#!/usr/bin/env node
/**
 * Parse Ritluka production WhatsApp export → Excel (hourly excavator loads + per-asset truck loads).
 * Usage: node scripts/extract-ritluka-whatsapp-production.js [path-to-chat.txt] [output.xlsx]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultInput =
  '/Users/gemau/Downloads/WhatsApp Chat with Ritluka production group leewpan/WhatsApp Chat with Ritluka production group leewpan.txt';
const inputPath = process.argv[2] || defaultInput;
const outputPath =
  process.argv[3] ||
  path.join(__dirname, '../reports/ritluka-whatsapp-production-extract.xlsx');

/** Max loads in one hour for one excavator — above this is usually a shift/day total mis-posted without hour */
const HOURLY_LOADS_CAP = 55;

const MSG_HEADER =
  /^(\d{4}\/\d{2}\/\d{2}),\s*(\d{2}:\d{2})\s*-\s*[^:]+:\s*(.*)$/;

function parseProductionDate(s) {
  if (!s) return null;
  const m = String(s)
    .trim()
    .match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += y < 50 ? 2000 : 1900;
  const month = parseInt(m[2], 10);
  const day = parseInt(m[1], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (y < 2023 || y > 2027) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function messageDateToIso(msgDate) {
  if (!msgDate) return '';
  const m = msgDate.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function msgSortKey(msgDate, msgTime) {
  return `${msgDate || ''} ${msgTime || ''}`;
}

function lineText(entry) {
  return typeof entry === 'string' ? entry : entry.text;
}

function findProductionDateInLines(lines) {
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const t = lineText(lines[i]).trim();
    if (/^(exc?|ex)\s*:?\s*\d|material|trucks?[=:]|loads?[=:]|target/i.test(t)) break;
    const only = t.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
    if (only) {
      const parsed = parseProductionDate(only[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseHourLine(line) {
  const t = line.trim();
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
  m = t.match(/^(\d{1,2})h(\d{2})\b/i);
  if (m) return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
  return null;
}

function messageHasProductionHour(lines) {
  return lines.some((l) => parseHourLine(lineText(l)) != null);
}

function isShiftSummaryMessage(lines) {
  const joined = lines.map(lineText).join('\n');
  if (/end of production|production on hold|total bcm|shift total/i.test(joined)) return true;
  if (!messageHasProductionHour(lines)) {
    const exCount = lines.filter((l) => normalizeExcavator(lineText(l))).length;
    if (exCount >= 3) return true;
  }
  return false;
}

function cleanMaterial(raw) {
  return String(raw || '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/\*/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseNum(raw) {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeExcavator(line) {
  const m = line.trim().match(/^(exc?|ex)\s*:?\s*(\d+)\s*$/i);
  if (!m) return null;
  return `EX${m[2]}`;
}

function truckFamilyFromConfig(config) {
  const c = String(config || '').toLowerCase();
  if (/crt/.test(c)) return 'CRT';
  if (/rdt|adt/.test(c)) return 'RDT';
  if (/a45/.test(c)) return 'CBK';
  return '';
}

function normalizeTruckId(raw, family) {
  const s = String(raw || '').trim();
  let m = s.match(/^(cbk|rdt|crt|gr)(\d+)$/i);
  if (m) return `${m[1].toUpperCase()}${m[2]}`;
  m = s.match(/^(\d+)$/);
  if (m && family) return `${family}${m[1]}`;
  return s.toUpperCase();
}

function parseTruckLoadsLine(line, family) {
  const t = line.trim();
  if (/^loads?\s*[=:]/i.test(t)) return null;
  const m = t.match(/^([A-Za-z]*\d+)\s*[=:]\s*(\d+)\s*$/);
  if (!m) return null;
  const loads = parseInt(m[2], 10);
  if (!Number.isFinite(loads) || loads > HOURLY_LOADS_CAP) return null;
  return { asset: normalizeTruckId(m[1], family), loads };
}

function parseLoadsLine(line) {
  const m = line.trim().match(/^loads?\s*[=:]\s*(\d+)\s*$/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseBcmLine(line) {
  const m = line.trim().match(/^bcm\s*[=:]\s*([\d\s,\.]+)\s*$/i);
  return m ? parseNum(m[1]) : null;
}

function parseTonsLine(line) {
  const m = line.trim().match(/^tons?\s*[=:]\s*([\d\s,\.]+)\s*$/i);
  return m ? parseNum(m[1]) : null;
}

function parseMaterialLine(line) {
  let m = line.match(/material\s*[=:;]\s*(.+?)\s*$/i);
  if (!m) m = line.match(/\*material\s*[=:;]\s*(.+?)\*?\s*$/i);
  if (!m) m = line.match(/metarial\s+(.+?)\s*$/i);
  return m ? cleanMaterial(m[1]) : null;
}

function parseDistanceLine(line) {
  const m = line.match(/distance\s*[=:]\s*(.+?)\s*$/i);
  return m ? m[1].trim().replace(/\*+/g, '') : null;
}

function parseShift(lines) {
  let shiftCode = '';
  let shiftType = '';
  for (const entry of lines) {
    const line = lineText(entry);
    const sc = line.match(/shift\s*([abc])\b/i);
    if (sc) shiftCode = sc[1].toUpperCase();
    if (/day\s*shift/i.test(line)) shiftType = 'Day';
    if (/night\s*shift/i.test(line)) shiftType = 'Night';
  }
  return [shiftCode, shiftType].filter(Boolean).join(' ') || '';
}

function flushBlock(ctx, excavatorRows, truckRows, sourceFile) {
  const {
    msgDate,
    msgTime,
    productionDate,
    shift,
    hour,
    messageHadHour,
    isShiftSummary,
    material,
    distance,
    excavator,
    trucksConfig,
    totalLoads,
    bcm,
    tons,
    trucks,
    lineMessage,
    lineHour,
    lineExcavator,
    lineLoads,
  } = ctx;
  if (!excavator || totalLoads == null) return;

  const truckLoadsSum = trucks.reduce((s, t) => s + t.loads, 0);
  const recordType =
    !hour || !messageHadHour || isShiftSummary || totalLoads > HOURLY_LOADS_CAP
      ? 'shift_or_summary'
      : 'hourly';

  const row = {
    source_file: sourceFile,
    source_line_loads: lineLoads,
    source_line_excavator: lineExcavator,
    source_line_hour: lineHour || '',
    source_line_message: lineMessage,
    message_date: msgDate,
    message_time: msgTime,
    production_date: productionDate,
    shift,
    hour: hour || '',
    record_type: recordType,
    material: material || '',
    distance_km: distance || '',
    excavator,
    trucks_config: trucksConfig || '',
    total_loads: totalLoads,
    truck_loads_sum: truckLoadsSum || '',
    bcm: bcm ?? '',
    tons: tons ?? '',
  };

  excavatorRows.push(row);

  for (const t of trucks) {
    truckRows.push({
      source_file: sourceFile,
      source_line_truck: t.lineNum,
      source_line_loads: lineLoads,
      source_line_excavator: lineExcavator,
      source_line_message: lineMessage,
      message_date: msgDate,
      message_time: msgTime,
      production_date: productionDate,
      shift,
      hour: hour || '',
      record_type: recordType,
      material: material || '',
      distance_km: distance || '',
      excavator,
      truck_asset: t.asset,
      truck_loads: t.loads,
      trucks_config: trucksConfig || '',
    });
  }
}

function parseChat(text, sourceFile) {
  const excavatorRows = [];
  const truckRows = [];
  const lines = text.split(/\r?\n/);

  let msgDate = '';
  let msgTime = '';
  let productionDate = '';
  let shift = '';
  let hour = '';
  let messageHadHour = false;
  let isShiftSummary = false;
  let material = '';
  let distance = '';
  let lineMessage = 0;
  let lineHour = 0;

  let excavator = '';
  let trucksConfig = '';
  let truckFamily = '';
  let totalLoads = null;
  let bcm = null;
  let tons = null;
  let trucks = [];
  let lineExcavator = 0;
  let lineLoads = 0;

  function blockCtx() {
    return {
      msgDate,
      msgTime,
      productionDate,
      shift,
      hour,
      messageHadHour,
      isShiftSummary,
      material,
      distance,
      excavator,
      trucksConfig,
      truckFamily,
      totalLoads,
      bcm,
      tons,
      trucks: [...trucks],
      lineMessage,
      lineHour,
      lineExcavator,
      lineLoads,
    };
  }

  function resetExcavatorBlock() {
    excavator = '';
    trucksConfig = '';
    truckFamily = '';
    totalLoads = null;
    bcm = null;
    tons = null;
    trucks = [];
    lineExcavator = 0;
    lineLoads = 0;
  }

  function commitExcavator() {
    flushBlock(blockCtx(), excavatorRows, truckRows, sourceFile);
    resetExcavatorBlock();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = line.match(MSG_HEADER);
    if (!header) continue;

    commitExcavator();
    msgDate = header[1];
    msgTime = header[2];
    lineMessage = i + 1;
    const messageEntries = [{ text: header[3], lineNum: i + 1 }];
    let j = i + 1;
    while (j < lines.length && !MSG_HEADER.test(lines[j])) {
      messageEntries.push({ text: lines[j], lineNum: j + 1 });
      j++;
    }
    i = j - 1;

    const joined = messageEntries.map((e) => e.text).join('\n');
    if (
      !/controlroom|production|shift\s*[abc]/i.test(joined) &&
      !/^(exc?|ex)\s*:?\s*\d/im.test(joined)
    ) {
      continue;
    }

    shift = parseShift(messageEntries);
    productionDate = findProductionDateInLines(messageEntries) || '';
    hour = '';
    lineHour = 0;
    messageHadHour = messageHasProductionHour(messageEntries);
    isShiftSummary = isShiftSummaryMessage(messageEntries);
    material = '';
    distance = '';
    resetExcavatorBlock();

    const captionDate = parseProductionDate(header[3]);
    if (captionDate) productionDate = captionDate;

    for (const { text: ml, lineNum } of messageEntries) {
      const pd = ml.trim().match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
      if (pd) {
        const parsed = parseProductionDate(pd[1]);
        if (parsed) productionDate = parsed;
      }
      const h = parseHourLine(ml);
      if (h) {
        hour = h;
        lineHour = lineNum;
      }
      const mat = parseMaterialLine(ml);
      if (mat) {
        if (excavator) commitExcavator();
        material = mat;
      }
      const dist = parseDistanceLine(ml);
      if (dist) distance = dist;

      const ex = normalizeExcavator(ml);
      if (ex) {
        if (excavator) commitExcavator();
        excavator = ex;
        lineExcavator = lineNum;
        continue;
      }

      const trucksM = ml.match(/trucks?\s*[=:]\s*(.+?)\s*$/i);
      if (trucksM && excavator) {
        trucksConfig = trucksM[1].trim();
        truckFamily = truckFamilyFromConfig(trucksConfig);
        continue;
      }

      const tl = parseTruckLoadsLine(ml, truckFamily);
      if (tl && excavator) {
        trucks.push({ ...tl, lineNum });
        continue;
      }

      const loads = parseLoadsLine(ml);
      if (loads != null && excavator) {
        totalLoads = loads;
        lineLoads = lineNum;
        continue;
      }

      const b = parseBcmLine(ml);
      if (b != null && excavator) {
        bcm = b;
        continue;
      }

      const t = parseTonsLine(ml);
      if (t != null && excavator) {
        tons = t;
      }
    }

    if (!productionDate) productionDate = messageDateToIso(msgDate);
    commitExcavator();
  }

  return { excavatorRows, truckRows };
}

function dedupeHourly(rows, truckRows) {
  const excMap = new Map();
  const truckMap = new Map();

  for (const r of rows) {
    if (r.record_type !== 'hourly') continue;
    const key = [r.production_date, r.shift, r.hour, r.excavator, r.material].join(
      '|'
    );
    const prev = excMap.get(key);
    if (
      !prev ||
      msgSortKey(r.message_date, r.message_time) >=
        msgSortKey(prev.message_date, prev.message_time)
    ) {
      excMap.set(key, r);
    }
  }

  for (const t of truckRows) {
    if (t.record_type !== 'hourly') continue;
    const key = [
      t.production_date,
      t.shift,
      t.hour,
      t.excavator,
      t.material,
      t.truck_asset,
    ].join('|');
    const parentKey = [
      t.production_date,
      t.shift,
      t.hour,
      t.excavator,
      t.material,
    ].join('|');
    const parent = excMap.get(parentKey);
    if (!parent) continue;
    if (
      t.message_date !== parent.message_date ||
      t.message_time !== parent.message_time
    ) {
      continue;
    }
    const prev = truckMap.get(key);
    if (
      !prev ||
      msgSortKey(t.message_date, t.message_time) >=
        msgSortKey(prev.message_date, prev.message_time)
    ) {
      truckMap.set(key, t);
    }
  }

  return { hourlyExc: [...excMap.values()], hourlyTruck: [...truckMap.values()] };
}

function buildHourlyPivot(hourlyRows) {
  const exSet = new Set();
  for (const r of hourlyRows) exSet.add(r.excavator);
  const excavators = [...exSet].sort();

  const slotMap = new Map();
  for (const r of hourlyRows) {
    const slot = `${r.production_date}|${r.shift}|${r.hour}`;
    if (!slotMap.has(slot)) {
      slotMap.set(slot, {
        production_date: r.production_date,
        shift: r.shift,
        hour: r.hour,
      });
    }
    const row = slotMap.get(slot);
    row[`${r.excavator}_loads`] = r.total_loads;
    row[`${r.excavator}_bcm`] = r.bcm;
    row[`${r.excavator}_material`] = r.material;
  }

  const slots = [...slotMap.values()].sort((a, b) => {
    const d = a.production_date.localeCompare(b.production_date);
    if (d) return d;
    return a.hour.localeCompare(b.hour);
  });

  return { slots, excavators };
}

function autoWidth(rows, sampleSize = 500) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  const sample = rows.length <= sampleSize ? rows : rows.slice(0, sampleSize);
  return keys.map((k) => {
    let max = k.length;
    for (const r of sample) {
      const len = String(r[k] ?? '').length;
      if (len > max) max = len;
    }
    return { wch: Math.min(max + 2, 48) };
  });
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error('Input not found:', inputPath);
    process.exit(1);
  }

  console.log('Reading', inputPath);
  const text = fs.readFileSync(inputPath, 'utf8');
  const sourceFile = path.basename(inputPath);
  console.log('Parsing…');
  const { excavatorRows, truckRows } = parseChat(text, sourceFile);

  const { hourlyExc, hourlyTruck } = dedupeHourly(excavatorRows, truckRows);

  const sortHourly = (a, b) => {
    const d = (a.production_date || '').localeCompare(b.production_date || '');
    if (d) return d;
    const h = (a.hour || '').localeCompare(b.hour || '');
    if (h) return h;
    return (a.excavator || '').localeCompare(b.excavator || '');
  };
  hourlyExc.sort(sortHourly);
  hourlyTruck.sort((a, b) => {
    const d = sortHourly(a, b);
    if (d) return d;
    return (a.truck_asset || '').localeCompare(b.truck_asset || '');
  });

  const shiftSummary = excavatorRows
    .filter((r) => r.record_type === 'shift_or_summary')
    .sort(sortHourly);

  const { slots: pivotSlots } = buildHourlyPivot(hourlyExc);

  const wb = XLSX.utils.book_new();

  const wsHourly = XLSX.utils.json_to_sheet(hourlyExc);
  wsHourly['!cols'] = autoWidth(hourlyExc);
  XLSX.utils.book_append_sheet(wb, wsHourly, 'Hourly_Loads');

  const wsPivot = XLSX.utils.json_to_sheet(pivotSlots);
  wsPivot['!cols'] = autoWidth(pivotSlots);
  XLSX.utils.book_append_sheet(wb, wsPivot, 'Hourly_By_TimeSlot');

  const wsTruck = XLSX.utils.json_to_sheet(hourlyTruck);
  wsTruck['!cols'] = autoWidth(hourlyTruck);
  XLSX.utils.book_append_sheet(wb, wsTruck, 'Truck_Loads_Hourly');

  const wsShift = XLSX.utils.json_to_sheet(shiftSummary);
  wsShift['!cols'] = autoWidth(shiftSummary);
  XLSX.utils.book_append_sheet(wb, wsShift, 'Shift_Summaries');

  const wsAll = XLSX.utils.json_to_sheet(excavatorRows);
  XLSX.utils.book_append_sheet(wb, wsAll, 'All_Raw');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { metric: 'hourly_rows_deduped', value: hourlyExc.length },
      { metric: 'truck_rows_hourly', value: hourlyTruck.length },
      { metric: 'shift_summary_rows', value: shiftSummary.length },
      { metric: 'all_raw_rows', value: excavatorRows.length },
      {
        metric: 'note',
        value:
          'Hourly_Loads = one row per date/shift/hour/excavator/material (latest message wins). source_line_* = 1-based line in source_file (.txt). Jump to source_line_loads for Loads= row.',
      },
      { metric: 'source_file', value: sourceFile },
    ]),
    'README'
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(wb, outputPath);

  console.log('Hourly (deduped):', hourlyExc.length);
  console.log('Shift summaries:', shiftSummary.length);
  console.log('Written:', outputPath);
}

main();
