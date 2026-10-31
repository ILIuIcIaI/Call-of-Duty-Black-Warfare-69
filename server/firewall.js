// =============================================================================
// Windows only. Before anybody can get into a room on this computer the firewall has to let Node.js through, and a
// network set to "public" keeps everybody out even after a yes for private networks. This looks at how things stand and
// lets whoever sits at this computer fix it with one click. Windows asks for the rights itself, and the rule only covers
// devices in the same network.
// =============================================================================
const { execFile } = require('child_process');

const RULE = 'Black Warfare 69';
const quoted = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const NODE = quoted(process.execPath);

const LOOK = `$n=${NODE};
$cat=@(Get-NetConnectionProfile | ForEach-Object { @{ i=[string]$_.InterfaceAlias; c=[string]$_.NetworkCategory } });
$off=@(Get-NetFirewallProfile | Where-Object { -not $_.Enabled -or $_.DefaultInboundAction -eq 'Allow' } | ForEach-Object { [string]$_.Name });
$rules=@(Get-NetFirewallApplicationFilter -Program $n -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' } | ForEach-Object { @{ a=[string]$_.Action; p=[string]$_.Profile } });
@{ cat=$cat; off=$off; rules=$rules } | ConvertTo-Json -Compress -Depth 4`;

// (a block rule beats every allow rule, and that is what a "no" for public networks leaves behind)
const OPEN = `$n=${NODE};
Get-NetFirewallApplicationFilter -Program $n -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule;
Get-NetFirewallRule -DisplayName ${quoted(RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule;
New-NetFirewallRule -DisplayName ${quoted(RULE)} -Direction Inbound -Action Allow -Program $n -RemoteAddress LocalSubnet -Profile Any | Out-Null`;

const powershell = (script, done) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 120000 }, done);
const covers = (rule, cat) => rule.p === 'Any' || rule.p.split(/,\s*/).includes(cat);

// 'ok', 'blocked', or null if there is nothing to say. adapter: the one the others come in through.
function verdict(o, adapter) {
  const list = [].concat(o.cat || []), mine = list.filter((c) => c.i === adapter), off = [].concat(o.off || []), rules = [].concat(o.rules || []);
  const cats = (mine.length ? mine : list).map((c) => (c.c === 'DomainAuthenticated' ? 'Domain' : c.c));
  if (!cats.length) return null;
  const open = (c) => off.includes(c) || (rules.some((r) => r.a === 'Allow' && covers(r, c)) && !rules.some((r) => r.a === 'Block' && covers(r, c)));
  return cats.every(open) ? 'ok' : 'blocked';
}

function check(adapter, done) {
  if (process.platform !== 'win32') return done(null);
  powershell(LOOK, (err, out) => {
    if (err) return done(null);
    try { done(verdict(JSON.parse(out), adapter)); } catch (e) { done(null); }
  });
}

function open(done) {
  if (process.platform !== 'win32') return done(false);
  const code = Buffer.from(OPEN, 'utf16le').toString('base64');
  powershell(`Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ErrorAction Stop -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${code}'`, (err) => done(!err));
}

module.exports = { check, open, verdict, LOOK, OPEN };
