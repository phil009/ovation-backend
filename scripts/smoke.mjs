// End-to-end smoke test: walks the whole API against a running server and prints PASS/FAIL.
// Run with: pnpm test:smoke   (needs the API running and Postgres up; no seed data needed)
// It registers its own throwaway users (*@smoke.test) and organisations each run.
// Point it elsewhere with API_URL=http://host:port/api. Never run it against production.
import ExcelJS from 'exceljs';

const B = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 5000}/api`;
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra ? '  -> ' + extra : ''}`);
};
async function call(method, path, { token, body } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers, raw: text };
}
const rnd = () => crypto.randomUUID().slice(0, 8);
const PW = 'smoke-pass-123';
async function register(name) {
  const email = `${name.toLowerCase()}-${rnd()}@smoke.test`;
  const r = await call('POST', '/auth/register', { body: { name, email, password: PW } });
  return { ...r.json, status: r.status, email, token: r.json.accessToken, id: r.json.user?.id };
}
const statuses = (rs) => rs.map((r) => r.status).join(',');

// ───────────── 1. accounts ─────────────
const A = await register('Admin');
const T = A.token;
check('register -> 201 with tokens', A.status === 201 && !!A.accessToken && !!A.refreshToken, String(A.status));
check('register same email (any case) -> 409', (await call('POST', '/auth/register', { body: { name: 'x', email: A.email.toUpperCase(), password: PW } })).status === 409);
check('register short password -> 400', (await call('POST', '/auth/register', { body: { name: 'x', email: `s-${rnd()}@smoke.test`, password: 'short' } })).status === 400);
check('login -> 201', (await call('POST', '/auth/login', { body: { email: A.email, password: PW } })).status === 201);
check('login wrong password -> 401', (await call('POST', '/auth/login', { body: { email: A.email, password: 'wrong-password-xyz' } })).status === 401);
check('login unknown email -> 401 (same answer)', (await call('POST', '/auth/login', { body: { email: `nobody-${rnd()}@smoke.test`, password: PW } })).status === 401);
check('login short password -> 400', (await call('POST', '/auth/login', { body: { email: A.email, password: 'short' } })).status === 400);
check('me without token -> 401', (await call('GET', '/auth/me')).status === 401);
const me0 = await call('GET', '/auth/me', { token: T });
check('me -> 200, no organisations yet', me0.status === 200 && me0.json.memberships?.length === 0, me0.raw);

// ───────────── 2. organisations ─────────────
const org = await call('POST', '/orgs', { token: T, body: { name: 'Smoke Town Union' } });
check('create org -> 201, creator is ADMIN', org.status === 201 && org.json.myRole === 'ADMIN', org.raw);
const O = org.json.id;
const me1 = await call('GET', '/auth/me', { token: T });
check('me lists the org with role ADMIN', me1.json.memberships?.[0]?.organization?.id === O && me1.json.memberships[0].role === 'ADMIN');
check('GET /orgs lists my orgs', (await call('GET', '/orgs', { token: T })).json.some?.((o) => o.id === O));
check('rename org -> 200', (await call('PATCH', `/orgs/${O}`, { token: T, body: { name: 'Smoke Town Union (Lagos)' } })).json.name === 'Smoke Town Union (Lagos)');

// ───────────── 3. event, awardee, donations ─────────────
const ev = await call('POST', `/orgs/${O}/events`, { token: T, body: { name: 'Smoke Test Day', date: '2026-11-08' } });
check('create event in org -> 201', ev.status === 201 && ev.json.organizationId === O, ev.raw);
const E = ev.json.id;
check('list org events', (await call('GET', `/orgs/${O}/events`, { token: T })).json.some?.((e) => e.id === E));
const aw = await call('POST', `/events/${E}/awardees`, { token: T, body: { number: 1, name: 'Chief Test', amountKobo: '300000000', paymentMode: 'TRANSFER' } });
check('create awardee -> 201, amount as string', aw.status === 201 && aw.json.amountKobo === '300000000', aw.raw);
const A1 = aw.json.id;
const d1 = crypto.randomUUID(), d2 = crypto.randomUUID(), d3 = crypto.randomUUID();
const batch = { donations: [
  { id: d1, eventId: E, awardeeId: A1, donorName: 'Mrs Okafor', amountKobo: '5000000', paymentMode: 'TRANSFER' },
  { id: d2, eventId: E, awardeeId: A1, donorName: 'Mr Eze', amountKobo: '2000000', paymentMode: 'PLEDGE' },
  { id: d3, eventId: E, donorName: 'For all awardees', amountKobo: '10000000', paymentMode: 'CASH' },
] };
const b1 = await call('POST', '/donations/batch', { token: T, body: batch });
check('batch -> 200, 3 created', b1.status === 200 && b1.json.created?.length === 3, b1.raw);
const b2 = await call('POST', '/donations/batch', { token: T, body: batch });
check('resend batch -> 0 created, 3 duplicates', b2.json.created?.length === 0 && b2.json.duplicates?.length === 3, b2.raw);
const single = await call('POST', '/donations', { token: T, body: batch.donations[0] });
check('single create with existing id returns existing', single.json.id === d1 && single.json.version === 1, single.raw);

const s = await call('GET', `/events/${E}/summary`, { token: T });
const a0 = s.json.awardees?.[0];
check('summary per awardee: 3,000,000 + 70,000', a0?.awardeeKobo === '300000000' && a0?.supportersKobo === '7000000' && a0?.totalKobo === '307000000' && a0?.supporterCount === 2, JSON.stringify(a0));
check('summary general = 100,000', s.json.general?.totalKobo === '10000000', JSON.stringify(s.json.general));
check('summary grand total 3,170,000; pledged 20,000', s.json.totals?.totalKobo === '317000000' && s.json.totals?.pledgedKobo === '2000000' && s.json.totals?.receivedKobo === '315000000', JSON.stringify(s.json.totals));

const u1 = await call('PATCH', `/donations/${d1}`, { token: T, body: { version: 1, note: 'checked' } });
check('update at current version -> 200, version 2', u1.status === 200 && u1.json.version === 2, u1.raw);
check('update at stale version -> 409', (await call('PATCH', `/donations/${d1}`, { token: T, body: { version: 1, note: 'stale' } })).status === 409);
check('decimal amount -> 400', (await call('POST', '/donations', { token: T, body: { ...batch.donations[0], id: crypto.randomUUID(), amountKobo: '50.5' } })).status === 400);
check('awardee delete with donations -> 409', (await call('DELETE', `/events/${E}/awardees/${A1}`, { token: T })).status === 409);
check('delete donation -> 204', (await call('DELETE', `/donations/${d2}`, { token: T })).status === 204);
check('deleted donation -> 404', (await call('GET', `/donations/${d2}`, { token: T })).status === 404);
const list = await call('GET', `/donations?eventId=${E}&limit=10`, { token: T });
check('list -> 2 live donations', list.json.total === 2, list.raw.slice(0, 120));
check('close event -> 200', (await call('PATCH', `/events/${E}/close`, { token: T })).status === 200);
check('write to closed event -> 409', (await call('POST', '/donations', { token: T, body: { ...batch.donations[0], id: crypto.randomUUID() } })).status === 409);
check('reopen event -> 200', (await call('PATCH', `/events/${E}/reopen`, { token: T })).status === 200);

// ───────────── 4. invite codes ─────────────
const inv1 = await call('POST', `/orgs/${O}/invites`, { token: T, body: { role: 'EDITOR', maxUses: 1 } });
check('create invite -> 201, OVN-XXXX-XXXX, 7-day expiry', inv1.status === 201 && /^OVN-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inv1.json.code) && inv1.json.status === 'ACTIVE' && !!inv1.json.expiresAt, inv1.raw);
check('invite with role ADMIN -> 400', (await call('POST', `/orgs/${O}/invites`, { token: T, body: { role: 'ADMIN' } })).status === 400);
const Bu = await register('Editor');
const sloppy = inv1.json.code.toLowerCase().replace(/-/g, ' '); // as typed from a WhatsApp message
const prev = await call('POST', '/invites/preview', { token: Bu.token, body: { code: sloppy } });
check('preview (lowercase, spaces) -> org name and role', prev.status === 200 && prev.json.organization?.id === O && prev.json.role === 'EDITOR' && prev.json.alreadyMember === false, prev.raw);
const join1 = await call('POST', '/invites/accept', { token: Bu.token, body: { code: inv1.json.code } });
check('accept -> 201 as EDITOR', join1.status === 201 && join1.json.role === 'EDITOR' && join1.json.organization?.id === O, join1.raw);
const Cu = await register('Viewer');
check('single-use code used again -> 410 Gone', (await call('POST', '/invites/accept', { token: Cu.token, body: { code: inv1.json.code } })).status === 410);
const inv2 = await call('POST', `/orgs/${O}/invites`, { token: T, body: { role: 'VIEWER' } });
check('accept unlimited viewer code -> VIEWER', (await call('POST', '/invites/accept', { token: Cu.token, body: { code: inv2.json.code } })).json.role === 'VIEWER');
check('accept when already a member -> 409', (await call('POST', '/invites/accept', { token: T, body: { code: inv2.json.code } })).status === 409);
check('unknown code -> 404', (await call('POST', '/invites/accept', { token: Cu.token, body: { code: 'OVN-AAAA-AAAA' } })).status === 404);
const inv3 = await call('POST', `/orgs/${O}/invites`, { token: T, body: { role: 'EDITOR' } });
const rev = await call('DELETE', `/orgs/${O}/invites/${inv3.json.id}`, { token: T });
check('revoke invite -> status REVOKED', rev.status === 200 && rev.json.status === 'REVOKED', rev.raw);
const Du = await register('Late');
check('revoked code -> 410', (await call('POST', '/invites/accept', { token: Du.token, body: { code: inv3.json.code } })).status === 410);
check('editor creating an invite -> 403', (await call('POST', `/orgs/${O}/invites`, { token: Bu.token, body: { role: 'VIEWER' } })).status === 403);
const invs = await call('GET', `/orgs/${O}/invites`, { token: T });
check('list invites shows USED_UP / ACTIVE / REVOKED', ['USED_UP', 'ACTIVE', 'REVOKED'].every((st) => invs.json.some?.((i) => i.status === st)), invs.raw.slice(0, 200));

// race: a single-use code, five people at once
const inv4 = await call('POST', `/orgs/${O}/invites`, { token: T, body: { role: 'VIEWER', maxUses: 1 } });
const racers = await Promise.all(Array.from({ length: 5 }, (_, i) => register(`Racer${i}`)));
const joins = await Promise.all(racers.map((r) => call('POST', '/invites/accept', { token: r.token, body: { code: inv4.json.code } })));
check('race: 5 accept a single-use code at once -> one 201, four 410', joins.filter((r) => r.status === 201).length === 1 && joins.filter((r) => r.status === 410).length === 4, statuses(joins));
const winner = racers[joins.findIndex((r) => r.status === 201)];

// ───────────── 5. roles inside the org ─────────────
check('editor deleting a donation -> 403', (await call('DELETE', `/donations/${d3}`, { token: Bu.token })).status === 403);
check('editor creating an awardee -> 201', (await call('POST', `/events/${E}/awardees`, { token: Bu.token, body: { name: 'Editor Awardee' } })).status === 201);
check('editor adding a donation -> 201', (await call('POST', '/donations', { token: Bu.token, body: { id: crypto.randomUUID(), eventId: E, donorName: 'Via editor', amountKobo: '100000', paymentMode: 'CASH' } })).status === 201);
check('viewer creating an awardee -> 403', (await call('POST', `/events/${E}/awardees`, { token: Cu.token, body: { name: 'Nope' } })).status === 403);
check('viewer reading summary -> 200', (await call('GET', `/events/${E}/summary`, { token: Cu.token })).status === 200);
check('viewer listing donations -> 200', (await call('GET', `/donations?eventId=${E}`, { token: Cu.token })).status === 200);
check('viewer reading audit log -> 403', (await call('GET', `/orgs/${O}/audit-log`, { token: Cu.token })).status === 403);
check('viewer listing members -> 403', (await call('GET', `/orgs/${O}/members`, { token: Cu.token })).status === 403);

// ───────────── 6. isolation between organisations ─────────────
const X = await register('Outsider');
const XO = (await call('POST', '/orgs', { token: X.token, body: { name: 'Other Org' } })).json.id;
const XE = (await call('POST', `/orgs/${XO}/events`, { token: X.token, body: { name: 'Other Event', date: '2026-12-01' } })).json.id;
const outsider = await Promise.all([
  call('GET', `/orgs/${O}`, { token: X.token }),
  call('GET', `/orgs/${O}/events`, { token: X.token }),
  call('POST', `/orgs/${O}/events`, { token: X.token, body: { name: 'Sneaky', date: '2026-12-01' } }),
  call('GET', `/orgs/${O}/members`, { token: X.token }),
  call('GET', `/orgs/${O}/audit-log`, { token: X.token }),
  call('GET', `/events/${E}`, { token: X.token }),
  call('GET', `/events/${E}/summary`, { token: X.token }),
  call('GET', `/events/${E}/export.xlsx`, { token: X.token }),
  call('GET', `/events/${E}/awardees`, { token: X.token }),
  call('GET', `/donations?eventId=${E}`, { token: X.token }),
  call('GET', `/donations/${d1}`, { token: X.token }),
  call('PATCH', `/donations/${d1}`, { token: X.token, body: { version: 2, note: 'hacked' } }),
  call('POST', '/donations', { token: X.token, body: { id: crypto.randomUUID(), eventId: E, donorName: 'x', amountKobo: '100', paymentMode: 'CASH' } }),
]);
check('outsider gets 404 on all 13 routes into another org', outsider.every((r) => r.status === 404), statuses(outsider));
const sneakyId = crypto.randomUUID();
const mixed = await call('POST', '/donations/batch', { token: X.token, body: { donations: [
  { id: sneakyId, eventId: XE, donorName: 'Mine', amountKobo: '100', paymentMode: 'CASH' },
  { id: crypto.randomUUID(), eventId: E, donorName: 'Theirs', amountKobo: '100', paymentMode: 'CASH' },
] } });
check('batch mixing own and foreign events -> 404, nothing saved', mixed.status === 404 && (await call('GET', `/donations/${sneakyId}`, { token: X.token })).status === 404, String(mixed.status));
check('awardee from another org can\'t be used', (await call('POST', '/donations', { token: X.token, body: { id: crypto.randomUUID(), eventId: XE, awardeeId: A1, donorName: 'x', amountKobo: '100', paymentMode: 'CASH' } })).status === 404);

// ───────────── 7. members ─────────────
const mem = await call('GET', `/orgs/${O}/members`, { token: T });
check('list members -> admin, editor, viewer, race winner', mem.status === 200 && mem.json.length === 4, mem.raw.slice(0, 200));
check('only admin demoting themselves -> 409', (await call('PATCH', `/orgs/${O}/members/${A.id}`, { token: T, body: { role: 'EDITOR' } })).status === 409);
check('only admin leaving -> 409', (await call('DELETE', `/orgs/${O}/members/${A.id}`, { token: T })).status === 409);
check('editor removing someone else -> 403', (await call('DELETE', `/orgs/${O}/members/${Cu.id}`, { token: Bu.token })).status === 403);
const promo = await call('PATCH', `/orgs/${O}/members/${Cu.id}`, { token: T, body: { role: 'EDITOR' } });
check('admin promotes viewer to editor', promo.status === 200 && promo.json.role === 'EDITOR', promo.raw);
check('promoted member can now write', (await call('POST', `/events/${E}/awardees`, { token: Cu.token, body: { name: 'Now allowed' } })).status === 201);
check('admin removes a member -> 204', (await call('DELETE', `/orgs/${O}/members/${Cu.id}`, { token: T })).status === 204);
check('removed member loses access immediately -> 404', (await call('GET', `/events/${E}`, { token: Cu.token })).status === 404);
check('member leaves on their own -> 204', (await call('DELETE', `/orgs/${O}/members/${winner.id}`, { token: winner.token })).status === 204);

// ───────────── 8. audit log ─────────────
const auditFor = async (entity, id) => (await call('GET', `/orgs/${O}/audit-log?entity=${entity}&entityId=${id}`, { token: T })).json;
const evLog = await auditFor('Event', E);
check('audit: event CREATE, CLOSE, REOPEN', JSON.stringify(evLog.items?.map((i) => i.action).reverse()) === '["CREATE","CLOSE","REOPEN"]', JSON.stringify(evLog.items?.map((i) => i.action)));
const d1Log = await auditFor('Donation', d1);
check('audit: d1 CREATE + UPDATE only (replays not logged)', JSON.stringify(d1Log.items?.map((i) => i.action).reverse()) === '["CREATE","UPDATE"]', JSON.stringify(d1Log.items?.map((i) => i.action)));
const upd = d1Log.items?.find((i) => i.action === 'UPDATE');
check('audit: before/after values, kobo as string, names the user', upd?.before?.version === 1 && upd?.after?.note === 'checked' && upd?.after?.amountKobo === '5000000' && upd?.user?.email === A.email);
const del = (await auditFor('Donation', d2)).items?.find((i) => i.action === 'DELETE');
check('audit: DELETE before.deletedAt null -> after set', del && del.before.deletedAt === null && !!del.after.deletedAt);
const memLog = await call('GET', `/orgs/${O}/audit-log?entity=Membership&limit=50`, { token: T });
check('audit: joins, role change and removals are logged', ['CREATE', 'UPDATE', 'DELETE'].every((a) => memLog.json.items?.some((i) => i.action === a)), JSON.stringify(memLog.json.items?.map((i) => i.action)));
check('audit: another org\'s log has none of this org\'s entries', (await call('GET', `/orgs/${XO}/audit-log?entityId=${E}`, { token: X.token })).json.total === 0);

// ───────────── 9. concurrency ─────────────
const race = crypto.randomUUID();
const creates = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/donations', { token: T, body: { ...batch.donations[0], id: race } })));
check('race: 5 simultaneous creates of one id -> same row', creates.every((r) => r.status === 201 && r.json.id === race), statuses(creates));
check('race: ... exactly 1 CREATE audit row', (await auditFor('Donation', race)).total === 1);
const edits = await Promise.all(['A', 'B', 'C'].map((n) => call('PATCH', `/donations/${race}`, { token: T, body: { version: 1, note: n } })));
check('race: 3 simultaneous edits at version 1 -> one 200, two 409', edits.filter((r) => r.status === 200).length === 1 && edits.filter((r) => r.status === 409).length === 2, statuses(edits));

// ───────────── 10. sessions: refresh, logout, password ─────────────
const L = (await call('POST', '/auth/login', { body: { email: A.email, password: PW } })).json;
const r1 = await call('POST', '/auth/refresh', { body: { refreshToken: L.refreshToken } });
check('refresh -> 201 with a new refresh token', r1.status === 201 && r1.json.refreshToken !== L.refreshToken);
check('old refresh token after rotation -> 401', (await call('POST', '/auth/refresh', { body: { refreshToken: L.refreshToken } })).status === 401);
check('new access token works', (await call('GET', '/auth/me', { token: r1.json.accessToken })).status === 200);
check('logout -> 204', (await call('POST', '/auth/logout', { body: { refreshToken: r1.json.refreshToken } })).status === 204);
check('refresh after logout -> 401', (await call('POST', '/auth/refresh', { body: { refreshToken: r1.json.refreshToken } })).status === 401);
const S1 = (await call('POST', '/auth/login', { body: { email: Bu.email, password: PW } })).json;
const S2 = (await call('POST', '/auth/login', { body: { email: Bu.email, password: PW } })).json;
check('logout-all -> 204', (await call('POST', '/auth/logout-all', { token: S1.accessToken })).status === 204);
const afterAll = await Promise.all([S1, S2, Bu].map((s) => call('POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } })));
check('every session of that user is ended', afterAll.every((r) => r.status === 401), statuses(afterAll));
const P = await register('Pw');
check('change password with wrong current -> 401', (await call('PATCH', '/auth/password', { token: P.token, body: { currentPassword: 'not-it-123', newPassword: 'new-pass-456' } })).status === 401);
const pc = await call('PATCH', '/auth/password', { token: P.token, body: { currentPassword: PW, newPassword: 'new-pass-456' } });
check('change password -> 200 with fresh tokens', pc.status === 200 && !!pc.json.refreshToken, pc.raw);
check('old sessions ended after password change', (await call('POST', '/auth/refresh', { body: { refreshToken: P.refreshToken } })).status === 401);
check('old password -> 401, new password -> 201',
  (await call('POST', '/auth/login', { body: { email: P.email, password: PW } })).status === 401 &&
  (await call('POST', '/auth/login', { body: { email: P.email, password: 'new-pass-456' } })).status === 201);

// ───────────── 11. Excel export ─────────────
await call('POST', '/donations', { token: T, body: { id: crypto.randomUUID(), eventId: E, awardeeId: A1, donorName: 'Hard to read', amountKobo: '1500000', paymentMode: 'CASH', needsReview: true, note: 'amount unclear: 15k or 75k?' } });
const sum2 = (await call('GET', `/events/${E}/summary`, { token: T })).json;
const xres = await fetch(`${B}/events/${E}/export.xlsx`, { headers: { authorization: 'Bearer ' + T } });
check('export -> 200 xlsx attachment', xres.status === 200 && xres.headers.get('content-type')?.includes('spreadsheetml') && /attachment; filename="smoke-test-day-2026-11-08\.xlsx"/.test(xres.headers.get('content-disposition') ?? ''), `${xres.status} ${xres.headers.get('content-disposition')}`);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(await xres.arrayBuffer()));
const ws = wb.getWorksheet('Donations');
const rows = [];
ws?.eachRow((row) => rows.push(row));
const find = (label) => rows.find((r) => r.getCell(1).value === label);
const val = (cell) => (typeof cell.value === 'object' && cell.value !== null ? cell.value.result : cell.value);
const header = rows.find((r) => r.number === 3);
check('sheet "Donations" with the 10 client columns', header?.getCell(1).value === 'Awardee' && header?.getCell(10).value === 'Notes');
check('awardee row "1. Chief Test" with ₦3,000,000', rows.some((r) => r.getCell(1).value === '1. Chief Test' && r.getCell(2).value === 3000000));
const totalRow = find('Total: Chief Test');
check('awardee Total row uses formulas', typeof totalRow?.getCell(5).value?.formula === 'string' && typeof totalRow?.getCell(7).value?.formula === 'string');
const aSum = sum2.awardees.find((a) => a.id === A1);
check('awardee Total row matches the API summary', val(totalRow.getCell(7)) === Number(aSum.totalKobo) / 100, `${val(totalRow.getCell(7))} vs ${Number(aSum.totalKobo) / 100}`);
check('Everything = API grand total', val(find('Everything').getCell(7)) === Number(sum2.totals.totalKobo) / 100, `${val(find('Everything').getCell(7))} vs ${Number(sum2.totals.totalKobo) / 100}`);
check('general donations total matches', val(find('Total: general donations').getCell(7)) === Number(sum2.general.totalKobo) / 100);
const flagged = rows.find((r) => r.getCell(4).value === 'Hard to read');
check('doubtful entry has CHECK flag and the note', flagged?.getCell(9).value === 'CHECK' && /unclear/.test(flagged?.getCell(10).value ?? ''));

// ───────────── 12. hardening ─────────────
const health = await fetch(`${B}/health`);
check('health -> 200, database up', health.status === 200 && (await health.json()).info?.database?.status === 'up');
check('helmet headers present (nosniff, no X-Powered-By)', health.headers.get('x-content-type-options') === 'nosniff' && !health.headers.has('x-powered-by'));
const rlEmail = `ratelimit-${rnd()}@smoke.test`;
const hammer = [];
for (let i = 0; i < 12; i++) hammer.push((await call('POST', '/auth/login', { body: { email: rlEmail, password: 'guessing-123' } })).status);
check('login guessing is rate limited (429)', hammer.includes(429) && hammer.at(-1) === 429, hammer.join(','));

// ───────────── 13. docs + SDK ─────────────
// Production switches both off. Tell the test what to expect: EXPECT_DOCS=false / EXPECT_SDK=false.
const expectDocs = process.env.EXPECT_DOCS !== 'false';
const expectSdk = process.env.EXPECT_SDK !== 'false';
const docs = await fetch(`${B}/docs`);
check(expectDocs ? '/api/docs -> 200' : '/api/docs switched off -> 404', docs.status === (expectDocs ? 200 : 404), String(docs.status));
const sdk = await fetch(B + '/sdk/typescript.zip');
const zip = Buffer.from(await sdk.arrayBuffer());
check(expectSdk ? 'SDK zip -> 200' : 'SDK download switched off -> 404',
  expectSdk ? sdk.status === 200 && zip.subarray(0, 2).toString() === 'PK' : sdk.status === 404, `${sdk.status} ${zip.length} bytes`);

console.log(`\n${pass} passed, ${fail} failed. Org ${O}, event ${E}`);
process.exitCode = fail > 0 ? 1 : 0; // non-zero exit so CI or scripts can tell it failed
