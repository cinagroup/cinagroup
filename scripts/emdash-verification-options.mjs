export function parseVerificationOptions(args) {
  const allowed = new Set(['--staging', '--migration-parity']);
  if (args.some((arg) => !allowed.has(arg)) || new Set(args).size !== args.length)
    throw new Error('Unexpected or duplicate verification option');
  const staging = args.includes('--staging');
  const migrationParity = args.includes('--migration-parity');
  if (migrationParity && !staging) throw new Error('Migration parity requires the staging hostname');
  return { staging, migrationParity };
}
