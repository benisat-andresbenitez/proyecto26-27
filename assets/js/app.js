(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function emptyData(){return {tasks:[],docs:[],expenses:[],notes:[],posts:[],milestones:[]}}
let data=emptyData(),filter="pendientes",toastTimer;
let syncedData=emptyData(),saveQueue=Promise.resolve(),currentUser=null,currentRole=null,pendingSaveCount=0,deferredMessage="";
const id=()=>globalThis.crypto?.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(v);
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=value=>{if(!value)return "Fecha pendiente";const d=new Date(value+"T12:00:00");return Number.isNaN(d.getTime())?value:d.toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"})};
const tableMap={tasks:"tasks",milestones:"milestones",docs:"documents",notes:"scientific_notes",expenses:"expenses",posts:"posts"};
function toRow(kind,item){
 if(kind==="tasks")return {id:item.id,title:item.title,priority:item.priority||"media",area:item.area||"General",due:item.due||null,done:!!item.done,created_label:item.createdLabel||null};
 if(kind==="milestones")return {id:item.id,title:item.title,date:item.date||null,note:item.note||"",fixed:!!item.fixed};
 if(kind==="docs")return {id:item.id,title:item.title,type:item.type||"Otro",status:item.status||"Pendiente",url:item.url||"",date:item.date||today()};
 if(kind==="notes")return {id:item.id,title:item.title,body:item.body,date:item.date||today()};
 if(kind==="expenses")return {id:item.id,title:item.title,amount:Number(item.amount),type:item.type,date:item.date||today()};
 if(kind==="posts")return {id:item.id,title:item.title,status:item.status||"Idea",date:item.date||null};
 return item;
}
function fromRow(kind,row){
 if(kind==="tasks")return {id:row.id,title:row.title,priority:row.priority,area:row.area,due:row.due||"",done:row.done,createdLabel:row.created_label||""};
 if(kind==="milestones")return {id:row.id,title:row.title,date:row.date||"",note:row.note||"",fixed:row.fixed};
 if(kind==="docs")return {id:row.id,title:row.title,type:row.type,status:row.status,url:row.url||"",date:row.date||today()};
 if(kind==="notes")return {id:row.id,title:row.title,body:row.body,date:row.date||today()};
 if(kind==="expenses")return {id:row.id,title:row.title,amount:Number(row.amount),type:row.type,date:row.date||today()};
 if(kind==="posts")return {id:row.id,title:row.title,status:row.status,date:row.date||""};
 return row;
}
function cloneData(value){return JSON.parse(JSON.stringify(value))}
async function persistChanges(){
 if(!window.benisatSupabase||!currentUser)throw new Error("No hay una sesión activa.");
 for(const kind of Object.keys(tableMap)){
  const table=tableMap[kind], now=data[kind]||[], before=syncedData[kind]||[];
  const oldById=new Map(before.map(item=>[String(item.id),item]));
  const newIds=new Set(now.map(item=>String(item.id)));
  const removed=before.filter(item=>!newIds.has(String(item.id))).map(item=>item.id);
  if(removed.length){
   const {error}=await window.benisatSupabase.from(table).delete().in("id",removed);
   if(error)throw error;
  }
  const changed=now.filter(item=>JSON.stringify(item)!==JSON.stringify(oldById.get(String(item.id)))).map(item=>toRow(kind,item));
  if(changed.length){
   const {error}=await window.benisatSupabase.from(table).upsert(changed,{onConflict:"id"});
   if(error)throw error;
  }
 }
 syncedData=cloneData(data);
}
function save(){
 pendingSaveCount++;
 saveQueue=saveQueue.then(persistChanges).then(()=>{
  pendingSaveCount=Math.max(0,pendingSaveCount-1);
  if(pendingSaveCount===0){
   const message=deferredMessage||"Cambios sincronizados con Supabase.";
   deferredMessage="";
   notify(message);
  }
 }).catch(error=>{
  pendingSaveCount=0;deferredMessage="";
  console.error("BENISAT sync error:",error);
  notify("No se ha podido sincronizar: "+(error.message||"comprueba tu conexión y permisos."));
 });
 return saveQueue;
}
async function loadWorkspace(user){
 currentUser=user;
 $("#auth-gate").classList.add("auth-loading");
 $("#auth-message").textContent="Comprobando permisos del equipo…";
 const memberResult=await window.benisatSupabase.from("team_members").select("role,active").eq("user_id",user.id).maybeSingle();
 if(memberResult.error)throw memberResult.error;
 if(!memberResult.data||!memberResult.data.active){
  await window.benisatSupabase.auth.signOut();
  currentUser=null;
  throw new Error("Tu cuenta no está autorizada en BENISAT. Pide al administrador que te añada como miembro activo.");
 }
 currentRole=memberResult.data.role;
 const kinds=Object.keys(tableMap);
 const results=await Promise.all(kinds.map(kind=>window.benisatSupabase.from(tableMap[kind]).select("*")));
 const next=emptyData();
 for(let i=0;i<kinds.length;i++){
  if(results[i].error)throw results[i].error;
  next[kinds[i]]=results[i].data.map(row=>fromRow(kinds[i],row));
 }
 data=next;syncedData=cloneData(next);
 document.body.classList.add("authenticated");
 $("#auth-gate").classList.remove("auth-loading");
 $("#signed-in-email").textContent=user.email||"";
 $("#connection-status").innerHTML=currentRole==="viewer"?"<i></i> SOLO LECTURA":"<i></i> SINCRONIZADO";
 $("#connection-status").classList.add("connected");
 $("#auth-message").textContent="";
 renderAll();
 const initial=location.hash.slice(1);if(viewNames[initial])showView(initial);
}
function showAuth(message=""){
 document.body.classList.remove("authenticated");
 $("#auth-gate").classList.remove("auth-loading");
 $("#auth-message").textContent=message;
 $("#connection-status").innerHTML="<i></i> SIN CONEXIÓN";
 $("#connection-status").classList.remove("connected");
 $("#signed-in-email").textContent="";
}
function notify(message){if(pendingSaveCount>0&&!/No se ha podido sincronizar|Introduce |Introduce un |válido|enlace válido/i.test(message)){deferredMessage=message;return}const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600)}
const viewNames={inicio:"Inicio",tareas:"Tareas",hitos:"Hitos",documentacion:"Documentación",mision:"Misión científica",presupuesto:"Presupuesto",difusion:"Difusión",ajustes:"Datos locales y copias"};
function showView(name){if(!viewNames[name])name="inicio";$$(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$("#breadcrumb").textContent=viewNames[name];$("#sidebar").classList.remove("open");history.replaceState(null,"","#"+name);window.scrollTo({top:0,behavior:"smooth"})}
function taskMarkup(t){return '<article class="task-row '+(t.done?"done":"")+'"><input class="task-check" type="checkbox" data-task-toggle="'+esc(t.id)+'" aria-label="Completar tarea" '+(t.done?"checked":"")+'><div class="task-copy"><strong>'+esc(t.title)+'</strong><small>'+esc(t.area||"General")+' · '+(t.due?"Fecha límite: "+fmtDate(t.due):"Añadida: "+esc(t.createdLabel||"Hoy"))+(t.done?" · Completada":"")+'</small></div><span class="priority '+(t.priority||"media")+'">'+({alta:"ALTA",media:"MEDIA",baja:"BAJA"}[t.priority||"media"])+'</span><button class="delete-btn" data-task-delete="'+esc(t.id)+'" aria-label="Eliminar tarea">×</button></article>'}
function renderTasks(){const open=data.tasks.filter(t=>!t.done).length;$("#nav-task-count").textContent=open;$("#stat-open").textContent=open;$("#task-total").textContent=data.tasks.length+" tarea"+(data.tasks.length===1?"":"s");const preview=data.tasks.filter(t=>!t.done).sort((a,b)=>({alta:0,media:1,baja:2}[a.priority]??1)-({alta:0,media:1,baja:2}[b.priority]??1)).slice(0,4);$("#task-preview").innerHTML=preview.length?preview.map(taskMarkup).join(""):'<div class="empty-state"><span>✓</span><strong>'+(data.tasks.length?"Todo lo pendiente está hecho":"Todo empieza con un primer paso")+'</strong><p>'+(data.tasks.length?"Buen trabajo. Puedes añadir nuevas tareas cuando quieras.":"Añade una tarea para organizar el trabajo de la misión.")+'</p></div>';const shown=data.tasks.filter(t=>filter==="todas"||(filter==="hechas"?t.done:!t.done)).sort((a,b)=>Number(a.done)-Number(b.done)||({alta:0,media:1,baja:2}[a.priority]??1)-({alta:0,media:1,baja:2}[b.priority]??1));$("#task-list").innerHTML=shown.length?shown.map(taskMarkup).join(""):'<div class="empty-state"><span>✓</span><strong>No hay tareas en esta lista</strong><p>Añade una tarea para comenzar.</p></div>'}
function addTask(title,priority,area,due){title=title.trim();if(!title)return;data.tasks.unshift({id:id(),title,priority,area,due,done:false,createdLabel:fmtDate(today())});save();renderAll();notify("Tarea añadida a tu planificación.")}
function renderMilestones(){const ordered=[...data.milestones].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"));$("#stat-milestones").textContent=data.milestones.length;$("#milestone-preview").innerHTML=ordered.slice(0,3).map(m=>{let d=m.date?new Date(m.date+"T12:00:00"):null;return '<article class="milestone-preview"><div class="date-tile"><strong>'+(d?d.toLocaleDateString("es-ES",{day:"2-digit"}):"—")+'</strong><small>'+(d?d.toLocaleDateString("es-ES",{month:"short"}).toUpperCase():"PEND.")+'</small></div><div class="milestone-copy"><strong>'+esc(m.title)+'</strong><p>'+esc(m.note||fmtDate(m.date))+'</p></div></article>'}).join("");$("#timeline").innerHTML=ordered.map(m=>'<article class="timeline-item"><div class="timeline-pin"></div><div class="timeline-date">'+esc(m.date?fmtDate(m.date).toUpperCase():"FECHA PENDIENTE")+'</div><h3>'+esc(m.title)+'</h3><p>'+esc(m.note||"Sin notas adicionales.")+'</p>'+(m.fixed?'<span class="pill pill-muted">Hito de referencia</span>':'<button class="delete-btn" data-milestone-delete="'+esc(m.id)+'">Eliminar hito ×</button>')+'</article>').join("")}
function renderDocs(){$("#stat-docs").textContent=data.docs.length;$("#documents-list").innerHTML=data.docs.length?data.docs.slice().reverse().map(d=>'<article class="document-row"><div class="document-copy"><strong>'+esc(d.title)+'</strong><small>'+esc(d.type)+' · '+esc(fmtDate(d.date))+'</small>'+(d.url?'<a href="'+esc(d.url)+'" target="_blank" rel="noreferrer">Abrir enlace ↗</a>':"")+'</div><select class="status-select" data-doc-status="'+esc(d.id)+'" aria-label="Estado"><option '+(d.status==="Pendiente"?"selected":"")+'>Pendiente</option><option '+(d.status==="En curso"?"selected":"")+'>En curso</option><option '+(d.status==="Revisado"?"selected":"")+'>Revisado</option><option '+(d.status==="Finalizado"?"selected":"")+'>Finalizado</option></select><button class="delete-btn" data-doc-delete="'+esc(d.id)+'" aria-label="Eliminar">×</button></article>').join(""):'<p class="empty-copy">Todavía no has registrado documentos.</p>'}
function renderNotes(){$("#notes-list").innerHTML=data.notes.slice().reverse().map(n=>'<article class="note-card"><div><strong>'+esc(n.title)+'</strong><small>'+esc(fmtDate(n.date))+'</small><p>'+esc(n.body)+'</p></div><button class="delete-btn" data-note-delete="'+esc(n.id)+'" aria-label="Eliminar nota">×</button></article>').join("")||'<p class="empty-copy">Aún no hay notas científicas.</p>'}
function renderExpenses(){const spend=data.expenses.filter(e=>e.type==="gasto").reduce((s,e)=>s+e.amount,0),income=data.expenses.filter(e=>e.type==="ingreso").reduce((s,e)=>s+e.amount,0),net=spend-income;$("#stat-spent").textContent=money(spend);$("#stat-remaining").textContent=money(500-net)+" disponibles";$("#spent-total").textContent=money(net);$("#remaining-total").textContent=money(500-net);$("#expenses-list").innerHTML=data.expenses.slice().reverse().map(e=>'<article class="expense-row"><div class="expense-copy"><strong>'+esc(e.title)+'</strong><small>'+(e.type==="gasto"?"Gasto":"Ingreso o aportación")+' · '+esc(fmtDate(e.date))+'</small></div><span class="expense-amount '+(e.type==="ingreso"?"income":"")+'">'+(e.type==="gasto"?"−":"+")+money(e.amount)+'</span><button class="delete-btn" data-expense-delete="'+esc(e.id)+'" aria-label="Eliminar movimiento">×</button></article>').join("")||'<p class="empty-copy">Todavía no hay movimientos registrados.</p>'}
function renderPosts(){$("#posts-list").innerHTML=data.posts.slice().reverse().map(p=>'<article class="post-row"><div class="post-copy"><strong>'+esc(p.title)+'</strong><small>'+(p.date?fmtDate(p.date):"Fecha pendiente")+'</small></div><select class="status-select" data-post-status="'+esc(p.id)+'" aria-label="Estado"><option '+(p.status==="Idea"?"selected":"")+'>Idea</option><option '+(p.status==="Preparando"?"selected":"")+'>Preparando</option><option '+(p.status==="Publicado"?"selected":"")+'>Publicado</option></select><button class="delete-btn" data-post-delete="'+esc(p.id)+'" aria-label="Eliminar">×</button></article>').join("")||'<p class="empty-copy">Añade ideas para organizar la difusión.</p>'}
function applyRolePermissions(){
 const readOnly=currentRole==="viewer";
 if(!document.body.classList.contains("authenticated"))return;
 document.querySelectorAll("#view-inicio form,#view-tareas form,#view-hitos form,#view-documentacion form,#view-mision form,#view-presupuesto form,#view-difusion form").forEach(form=>form.querySelectorAll("input,textarea,select,button").forEach(el=>{el.disabled=readOnly}));
 document.querySelectorAll("[data-task-toggle],[data-task-delete],[data-doc-status],[data-doc-delete],[data-note-delete],[data-expense-delete],[data-post-status],[data-post-delete],[data-milestone-delete],#add-milestone-btn,#clear-data,#backup-file").forEach(el=>{el.disabled=readOnly});
}
function renderAll(){renderTasks();renderMilestones();renderDocs();renderNotes();renderExpenses();renderPosts();applyRolePermissions()}
$$(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.goto)));
$("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#quick-task-form").addEventListener("submit",e=>{e.preventDefault();addTask($("#quick-task").value,"media","General","");$("#quick-task").value=""});
$("#task-form").addEventListener("submit",e=>{e.preventDefault();addTask($("#task-title").value,$("#task-priority").value,$("#task-area").value,$("#task-due").value);$("#task-title").value="";$("#task-due").value=""});
$$("[data-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;$$("[data-filter]").forEach(x=>x.classList.toggle("selected",x===b));renderTasks()}));
document.addEventListener("change",e=>{const t=e.target;if(t.dataset.taskToggle){const item=data.tasks.find(x=>x.id===t.dataset.taskToggle);if(item)item.done=t.checked;save();renderTasks()}if(t.dataset.docStatus){const item=data.docs.find(x=>x.id===t.dataset.docStatus);if(item)item.status=t.value;save()}if(t.dataset.postStatus){const item=data.posts.find(x=>x.id===t.dataset.postStatus);if(item)item.status=t.value;save()}});
document.addEventListener("click",e=>{const t=e.target.closest("[data-task-delete]");if(t){data.tasks=data.tasks.filter(x=>x.id!==t.dataset.taskDelete);save();renderTasks();notify("Tarea eliminada.")}const d=e.target.closest("[data-doc-delete]");if(d){data.docs=data.docs.filter(x=>x.id!==d.dataset.docDelete);save();renderDocs();renderAll()}const n=e.target.closest("[data-note-delete]");if(n){data.notes=data.notes.filter(x=>x.id!==n.dataset.noteDelete);save();renderNotes()}const x=e.target.closest("[data-expense-delete]");if(x){data.expenses=data.expenses.filter(v=>v.id!==x.dataset.expenseDelete);save();renderExpenses()}const p=e.target.closest("[data-post-delete]");if(p){data.posts=data.posts.filter(v=>v.id!==p.dataset.postDelete);save();renderPosts()}const m=e.target.closest("[data-milestone-delete]");if(m){data.milestones=data.milestones.filter(v=>v.id!==m.dataset.milestoneDelete);save();renderMilestones();notify("Hito eliminado.")}});
$("#add-milestone-btn").addEventListener("click",()=>$("#milestone-form").classList.toggle("hidden"));
$("#milestone-form").addEventListener("submit",e=>{e.preventDefault();const title=$("#milestone-title").value.trim();if(!title)return;data.milestones.push({id:id(),title,date:$("#milestone-date").value,note:$("#milestone-note").value.trim(),fixed:false});save();renderMilestones();e.target.reset();e.target.classList.add("hidden");notify("Hito añadido.")});
$("#doc-form").addEventListener("submit",e=>{e.preventDefault();const url=$("#doc-url").value.trim();if(url){try{const parsed=new URL(url);if(!["http:","https:"].includes(parsed.protocol))throw Error()}catch{notify("Introduce un enlace válido que empiece por https://");return}}data.docs.push({id:id(),title:$("#doc-title").value.trim(),type:$("#doc-type").value,status:$("#doc-status").value,url,date:today()});save();renderDocs();renderAll();e.target.reset();notify("Registro documental guardado.")});
$("#note-form").addEventListener("submit",e=>{e.preventDefault();data.notes.push({id:id(),title:$("#note-title").value.trim(),body:$("#note-body").value.trim(),date:today()});save();renderNotes();e.target.reset();notify("Nota científica guardada.")});
$("#expense-form").addEventListener("submit",e=>{e.preventDefault();const amount=Number($("#expense-amount").value),title=$("#expense-title").value.trim();if(!title||!Number.isFinite(amount)||amount<=0){notify("Introduce un concepto y un importe válido.");return}data.expenses.push({id:id(),title,amount,type:$("#expense-type").value,date:$("#expense-date").value||today()});save();renderExpenses();renderAll();e.target.reset();notify("Movimiento enviado para sincronización.")});
$("#post-form").addEventListener("submit",e=>{e.preventDefault();data.posts.push({id:id(),title:$("#post-title").value.trim(),status:$("#post-status").value,date:$("#post-date").value});save();renderPosts();e.target.reset();notify("Idea de publicación añadida.")});
function download(filename,text,type="application/json"){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$("#backup-export").addEventListener("click",()=>download("benisat-copia-"+today()+".json",JSON.stringify({version:1,exportedAt:new Date().toISOString(),data},null,2)));
$("#backup-file").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const obj=JSON.parse(await file.text());const imported=obj.data||obj;if(!Array.isArray(imported.tasks)||!Array.isArray(imported.milestones))throw Error("formato");if(!confirm("La copia sustituirá los datos compartidos de todo el equipo. ¿Continuar?"))return;const base=emptyData();data={...base,...imported};save();renderAll();notify("Copia restaurada correctamente.")}catch{notify("No se ha podido leer la copia. Comprueba que sea un JSON de BENISAT.")}finally{e.target.value=""}});
$("#clear-data").addEventListener("click",()=>{if(!confirm("¿Seguro que quieres vaciar TODOS los datos compartidos de BENISAT para todo el equipo? Esta acción no se puede deshacer."))return;data=emptyData();save();renderAll();notify("Se ha solicitado vaciar los datos compartidos.")});
function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"'}
$("#export-finance").addEventListener("click",()=>{const rows=[["Concepto","Tipo","Importe EUR","Fecha"],...data.expenses.map(e=>[e.title,e.type,e.amount,e.date])];download("benisat-presupuesto-"+today()+".csv","\uFEFF"+rows.map(r=>r.map(csvCell).join(";")).join("\r\n"),"text/csv;charset=utf-8")});
$("#auth-form").addEventListener("submit",async e=>{
 e.preventDefault();
 const button=$("#auth-submit"),email=$("#auth-email").value.trim(),password=$("#auth-password").value;
 button.disabled=true;button.textContent="Iniciando sesión…";$("#auth-message").textContent="";
 try{
  const {data:authData,error}=await window.benisatSupabase.auth.signInWithPassword({email,password});
  if(error)throw error;
  await loadWorkspace(authData.user);
 }catch(error){
  console.error("BENISAT auth error:",error);
  showAuth(error.message||"No se ha podido iniciar sesión.");
 }finally{button.disabled=false;button.textContent="Iniciar sesión"}
});
$("#auth-logout").addEventListener("click",async()=>{
 await window.benisatSupabase.auth.signOut();
 currentUser=null;currentRole=null;data=emptyData();syncedData=emptyData();showAuth("Has cerrado sesión.");
});
window.benisatSupabase=window.supabase?.createClient(window.BENISAT_SUPABASE_URL,window.BENISAT_SUPABASE_PUBLISHABLE_KEY,{
 auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
});
async function initApp(){
 if(!window.benisatSupabase){showAuth("No se ha podido cargar la conexión con Supabase. Recarga la página.");return}
 try{
  const {data:sessionData,error}=await window.benisatSupabase.auth.getSession();
  if(error)throw error;
  if(sessionData.session)await loadWorkspace(sessionData.session.user);
  else showAuth("");
 }catch(error){console.error("BENISAT startup error:",error);showAuth(error.message||"No se ha podido conectar con Supabase.")}
}
window.benisatSupabase?.auth.onAuthStateChange((event)=>{
 if(event==="SIGNED_OUT"){currentUser=null;currentRole=null;showAuth("")}
});
initApp();
})();