import fs from 'fs';
import path from 'path';

const DIRS = ['content/concepts', 'content/autopsies'];

for (const dir of DIRS) {
  for (const file of fs.readdirSync(dir).filter((f) => /\.mdx?$/.test(f)).sort()) {
    const full = path.join(dir, file);
    const raw = fs.readFileSync(full, 'utf-8');
    if (/^proof_status:/m.test(raw.split('\n---')[0])) continue; // idempotent
    // Insert right after the last_verified_at line of the frontmatter.
    const next = raw.replace(/^(last_verified_at:.*)$/m, `$1\nproof_status: unverified`);
    if (next === raw) throw new Error(`No last_verified_at line in ${full}`);
    fs.writeFileSync(full, next);
  }
}
console.log('proof_status: unverified added');
