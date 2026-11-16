// CSV 공용 유틸: 인코딩 판별(UTF-8 / CP949), RFC 4180 파서, 헤더 정규화.
// 외부 의존성 없음 (Node 20+).

/**
 * 바이트를 문자열로 디코딩한다. UTF-8 BOM은 제거하고,
 * UTF-8로 해석이 안 되면 CP949(euc-kr)로 재시도한다.
 * @param {Uint8Array} buffer
 * @returns {{ text: string, encoding: 'utf-8' | 'cp949' }}
 */
export function decodeBuffer(buffer) {
  if (!(buffer instanceof Uint8Array)) {
    throw new TypeError('decodeBuffer: Buffer 또는 Uint8Array가 필요합니다.');
  }
  let bytes = buffer;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    try {
      return { text: new TextDecoder('euc-kr', { fatal: true }).decode(bytes), encoding: 'cp949' };
    } catch {
      throw new Error('인코딩을 판별할 수 없습니다. 엑셀에서 "CSV UTF-8"로 다시 저장해 주세요.');
    }
  }
}

/**
 * RFC 4180 방식 CSV 파서. 따옴표 안의 쉼표·줄바꿈·이중따옴표를 처리한다.
 * @param {string} text
 * @returns {{ rows: string[][], lines: number[] }} lines[i]는 rows[i]가 시작한 원본 행 번호(1부터)
 */
export function parseCsv(text) {
  if (typeof text !== 'string') throw new TypeError('parseCsv: 문자열이 필요합니다.');
  const rows = [];
  const lines = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  let quoteOpenLine = 1;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    lines.push(rowStart);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      quoteOpenLine = line;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      line += 1;
      pushRow();
      rowStart = line;
    } else if (ch === '\n') {
      line += 1;
      pushRow();
      rowStart = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw new Error(`CSV 형식 오류: ${quoteOpenLine}행에서 연 따옴표가 닫히지 않았습니다.`);
  }
  if (field !== '' || row.length > 0) pushRow();
  return { rows, lines };
}

/**
 * 헤더 표기를 정규화한다: 괄호 설명과 공백 제거.
 * 예) "앞면 (개념)" → "앞면", "완료 조건" → "완료조건"
 * @param {string} header
 */
export function normalizeHeader(header) {
  return String(header)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '');
}

/**
 * CSV 텍스트를 레코드 배열로 변환한다. 첫 비어 있지 않은 행을 헤더로 본다.
 * @param {string} text
 * @param {string[]} requiredHeaders 정규화된 필수 헤더 이름
 * @returns {{ records: { line: number, values: Record<string, string> }[], errors: string[] }}
 * @throws 필수 헤더가 없거나 헤더 행이 없을 때
 */
export function csvToRecords(text, requiredHeaders) {
  const { rows, lines } = parseCsv(text);
  const isBlank = (r) => r.every((c) => c.trim() === '');
  const headerIdx = rows.findIndex((r) => !isBlank(r));
  if (headerIdx < 0) throw new Error('CSV에 헤더 행이 없습니다.');

  const headers = rows[headerIdx].map(normalizeHeader);
  const missing = requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`필수 열이 없습니다: ${missing.join(', ')} (확인된 열: ${headers.join(', ')})`);
  }
  const dupHeaders = headers.filter((h, i) => h !== '' && headers.indexOf(h) !== i);
  if (dupHeaders.length > 0) {
    throw new Error(`중복된 열 이름이 있습니다: ${[...new Set(dupHeaders)].join(', ')}`);
  }

  const records = [];
  const errors = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (isBlank(r)) continue;
    if (r.length !== headers.length) {
      errors.push(`${lines[i]}행: 열 개수가 헤더(${headers.length})와 다릅니다(${r.length}). 쉼표가 들어간 셀은 따옴표로 감싸야 합니다.`);
      continue;
    }
    const values = {};
    headers.forEach((h, c) => {
      values[h] = r[c].normalize('NFC').trim();
    });
    records.push({ line: lines[i], values });
  }
  return { records, errors };
}

/** "없음", "-", 빈 문자열을 null로 바꾼다. */
export function nullIfEmpty(value) {
  const v = String(value ?? '').trim();
  return v === '' || v === '없음' || v === '-' ? null : v;
}
