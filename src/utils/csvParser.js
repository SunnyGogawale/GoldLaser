export const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(field);
      field = '';
      if (row.some((value) => String(value).trim() !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => String(value).trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
};

export const normalizeCsvHeader = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

export const parseCsvData = (text) => {
  const rows = parseCsvText(text).filter((row) => row.some((value) => String(value).trim() !== ''));
  if (rows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const headers = rows[0].map((header) => String(header || '').trim());
  const dataRows = rows.slice(1).map((row) => row.slice(0, headers.length));
  return { headers, dataRows };
};

export const getSuggestedCsvHeader = (headers, candidates) => {
  const normalizedCandidates = candidates.map((candidate) => normalizeCsvHeader(candidate));
  const match = headers.find((header) => {
    const normalizedHeader = normalizeCsvHeader(header);
    return normalizedCandidates.some((candidate) => normalizedHeader.includes(candidate));
  });
  return match || '';
};

export const parseCsvDateValue = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const fullYear = year < 100 ? 2000 + year : year;
    return new Date(Date.UTC(fullYear, month - 1, day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toIsoDateString = (value) => {
  if (!value) return new Date().toISOString();
  const parsed = parseCsvDateValue(value);
  if (!parsed) return new Date().toISOString();
  return parsed.toISOString();
};
