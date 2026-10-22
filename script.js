'use strict';

// Geovane Viana interactive prototype: reservations and blocked slots are stored locally.
const modal = document.getElementById('bookingModal');
const form = document.getElementById('bookingForm');
const service = document.getElementById('service');
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('timeSelect');
const msg = document.getElementById('message');
const STORAGES = {
  bookings: 'sbPedidosLocal',
  blocked: 'sbHorariosBloqueados',
  overrides: 'sbHorariosPersonalizados'
};
const ADMIN_PASSWORD = 'GV2026'; // Senha apenas de demonstração local; não protege dados em um site público.
const ALL_TIMES = ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00'];
const DEFAULT_AVAILABLE = new Set(['08:00','10:00','14:00','16:00']);
const COLORS = [
  {color:'rgba(255,218,124,.95)', fill:'rgba(255,203,86,.16)', glow:'rgba(255,193,70,.35)'},
  {color:'rgba(255,105,215,.92)', fill:'rgba(255,105,215,.14)', glow:'rgba(255,60,197,.32)'},
  {color:'rgba(77,219,255,.94)', fill:'rgba(77,219,255,.14)', glow:'rgba(77,219,255,.32)'},
  {color:'rgba(166,129,255,.95)', fill:'rgba(166,129,255,.14)', glow:'rgba(166,129,255,.32)'},
  {color:'rgba(255,139,85,.92)', fill:'rgba(255,139,85,.14)', glow:'rgba(255,139,85,.3)'}
];
let adminUnlocked = false;
let toastTimer;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return value ?? fallback;
  } catch (_) { return fallback; }
}
function bookings() { return readJson(STORAGES.bookings, []); }
function blockedSlots() { return readJson(STORAGES.blocked, []); }
function slotOverrides() { return readJson(STORAGES.overrides, {}); }
function store(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function slotKey(day, time) { return `${day}|${time}`; }
function getSlotStatus(day, time) {
  const accepted = bookings().find(b => b.data && b.data === day && b.horario === time && b.status !== 'Recusado');
  const isBooked = bookings().some(b => b.data === day && b.horario === time && b.status !== 'Recusado');
  if (isBooked) return { available:false, reason:'Este horário já tem um pedido de agendamento.', booked:true };
  if (blockedSlots().some(b => b.data === day && b.horario === time)) return { available:false, reason:'Este horário foi bloqueado pelo salão.', blocked:true };
  const override = slotOverrides()[slotKey(day,time)];
  if (override === 'available') return {available:true, custom:true};
  if (override === 'unavailable') return {available:false, blocked:true, reason:'Este horário está marcado como indisponível pelo salão.'};
  if (DEFAULT_AVAILABLE.has(time)) return {available:true};
  return {available:false, reason:'Este horário está marcado como indisponível no painel.', defaultClosed:true};
}
function showToast(text) {
  let toast = document.getElementById('sbToast');
  if (!toast) {
    toast = document.createElement('div'); toast.id = 'sbToast'; toast.className = 'toast'; toast.setAttribute('role','status');
    document.body.appendChild(toast);
  }
  toast.textContent = text; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2900);
}

// Floating bubbles + a liquid ripple are emitted from every pointer click on the page.
function createClickEffect(x, y, size = 1) {
  const layer = document.getElementById('fxLayer') || (() => {
    const node = document.createElement('div'); node.id = 'fxLayer'; document.body.appendChild(node); return node;
  })();
  const ripple = document.createElement('span'); ripple.className = 'click-ripple';
  ripple.style.left = `${x}px`; ripple.style.top = `${y}px`; layer.appendChild(ripple);
  setTimeout(() => ripple.remove(), 750);
  const count = Math.min(15, Math.round(8 * size));
  for (let i=0;i<count;i++) {
    const palette = COLORS[Math.floor(Math.random()*COLORS.length)];
    const node = document.createElement('span');
    const bubble = Math.random() > .35;
    node.className = bubble ? 'bubble' : 'bubble-spark';
    node.style.setProperty('--x', `${x + (Math.random()-0.5)*25}px`);
    node.style.setProperty('--y', `${y + (Math.random()-0.5)*25}px`);
    node.style.setProperty('--bubble-color', palette.color);
    node.style.setProperty('--bubble-fill', palette.fill);
    node.style.setProperty('--bubble-glow', palette.glow);
    node.style.setProperty('--size', `${(5 + Math.random()*18) * size}px`);
    node.style.setProperty('--duration', `${.75 + Math.random()*1.1}s`);
    node.style.setProperty('--drift', `${(Math.random()-.5)*125}px`);
    node.style.setProperty('--rise', `${45 + Math.random()*100}px`);
    layer.appendChild(node);
    setTimeout(() => node.remove(), 2100);
  }
}
document.addEventListener('pointerdown', e => {
  createClickEffect(e.clientX, e.clientY, e.target.closest('.hotspot, .brand, .brand-hit, .service-card') ? 1.25 : .9);
}, {passive:true});

function openModal() {
  if (!modal) return;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  if (dateInput && !dateInput.value) dateInput.value = localDate();
  updateAvailability();
  setTimeout(() => service?.focus(), 80);
}
function closeModal() {
  if (!modal) return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow = '';
}
document.querySelectorAll('[data-open-booking]').forEach(button => button.addEventListener('click', openModal));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeModal));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Clicking the GV mark or Geovane Viana title gives it a dedicated gold pulse.
document.querySelector('[data-brand-hit]')?.addEventListener('click', () => {
  const stage = document.querySelector('.stage');
  stage?.classList.remove('brand-active');
  void stage?.offsetWidth;
  stage?.classList.add('brand-active');
  setTimeout(() => stage?.classList.remove('brand-active'), 900);
  showToast('GV • Geovane Viana — beleza, estilo e confiança ✦');
});

// Service cards open the booking modal with the requested service preselected.
document.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => {
  const value = button.dataset.service;
  const map = {'Corte de cabelo':'Corte feminino','Progressiva':'Progressiva','Sobrancelha':'Sobrancelha','Coloração':'Coloração'};
  openModal(); if (service) service.value = map[value] || '';
  updateAvailability();
  showToast(`Serviço selecionado: ${map[value] || value}`);
}));

function setTime(value) {
  if (!timeSelect || !value) return;
  const option = [...timeSelect.options].find(o => o.value === value);
  if (option && !option.disabled) {
    timeSelect.value = value;
    renderTimeChips();
  }
}
function buildTimeOption(value, available, selectedValue) {
  const option = document.createElement('option');
  option.value = value; option.textContent = `${value}${available ? ' — disponível' : ' — indisponível'}`;
  option.disabled = !available;
  if (selectedValue === value && available) option.selected = true;
  return option;
}
function renderTimeChips() {
  const day = dateInput?.value || localDate();
  const selected = timeSelect?.value;
  const availableBox = document.getElementById('availableTimes');
  const unavailableBox = document.getElementById('unavailableTimes');
  const dateLabel = document.getElementById('availabilityDateLabel');
  if (!availableBox || !unavailableBox || !timeSelect) return;
  availableBox.innerHTML = ''; unavailableBox.innerHTML = '';
  if (dateLabel) {
    const parts = day.split('-');
    dateLabel.textContent = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : 'Selecione uma data';
  }
  const options = ALL_TIMES.map(time => ({time, status:getSlotStatus(day,time)}));
  options.filter(o=>o.status.available).forEach(({time}) => {
    const button=document.createElement('button');button.type='button';button.className=`time-chip${selected===time?' selected':''}`;
    button.textContent=time;button.setAttribute('aria-label',`Selecionar horário ${time}`);
    button.addEventListener('click',()=>{setTime(time);showToast(`Horário ${time} selecionado`)});
    availableBox.appendChild(button);
  });
  options.filter(o=>!o.status.available).forEach(({time,status}) => {
    const button=document.createElement('button');button.type='button';
    const override=slotOverrides()[slotKey(day,time)];
    button.className=`time-chip${override==='available'?' available-by-admin':''}`;
    button.textContent=time;button.setAttribute('aria-label',`${time} indisponível`);
    if (override === 'available' && !status.booked && !status.blocked) {
      button.className='time-chip';button.disabled=false;
      button.addEventListener('click',()=>{setTime(time);showToast(`Horário ${time} selecionado`)});
    } else {
      button.disabled=true;
      button.addEventListener('click',()=>showToast(status.reason || 'Este horário não está disponível.'));
      button.title=status.reason || 'Indisponível';
    }
    unavailableBox.appendChild(button);
  });
  timeSelect.innerHTML='';
  const prompt=document.createElement('option');prompt.value='';prompt.textContent='Escolha um horário disponível';timeSelect.appendChild(prompt);
  options.filter(o=>o.status.available).forEach(({time})=>timeSelect.appendChild(buildTimeOption(time,true,selected)));
  if (!options.some(o=>o.status.available)) {
    const none=document.createElement('option');none.value='';none.textContent='Sem horários disponíveis nesta data';timeSelect.appendChild(none);
  }
  if (selected && options.some(o=>o.time===selected&&o.status.available)) timeSelect.value=selected;
}
function updateAvailability(preferredTime) {
  if (!dateInput || !timeSelect) return;
  if (dateInput.value && dateInput.min && dateInput.value < dateInput.min) dateInput.value = dateInput.min;
  renderTimeChips();
  if (preferredTime) {
    const status=getSlotStatus(dateInput.value || localDate(), preferredTime);
    if (status.available) setTime(preferredTime);
    else showToast(status.reason || `${preferredTime} está indisponível para esta data.`);
  }
}
if (dateInput) {
  dateInput.min = localDate();
  if (!dateInput.value) dateInput.value = localDate();
  dateInput.addEventListener('change', () => { updateAvailability(); showToast('Agenda atualizada para a data escolhida'); });
}
timeSelect?.addEventListener('change', renderTimeChips);

// Time slots printed on the main artwork work as real controls.
document.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => {
  const time=button.dataset.slot;
  if (!dateInput.value) dateInput.value=localDate();
  const status=getSlotStatus(dateInput.value,time);
  if (status.available) {
    openModal(); updateAvailability(time);
    showToast(`Horário ${time} selecionado. Agora escolha o serviço e preencha seus dados.`);
  } else {
    createClickEffect(window.innerWidth*.85, window.innerHeight*.5, 1.5);
    showToast(status.reason || `${time} está indisponível. Escolha um horário verde.`);
    if (button.dataset.unavailable === 'true') button.classList.add('slot-unavailable-pulse');
  }
}));

if (form) form.addEventListener('submit', e => {
  e.preventDefault();
  const data=Object.fromEntries(new FormData(form).entries());
  const day=data.data, time=data.horario;
  if (!day || day < localDate()) { msg.textContent='Escolha uma data válida, a partir de hoje.'; msg.style.color='#ff9c9c'; return; }
  const status=getSlotStatus(day,time);
  if (!status.available) {
    msg.textContent=status.reason || 'Esse horário não está mais disponível. Escolha outro.';
    msg.style.color='#ff9c9c'; updateAvailability(); return;
  }
  data.status='Pendente';data.criadoEm=new Date().toISOString();data.id=`GV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`;
  const old=bookings();old.push(data);store(STORAGES.bookings,old);
  msg.textContent='Pedido registrado neste navegador! O horário foi reservado como PENDENTE até a confirmação do salão.';
  msg.style.color='#8fda9a';
  showToast('Pedido salvo! Aguarde a confirmação do salão.');
  const selectedDate=day;
  form.reset();dateInput.value=selectedDate;updateAvailability();
});

// Local administrator controls: change daily availability and accept/reject requests.
document.getElementById('adminToggle')?.addEventListener('click', () => {
  const panel=document.getElementById('adminPanel');panel.hidden=!panel.hidden;
  if (!panel.hidden) document.getElementById('adminPassword')?.focus();
});
document.querySelector('[data-open-admin]')?.addEventListener('click', () => {
  openModal();
  const panel=document.getElementById('adminPanel'); if(panel)panel.hidden=false;
  document.getElementById('adminPassword')?.focus();
  document.getElementById('adminPanel')?.scrollIntoView({behavior:'smooth',block:'nearest'});
});
document.getElementById('adminLogin')?.addEventListener('click', () => {
  if (document.getElementById('adminPassword').value !== ADMIN_PASSWORD) {
    showToast('Senha incorreta.'); return;
  }
  adminUnlocked=true;renderAdminPanel();showToast('Painel de administração aberto.');
});
function renderAdminPanel() {
  const area=document.getElementById('adminContent');if(!area || !adminUnlocked)return;
  const chosenDay=document.getElementById('adminDay')?.value || dateInput?.value || localDate();
  area.innerHTML=`<h3 class="admin-content-title">Disponibilidade por data</h3><label>Data da agenda<input class="admin-day" type="date" id="adminDay" min="${localDate()}" value="${escapeHtml(chosenDay)}"></label><p style="font-size:10px;color:#c5b69d">Toque em um horário para alternar entre disponível e indisponível. Pedidos pendentes ou aceitos ocupam o horário.</p><div id="adminSlotGrid" class="admin-slots"></div><h3 class="admin-content-title">Pedidos de agendamento</h3><div id="adminBookings"></div><button type="button" class="submit" id="exportCsv" style="margin-top:10px">Exportar pedidos (CSV)</button>`;
  document.getElementById('adminDay').addEventListener('change',renderAdminPanel);
  const grid=document.getElementById('adminSlotGrid');
  ALL_TIMES.forEach(time=>{
    const status=getSlotStatus(chosenDay,time);const button=document.createElement('button');button.type='button';
    button.className=`admin-slot${status.available?'':' is-off'}`;
    button.textContent=`${time} · ${status.booked?'Ocupado':status.available?'Disponível':'Indisponível'}`;
    button.disabled=!!status.booked;
    button.addEventListener('click',()=>{
      const overrides=slotOverrides();const k=slotKey(chosenDay,time);
      const current=getSlotStatus(chosenDay,time);
      overrides[k]=current.available?'unavailable':'available';
      store(STORAGES.overrides,overrides);
      renderAdminPanel();updateAvailability();showToast(`${time}: ${overrides[k]==='available'?'disponível':'indisponível'}`);
    });grid.appendChild(button);
  });
  const list=document.getElementById('adminBookings');const all=bookings().slice().reverse();
  if (!all.length) list.innerHTML='<p style="font-size:11px;color:#a99b87">Nenhum pedido registrado neste navegador.</p>';
  else all.forEach(b=>{
    const row=document.createElement('div');row.className='admin-booking';
    row.innerHTML=`<b>${escapeHtml(b.nome)}</b> · ${escapeHtml(b.status)}<br>${escapeHtml(b.servico)} — ${escapeHtml(b.data)} às ${escapeHtml(b.horario)}<br>WhatsApp: ${escapeHtml(b.whatsapp)}${b.observacoes?`<br>Observações: ${escapeHtml(b.observacoes)}`:''}`;
    if (b.status !== 'Aceito') { const accept=document.createElement('button');accept.textContent='Aceitar';accept.addEventListener('click',()=>setBookingStatus(b.id,'Aceito'));row.appendChild(accept); }
    if (b.status !== 'Recusado') { const reject=document.createElement('button');reject.className='danger';reject.textContent='Recusar';reject.addEventListener('click',()=>setBookingStatus(b.id,'Recusado'));row.appendChild(reject); }
    list.appendChild(row);
  });
  document.getElementById('exportCsv').addEventListener('click',exportCsv);
}
function setBookingStatus(id,status) {
  const list=bookings();const booking=list.find(b=>b.id===id);if(!booking)return;
  if(status==='Aceito'&&list.some(b=>b.id!==id&&b.data===booking.data&&b.horario===booking.horario&&b.status==='Aceito')) {showToast('Já existe um pedido aceito nesse horário.');return;}
  booking.status=status;store(STORAGES.bookings,list);renderAdminPanel();updateAvailability();showToast(`Pedido ${status.toLowerCase()}.`);
}
function exportCsv() {
  const records=bookings();const header=['Nome','WhatsApp','Serviço','Cor','Data','Horário','Status','Observações'];
  const rows=[header,...records.map(b=>[b.nome,b.whatsapp,b.servico,b.cor,b.data,b.horario,b.status,b.observacoes])];
  const csv='\ufeff'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='agendamentos-geovane-viana.csv';a.click();URL.revokeObjectURL(url);
}

// Prevent a page refresh while keeping keyboard/screen-reader functionality intact.
modal?.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
