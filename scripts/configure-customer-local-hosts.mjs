import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dryRun = process.argv.includes('--dry-run');
const tenants = [...new Set(process.argv.slice(2).filter(arg => arg !== '--dry-run').map(arg => arg.toLowerCase()))];
if (!tenants.length || tenants.some(tenant => tenant.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(tenant))) {
  console.error('Uso: node scripts/configure-customer-local-hosts.mjs [--dry-run] <tenant> [altri tenant]');
  process.exit(1);
}
const hostsFile = process.env.CUSTOMER_LOCAL_HOSTS_FILE || '/etc/hosts';
const current = fs.readFileSync(hostsFile, 'utf8');
const entries = current.split('\n').map(line => line.split('#')[0].trim().split(/\s+/));
const additions = tenants.flatMap(tenant => ['127.0.0.1', '::1']
  .filter(ip => !entries.some(([address, ...hosts]) => address === ip && hosts.includes(`${tenant}.customer.local`)))
  .map(ip => `${ip}\t${tenant}.customer.local`));
if (!additions.length) {
  console.log('Domini clienti locali già configurati.');
} else if (dryRun) {
  console.log(additions.join('\n'));
} else {
  try {
    fs.appendFileSync(hostsFile, `\n# MVanager: portale clienti locale\n${additions.join('\n')}\n`);
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    console.error('La modifica di /etc/hosts richiede privilegi amministrativi: esegui lo stesso comando con sudo.');
    process.exit(1);
  }
  if (process.platform === 'darwin' && hostsFile === '/etc/hosts') {
    for (const [command, args] of [['/usr/bin/dscacheutil', ['-flushcache']], ['/usr/bin/killall', ['-HUP', 'mDNSResponder']]]) {
      try { execFileSync(command, args, { stdio: 'ignore' }); }
      catch { console.warn('Domini registrati; potrebbe essere necessario riaprire il browser per aggiornare la cache DNS.'); }
    }
  }
  console.log(`Domini registrati: ${tenants.map(tenant => `${tenant}.customer.local`).join(', ')}`);
}
