const app=document.getElementById("app");
const services=[
  {id:"fade",name:"Fade",price:1800},
  {id:"normal",name:"Obično šišanje",price:1500}
];
let currentUser=null;
let selectedService=null;
let selectedDate=null;
let selectedTime=null;
let adminMode=false;
let calendarDate=new Date();

const api=async(path,options={})=>{
  const r=await fetch(path,{cache:"no-store",...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`Greška (${r.status})`);
  return data;
};

function shell(content){app.innerHTML=content.startsWith('<div class="app-layout">')?content:`<div class="wrap">${content}</div>`}
function brand(){return `<div class="brand"><div class="sc">✂</div><h1>Bojke Barber</h1><p>✂ • stil • preciznost</p></div>`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function auth(){
  shell(brand()+`
    <div class="card">
      <h2 class="title">Dobro došao</h2>
      <div id="authbox">
        <button class="btn" onclick="showLogin()">Prijava</button>
        <button class="btn secondary" onclick="showRegister()">Napravi nalog</button>
      </div>
      <div class="admin-discreet"><span onclick="showAdminLogin()">administracija</span></div>
    </div>`);
}
function showLogin(){
  document.getElementById("authbox").innerHTML=`
    <input id="loginPhone" class="input" placeholder="Broj telefona" autocomplete="tel">
    <input id="loginPassword" class="input" type="password" placeholder="Lozinka" autocomplete="current-password">
    <div class="row"><button class="btn" onclick="login()">Prijavi se</button><button class="btn secondary" onclick="auth()">Nazad</button></div>
    <p class="small muted">Nemaš nalog? <span class="link" onclick="showRegister()">Napravi ga ovde.</span></p>`;
}
function showRegister(){
  document.getElementById("authbox").innerHTML=`
    <input id="regName" class="input" placeholder="Ime i prezime" autocomplete="name">
    <input id="regPhone" class="input" placeholder="Broj telefona" autocomplete="tel">
    <input id="regPassword" class="input" type="password" placeholder="Lozinka (minimum 4 karaktera)" autocomplete="new-password">
    <div class="row"><button class="btn" onclick="register()">Napravi nalog</button><button class="btn secondary" onclick="auth()">Nazad</button></div>
    <p class="small muted">Email nije potreban.</p>`;
}
async function register(){
  try{
    const user=await api("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      name:document.getElementById("regName").value,
      phone:document.getElementById("regPhone").value,
      password:document.getElementById("regPassword").value
    })});
    currentUser=user;
    localStorage.setItem("djoleUserId",user.id);
    userMenu();
  }catch(e){alert(e.message)}
}
async function login(){
  try{
    const user=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      phone:document.getElementById("loginPhone").value,
      password:document.getElementById("loginPassword").value
    })});
    currentUser=user;
    localStorage.setItem("djoleUserId",user.id);
    userMenu();
  }catch(e){alert(e.message)}
}
async function restoreLogin(){
  const id=localStorage.getItem("djoleUserId");
  if(!id){auth();return}
  try{
    currentUser=await api(`/api/user?userId=${encodeURIComponent(id)}`);
    userMenu();
  }catch{
    localStorage.removeItem("djoleUserId");
    auth();
  }
}
function logout(){currentUser=null;localStorage.removeItem("djoleUserId");auth()}

function userShell(content, active="home", title=""){
  const first=escapeHtml((currentUser?.name||"").split(" ")[0]||"Klijent");
  const full=escapeHtml(currentUser?.name||"Klijent");
  return `<div class="app-layout">
    <aside class="sidebar">
      <div class="side-brand"><div class="side-sc">✂</div><div class="side-name">BOJKE <span>BARBER</span></div><div class="side-tag">STIL • PRECIZNOST</div></div>
      <nav class="side-nav">
        <button class="nav-item ${active==='home'?'active':''}" onclick="userMenu()"><span>⌂</span><b>Početna</b></button>
        <button class="nav-item ${active==='booking'?'active':''} ${activeBookingForNav?'disabled-nav':''}" onclick="openBooking()"><span>✂</span><b>Zakaži šišanje</b></button>
        <button class="nav-item ${active==='prices'?'active':''}" onclick="openPrices()"><span>▤</span><b>Cenovnik</b></button>
        <button class="nav-item ${active==='history'?'active':''}" onclick="openHistory()"><span>◷</span><b>Moja šišanja</b></button>
      </nav>
      <div class="side-bottom"><button class="nav-item profile-nav ${active==='profile'?'active':''}" onclick="openProfile()"><span>◯</span><b>Profil</b></button><button class="logout-side" onclick="logout()">↪ Odjavi se</button></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div><div class="eyebrow">${title||'BOJKE BARBER'}</div></div><div class="client-box"><div class="client-avatar">${first.charAt(0).toUpperCase()}</div><div class="client-info"><strong>${full}</strong><small>${escapeHtml(currentUser?.phone||'')}</small></div></div></header>
      <section class="page-content">${content}</section>
    </main>
  </div>`;
}
let activeBookingForNav=false;

async function getActiveBooking(){
  try{
    const rows=await api(`/api/user/bookings?userId=${encodeURIComponent(currentUser.id)}`);
    return rows.find(b=>b.status==="confirmed" && new Date(`${b.date}T${b.time}:00`)>=new Date())||null;
  }catch{return null}
}

async function userMenu(){
  const active=await getActiveBooking();
  activeBookingForNav=!!active;
  shell(userShell(`
    <div class="hero-card">
      <div><span class="kicker">BOJKE BARBER</span><h1>Dobro došao, ${escapeHtml((currentUser.name||'').split(' ')[0])}.</h1><p>Ovde možeš zakazati termin, pogledati cenovnik i svoju istoriju šišanja.</p></div>
      <div class="hero-scissors">✂</div>
    </div>
    ${active?`<div class="active-booking"><div><span class="status-dot"></span><b>Aktivan termin</b><p>${escapeHtml(active.date)} u <strong>${escapeHtml(active.time)}</strong> · ${escapeHtml(active.service)} · ${active.price} RSD</p></div><button class="btn danger" onclick="openHistory()">Pogledaj termin</button></div>`:""}
    <div class="section-heading"><div><span class="kicker">BRZI PRISTUP</span><h2>Šta želiš da uradiš?</h2></div></div>
    <div class="menu-grid desktop-menu">
      <button class="menu-card" onclick="openBooking()" ${active?'disabled':''}><div class="menu-icon">✂</div><b>Zakaži šišanje</b><span>${active?'Već imaš aktivan termin':'Izaberi tehniku, datum i vreme'}</span><em>Otvori →</em></button>
      <button class="menu-card" onclick="openPrices()"><div class="menu-icon">▤</div><b>Cenovnik</b><span>Pogledaj sve usluge i cene</span><em>Otvori →</em></button>
      <button class="menu-card" onclick="openHistory()"><div class="menu-icon">◷</div><b>Moja šišanja</b><span>Pregled budućih i završenih termina</span><em>Otvori →</em></button>
    </div>
  `,"home"));
}

function openPrices(){
  activeBookingForNav=false;
  shell(userShell(`<div class="page-header"><div><span class="kicker">USLUGE</span><h1>Cenovnik</h1><p>Pogledaj dostupne tehnike i cene šišanja.</p></div></div><div class="price-list large-prices">
    ${services.map(s=>`<div class="price-card"><div class="price-icon">✂</div><div class="price-main"><h3>${s.name}</h3><p>Trajanje 30 min · Profesionalno šišanje</p></div><strong>${s.price} RSD</strong></div>`).join("")}
  </div>`,'prices','Cenovnik'));
}

async function openHistory(){
  try{
    const rows=await api(`/api/user/bookings?userId=${encodeURIComponent(currentUser.id)}`);
    const now=new Date();
    const future=rows.filter(b=>new Date(`${b.date}T${b.time}:00`)>=now).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    const past=rows.filter(b=>new Date(`${b.date}T${b.time}:00`)<now).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
    activeBookingForNav=!!future.length;
    shell(userShell(`<div class="page-header"><div><span class="kicker">TERMINI</span><h1>Moja šišanja</h1><p>Pregled tvog budućeg termina i istorije šišanja.</p></div></div>
      ${future.length?`<div class="sub-title">Naredno šišanje</div>${future.map(bookingItem).join("")}`:""}
      <div class="sub-title history-title">Istorija šišanja</div>
      ${past.length?past.map(bookingItem).join(""):`<div class="empty">Još nema završenih šišanja.</div>`}
    `,'history','Moja šišanja'));
  }catch(e){alert(e.message)}
}
function bookingItem(b){
  const isFuture=new Date(`${b.date}T${b.time}:00`)>=new Date();
  return `<div class="history-item"><div class="history-date"><strong>${escapeHtml(b.date.slice(8,10))}</strong><small>${escapeHtml(b.date.slice(5,7))}</small></div><div class="history-info"><b>${escapeHtml(b.service)}</b><span>${escapeHtml(b.date)} · ${escapeHtml(b.time)} · ${b.price} RSD</span></div><div>${isFuture?`<button class="btn danger" onclick="cancelMyBooking('${b.id}')">Otkaži termin</button>`:`<span class="badge">Završeno</span>`}</div></div>`
}
async function cancelMyBooking(id){
  if(!confirm("Da li želiš da otkažeš termin?")) return;
  try{await api(`/api/bookings/${id}/cancel`,{method:"POST"});openHistory()}catch(e){alert(e.message)}
}
function openProfile(){
  shell(userShell(`<div class="page-header"><div><span class="kicker">NALOG</span><h1>Profil</h1><p>Podaci sa tvog Bojke Barber naloga.</p></div></div><div class="profile-card"><div class="profile-avatar">${escapeHtml((currentUser.name||'K').charAt(0).toUpperCase())}</div><div><span class="muted small">IME I PREZIME</span><h2>${escapeHtml(currentUser.name)}</h2><span class="muted small">BROJ TELEFONA</span><p>${escapeHtml(currentUser.phone)}</p></div></div>`,'profile','Profil'));
}
function dates(){
  const a=[];
  for(let i=0;i<14;i++){let d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);a.push(d.toISOString().slice(0,10))}
  return a;
}
async function openBooking(){
  try{
    const active=await getActiveBooking();
    if(active){alert("Već imaš jedan budući termin. Možeš ga otkazati u 'Moja šišanja'.");openHistory();return}
  }catch{}
  activeBookingForNav=false;
  selectedService=null;selectedDate=null;selectedTime=null;
  renderBooking();
}
function renderBooking(){
  shell(userShell(`<div class="page-header"><div><span class="kicker">NOVI TERMIN</span><h1>Zakaži šišanje</h1><p>Izaberi tehniku, datum i slobodan termin.</p></div></div>
    <div class="booking-card">
    <div class="steps"><span class="current">1 <small>Tehnika</small></span><i></i><span class="${selectedDate?'current':''}">2 <small>Datum</small></span><i></i><span class="${selectedTime?'current':''}">3 <small>Vreme</small></span><i></i><span>4 <small>Potvrda</small></span></div>
    <h3>1. Izaberi tehniku</h3>
    <div class="services">${services.map(s=>`<button class="service ${selectedService?.id===s.id?'active':''}" onclick="pickService('${s.id}')"><div class="service-icon">✂</div><b>${s.name}</b><div class="price">${s.price} RSD</div></button>`).join("")}</div>
    ${selectedService?`<h3>2. Izaberi datum</h3><div class="dates">${dates().map(d=>`<button class="date ${selectedDate===d?'active':''}" onclick="pickDate('${d}')">${new Date(d+"T12:00:00").getDate()}<small>${new Date(d+"T12:00:00").toLocaleDateString("sr-RS",{weekday:"short"})}</small></button>`).join("")}</div>`:""}
    ${selectedDate?`<h3>3. Izaberi vreme</h3><div id="slotbox" class="slots"></div>`:""}
    ${selectedTime?`<h3>4. Potvrdi termin</h3><div class="summary booking-summary"><div><span>Tehnika</span><b>${escapeHtml(selectedService.name)}</b></div><div><span>Cena</span><b>${selectedService.price} RSD</b></div><div><span>Datum</span><b>${escapeHtml(selectedDate)}</b></div><div><span>Vreme</span><b>${escapeHtml(selectedTime)}</b></div><div><span>Telefon</span><b>${escapeHtml(currentUser.phone)}</b></div></div><button class="btn confirm-btn" onclick="confirmBooking()">Potvrdi termin</button>`:""}
    </div>
  `,'booking','Zakaži šišanje'));
  if(selectedDate) loadSlots();
}
function pickService(id){selectedService=services.find(s=>s.id===id);selectedDate=null;selectedTime=null;renderBooking()}
function pickDate(d){selectedDate=d;selectedTime=null;renderBooking()}
async function loadSlots(){
  try{
    const used=await api(`/api/availability?date=${selectedDate}`);
    document.getElementById("slotbox").innerHTML=[...Array(20)].map((_,i)=>{
      const h=11+Math.floor(i/2), m=i%2?"30":"00", t=`${String(h).padStart(2,"0")}:${m}`,busy=used.includes(t);
      return `<button class="slot ${busy?'busy':''}" ${busy?'disabled':''} onclick="pickTime('${t}')">${t}${busy?" · Zauzeto":""}</button>`
    }).join("");
  }catch(e){alert(e.message)}
}
function pickTime(t){selectedTime=t;renderBooking()}
async function confirmBooking(){
  try{
    await api("/api/book",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:currentUser.id,date:selectedDate,time:selectedTime,serviceId:selectedService.id})});
    alert("Termin je uspešno zakazan.");
    selectedService=null;selectedDate=null;selectedTime=null;
    userMenu();
  }catch(e){alert(e.message)}
}

async function showAdminLogin(){
  shell(brand()+`<div class="card"><h2 class="title">Administracija</h2>
    <input id="adminPhone" class="input" placeholder="Broj telefona">
    <input id="adminPassword" class="input" type="password" placeholder="Lozinka">
    <div class="row"><button class="btn" onclick="adminLogin()">Uđi</button><button class="btn secondary" onclick="auth()">Nazad</button></div>
    <p class="small muted">Demo admin: 0600000000 / admin</p>
  </div>`);
}
async function adminLogin(){
  try{await api("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:document.getElementById("adminPhone").value,password:document.getElementById("adminPassword").value})});adminMode=true;adminCalendar()}catch(e){alert(e.message)}
}
async function loadMonthFiles(){
  const files=await api("/api/admin/months");
  const select=document.getElementById("exportMonth");
  const months=[...files.map(f=>f.replace(".csv","")), new Date().toISOString().slice(0,7)];
  const unique=[...new Set(months)].sort().reverse();
  select.innerHTML=unique.map(m=>`<option value="${m}">${new Date(m+"-01T12:00:00").toLocaleDateString("sr-RS",{month:"long",year:"numeric"})}</option>`).join("");
  const list=document.getElementById("monthFiles");
  list.innerHTML=files.length
    ? `<span class="small muted">Postojeći fajlovi: </span>`+files.map(f=>`<span class="file-pill">${f}</span>`).join(" ")
    : `<span class="small muted">Još nema sačuvanih mesečnih popisa.</span>`;
}
function exportMonth(){
  const month=document.getElementById("exportMonth").value;
  if(!month)return;
  window.location.href="/api/admin/export?month="+encodeURIComponent(month);
}

async function adminCalendar(){
  shell(brand()+`<div class="card"><div class="row space"><h2 class="title">Kalendar termina</h2><button class="btn secondary" onclick="auth()">Izlaz</button></div><div id="calendar"></div></div>
  <div class="card"><h2 class="title">Termini izabranog dana</h2><div id="adminDay"></div></div>
  <div class="card"><h2 class="title">Mesečni popis šišanja</h2>
    <p class="muted small">Izaberi mesec i preuzmi tabelu svih potvrđenih šišanja za taj mesec.</p>
    <div class="row">
      <select id="exportMonth" class="input month-select"></select>
      <button class="btn" onclick="exportMonth()">Izbaci mesečni fajl</button>
    </div>
    <div id="monthFiles" class="month-files"></div>
  </div>`);
  await loadMonthFiles();
  renderAdminCalendar();
}
async function renderAdminCalendar(){
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth();
  const first=new Date(y,m,1),last=new Date(y,m+1,0),start=(first.getDay()+6)%7;
  const all=await api("/api/admin/bookings");
  const count={};all.forEach(b=>count[b.date]=(count[b.date]||0)+1);
  let cells=Array.from({length:start},()=>`<div class="day muted"></div>`);
  for(let d=1;d<=last.getDate();d++){
    const dt=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    cells.push(`<button class="day ${count[dt]?'has':''} ${selectedDate===dt?'selected':''}" onclick="adminPickDay('${dt}')"><strong>${d}</strong>${count[dt]?`<span class="count">${count[dt]} ${count[dt]===1?'termin':'termina'}</span>`:""}</button>`);
  }
  document.getElementById("calendar").innerHTML=`<div class="calendar-head"><button onclick="moveCalendar(-1)">‹</button><div class="monthname">${first.toLocaleDateString("sr-RS",{month:"long",year:"numeric"})}</div><button onclick="moveCalendar(1)">›</button></div><div class="calendar"><div class="dow">Pon</div><div class="dow">Uto</div><div class="dow">Sre</div><div class="dow">Čet</div><div class="dow">Pet</div><div class="dow">Sub</div><div class="dow">Ned</div>${cells.join("")}</div>`;
  if(!selectedDate || !selectedDate.startsWith(`${y}-${String(m+1).padStart(2,"0")}`)) selectedDate=`${y}-${String(m+1).padStart(2,"0")}-01`;
  adminPickDay(selectedDate);
}
function moveCalendar(dir){calendarDate.setMonth(calendarDate.getMonth()+dir);selectedDate=null;renderAdminCalendar()}
async function adminPickDay(date){
  selectedDate=date;
  const rows=await api(`/api/admin/bookings?date=${date}`);
  document.getElementById("adminDay").innerHTML=rows.length?rows.map(b=>`<div class="booking"><div><b>${b.time} — ${escapeHtml(b.user)}</b><div class="small muted">${escapeHtml(b.phone)} • ${escapeHtml(b.service)} • ${b.price} RSD</div></div><button class="btn danger" onclick="adminCancel('${b.id}')">Otkaži</button></div>`).join(""):`<div class="empty">Nema zakazanih termina za ${date}.</div>`;
  // refresh selected state without moving the month
  const buttons=document.querySelectorAll(".day");
  // calendar cells are rebuilt only when month changes, so add selected visual safely
  document.querySelectorAll(".day").forEach(el=>el.classList.remove("selected"));
  [...document.querySelectorAll(".day")].find(el=>el.querySelector("strong")?.textContent===String(new Date(date+"T12:00:00").getDate()))?.classList.add("selected");
}
async function adminCancel(id){if(!confirm("Otkaži ovaj termin?"))return;try{await api(`/api/bookings/${id}/cancel`,{method:"POST"});renderAdminCalendar()}catch(e){alert(e.message)}}

restoreLogin();