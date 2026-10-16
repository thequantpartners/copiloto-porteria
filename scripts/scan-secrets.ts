import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

console.log('🔒 Starting forensic secrets and credentials audit...\n');

// 1. Audit full Git history
let gitLogDiff = '';
try {
  gitLogDiff = execSync('git log -p', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
} catch (err) {
  console.error('Error reading git history:', err);
  process.exit(1);
}

const patterns: Record<string, RegExp> = {
  'Google Gemini API Key': /AIza[0-9A-Za-z\-_]{35}/g,
  'OpenAI Standard API Key': /sk-[a-zA-Z0-9_\-]{20,}/g,
  'OpenRouter API Key': /sk-or-v1-[a-f0-9]{64}/g,
  'GitHub Personal Token': /gh[pous]_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{60,}/g,
  'Private Key Block': /BEGIN (RSA )?PRIVATE KEY/g,
  'Hardcoded Secret Assignment': /(?:api[_-]?key|auth_token|client_secret)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/gi,
};

let hasAlert = false;

console.log('--- 1. AUDIT OF FULL GIT COMMIT LOG (git log -p) ---');
for (const [name, regex] of Object.entries(patterns)) {
  const matches = gitLogDiff.match(regex);
  if (matches && matches.length > 0) {
    const realMatches = matches.filter(
      (m) => !/YOUR_|PLACEHOLDER|<your|dummy|example|fake/i.test(m)
    );
    if (realMatches.length > 0) {
      console.warn(`❌ [ALERT] Found ${realMatches.length} matches for ${name}:`);
      realMatches.slice(0, 3).forEach((m) => console.warn(`   Preview: ${m.slice(0, 15)}...`));
      hasAlert = true;
    } else {
      console.log(`✅ ${name}: 0 real matches (only placeholders/examples).`);
    }
  } else {
    console.log(`✅ ${name}: 0 matches in git history.`);
  }
}

console.log('\n--- 2. AUDIT OF TRACKED FILES ON DISK (git ls-files) ---');
const trackedFiles = execSync('git ls-files', { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Auditing ${trackedFiles.length} tracked files...`);

for (const file of trackedFiles) {
  if (!existsSync(file)) continue;
  try {
    const content = readFileSync(file, 'utf-8');
    for (const [name, regex] of Object.entries(patterns)) {
      const matches = content.match(regex);
      if (matches) {
        const real = matches.filter(
          (m) => !/YOUR_|PLACEHOLDER|<your|dummy|example|fake|model|referenceDate/i.test(m)
        );
        if (real.length > 0) {
          console.warn(`❌ [ALERT] ${file} contains potential ${name}`);
          hasAlert = true;
        }
      }
    }

    // Check for hardcoded absolute personal paths
    if (/C:\\Users\\Ken|Users\/Ken Ryzen/i.test(content)) {
      console.warn(`⚠️ [WARNING] ${file} contains personal machine path`);
      hasAlert = true;
    }
  } catch {
    // Ignore binary files
  }
}

console.log('\n--- VEREDICTO DE AUDITORÍA ---');
if (!hasAlert) {
  console.log('✅ ESTADO: 100% LIMPIO. Cero API keys, secretos o rutas privadas detectadas.');
  process.exit(0);
} else {
  console.error('❌ ESTADO: Se detectaron posibles secretos o datos sensibles.');
  process.exit(1);
}
