const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state={user:null,owners:[],storages:[],categories:[],transactions:[],loans:[],recurring:[],charts:{}};

const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n||0))+' Ar';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10);

function show(id){$(id).classList.remove('hidden')} function hide(id){$(id).classList.add('hidden')}
function openModal(html){$('modalContent').innerHTML=html;show('modal')} function closeModal(){hide('modal')}

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(session){state.user=session.user; show('appView');hide('authView');await loadAll();} else {show('authView');hide('appView')}
}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();$('loginError').textContent='';
 const {data,error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});
 if(error){$('loginError').textContent=error.message;return}
 state.user=data.user;hide('authView');show('appView');await loadAll();
});
$('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
$('closeModal').onclick=closeModal;$('modal').onclick=e=>{if(e.target.id==='modal')closeModal()};

document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
document.querySelectorAll('[data-page-link]').forEach(b=>b.onclick=()=>navigate(b.dataset.pageLink));
function navigate(page){
 document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
 $(page).classList.remove('hidden');
 document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.page===page));
 const labels={dashboard:'Overview',transactions:'Transactions',forecast:'Forecast',analytics:'Analytics',owners:'Owners',storages:'Storages',categories:'Categories',recurring:'Recurring',loans:'Loans & receivables'};
 $('pageTitle').textContent=labels[page]||'Overview';
 if(page==='transactions')renderTransactions();
 if(page==='forecast')renderForecast();
 if(page==='analytics')renderAnalytics();
}

async function loadAll(){
 const uid=state.user.id;
 const [o,s,c,t,l,r]=await Promise.all([
  sb.from('owners').select('*').eq('user_id',uid).eq('is_active',true).order('name'),
  sb.from('storages').select('*').eq('user_id',uid).eq('is_active',true).order('name'),
  sb.from('categories').select('*').eq('user_id',uid).eq('is_active',true).order('name'),
  sb.from('transactions').select('*').eq('user_id',uid).order('transaction_date',{ascending:false}).limit(1000),
  sb.from('loans').select('*').eq('user_id',uid).order('loan_date',{ascending:false}),
  sb.from('recurring_rules').select('*').eq('user_id',uid).eq('is_active',true).order('start_date')
 ]);
 state.owners=o.data||[];state.storages=s.data||[];state.categories=c.data||[];state.transactions=t.data||[];state.loans=l.data||[];state.recurring=r.data||[];
 renderDashboard();renderOwners();renderStorages();renderCategories();renderRecurring();renderLoans();
}

function txSigned(t){
 if(t.status==='cancelled')return 0;
 if(t.transaction_type==='expense')return -Number(t.amount);
 if(t.transaction_type==='income')return Number(t.amount);
 return 0;
}
function storageBalance(id){
 return state.transactions.reduce((sum,t)=>{
  if(t.status==='cancelled')return sum;
  if(t.destination_storage_id===id)sum+=Number(t.amount);
  if(t.source_storage_id===id)sum-=Number(t.amount);
  return sum;
 },0);
}
function ownerTransactions(ownerId){return state.transactions.filter(t=>t.owner_id===ownerId)}
function ownerNetWorth(ownerId){
 const ids=new Set(state.storages.filter(s=>state.owners.some(o=>o.id===ownerId)).map(s=>s.id));
 return state.transactions.reduce((sum,t)=>{
   if(t.status==='cancelled'||t.owner_id!==ownerId)return sum;
   return sum+txSigned(t);
 },0);
}
function fmtDate(d){return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}
function catName(id){return state.categories.find(c=>c.id===id)?.name||'Uncategorized'}
function ownerName(id){return state.owners.find(o=>o.id===id)?.name||'—'}
function storageName(id){return state.storages.find(s=>s.id===id)?.name||'—'}

function renderDashboard(){
 const completed=state.transactions.filter(t=>t.status==='completed');
 const liquidity=state.storages.reduce((s,x)=>s+storageBalance(x.id),0);
 const income=completed.filter(t=>t.transaction_type==='income'&&t.transaction_date>=monthStart()).reduce((s,t)=>s+Number(t.amount),0);
 const expense=completed.filter(t=>t.transaction_type==='expense'&&t.transaction_date>=monthStart()).reduce((s,t)=>s+Number(t.amount),0);
 const receivables=state.loans.filter(l=>['active','partially_paid'].includes(l.status)).reduce((s,l)=>s+Number(l.principal_amount)-Number(l.repaid_amount),0);
 $('liquidity').textContent=money(liquidity);$('receivables').textContent=money(receivables);$('debts').textContent=money(0);
 $('netWorth').textContent=money(liquidity+receivables);
 $('monthIncome').textContent='+'+money(income);$('monthExpense').textContent='−'+money(expense);$('cashFlow').textContent=money(income-expense);$('txCount').textContent=completed.length;
 $('quickTransactions').innerHTML=completed.slice(0,8).map(movementHTML).join('')||'<p class="muted">No movements yet.</p>';
 renderCharts();
}
function movementHTML(t){
 const isIn=t.transaction_type==='income';
 const sign=isIn?'+':(t.transaction_type==='expense'?'−':'');
 return `<div class="movement"><span class="date">${fmtDate(t.transaction_date)}</span><div><div class="reason">${esc(t.reason)}</div><div class="meta">${esc(catName(t.category_id))} · ${esc(storageName(t.destination_storage_id||t.source_storage_id))}</div></div><span class="badge">${esc(t.transaction_type)}</span><span class="amount ${isIn?'in':t.transaction_type==='expense'?'out':''}">${sign}${money(t.amount)}</span></div>`;
}
function renderTransactions(){
 let list=[...state.transactions];
 const q=$('searchTx').value.toLowerCase(),type=$('typeFilter').value,from=$('fromDate').value,to=$('toDate').value;
 list=list.filter(t=>(!q||`${t.reason} ${catName(t.category_id)}`.toLowerCase().includes(q))&&(!type||t.transaction_type===type)&&(!from||t.transaction_date>=from)&&(!to||t.transaction_date<=to));
 $('transactionsTable').innerHTML=`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Reason</th><th>Owner</th><th>Source</th><th>Destination</th><th>Amount</th></tr></thead><tbody>${list.map(t=>`<tr><td>${fmtDate(t.transaction_date)}</td><td>${esc(t.transaction_type)}</td><td>${esc(catName(t.category_id))}</td><td>${esc(t.reason)}</td><td>${esc(ownerName(t.owner_id))}</td><td>${esc(storageName(t.source_storage_id))}</td><td>${esc(storageName(t.destination_storage_id))}</td><td>${t.transaction_type==='expense'?'−':t.transaction_type==='income'?'+':''}${money(t.amount)}</td></tr>`).join('')||'<tr><td colspan="8">No results.</td></tr>'}</tbody></table></div>`;
}
['searchTx','typeFilter','fromDate','toDate'].forEach(id=>$(id).addEventListener('input',renderTransactions));
$('newTxBtn').onclick=()=>transactionModal();

function transactionModal(){
 openModal(`<h3>New transaction</h3><form id="txForm" class="form-grid">
 <label>Type<select name="transaction_type"><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option><option value="gift">Gift</option><option value="loan">Loan</option></select></label>
 <label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label>
 <label>Owner<select name="owner_id">${state.owners.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>
 <label>Category<select name="category_id"><option value="">None</option>${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
 <label>Source storage<select name="source_storage_id"><option value="">None</option>${state.storages.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
 <label>Destination storage<select name="destination_storage_id"><option value="">None</option>${state.storages.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
 <label>Date<input name="transaction_date" type="date" value="${today()}"></label>
 <label>Reason<input name="reason" required placeholder="What happened?"></label>
 <label class="full-row">Description<textarea name="description"></textarea></label>
 <button class="primary full-row" type="submit">Save movement</button></form>`);
 $('txForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const row=Object.fromEntries(f);row.user_id=state.user.id;row.amount=Number(row.amount);row.category_id=row.category_id||null;row.source_storage_id=row.source_storage_id||null;row.destination_storage_id=row.destination_storage_id||null;const {error}=await sb.from('transactions').insert(row);if(error){alert(error.message);return}closeModal();await loadAll()};
}

function renderOwners(){
 $('ownersGrid').innerHTML=state.owners.map(o=>`<div class="card"><span class="badge">${esc(o.owner_type)}</span><h3>${esc(o.name)}</h3><p class="muted">${esc(o.description||'')}</p><div class="big">${money(ownerNetWorth(o.id))}</div><small class="muted">Net movement position</small></div>`).join('')||'<p class="muted">Create your first owner.</p>';
}
function renderStorages(){
 $('storagesGrid').innerHTML=state.storages.map(s=>`<div class="card"><span class="badge">${esc(s.storage_type)}</span><h3>${esc(s.name)}</h3><p class="muted">${esc(s.description||'')}</p><div class="big">${money(storageBalance(s.id))}</div><small class="muted">${esc(s.currency)}</small></div>`).join('')||'<p class="muted">Create your first storage.</p>';
}
function renderCategories(){
 $('categoriesGrid').innerHTML=state.categories.map(c=>`<div class="card"><span class="badge" style="border-left:3px solid ${esc(c.color)}">${esc(c.category_type)}</span><h3>${esc(c.icon||'●')} ${esc(c.name)}</h3><p class="muted">${esc(c.color)}</p></div>`).join('')||'<p class="muted">Create your first category.</p>';
}
function renderRecurring(){
 $('recurringGrid').innerHTML=state.recurring.map(r=>`<div class="card"><span class="badge">${esc(r.frequency)}</span><h3>${esc(r.reason)}</h3><div class="big">${money(r.amount)}</div><small class="muted">${fmtDate(r.start_date)}${r.end_date?' → '+fmtDate(r.end_date):' · ongoing'}</small></div>`).join('')||'<p class="muted">No recurring rules.</p>';
}
function renderLoans(){
 $('loansGrid').innerHTML=state.loans.map(l=>{const remaining=Number(l.principal_amount)-Number(l.repaid_amount);return `<div class="card"><span class="badge">${esc(l.status)}</span><h3>${esc(ownerName(l.borrower_owner_id))}</h3><p class="muted">Lender: ${esc(ownerName(l.lender_owner_id))}</p><div class="big">${money(remaining)}</div><small class="muted">${l.due_date?'Due '+fmtDate(l.due_date):'No due date'}</small></div>`}).join('')||'<p class="muted">No loans.</p>';
}

function modalSimple(title,fields,table,after){
 openModal(`<h3>${title}</h3><form id="simpleForm" class="form-grid">${fields}<button class="primary full-row">Save</button></form>`);
 $('simpleForm').onsubmit=async e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.target));row.user_id=state.user.id;const {error}=await sb.from(table).insert(row);if(error){alert(error.message);return}closeModal();await loadAll();after?.()};
}
$('addOwnerBtn').onclick=()=>modalSimple('New owner',`<label>Name<input name="name" required></label><label>Type<select name="owner_type"><option value="individual">Individual</option><option value="company">Company</option><option value="other">Other</option></select></label><label class="full-row">Description<input name="description"></label>`,'owners');
$('addStorageBtn').onclick=()=>modalSimple('New storage',`<label>Name<input name="name" required></label><label>Type<select name="storage_type"><option>bank</option><option>cash</option><option>mobile_money</option><option>savings</option><option>investment</option><option>other</option></select></label><label>Currency<input name="currency" value="MGA"></label><label>Description<input name="description"></label>`,'storages');
$('addCategoryBtn').onclick=()=>modalSimple('New category',`<label>Name<input name="name" required></label><label>Type<select name="category_type"><option value="both">Both</option><option value="income">Income</option><option value="expense">Expense</option></select></label><label>Color<input name="color" value="#8A7665"></label><label>Icon<input name="icon" value="●"></label>`,'categories');
$('addRecurringBtn').onclick=()=>modalSimple('New recurring rule',`<label>Reason<input name="reason" required></label><label>Amount<input name="amount" type="number" step="0.01" required></label><label>Type<select name="transaction_type"><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Frequency<select name="frequency"><option>daily</option><option>weekly</option><option>monthly</option><option>yearly</option></select></label><label>Start date<input name="start_date" type="date" value="${today()}"></label><label>End date<input name="end_date" type="date"></label><label>Owner<select name="owner_id"><option value="">None</option>${state.owners.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label><label>Storage<select name="source_storage_id"><option value="">None</option>${state.storages.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`,'recurring_rules');
$('addLoanBtn').onclick=()=>modalSimple('New loan',`<label>Lender<select name="lender_owner_id">${state.owners.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label><label>Borrower<select name="borrower_owner_id">${state.owners.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label><label>Amount<input name="principal_amount" type="number" step="0.01" required></label><label>Loan date<input name="loan_date" type="date" value="${today()}"></label><label>Due date<input name="due_date" type="date"></label><label>Reason<input name="reason"></label>`,'loans');

function chart(id,type,data,options={}){
 if(state.charts[id])state.charts[id].destroy();
 state.charts[id]=new Chart($(id),{type,data,options:{responsive:true,plugins:{legend:{labels:{color:'#aaa',font:{size:10}}}},scales:type==='doughnut'?{}:{x:{ticks:{color:'#777'},grid:{color:'#1c1b1a'}},y:{ticks:{color:'#777'},grid:{color:'#1c1b1a'}}},...options}});
}
function renderCharts(){
 const labels=[],vals=[];for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const key=d.toISOString().slice(0,7);labels.push(key);vals.push(state.transactions.filter(t=>t.status==='completed'&&t.transaction_date.startsWith(key)).reduce((s,t)=>s+txSigned(t),0))}
 chart('cashChart','line',{labels,datasets:[{label:'Net monthly flow',data:vals,borderWidth:2,tension:.35}]});
 const cats=state.categories.map(c=>({name:c.name,total:state.transactions.filter(t=>t.transaction_type==='expense'&&t.category_id===c.id).reduce((s,t)=>s+Number(t.amount),0)})).filter(x=>x.total);
 chart('categoryChart','doughnut',{labels:cats.map(x=>x.name),datasets:[{data:cats.map(x=>x.total)}]});
}
function renderForecast(){
 const current=state.storages.reduce((s,x)=>s+storageBalance(x.id),0);
 const projected=(days)=>{let total=current;for(let i=1;i<=days;i++){const d=new Date();d.setDate(d.getDate()+i);const ds=d.toISOString().slice(0,10);state.recurring.filter(r=>r.is_active&&r.start_date<=ds&&(!r.end_date||r.end_date>=ds)).forEach(r=>{if(r.frequency==='daily'||(r.frequency==='weekly'&&d.getDay()===new Date(r.start_date+'T00:00:00').getDay())||(r.frequency==='monthly'&&d.getDate()===Number(r.day_of_month||new Date(r.start_date+'T00:00:00').getDate()))||(r.frequency==='yearly'&&d.getDate()===new Date(r.start_date+'T00:00:00').getDate()&&d.getMonth()===new Date(r.start_date+'T00:00:00').getMonth()))total+=(r.transaction_type==='income'?1:-1)*Number(r.amount);state.transactions.filter(t=>t.status==='planned'&&t.transaction_date===ds).forEach(t=>total+=txSigned(t))}return total};
 [7,30,90,365].forEach(n=>$('f'+n).textContent=money(projected(n)));
 const labels=[],data=[];for(let i=0;i<=90;i+=5){const d=new Date();d.setDate(d.getDate()+i);labels.push(d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}));data.push(projected(i))}
 chart('forecastChart','line',{labels,datasets:[{label:'Projected balance',data,borderWidth:2,tension:.3}]});
 $('forecastWarnings').innerHTML=[7,30,90,365].map(n=>projected(n)<0?`<div class="warning">Potential cash shortage within ${n} days: projected balance ${money(projected(n))}.</div>`:'').join('');
}
function renderAnalytics(){
 const completed=state.transactions.filter(t=>t.status==='completed'),income=completed.filter(t=>t.transaction_type==='income').reduce((s,t)=>s+Number(t.amount),0),expense=completed.filter(t=>t.transaction_type==='expense').reduce((s,t)=>s+Number(t.amount),0);
 const labels=[],inc=[],exp=[];for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const k=d.toISOString().slice(0,7);labels.push(k);inc.push(completed.filter(t=>t.transaction_type==='income'&&t.transaction_date.startsWith(k)).reduce((s,t)=>s+Number(t.amount),0));exp.push(completed.filter(t=>t.transaction_type==='expense'&&t.transaction_date.startsWith(k)).reduce((s,t)=>s+Number(t.amount),0))}
 chart('incomeExpenseChart','bar',{labels,datasets:[{label:'Income',data:inc},{label:'Expenses',data:exp}]});
 const rate=income?((income-expense)/income*100):0;
 $('analyticsList').innerHTML=`<div class="insight">Total income <strong>${money(income)}</strong></div><div class="insight">Total expenses <strong>${money(expense)}</strong></div><div class="insight">Net cash flow <strong>${money(income-expense)}</strong></div><div class="insight">Savings rate <strong>${rate.toFixed(1)}%</strong></div>`;
}
init();
