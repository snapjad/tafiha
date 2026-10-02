// Reproduce pinned, integrity-checked browser assets from the official npm registry.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const packages = [
  { name: 'jspdf', version: '4.2.1', source: 'dist/jspdf.umd.min.js', integrity: 'YyAXyvnmjTbR4bHQRLzex3CuINCDlQnBqoSYyjJwTP2x9jDLuKDzy7aKUl0hgx3uhcl7xzg32agn5vlie6HIlQ==' },
  { name: 'html2canvas', version: '1.4.1', source: 'dist/html2canvas.min.js', integrity: 'fPU6BHNpsyIhr8yyMpTLLxAbkaK8ArIBcmZIRiBLiDhjeqvXolaEmDGmELFuX9I4xDcaKKcJl+TKZLqruBbmWA==' },
];
const manifest = [];
for (const p of packages) {
  const url = `https://registry.npmjs.org/${p.name}/-/${p.name}-${p.version}.tgz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Download failed: ${p.name}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (createHash('sha512').update(data).digest('base64') !== p.integrity) throw new Error(`Integrity mismatch: ${p.name}`);
  const dir = new URL(`.qa/vendor-${p.name}-${p.version}/`, root);
  await mkdir(dir, { recursive: true });
  const archive = new URL('package.tgz', dir);
  await writeFile(archive, data);
  execFileSync('tar', ['-xzf', fileURLToPath(archive), '-C', fileURLToPath(dir), `package/${p.source}`, 'package/LICENSE']);
  const target = new URL(`js/vendor/${p.name}.js`, root);
  await copyFile(new URL(`package/${p.source}`, dir), target);
  await copyFile(new URL('package/LICENSE', dir), new URL(`js/vendor/${p.name}.LICENSE`, root));
  manifest.push({ name: p.name, version: p.version, url, integrity: `sha512-${p.integrity}`, sha256: createHash('sha256').update(await readFile(target)).digest('hex') });
  console.log(`Verified ${p.name}@${p.version}`);
}
await writeFile(new URL('js/vendor/pdf-manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
