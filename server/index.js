import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const PORT = Number(process.env.PORT || 8787);
const JWT_SECRET = process.env.PURPOSEPAY_JWT_SECRET;
const ALLOWED_ORIGIN = process.env.PURPOSEPAY_ALLOWED_ORIGIN || '';
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!JWT_SECRET || JWT_SECRET.length < 32)) throw new Error('PURPOSEPAY_JWT_SECRET must be at least 32 characters in production');
if (!JWT_SECRET) console.warn('WARNING: development JWT secret is being used. Set PURPOSEPAY_JWT_SECRET before deployment.');
const EFFECTIVE_JWT_SECRET = JWT_SECRET || crypto.createHash('sha256').update('purposepay-local-development-secret').digest('hex');
const DB_FILE = process.env.PURPOSEPAY_DB || './purposepay.db';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const db = new Database(DB_FILE);
const loginAttempts = new Map();
function rateLimitLogin(email){const now=Date.now(); const x=loginAttempts.get(email)||{count:0,window:now}; if(now-x.window>15*60_000){x.count=0;x.window=now;} x.count++; loginAttempts.set(email,x); return x.count<=10;}
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('CUSTOMER','CONTRACTOR','MERCHANT','SCHOOL','ADMIN')),
 first_name TEXT, last_name TEXT, phone TEXT, kyc_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
 status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS kyc_documents (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), document_type TEXT NOT NULL,
 document_number TEXT NOT NULL, country_of_issue TEXT NOT NULL, issue_date TEXT, expiry_date TEXT,
 file_front_url TEXT, file_back_url TEXT, selfie_url TEXT, status TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
 review_note TEXT, reviewed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS merchants (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING', categories_json TEXT NOT NULL DEFAULT '[]',
 settlement_status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS schools (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 location TEXT NOT NULL, contractor_name TEXT, contractor_phone TEXT, description TEXT,
 status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vouchers (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), category TEXT NOT NULL,
 initial_amount INTEGER NOT NULL CHECK(initial_amount > 0), used_amount INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
 id TEXT PRIMARY KEY, voucher_id TEXT REFERENCES vouchers(id), project_id TEXT REFERENCES projects(id),
 customer_id TEXT NOT NULL REFERENCES users(id), merchant_id TEXT REFERENCES merchants(id), category TEXT,
 amount INTEGER NOT NULL CHECK(amount > 0), status TEXT NOT NULL DEFAULT 'PENDING',
 authorization_code TEXT UNIQUE, receipt_url TEXT, risk_status TEXT NOT NULL DEFAULT 'CLEAR',
 settlement_status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS school_payments (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id), school_id TEXT NOT NULL REFERENCES schools(id),
 student_name TEXT NOT NULL, student_id TEXT, term TEXT, amount INTEGER NOT NULL CHECK(amount > 0),
 status TEXT NOT NULL DEFAULT 'PENDING', receipt_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
 key TEXT PRIMARY KEY, user_id TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, status_code INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_project ON vouchers(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_documents(status);
`);

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const nowRef = (prefix) => `${prefix}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const json = (res, status, body) => { const headers={'content-type':'application/json','access-control-allow-headers':'Content-Type, Authorization, Idempotency-Key','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}; if(ALLOWED_ORIGIN) headers['access-control-allow-origin']=ALLOWED_ORIGIN; res.writeHead(status, headers); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve,reject)=>{let b=''; req.on('data',c=>{b+=c;if(b.length>1_000_000) req.destroy();}); req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}}); req.on('error',reject)});
const tokenFor = u => jwt.sign({sub:u.id,role:u.role,email:u.email}, EFFECTIVE_JWT_SECRET, {expiresIn:'8h', issuer:'purposepay', audience:'purposepay-web'});
function auth(req){const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) return null; try{return jwt.verify(h.slice(7),EFFECTIVE_JWT_SECRET,{issuer:'purposepay',audience:'purposepay-web'})}catch{return null}}
function audit(actor, action, type, entity, meta={}){db.prepare('INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)').run(id('AUD'),actor||null,action,type,entity||null,JSON.stringify(meta));}
function role(me, ...roles){return roles.includes(me.role)}
function userSafe(u){return {id:u.id,email:u.email,role:u.role,firstName:u.first_name,lastName:u.last_name,phone:u.phone,kycStatus:u.kyc_status,status:u.status,createdAt:u.created_at};}
const requestHash = b => crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
function idempotent(req,userId,body){const key=req.headers['idempotency-key']; if(!key) return null; if(key.length<8 || key.length>128) throw new Error('Invalid Idempotency-Key'); const hash=requestHash(body); const existing=db.prepare('SELECT * FROM idempotency_keys WHERE key=?').get(key); if(existing){if(existing.user_id!==userId || existing.request_hash!==hash) throw new Error('Idempotency-Key was already used with different request data'); return {status:existing.status_code,body:JSON.parse(existing.response_json)};} return {key,hash};}
function saveIdempotency(record,userId,status,body){if(!record?.key)return;db.prepare('INSERT INTO idempotency_keys(key,user_id,request_hash,response_json,status_code) VALUES(?,?,?,?,?)').run(record.key,userId,record.hash,JSON.stringify(body),status);}
function seed(){
 const admin=db.prepare("SELECT id FROM users WHERE email='admin@purposepay.test'").get();
 if(!admin){const uid=id('USR'); const hash=bcrypt.hashSync('Admin12345!',12); db.prepare('INSERT INTO users(id,email,password_hash,role,first_name,last_name,kyc_status) VALUES(?,?,?,?,?,?,?)').run(uid,'admin@purposepay.test',hash,'ADMIN','PurposePay','Admin','VERIFIED');}
 const demo=db.prepare("SELECT id FROM users WHERE email='demo@purposepay.test'").get();
 if(!demo){const uid=id('USR'); const hash=bcrypt.hashSync('Demo12345!',12); db.prepare('INSERT INTO users(id,email,password_hash,role,first_name,last_name,phone,kyc_status) VALUES(?,?,?,?,?,?,?,?)').run(uid,'demo@purposepay.test',hash,'CUSTOMER','Demo','Customer','+233200000000','VERIFIED');
   const mid=id('MER'); const merchantUid=id('USR'); const merchantHash=bcrypt.hashSync('Merchant12345!',12); db.prepare('INSERT INTO users(id,email,password_hash,role,first_name,last_name,kyc_status) VALUES(?,?,?,?,?,?,?)').run(merchantUid,'merchant@purposepay.test',merchantHash,'MERCHANT','ABC','Merchant','VERIFIED'); db.prepare('INSERT INTO merchants(id,user_id,name,status,categories_json,settlement_status) VALUES(?,?,?,?,?,?)').run(mid,merchantUid,'ABC Building Materials','APPROVED',JSON.stringify(['Cement','Blocks','Steel','Roofing']),'PENDING');
   const contractorUid=id('USR'); const contractorHash=bcrypt.hashSync('Contractor12345!',12); db.prepare('INSERT INTO users(id,email,password_hash,role,first_name,last_name,kyc_status) VALUES(?,?,?,?,?,?,?)').run(contractorUid,'contractor@purposepay.test',contractorHash,'CONTRACTOR','Kwame','Mensah','VERIFIED');
   const sid=id('SCH'); db.prepare('INSERT INTO schools(id,name,status) VALUES(?,?,?)').run(sid,'Accra International School','APPROVED');
   const pid=id('PRJ'); db.prepare('INSERT INTO projects(id,customer_id,name,location,contractor_name,contractor_phone,description) VALUES(?,?,?,?,?,?,?)').run(pid,uid,'Johnson Family House','Accra','Kwame Mensah','+233200000001','Family house construction');
   const vid=id('VCH'); db.prepare('INSERT INTO vouchers(id,project_id,category,initial_amount,used_amount,status) VALUES(?,?,?,?,?,?)').run(vid,pid,'Cement',20000,8000,'PARTIALLY_USED');
   const tx=id('TXN'); db.prepare('INSERT INTO transactions(id,voucher_id,project_id,customer_id,merchant_id,category,amount,status,authorization_code,risk_status,settlement_status,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(tx,vid,pid,uid,mid,'Cement',8000,'COMPLETED','DEMOAUTH','REVIEW','PENDING');
   audit(uid,'SEED_DEMO','SYSTEM',null,{transaction:tx});
 }
}
seed();

async function main(req,res){
 if(req.method==='OPTIONS') return json(res,204,{});
 const urlPath=req.url.split('?')[0]; const parts=urlPath.split('/').filter(Boolean); const route=parts.join('/');
 try {
  if(req.method==='GET' && route==='api/health') return json(res,200,{ok:true,service:'purposepay-api',version:'0.3.0',database:DB_FILE});
  if(req.method==='GET' && !route.startsWith('api/')) {
   const requested=route ? route : 'index.html';
   const file=path.join(ROOT,'..',requested);
   if(fs.existsSync(file) && fs.statSync(file).isFile()){res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream',...(ALLOWED_ORIGIN?{'access-control-allow-origin':ALLOWED_ORIGIN}:{})});return res.end(fs.readFileSync(file));}
   const index=path.join(ROOT,'..','index.html'); res.writeHead(200,{'content-type':'text/html','access-control-allow-origin':'*'}); return res.end(fs.readFileSync(index));
  }
  if(req.method==='POST' && route==='api/auth/register'){
   const b=await readBody(req); if(!b.email||!b.password||!b.firstName||!b.lastName) return json(res,400,{error:'First name, last name, email and password are required'}); if(String(b.password).length<8)return json(res,400,{error:'Password must be at least 8 characters'});
   const email=b.email.trim().toLowerCase(); if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) return json(res,409,{error:'Email already registered'});
   const uid=id('USR'); const hash=await bcrypt.hash(b.password,12); db.prepare('INSERT INTO users(id,email,password_hash,role,first_name,last_name,phone) VALUES(?,?,?,?,?,?,?)').run(uid,email,hash,'CUSTOMER',b.firstName.trim(),b.lastName.trim(),b.phone||null); audit(uid,'REGISTER','USER',uid); const u=db.prepare('SELECT * FROM users WHERE id=?').get(uid); return json(res,201,{user:userSafe(u),token:tokenFor(u)});
  }
  if(req.method==='POST' && route==='api/auth/login'){
   const b=await readBody(req); const loginEmail=(b.email||'').trim().toLowerCase(); if(!rateLimitLogin(loginEmail)) return json(res,429,{error:'Too many login attempts. Try again later.'}); const u=db.prepare('SELECT * FROM users WHERE email=?').get(loginEmail); if(!u||!(await bcrypt.compare(b.password||'',u.password_hash)))return json(res,401,{error:'Invalid email or password'}); audit(u.id,'LOGIN','USER',u.id); return json(res,200,{user:userSafe(u),token:tokenFor(u)});
  }
  const me=auth(req); if(!me)return json(res,401,{error:'Authentication required'});
  if(req.method==='GET'&&route==='api/me') return json(res,200,{user:userSafe(db.prepare('SELECT * FROM users WHERE id=?').get(me.sub))});
  if(req.method==='POST'&&route==='api/kyc/submit'){
   if(!role(me,'CUSTOMER')) return json(res,403,{error:'Customer role required'});
   const b=await readBody(req); const required=['documentType','documentNumber','countryOfIssue']; if(required.some(k=>!b[k]))return json(res,400,{error:'Document type, number and country of issue are required'});
   const kid=id('KYC'); db.prepare('INSERT INTO kyc_documents(id,user_id,document_type,document_number,country_of_issue,issue_date,expiry_date,file_front_url,file_back_url,selfie_url) VALUES(?,?,?,?,?,?,?,?,?,?)').run(kid,me.sub,b.documentType,b.documentNumber,b.countryOfIssue,b.issueDate||null,b.expiryDate||null,b.fileFrontUrl||null,b.fileBackUrl||null,b.selfieUrl||null); db.prepare('UPDATE users SET kyc_status=? WHERE id=?').run('UNDER_REVIEW',me.sub); audit(me.sub,'KYC_SUBMITTED','KYC',kid); return json(res,201,{id:kid,status:'UNDER_REVIEW'});
  }
  if(req.method==='GET'&&route==='api/kyc/me'){const k=db.prepare('SELECT * FROM kyc_documents WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(me.sub); return json(res,200,{kyc:k||null});}
  if(req.method==='GET'&&route==='api/dashboard'){
   const customer=role(me,'CUSTOMER'); const stats={projects:db.prepare('SELECT COUNT(*) n FROM projects WHERE customer_id=?').get(me.sub).n,vouchers:db.prepare('SELECT COUNT(*) n FROM vouchers v JOIN projects p ON p.id=v.project_id WHERE p.customer_id=?').get(me.sub).n,transactions:db.prepare('SELECT COUNT(*) n FROM transactions WHERE customer_id=?').get(me.sub).n,schoolPayments:db.prepare('SELECT COUNT(*) n FROM school_payments WHERE customer_id=?').get(me.sub).n}; if(customer)return json(res,200,{stats});
   if(role(me,'ADMIN'))return json(res,200,{stats:{customers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='CUSTOMER'").get().n,pendingKyc:db.prepare("SELECT COUNT(*) n FROM users WHERE kyc_status='UNDER_REVIEW'").get().n,merchants:db.prepare('SELECT COUNT(*) n FROM merchants').get().n,transactions:db.prepare('SELECT COUNT(*) n FROM transactions').get().n,openRisk:db.prepare("SELECT COUNT(*) n FROM transactions WHERE risk_status='REVIEW'").get().n}});
   if(role(me,'MERCHANT'))return json(res,200,{stats:{sales:db.prepare('SELECT COUNT(*) n FROM transactions WHERE merchant_id=(SELECT id FROM merchants WHERE user_id=?)').get(me.sub).n}});
   return json(res,200,{stats});
  }
  if(req.method==='POST'&&route==='api/projects'){
   if(!role(me,'CUSTOMER'))return json(res,403,{error:'Customer role required'}); const b=await readBody(req); if(!b.name||!b.location)return json(res,400,{error:'Project name and location are required'}); if(db.prepare("SELECT kyc_status FROM users WHERE id=?").get(me.sub).kyc_status!=='VERIFIED')return json(res,403,{error:'Complete identity verification before creating a funded project'});
   const pid=id('PRJ'); db.prepare('INSERT INTO projects(id,customer_id,name,location,contractor_name,contractor_phone,description) VALUES(?,?,?,?,?,?,?)').run(pid,me.sub,b.name,b.location,b.contractorName||null,b.contractorPhone||null,b.description||null); audit(me.sub,'CREATE','PROJECT',pid); return json(res,201,{id:pid,status:'ACTIVE'});
  }
  if(req.method==='GET'&&route==='api/projects'){let rows;if(role(me,'CUSTOMER'))rows=db.prepare('SELECT * FROM projects WHERE customer_id=? ORDER BY created_at DESC').all(me.sub);else if(role(me,'ADMIN'))rows=db.prepare('SELECT p.*,u.email customer_email FROM projects p JOIN users u ON u.id=p.customer_id ORDER BY p.created_at DESC').all();else return json(res,403,{error:'Not authorized'}); return json(res,200,{projects:rows});}
  if(req.method==='POST'&&route==='api/vouchers'){
   if(!role(me,'CUSTOMER'))return json(res,403,{error:'Customer role required'}); if(db.prepare('SELECT kyc_status FROM users WHERE id=?').get(me.sub).kyc_status!=='VERIFIED') return json(res,403,{error:'Complete identity verification before creating a voucher'}); const b=await readBody(req); const p=db.prepare('SELECT * FROM projects WHERE id=? AND customer_id=?').get(b.projectId,me.sub); if(!p)return json(res,404,{error:'Project not found'}); if(!b.category||!Number.isInteger(b.amount)||b.amount<=0)return json(res,400,{error:'Category and positive integer amount are required'});
   const vid=id('VCH'); db.prepare('INSERT INTO vouchers(id,project_id,category,initial_amount) VALUES(?,?,?,?)').run(vid,p.id,b.category,b.amount); audit(me.sub,'CREATE','VOUCHER',vid,{amount:b.amount,category:b.category}); return json(res,201,{id:vid,code:`PP-BLD-${vid.slice(-8).toUpperCase()}`,status:'ACTIVE',category:b.category,initialAmount:b.amount,usedAmount:0,remainingAmount:b.amount});
  }
  if(req.method==='GET'&&route==='api/vouchers'){
   const rows=role(me,'CUSTOMER')?db.prepare('SELECT v.*,p.name project_name FROM vouchers v JOIN projects p ON p.id=v.project_id WHERE p.customer_id=? ORDER BY v.created_at DESC').all(me.sub):role(me,'ADMIN')?db.prepare('SELECT v.*,p.name project_name,u.email customer_email FROM vouchers v JOIN projects p ON p.id=v.project_id JOIN users u ON u.id=p.customer_id ORDER BY v.created_at DESC').all():[]; return json(res,200,{vouchers:rows.map(v=>({...v,remaining_amount:v.initial_amount-v.used_amount}))});
  }
  if(req.method==='GET'&&route==='api/merchants'){
   const rows=db.prepare('SELECT * FROM merchants WHERE status=? ORDER BY name').all('APPROVED').map(m=>({...m,categories:JSON.parse(m.categories_json||'[]')})); return json(res,200,{merchants:rows});
  }
  if(req.method==='GET'&&route==='api/schools')return json(res,200,{schools:db.prepare('SELECT * FROM schools WHERE status=? ORDER BY name').all('APPROVED')});
  if(req.method==='POST'&&route==='api/transactions/authorize'){
   if(!role(me,'CUSTOMER','CONTRACTOR'))return json(res,403,{error:'Customer or contractor role required'}); const b=await readBody(req); const idem=idempotent(req,me.sub,b); if(idem)return json(res,idem.status,idem.body); let v; if(role(me,'CUSTOMER')) v=db.prepare('SELECT v.*,p.customer_id FROM vouchers v JOIN projects p ON p.id=v.project_id WHERE v.id=? AND p.customer_id=?').get(b.voucherId,me.sub); else { const contractor=db.prepare("SELECT id FROM users WHERE id=? AND role='CONTRACTOR'").get(me.sub); v=contractor?db.prepare(`SELECT v.*,p.customer_id FROM vouchers v JOIN projects p ON p.id=v.project_id WHERE v.id=? AND (p.contractor_phone=(SELECT phone FROM users WHERE id=?) OR lower(p.contractor_name)=lower((SELECT trim(first_name||' '||last_name) FROM users WHERE id=?)))`).get(b.voucherId,me.sub,me.sub):null; } if(!v)return json(res,404,{error:'Voucher not found'});
   const m=db.prepare('SELECT * FROM merchants WHERE id=? AND status=?').get(b.merchantId,'APPROVED'); if(!m)return json(res,400,{error:'Merchant not approved'}); const allowed=JSON.parse(m.categories_json||'[]'); if(allowed.length&&!allowed.includes(v.category))return json(res,400,{error:'Merchant is not approved for this voucher category'}); const remaining=v.initial_amount-v.used_amount; if(!Number.isInteger(b.amount)||b.amount<=0||b.amount>remaining)return json(res,400,{error:'Amount exceeds voucher balance'});
   const tx=id('TXN'), code=crypto.randomBytes(6).toString('hex').toUpperCase(); db.prepare('INSERT INTO transactions(id,voucher_id,project_id,customer_id,merchant_id,category,amount,status,authorization_code,risk_status) VALUES(?,?,?,?,?,?,?,?,?,?)').run(tx,v.id,v.project_id,v.customer_id,m.id,v.category,b.amount,'AUTHORIZED',code,b.amount>=5000?'REVIEW':'CLEAR'); audit(me.sub,'AUTHORIZE_PURCHASE','TRANSACTION',tx,{amount:b.amount,merchant:m.name}); const response={transactionId:tx,authorizationCode:code,status:'AUTHORIZED',amount:b.amount,riskStatus:b.amount>=5000?'REVIEW':'CLEAR'}; saveIdempotency(idem,me.sub,201,response); return json(res,201,response);
  }
  if(req.method==='GET'&&route==='api/transactions'){
   let rows;if(role(me,'CUSTOMER'))rows=db.prepare('SELECT t.*,m.name merchant_name,p.name project_name FROM transactions t LEFT JOIN merchants m ON m.id=t.merchant_id LEFT JOIN projects p ON p.id=t.project_id WHERE t.customer_id=? ORDER BY t.created_at DESC').all(me.sub); else if(role(me,'MERCHANT'))rows=db.prepare('SELECT t.*,m.name merchant_name,p.name project_name FROM transactions t JOIN merchants m ON m.id=t.merchant_id LEFT JOIN projects p ON p.id=t.project_id WHERE m.user_id=? ORDER BY t.created_at DESC').all(me.sub); else if(role(me,'ADMIN'))rows=db.prepare('SELECT t.*,m.name merchant_name,p.name project_name,u.email customer_email FROM transactions t LEFT JOIN merchants m ON m.id=t.merchant_id LEFT JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.customer_id ORDER BY t.created_at DESC').all(); else return json(res,403,{error:'Not authorized'}); return json(res,200,{transactions:rows});
  }
  if(req.method==='POST'&&route==='api/transactions/complete'){
   if(!role(me,'MERCHANT','ADMIN'))return json(res,403,{error:'Merchant or admin role required'}); const b=await readBody(req); const idem=idempotent(req,me.sub,b); if(idem)return json(res,idem.status,idem.body); const tx=role(me,'MERCHANT')?db.prepare('SELECT t.* FROM transactions t JOIN merchants m ON m.id=t.merchant_id WHERE t.id=? AND t.authorization_code=? AND m.user_id=?').get(b.transactionId,b.authorizationCode,me.sub):db.prepare('SELECT * FROM transactions WHERE id=? AND authorization_code=?').get(b.transactionId,b.authorizationCode); if(!tx)return json(res,404,{error:'Authorization not found'}); if(tx.risk_status==='BLOCKED')return json(res,403,{error:'Transaction is blocked by risk controls'}); if(tx.status!=='AUTHORIZED')return json(res,409,{error:'Transaction is not authorized'});
   const complete=db.transaction(()=>{const v=db.prepare('SELECT * FROM vouchers WHERE id=?').get(tx.voucher_id); if(!v||tx.amount>v.initial_amount-v.used_amount)throw new Error('Voucher balance changed'); db.prepare('UPDATE vouchers SET used_amount=used_amount+?,status=CASE WHEN used_amount+? >= initial_amount THEN ? ELSE ? END WHERE id=?').run(tx.amount,tx.amount,'USED','PARTIALLY_USED',v.id); db.prepare('UPDATE transactions SET status=?,receipt_url=?,settlement_status=?,completed_at=CURRENT_TIMESTAMP WHERE id=?').run('COMPLETED',b.receiptUrl||null,'PENDING',tx.id); audit(me.sub,'COMPLETE_PURCHASE','TRANSACTION',tx.id,{receiptUrl:b.receiptUrl||null}); return tx.id;}); const response={transactionId:complete,status:'COMPLETED'}; saveIdempotency(idem,me.sub,200,response); return json(res,200,response);
  }
  if(req.method==='POST'&&route==='api/schools/payments'){
   if(!role(me,'CUSTOMER'))return json(res,403,{error:'Customer role required'}); const b=await readBody(req); const idem=idempotent(req,me.sub,b); if(idem)return json(res,idem.status,idem.body); const s=db.prepare('SELECT * FROM schools WHERE id=? AND status=?').get(b.schoolId,'APPROVED'); if(!s)return json(res,400,{error:'School not approved'}); if(!b.studentName||!Number.isInteger(b.amount)||b.amount<=0)return json(res,400,{error:'Student name and positive integer amount are required'}); const sp=id('SCH'); db.prepare('INSERT INTO school_payments(id,customer_id,school_id,student_name,student_id,term,amount) VALUES(?,?,?,?,?,?,?)').run(sp,me.sub,s.id,b.studentName,b.studentId||null,b.term||null,b.amount); audit(me.sub,'CREATE','SCHOOL_PAYMENT',sp,{amount:b.amount,school:s.name}); const response={id:sp,status:'PENDING',school:s.name}; saveIdempotency(idem,me.sub,201,response); return json(res,201,response);
  }
  if(req.method==='GET'&&route==='api/schools/payments'){const rows=role(me,'CUSTOMER')?db.prepare('SELECT sp.*,s.name school_name FROM school_payments sp JOIN schools s ON s.id=sp.school_id WHERE sp.customer_id=? ORDER BY sp.created_at DESC').all(me.sub):role(me,'ADMIN')?db.prepare('SELECT sp.*,s.name school_name,u.email customer_email FROM school_payments sp JOIN schools s ON s.id=sp.school_id JOIN users u ON u.id=sp.customer_id ORDER BY sp.created_at DESC').all():[];return json(res,200,{payments:rows});}
  if(req.method==='GET'&&route==='api/admin/overview'){if(!role(me,'ADMIN'))return json(res,403,{error:'Admin role required'});return json(res,200,{customers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='CUSTOMER'").get().n,projects:db.prepare('SELECT COUNT(*) n FROM projects').get().n,vouchers:db.prepare('SELECT COUNT(*) n FROM vouchers').get().n,transactions:db.prepare('SELECT COUNT(*) n FROM transactions').get().n,pendingKyc:db.prepare("SELECT COUNT(*) n FROM users WHERE kyc_status='UNDER_REVIEW'").get().n,openRisk:db.prepare("SELECT COUNT(*) n FROM transactions WHERE risk_status='REVIEW' AND status!='REFUNDED'").get().n});}
  if(req.method==='GET'&&route==='api/admin/kyc'){if(!role(me,'ADMIN'))return json(res,403,{error:'Admin role required'});return json(res,200,{documents:db.prepare('SELECT k.*,u.email,u.first_name,u.last_name,u.kyc_status FROM kyc_documents k JOIN users u ON u.id=k.user_id ORDER BY k.created_at DESC').all()});}
  if(req.method==='POST'&&parts[0]==='api'&&parts[1]==='admin'&&parts[2]==='kyc'&&parts[4]==='review'){if(!role(me,'ADMIN'))return json(res,403,{error:'Admin role required'});const kid=parts[3];const b=await readBody(req);const k=db.prepare('SELECT * FROM kyc_documents WHERE id=?').get(kid);if(!k)return json(res,404,{error:'KYC document not found'});const status=b.status==='VERIFIED'?'VERIFIED':'VERIFICATION_FAILED';db.prepare('UPDATE kyc_documents SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(status,b.note||null,me.sub,kid);db.prepare('UPDATE users SET kyc_status=? WHERE id=?').run(status==='VERIFIED'?'VERIFIED':'VERIFICATION_FAILED',k.user_id);audit(me.sub,'KYC_REVIEW','KYC',kid,{status,note:b.note||null});return json(res,200,{id:kid,status});}
  if(req.method==='GET'&&route==='api/admin/risk'){if(!role(me,'ADMIN'))return json(res,403,{error:'Admin role required'});return json(res,200,{alerts:db.prepare("SELECT t.*,m.name merchant_name,u.email customer_email FROM transactions t LEFT JOIN merchants m ON m.id=t.merchant_id JOIN users u ON u.id=t.customer_id WHERE t.risk_status='REVIEW' ORDER BY t.created_at DESC").all()});}
  if(req.method==='POST'&&route==='api/admin/risk/resolve'){if(!role(me,'ADMIN'))return json(res,403,{error:'Admin role required'});const b=await readBody(req);db.prepare('UPDATE transactions SET risk_status=? WHERE id=?').run(b.status==='BLOCKED'?'BLOCKED':'CLEAR',b.transactionId);audit(me.sub,'RISK_REVIEW','TRANSACTION',b.transactionId,{status:b.status});return json(res,200,{status:b.status});}
  if(req.method==='GET'&&route==='api/admin/audit'){if(!role(me,'ADMIN'))return json(res,403,{error:'Admin role required'});return json(res,200,{logs:db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all()});}
  return json(res,404,{error:'Route not found'});
 } catch(e){console.error(e);return json(res,500,{error:e.message||'Internal server error'});}
}
http.createServer((req,res)=>main(req,res)).listen(PORT,'0.0.0.0',()=>console.log(`PurposePay API listening on 0.0.0.0:${PORT}`));