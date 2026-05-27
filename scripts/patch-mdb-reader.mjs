import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tablePath = join(__dirname, '..', 'node_modules', 'mdb-reader', 'lib', 'node', 'Table.js');

try {
  let code = readFileSync(tablePath, 'utf-8');

  // Skip if already patched
  if (code.includes('if (pageBuffer === null) continue;')) {
    console.log('[patch-mdb-reader] Already patched, skipping.');
    process.exit(0);
  }

  // Patch 1: #getDataPage — return null on wrong page type instead of throw
  const oldGetDataPage = `    #getDataPage(page) {
        const pageBuffer = this.#database.getPage(page);
        assertPageType(pageBuffer, PageType.DataPage);
        if (pageBuffer.readUInt32LE(4) !== this.#firstDefinitionPage) {
            throw new Error(\`Data page \${page} does not belong to table \${this.#name}\`);
        }
        return pageBuffer;
    }`;

  const newGetDataPage = `    #getDataPage(page) {
        const pageBuffer = this.#database.getPage(page);
        if (pageBuffer[0] !== PageType.DataPage) {
            return null;
        }
        if (pageBuffer.readUInt32LE(4) !== this.#firstDefinitionPage) {
            return null;
        }
        return pageBuffer;
    }`;

  if (code.includes(oldGetDataPage)) {
    code = code.replace(oldGetDataPage, newGetDataPage);
  } else {
    console.error('[patch-mdb-reader] Could not find #getDataPage pattern. The file may have changed.');
    process.exit(1);
  }

  // Patch 2: getData — skip null pageBuffer
  code = code.replace(
    `const pageBuffer = this.#getDataPage(dataPage);
            const recordOffsets = this.#getRecordOffsets(pageBuffer);`,
    `const pageBuffer = this.#getDataPage(dataPage);
            if (pageBuffer === null) continue;
            const recordOffsets = this.#getRecordOffsets(pageBuffer);`
  );

  writeFileSync(tablePath, code);
  console.log('[patch-mdb-reader] mdb-reader Table.js patched successfully.');

  // Verify
  const verify = readFileSync(tablePath, 'utf-8');
  if (verify.includes('if (pageBuffer === null) continue;')) {
    console.log('[patch-mdb-reader] Verification passed.');
  } else {
    console.error('[patch-mdb-reader] Verification failed — patch may not be applied correctly.');
    process.exit(1);
  }
} catch (err) {
  console.error('[patch-mdb-reader] Error:', err.message);
  process.exit(1);
}
