const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const XLSX = require('xlsx');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

const services = [
  { id:'fade', name:'Fade', price:1800, duration:30 },
  { id:'normal', name:'Obično šišanje', price:1500, duration:30 }
];

function clean(v){ return String(v ?? '').trim(); }
function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')){
  return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
function verifyPassword(password, stored){
  try{
    const [salt,hex]=String(stored).split(':');
    const test=crypto.scryptSync(password,salt,64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test,'hex'),Buffer.from(hex,'hex'));
  }catch{return false;}
}
function publicUser(u){ return {id:u.id,name:u.name,phone:u.phone,createdAt:u.created_at || u.createdAt}; }
function send(res,status,data,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function jsonError(res,status,error){send(res,status,{error});}
function parseBody(req){
  return new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch(e){reject(e);}}); req.on('error',reject); });
}
function slotList(){const a=[];for(let h=11;h<21;h++){a.push(`${String(h).padStart(2,'0')}:00`);a.push(`${String(h).padStart(2,'0')}:30`);}return a;}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(new Date(d+'T12:00:00').getTime());}
function validSlot(t){return slotList().includes(t);}
function isFutureBooking(b){return new Date(`${b.date}T${b.time}:00`).getTime()>=Date.now();}

async function initDb(){
  if(!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS bookings(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_name TEXT NOT NULL, phone TEXT NOT NULL,
    date DATE NOT NULL, time TEXT NOT NULL, service TEXT NOT NULL, service_id TEXT NOT NULL, price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), cancelled_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(date,time);
  CREATE TABLE IF NOT EXISTS admin_users(phone TEXT PRIMARY KEY,password_hash TEXT NOT NULL);
  INSERT INTO admin_users(phone,password_hash) VALUES($1,$2) ON CONFLICT(phone) DO NOTHING;`,['0600000000',hashPassword('admin')]);
}
async function userById(id){const r=await pool.query('SELECT * FROM users WHERE id=$1',[id]);return r.rows[0];}
async function userByPhone(phone){const r=await pool.query('SELECT * FROM users WHERE phone=$1',[phone]);return r.rows[0];}
async function activeBooking(userId){
  const r=await pool.query(`SELECT * FROM bookings WHERE user_id=$1 AND status='confirmed' AND (date + time::time) >= NOW() ORDER BY date,time LIMIT 1`,[userId]);
  return r.rows[0];
}
async function ensureDb(){if(!pool) throw new Error('DATABASE_URL nije podešen.');}

async function api(req,res){
  await ensureDb();
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const body=['POST','PUT','PATCH'].includes(req.method)?await parseBody(req):{};
  if(req.method==='GET'&&url.pathname==='/api/services') return send(res,200,services);
  if(req.method==='POST'&&url.pathname==='/api/register'){
    const name=clean(body.name),phone=clean(body.phone),password=clean(body.password);
    if(name.length<2||phone.length<5||password.length<4)return jsonError(res,400,'Unesite ime, ispravan broj telefona i lozinku od najmanje 4 karaktera.');
    if(await userByPhone(phone))return jsonError(res,409,'Nalog sa ovim brojem već postoji.');
    const u={id:crypto.randomUUID(),name,phone,passwordHash:hashPassword(password)};
    const r=await pool.query('INSERT INTO users(id,name,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[u.id,u.name,u.phone,u.passwordHash]);
    return send(res,201,publicUser(r.rows[0]));
  }
  if(req.method==='POST'&&url.pathname==='/api/login'){
    const u=await userByPhone(clean(body.phone));
    if(!u||!verifyPassword(clean(body.password),u.password_hash))return jsonError(res,401,'Pogrešan broj telefona ili lozinka.');
    return send(res,200,publicUser(u));
  }
  if(req.method==='GET'&&url.pathname==='/api/user'){
    const u=await userById(clean(url.searchParams.get('userId'))); if(!u)return jsonError(res,404,'Korisnik nije pronađen.'); return send(res,200,publicUser(u));
  }
  if(req.method==='GET'&&url.pathname==='/api/user/bookings'){
    const r=await pool.query(`SELECT id,user_id AS "userId",user_name AS "user",phone,date::text,time,service,service_id AS "serviceId",price,status,created_at AS "createdAt",cancelled_at AS "cancelledAt" FROM bookings WHERE user_id=$1 AND status<>'cancelled' ORDER BY date DESC,time DESC`,[clean(url.searchParams.get('userId'))]);
    return send(res,200,r.rows);
  }
  if(req.method==='GET'&&url.pathname==='/api/availability'){
    const date=clean(url.searchParams.get('date')); if(!validDate(date))return jsonError(res,400,'Neispravan datum.');
    const r=await pool.query("SELECT time FROM bookings WHERE date=$1 AND status='confirmed'",[date]); return send(res,200,r.rows.map(x=>x.time));
  }
  if(req.method==='POST'&&url.pathname==='/api/book'){
    const userId=clean(body.userId),date=clean(body.date),time=clean(body.time),serviceId=clean(body.serviceId);
    const u=await userById(userId),s=services.find(x=>x.id===serviceId);
    if(!u||!s||!validDate(date)||!validSlot(time))return jsonError(res,400,'Podaci za termin nisu ispravni.');
    if(new Date(`${date}T${time}:00`).getTime()<Date.now())return jsonError(res,400,'Izabrani termin je u prošlosti.');
    if(await activeBooking(userId))return jsonError(res,409,'Već imate jedan budući termin. Prvo završite ili otkažite taj termin.');
    const conflict=await pool.query("SELECT id FROM bookings WHERE date=$1 AND time=$2 AND status='confirmed' LIMIT 1",[date,time]);
    if(conflict.rowCount)return jsonError(res,409,'Taj termin je upravo zauzet.');
    const id=crypto.randomUUID();
    const r=await pool.query(`INSERT INTO bookings(id,user_id,user_name,phone,date,time,service,service_id,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,user_id AS "userId",user_name AS "user",phone,date::text,time,service,service_id AS "serviceId",price,status,created_at AS "createdAt"`,[id,userId,u.name,u.phone,date,time,s.name,s.id,s.price]);
    return send(res,201,r.rows[0]);
  }
  if(req.method==='POST'&&url.pathname.startsWith('/api/bookings/')&&url.pathname.endsWith('/cancel')){
    const id=url.pathname.split('/')[3]; const r=await pool.query("UPDATE bookings SET status='cancelled',cancelled_at=NOW() WHERE id=$1 RETURNING id",[id]); if(!r.rowCount)return jsonError(res,404,'Termin nije pronađen.'); return send(res,200,{ok:true});
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/login'){
    const r=await pool.query('SELECT * FROM admin_users WHERE phone=$1',[clean(body.phone)]); const a=r.rows[0];
    if(a&&verifyPassword(clean(body.password),a.password_hash))return send(res,200,{ok:true}); return jsonError(res,401,'Pogrešni admin podaci.');
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/bookings'){
    const date=clean(url.searchParams.get('date')); let q=`SELECT id,user_id AS "userId",user_name AS "user",phone,date::text,time,service,service_id AS "serviceId",price,status,created_at AS "createdAt" FROM bookings WHERE status='confirmed'`; const args=[];
    if(date){args.push(date);q+=' AND date=$1';} q+=' ORDER BY date,time'; const r=await pool.query(q,args); return send(res,200,r.rows);
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/months'){
    const r=await pool.query("SELECT DISTINCT to_char(date,'YYYY-MM') AS month FROM bookings ORDER BY month DESC"); return send(res,200,r.rows.map(x=>x.month));
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/export'){
    const month=clean(url.searchParams.get('month')); if(!/^\d{4}-\d{2}$/.test(month))return jsonError(res,400,'Neispravan mesec.');
    const r=await pool.query(`SELECT to_char(date,'DD.MM.YYYY') AS "Datum",time AS "Vreme",user_name AS "Klijent",phone AS "Telefon",service AS "Tehnika",price AS "Cena (RSD)" FROM bookings WHERE status<>'cancelled' AND to_char(date,'YYYY-MM')=$1 ORDER BY date,time`,[month]);
    const ws=XLSX.utils.json_to_sheet(r.rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Šišanja'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="bojke-barber-${month}.xlsx"`,'Cache-Control':'no-store'}); return res.end(buf);
  }
  return null;
}

const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')){try{const handled=await api(req,res);if(handled!==null)return;}catch(e){console.error(e);return jsonError(res,500,'Greška na serveru.');}return jsonError(res,404,'API ruta ne postoji.');}
  let reqPath=new URL(req.url,`http://${req.headers.host||'localhost'}`).pathname;if(reqPath==='/')reqPath='/index.html';const safe=path.normalize(reqPath).replace(/^(\.\.[\\/])+/, '');const file=path.join(ROOT,safe);if(!file.startsWith(ROOT))return jsonError(res,403,'Forbidden');
  fs.readFile(file,(err,data)=>{if(err)return jsonError(res,404,'Fajl nije pronađen.');const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};send(res,200,data,types[ext]||'application/octet-stream');});
});

initDb().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Bojke Barber radi na portu ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});
