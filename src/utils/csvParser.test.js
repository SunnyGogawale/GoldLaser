import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvText, parseCsvData, getSuggestedCsvHeader, parseCsvDateValue, toIsoDateString } from './csvParser.js';

test('parseCsvText parses quoted fields and headers correctly', () => {
  const text = 'payment date,amount,description\n2024-07-01,1000,"Advance payment"\n"2024-07-02",2500,"Partial"';
  const rows = parseCsvText(text);
  assert.deepEqual(rows[0], ['payment date', 'amount', 'description']);
  assert.deepEqual(rows[1], ['2024-07-01', '1000', 'Advance payment']);
  assert.deepEqual(rows[2], ['2024-07-02', '2500', 'Partial']);
});

test('getSuggestedCsvHeader and date helpers map common column names', () => {
  const headers = ['Payment Date', 'Amount', 'Narration'];
  assert.equal(getSuggestedCsvHeader(headers, ['payment date', 'date']), 'Payment Date');
  assert.equal(parseCsvDateValue('12/07/2024')?.toISOString().slice(0, 10), '2024-07-12');
  assert.equal(toIsoDateString('07/12/2024').slice(0, 10), '2024-12-07');
});

test('parseCsvData returns headers and data rows', () => {
  const { headers, dataRows } = parseCsvData('payment date,amount\n2024-07-01,100\n2024-07-02,200');
  assert.deepEqual(headers, ['payment date', 'amount']);
  assert.deepEqual(dataRows, [['2024-07-01', '100'], ['2024-07-02', '200']]);
});
