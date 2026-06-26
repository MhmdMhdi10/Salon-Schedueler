/**
 * Self-contained QR Code generator for the owner panel (task 5.4; R4.1, R4.3).
 *
 * The repo has no QR-code dependency, and the governing SEO standard
 * (`seo-skills.md` §9) forbids loading panel/app code onto the public bundle.
 * So rather than pull a dependency into the shared graph, QR image generation
 * is a small, dependency-free module imported only by the lazily-loaded owner
 * panel chunk — it never reaches the public/customer bundle.
 *
 * The encoder is a compact byte-mode QR Code (model 2) generator adapted from
 * Nayuki's public-domain "QR Code generator" reference
 * (https://www.nayuki.io/page/qr-code-generator-library). It supports the byte
 * segment + automatic version/mask selection we need for a short campaign URL,
 * and renders to a crisp, scalable SVG `path` (ideal for print — the standee).
 *
 * We expose only {@link encodeQrToSvgPath} (geometry) and {@link buildQrSvg}
 * (a full `<svg>` string) so the React surface stays declarative and testable.
 */

// ─── Reed–Solomon + bit helpers ─────────────────────────────────────────────

/** Error-correction level. We use MEDIUM (~15%) — robust for a printed standee. */
const ECC_MEDIUM = { ordinal: 0, formatBits: 0 } as const;

/** Per-version, per-ECC number of error-correction codewords (MEDIUM column). */
// Subset of the QR spec tables — index by version (1..40). We only need the
// MEDIUM level. Values from ISO/IEC 18004 (Nayuki reference tables).
const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17,
  18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

/** Galois-field multiply over GF(2^8) with the QR primitive polynomial. */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Compute the Reed–Solomon divisor (generator) polynomial of the given degree. */
function reedSolomonComputeDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Compute the RS error-correction codewords for a data block. */
function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < result.length; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

// ─── Bit buffer ─────────────────────────────────────────────────────────────

function appendBits(value: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) {
    bb.push((value >>> i) & 1);
  }
}

// ─── Version capacity ───────────────────────────────────────────────────────

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(version: number): number {
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK_M[version] * NUM_ERROR_CORRECTION_BLOCKS_M[version]
  );
}

// ─── QR matrix builder ──────────────────────────────────────────────────────

interface QrMatrix {
  size: number;
  /** Row-major boolean modules (true = dark). */
  modules: boolean[][];
}

function buildMatrix(version: number, allCodewords: number[]): QrMatrix {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  const setFunctionModule = (x: number, y: number, isDark: boolean): void => {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  // Finder pattern + separators.
  const drawFinder = (x: number, y: number): void => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
          setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Alignment patterns.
  const getAlignmentPatternPositions = (): number[] => {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const step =
      version === 32
        ? 26
        : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result: number[] = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  };
  const drawAlignment = (x: number, y: number): void => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
        );
      }
    }
  };
  const alignPositions = getAlignmentPatternPositions();
  const numAlign = alignPositions.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      // Skip the three corners overlapping the finder patterns.
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === numAlign - 1) ||
        (i === numAlign - 1 && j === 0)
      ) {
        continue;
      }
      drawAlignment(alignPositions[i], alignPositions[j]);
    }
  }

  // Reserve format-info modules (filled after masking).
  const drawFormatBits = (mask: number): void => {
    const data = (ECC_MEDIUM.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, ((bits >>> i) & 1) !== 0);
    setFunctionModule(8, 7, ((bits >>> 6) & 1) !== 0);
    setFunctionModule(8, 8, ((bits >>> 7) & 1) !== 0);
    setFunctionModule(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++)
      setFunctionModule(14 - i, 8, ((bits >>> i) & 1) !== 0);

    for (let i = 0; i < 8; i++)
      setFunctionModule(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++)
      setFunctionModule(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
    setFunctionModule(8, size - 8, true); // Always-dark module.
  };
  drawFormatBits(0); // Reserve cells; real mask written later.

  // Version info (version >= 7).
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  // Draw the data codewords (zig-zag) over the non-function modules.
  let i = 0; // Bit index into the codeword sequence.
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip the vertical timing column.
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < allCodewords.length * 8) {
          modules[y][x] = ((allCodewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  // Mask selection: try all 8 masks, pick the lowest penalty.
  const applyMask = (mask: number): void => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = false;
        }
        if (invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  const getPenalty = (): number => {
    let penalty = 0;
    // Adjacent modules in rows/columns with the same color.
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runLen = 0;
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty++;
        } else {
          runColor = modules[y][x];
          runLen = 1;
        }
      }
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runLen = 0;
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty++;
        } else {
          runColor = modules[y][x];
          runLen = 1;
        }
      }
    }
    // 2x2 blocks of the same color.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          penalty += 3;
        }
      }
    }
    // Proportion of dark modules.
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    penalty += k * 10;
    return penalty;
  };

  let bestMask = 0;
  let minPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormatBits(mask);
    const penalty = getPenalty();
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask); // Undo (XOR is its own inverse).
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);

  return { size, modules };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Encode `text` (UTF-8, byte mode) into a QR matrix and return its size and
 * dark-module geometry as an SVG path string (1 module = 1 user unit).
 *
 * Throws if the text is too long for the largest version at MEDIUM ECC — the
 * campaign URLs we encode are far below that limit.
 */
export function encodeQrToSvgPath(text: string): { size: number; path: string } {
  // UTF-8 encode the text into bytes (byte mode).
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >>> 18),
        0x80 | ((cp >>> 12) & 0x3f),
        0x80 | ((cp >>> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }

  // Pick the smallest version (1..40) that fits the byte segment at MEDIUM ECC.
  const charCountBits = (version: number): number => (version <= 9 ? 8 : 16);
  let version = 1;
  for (; version <= 40; version++) {
    const capacityBits = getNumDataCodewords(version) * 8;
    const usedBits = 4 + charCountBits(version) + bytes.length * 8;
    if (usedBits <= capacityBits) break;
  }
  if (version > 40) {
    throw new Error('QR data too long to encode');
  }

  // Build the bit stream: mode indicator (byte=0100) + length + data.
  const bb: number[] = [];
  appendBits(0x4, 4, bb); // Byte mode.
  appendBits(bytes.length, charCountBits(version), bb);
  for (const b of bytes) appendBits(b, 8, bb);

  const dataCapacityBits = getNumDataCodewords(version) * 8;
  // Terminator (up to 4 zero bits).
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  // Pad to a byte boundary.
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  // Pad with alternating bytes until the capacity is filled.
  for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
    appendBits(padByte, 8, bb);
  }

  // Pack bits into data codewords.
  const dataCodewords: number[] = new Array<number>(bb.length / 8).fill(0);
  for (let k = 0; k < bb.length; k++) {
    dataCodewords[k >>> 3] |= bb[k] << (7 - (k & 7));
  }

  // Split into blocks and append Reed–Solomon error correction.
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);
  let off = 0;
  for (let b = 0; b < numBlocks; b++) {
    const dataLen = shortBlockLen - blockEccLen + (b < numShortBlocks ? 0 : 1);
    const dat = dataCodewords.slice(off, off + dataLen);
    off += dataLen;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    blocks.push(dat.concat(ecc));
  }

  // Interleave the blocks into the final codeword sequence.
  const allCodewords: number[] = [];
  for (let k = 0; k < blocks[0].length; k++) {
    for (let b = 0; b < blocks.length; b++) {
      // Short blocks have no extra data codeword at index shortBlockLen-blockEccLen.
      if (k !== shortBlockLen - blockEccLen || b >= numShortBlocks) {
        allCodewords.push(blocks[b][k]);
      }
    }
  }

  const { size, modules } = buildMatrix(version, allCodewords);

  // Emit one SVG sub-path (a unit square) per dark module.
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return { size, path: parts.join('') };
}

/**
 * Build a complete, self-describing `<svg>` string for `text` with a quiet zone
 * (the mandatory 4-module light border) and a white background, so the QR scans
 * reliably both on screen and in print. The SVG scales crisply to any physical
 * size for the standee.
 *
 * @param text   the payload to encode (the stable salon QR payload).
 * @param title  an accessible title rendered as `<title>` inside the SVG.
 */
export function buildQrSvg(text: string, title?: string): string {
  const { size, path } = encodeQrToSvgPath(text);
  const quiet = 4;
  const dim = size + quiet * 2;
  const titleEl = title
    ? `<title>${title.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)}</title>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `shape-rendering="crispEdges" role="img">` +
    titleEl +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path transform="translate(${quiet} ${quiet})" d="${path}" fill="#000000"/>` +
    `</svg>`
  );
}
