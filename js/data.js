/* Data layer extracted from V2 project */
/* HTML escape helper — prevents XSS when rendering user input */
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
/* text inside a quoted string of an inline handler: esc() alone is not enough, the browser decodes it before the code runs */
function escArg(s){return esc(String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n'))}
var QUOTES=["Small steps add up.","Start with one task.","Focus on what is in front of you.","Consistency beats intensity.","Progress, not perfection."];

var D=(function(){var SK='st3_d',GK='st3_g',TK='st3_t',GF='study_timer_v3.json';var DEF={config:{studySubjects:['General','Other'],workCategories:['General','Other'],knowledgeCategories:['General','Other'],theme:'dark',dailyGoals:{'default':6},effectiveMins:50,wakeTime:6,recurringTypes:['General','Other'],goalPresets:[]},deadlines:[],study:{},work:{},syllabus:{},revisions:[],recurring:[],recurringDone:{},knowledge:[]};function gl(){try{var d=JSON.parse(localStorage.getItem(SK));if(!d||!d.config)return cp(DEF);if(!d.revisions)d.revisions=[];return d}catch(e){return cp(DEF)}}function sl(d){localStorage.setItem(SK,JSON.stringify(d))}function cp(o){return JSON.parse(JSON.stringify(o))}function gid(){return localStorage.getItem(GK)||''}function sgid(v){localStorage.setItem(GK,v)}function tok(){return localStorage.getItem(TK)||''}function stok(v){localStorage.setItem(TK,v)}function cloud(){return !!(tok()&&gid())}function tk(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}function getSess(t,dk){var d=gl();return(d[t]&&d[t][dk])||[]}function todayS(t){return getSess(t,tk())}function addS(type,dk,s){var d=gl();if(!d[type])d[type]={};if(!d[type][dk])d[type][dk]=[];d[type][dk].push(s);sl(d)}function delS(type,i){var d=gl(),k=tk();if(d[type]&&d[type][k]){d[type][k].splice(i,1);if(!d[type][k].length)delete d[type][k];sl(d)}}function getCfg(){return gl().config||cp(DEF.config)}function setCfg(c){var d=gl();d.config=c;sl(d)}function getDL(){return gl().deadlines||[]}function setDL(a){var d=gl();d.deadlines=a;sl(d)}function getSyl(){return gl().syllabus||{}}function setSyl(s){var d=gl();d.syllabus=s;sl(d)}function getRevs(){return gl().revisions||[]}function setRevs(r){var d=gl();d.revisions=r;sl(d)}function addRev(r){var d=gl();if(!d.revisions)d.revisions=[];d.revisions.push(r);sl(d)}
function getRC(){return gl().recurring||[]}function setRC(r){var d=gl();d.recurring=r;sl(d)}function addRC(r){var d=gl();if(!d.recurring)d.recurring=[];d.recurring.push(r);sl(d)}
/* ========== EXAM SYSTEM ========== */
/* A profile saved before exams existed gets one exam with a neutral name; saved names are never changed */
function _migrateExams(){
  var d=gl();var cfg=d.config;
  if(!cfg.exams){
    cfg.exams=[{id:'exam_'+Date.now(),name:'My exam',subjects:cfg.studySubjects||[]}];
    d.config=cfg;sl(d);
  }
}
function getExams(){_migrateExams();return gl().config.exams||[]}
function setExams(exams){var cfg=getCfg();cfg.exams=exams;setCfg(cfg)}
/* Flat list of all subjects across all exams — backward-compatible replacement for studySubjects */
function getAllSubjects(){
  var exams=getExams();var subs=[];
  exams.forEach(function(ex){(ex.subjects||[]).forEach(function(s){if(subs.indexOf(s)===-1)subs.push(s)})});
  return subs;
}
function getExamForSubject(subj){
  var exams=getExams();
  for(var i=0;i<exams.length;i++){if((exams[i].subjects||[]).indexOf(subj)!==-1)return exams[i]}
  return null;
}
function addExam(name){
  var exams=getExams();
  exams.push({id:'exam_'+Date.now(),name:name,subjects:[]});
  setExams(exams);
}
function removeExam(id){
  var exams=getExams().filter(function(e){return e.id!==id});
  setExams(exams);
}
function addSubjectToExam(examId,subject){
  var exams=getExams();
  var ex=exams.find(function(e){return e.id===examId});
  if(ex&&ex.subjects.indexOf(subject)===-1)ex.subjects.push(subject);
  setExams(exams);
  /* Keep studySubjects in sync for backward compat */
  _syncStudySubjects();
}
function removeSubjectFromExam(examId,subject){
  var exams=getExams();
  var ex=exams.find(function(e){return e.id===examId});
  if(ex)ex.subjects=ex.subjects.filter(function(s){return s!==subject});
  setExams(exams);
  _syncStudySubjects();
}
/* Keep cfg.studySubjects in sync with exams (backward compat for merge, etc.) */
function _syncStudySubjects(){
  var cfg=getCfg();cfg.studySubjects=getAllSubjects();setCfg(cfg);
}
function getRCDone(){return gl().recurringDone||{}}function setRCDone(x){var d=gl();d.recurringDone=x;sl(d)}function markRCDone(id){var d=gl(),today=tk();if(!d.recurringDone)d.recurringDone={};if(!d.recurringDone[today])d.recurringDone[today]=[];if(d.recurringDone[today].indexOf(id)===-1)d.recurringDone[today].push(id);sl(d)}
/* Recursive todo list merge — deduplicates by id, merges children recursively */
function _mergeTodoList(local,remote){var byId={};var order=[];local.forEach(function(it){byId[it.id]=cp(it);order.push(it.id)});remote.forEach(function(it){if(!byId[it.id]){byId[it.id]=cp(it);order.push(it.id)}else{var ex=byId[it.id];if(it.status==='done'&&ex.status!=='done'){ex.status='done';ex.completedAt=it.completedAt}if(it.children&&it.children.length){if(!ex.children)ex.children=[];ex.children=_mergeTodoList(ex.children,it.children)}}});return order.map(function(id){return byId[id]})}
/* A copy that equals a freshly opened app has nothing of the person in it: the other copy wins whole. Else the two are merged. */
function isFresh(d){
  if(!d||!d.config)return false;
  var c=cp(d),e=c.config.exams;
  if(e){if(e.length!==1||e[0].name!=='My exam'||Object.keys(e[0]).length!==3||JSON.stringify(e[0].subjects)!==JSON.stringify(DEF.config.studySubjects))return false;delete c.config.exams}
  return JSON.stringify(c)===JSON.stringify(DEF);
}
function merge(a,b){
  if(isFresh(b))return cp(a);
  b=safeBackup(b);
  var lists=['studySubjects','workCategories','knowledgeCategories','recurringTypes'],fresh=isFresh(a),start=a;
  /* a fresh app starts empty: it gets exactly the fields a merge carries, never an unknown field of the other file */
  if(fresh){start=cp(DEF);lists.forEach(function(k){start.config[k]=[]})}
  var m=mergeSaved(start,b);
  if(fresh)lists.forEach(function(k){if(!m.config[k].length)m.config[k]=cp(DEF.config[k])});
  if(b.config&&!(m.config.goalPresets||[]).length){var p=safePresets(b.config.goalPresets);if(p.length)m.config.goalPresets=p}
  return m;
}
/* an imported schedule is drawn into the page: rebuilt from this shape only */
function safePresets(list){
  var ok=['all','even','odd'],out=[];
  (Array.isArray(list)?list:[]).forEach(function(p){
    if(!p||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||typeof p.name!=='string')return;
    var h=Number(p.hours);if(!isFinite(h)||h<0||h>999)return;
    var rules=Array.isArray(p.dayRules)?p.dayRules:Array.isArray(p.days)?p.days.map(function(d){return{day:d,pattern:p.weekPattern||'all'}}):[];
    out.push({id:p.id,name:p.name,hours:h,dayRules:rules.filter(function(r){return r&&[0,1,2,3,4,5,6].indexOf(r.day)!==-1&&ok.indexOf(r.pattern||'all')!==-1}).map(function(r){return{day:r.day,pattern:r.pattern||'all'}}),active:!!p.active});
  });
  return out;
}
/* An imported backup (file or Gist) is rebuilt from this allowlist, because the page stores a token and draws these
   values into HTML and click handlers. Ids, dates, times, numbers and choices must have their own shape. Free text
   stays as typed and is escaped where it is drawn. A field added to the data model must be added here too. */
var safeBackup=(function(){
  function own(o,k){return Object.prototype.hasOwnProperty.call(o,k)}
  function plain(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}
  /* listed once at load: a page that gets polluted later must not turn honest names into reserved ones */
  var BUILT_IN=Object.getOwnPropertyNames(Object.prototype);
  function builtIn(s){return BUILT_IN.indexOf(s)!==-1}
  function text(v){return typeof v==='string'?v:typeof v==='number'&&isFinite(v)?String(v):''}
  /* a name is also used as an object key, so it cannot be constructor, __proto__ and the like - also not after an
     <option> handed it back, which drops NUL and collapses white space */
  function name(v){var s=text(v),k=s.replace(/\0/g,'').replace(/[\t\n\f\r ]+/g,' ').trim();return builtIn(k)?k+'_':s}
  /* the same bad id always becomes the same good one, so links and a second import still match */
  function id(v){
    if(typeof v==='number'&&isFinite(v))return v;
    if(typeof v==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(v)&&!builtIn(v))return v;
    /* two independent 32-bit hashes, so two different ids do not become one */
    var s=String(JSON.stringify(v)),h=0x811c9dc5,g=5381;
    for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);h=Math.imul(h^c,16777619);g=Math.imul(g,33)+c|0}
    return 'imported_'+(h>>>0).toString(36)+'_'+(g>>>0).toString(36);
  }
  function num(min,max,fallback){return function(v){
    if(v===null)return null;
    var n=typeof v==='number'?v:typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?Number(v):NaN;
    return isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
  }}
  function one(choices,fallback){return function(v){return choices.indexOf(v)!==-1?v:fallback}}
  function flag(v){return typeof v==='boolean'?v:true}
  var DAY=/^\d{4,6}-\d\d-\d\d$/,CLOCK=/^\d{1,4}:\d\d(:\d\d)?$/,ISO=/^[+-]?\d{4,6}-\d\d-\d\d(T\d\d:\d\d(:\d\d(\.\d{1,6})?)?(Z|[+-]\d\d:?\d\d)?)?$/;
  function shaped(re){return function(v){return typeof v==='string'&&re.test(v)?v:''}}
  var date=shaped(DAY),time=shaped(CLOCK),iso=shaped(ISO);
  function moment(v){return typeof v==='number'&&isFinite(v)?v:iso(v)}
  function optTime(v){return v===null?null:time(v)}
  function done(v){return v===true}
  function list(check,fallback){return function(v){
    if(!Array.isArray(v))return fallback?[]:undefined;
    return v.map(check).filter(function(x){return x!==undefined});
  }}
  function record(fields){return function(v){
    if(!plain(v))return undefined;
    var out={};
    Object.keys(v).forEach(function(k){if(own(fields,k)){var x=fields[k](v[k]);if(x!==undefined)out[k]=x}});
    return out;
  }}
  function map(key,check){return function(v){
    if(!plain(v))return undefined;
    var out={};
    Object.keys(v).forEach(function(k){var safe=key(k);if(safe!==undefined){var x=check(v[k]);if(x!==undefined)out[safe]=x}});
    return out;
  }}
  function day(k){return DAY.test(k)?k:undefined}
  function goalDay(k){return k==='default'?k:day(k)}

  var diff=one(['easy','medium','hard',''],''),priority=one(['critical','high','medium','low',''],'medium');
  var names=list(name),hours=num(0,1e6,0),secs=num(0,1e9,0),clock=num(0,48);
  var sessions=map(day,list(record({cat:name,dur:secs,start:moment,end:moment,note:text,topic:text,diff:diff,source:text,planId:id})));
  var todoFields={id:id,title:text,type:one(['todo','note',''],'todo'),priority:priority,due:date,content:text,
    status:one(['pending','done'],'pending'),completedAt:moment,createdAt:moment,repeat:one(['daily','weekly','monthly',''],''),
    estMins:num(0,1e7,0)};
  var todo=record(todoFields);
  todoFields.children=list(todo,true);
  var backup=record({
    config:record({studySubjects:names,workCategories:names,knowledgeCategories:names,recurringTypes:names,
      exams:list(record({id:id,name:text,subjects:list(name,true)})),
      dailyGoals:map(goalDay,num(0,1e6)),wakeTime:clock,bedtime:clock,effectiveMins:num(0,1440),
      dailyWake:map(day,clock),dailyBed:map(day,clock),goalPresets:safePresets}),
    deadlines:list(record({id:id,type:one(['study','work','personal',''],''),title:text,date:moment,done:done})),
    revisions:list(record({id:id,subj:name,topic:text,diff:diff,created:date,revCount:num(0,1e6,0),
      history:list(record({date:date,diff:diff,type:text}),true),nextDate:date,active:flag})),
    recurring:list(record({id:id,title:text,rcType:name,time:time,active:flag,
      pattern:one(['daily','weekly','specific','fortnightly','monthly','yearly'],''),
      days:list(one([0,1,2,3,4,5,6]),true),monthDay:num(1,31,1),yearMonth:num(1,12,1),yearDay:num(1,31,1),startDate:date})),
    knowledge:list(record({id:id,date:date,category:name,topic:text,duration:secs,source:text,notes:text,createdAt:iso})),
    syllabus:map(name,record({total:num(0,5000,0),done:num(0,5000,0)})),
    study:sessions,
    work:sessions,
    plans:map(day,list(record({id:id,subject:name,planFor:one(['study','work',''],'study'),
      type:one(['topic','lecture','revision','practice','other',''],'other'),topic:text,source:text,estHours:hours,
      priority:priority,lecNum:num(0,1e5,null),status:one(['planned','in-progress','completed','skipped','carried'],'planned'),
      notes:text,actualSecs:secs,startTime:optTime,endTime:optTime,createdAt:moment,sortOrder:num(0,1e6,0)}))),
    todos:record({study:list(todo),work:list(todo)}),
    journal:map(day,record({rating:num(0,5,0),mood:one(['😤','😞','😐','😊','🤩',''],''),dayType:name,
      wentRight:text,wentWrong:text,notes:text,tags:list(name,true)}))
  });
  return function(v){if(!plain(v))throw new TypeError('not a backup');return backup(v)};
})();
/* what an edit list offers: the configured values plus every value a record already uses */
function withUsed(list,used){return Array.from(new Set(list.concat(used.filter(Boolean))))}
function mergeSaved(a,b){var m=cp(a);if(b.config){if(b.config.studySubjects)m.config.studySubjects=Array.from(new Set((m.config.studySubjects||[]).concat(b.config.studySubjects)));
/* Merge exams — deduplicate by id */
if(b.config.exams){if(!m.config.exams)m.config.exams=[];var eIds=new Set(m.config.exams.map(function(e){return e.id}));b.config.exams.forEach(function(e){if(!eIds.has(e.id)){m.config.exams.push(e)}else{var existing=m.config.exams.find(function(x){return x.id===e.id});if(existing)existing.subjects=Array.from(new Set((existing.subjects||[]).concat(e.subjects||[])))}})}if(b.config.workCategories)m.config.workCategories=Array.from(new Set((m.config.workCategories||[]).concat(b.config.workCategories)));if(b.config.dailyGoals)Object.assign(m.config.dailyGoals||(m.config.dailyGoals={}),b.config.dailyGoals);
if(b.config.wakeTime!==undefined)m.config.wakeTime=b.config.wakeTime;if(b.config.bedtime!==undefined)m.config.bedtime=b.config.bedtime;if(b.config.effectiveMins!==undefined)m.config.effectiveMins=b.config.effectiveMins;
if(b.config.dailyWake){if(!m.config.dailyWake)m.config.dailyWake={};Object.assign(m.config.dailyWake,b.config.dailyWake)}
if(b.config.dailyBed){if(!m.config.dailyBed)m.config.dailyBed={};Object.assign(m.config.dailyBed,b.config.dailyBed)}}if(b.deadlines){var ids=new Set((m.deadlines||[]).map(function(x){return x.id}));(b.deadlines||[]).forEach(function(x){if(!ids.has(x.id))m.deadlines.push(x)})}if(b.revisions){var rids=new Set((m.revisions||[]).map(function(x){return x.id}));(b.revisions||[]).forEach(function(x){if(!rids.has(x.id))m.revisions.push(x)})}if(b.syllabus){if(!m.syllabus)m.syllabus={};Object.keys(b.syllabus).forEach(function(k){if(!m.syllabus[k])m.syllabus[k]=b.syllabus[k]})}if(b.recurring){if(!m.recurring)m.recurring=[];var rcids=new Set(m.recurring.map(function(x){return x.id}));(b.recurring||[]).forEach(function(x){if(!rcids.has(x.id))m.recurring.push(x)})}if(b.config&&b.config.recurringTypes){m.config.recurringTypes=Array.from(new Set((m.config.recurringTypes||[]).concat(b.config.recurringTypes)))}['study','work'].forEach(function(t){if(b[t]){if(!m[t])m[t]={};Object.keys(b[t]).forEach(function(k){if(!m[t][k])m[t][k]=b[t][k];else{var ends={};m[t][k].forEach(function(s){ends[s.end]=1});b[t][k].forEach(function(s){if(!ends[s.end])m[t][k].push(s)})}})}});
/* Plans: per-item ID merge within each date key */
if(b.plans){if(!m.plans)m.plans={};Object.keys(b.plans).forEach(function(k){if(!m.plans[k]){m.plans[k]=b.plans[k]}else{var ids=new Set(m.plans[k].map(function(p){return p.id}));b.plans[k].forEach(function(p){if(!ids.has(p.id))m.plans[k].push(p)})}})}
/* Todos: recursive per-item ID merge */
if(b.todos){if(!m.todos)m.todos={};['study','work'].forEach(function(g){if(!b.todos[g])return;if(!m.todos[g]){m.todos[g]=b.todos[g]}else{m.todos[g]=_mergeTodoList(m.todos[g],b.todos[g])}})}
/* Journal: per-date merge, keeping most complete entry */
if(b.journal){if(!m.journal)m.journal={};Object.keys(b.journal).forEach(function(k){if(!m.journal[k]){m.journal[k]=b.journal[k]}else{var le=m.journal[k],re=b.journal[k];if(!le.rating&&re.rating)le.rating=re.rating;if(!le.mood&&re.mood)le.mood=re.mood;if(!le.dayType&&re.dayType)le.dayType=re.dayType;if(!le.wentRight&&re.wentRight)le.wentRight=re.wentRight;if(!le.wentWrong&&re.wentWrong)le.wentWrong=re.wentWrong;if(!le.notes&&re.notes)le.notes=re.notes;if(re.tags){if(!le.tags)le.tags=[];le.tags=Array.from(new Set(le.tags.concat(re.tags)))}}})}
/* Knowledge: deduplicate by id */
if(b.knowledge){if(!m.knowledge)m.knowledge=[];var knIds=new Set(m.knowledge.map(function(x){return x.id}));(b.knowledge||[]).forEach(function(x){if(!knIds.has(x.id))m.knowledge.push(x)})}
if(b.config&&b.config.knowledgeCategories){m.config.knowledgeCategories=Array.from(new Set((m.config.knowledgeCategories||[]).concat(b.config.knowledgeCategories)))}
return m}
function hdr(){return{'Authorization':'Bearer '+tok(),'Content-Type':'application/json','Accept':'application/vnd.github+json'}}function findG(){return fetch('https://api.github.com/gists',{headers:hdr()}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(gs){for(var i=0;i<gs.length;i++)if(gs[i].files&&gs[i].files[GF])return gs[i].id;return null})}function makeG(){var f={};f[GF]={content:JSON.stringify(gl(),null,2)};return fetch('https://api.github.com/gists',{method:'POST',headers:hdr(),body:JSON.stringify({description:'Study Timer v3',public:false,files:f})}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(g){return g.id})}function getG(){var id=gid();if(!id)return Promise.resolve(null);return fetch('https://api.github.com/gists/'+id,{headers:hdr()}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(g){var c=g.files&&g.files[GF]&&g.files[GF].content;return c?JSON.parse(c):null})}function putG(d){var id=gid();if(!id)return Promise.resolve();var f={};f[GF]={content:JSON.stringify(d,null,2)};return fetch('https://api.github.com/gists/'+id,{method:'PATCH',headers:hdr(),body:JSON.stringify({files:f})}).then(function(r){if(!r.ok)throw r})}function sync(){if(!cloud())return Promise.resolve(false);return getG().then(function(r){if(r){var m=merge(gl(),r);sl(m);return putG(m)}return putG(gl())}).then(function(){return true})}function push(){if(!cloud())return Promise.resolve();return putG(gl()).catch(function(e){console.error(e)})}function autoConn(){if(!tok())return Promise.reject('No token');return findG().then(function(id){if(id){sgid(id);return sync()}return makeG().then(function(nid){sgid(nid);return true})})}function validate(t){return fetch('https://api.github.com/gists',{headers:{'Authorization':'Bearer '+t,'Accept':'application/vnd.github+json'}}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(gs){for(var i=0;i<gs.length;i++)if(gs[i].files&&gs[i].files[GF])return gs[i].id;return null})}
function exportJSON(){var b=new Blob([JSON.stringify(gl(),null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='study-timer-'+tk()+'.json';a.click();UI.toast('Exported ✓')}function trigImp(){document.getElementById('fIn').click()}function doImp(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){try{var m=merge(gl(),JSON.parse(ev.target.result));sl(m);UI.renderAll();UI.toast('Imported ✓');push()}catch(err){UI.toast('Invalid file')}};r.readAsText(f);e.target.value=''}function clearAll(){if(!confirm('Delete ALL data?'))return;if(!confirm('Really sure?'))return;localStorage.removeItem(SK);sl(cp(DEF));UI.renderAll();UI.toast('Cleared');push()}function disc(){localStorage.removeItem(TK);localStorage.removeItem(GK)}
/* Goal lookup: manual override → preset rules → default */
function getGoalForDate(dk){
var cfg=gl().config||{};
/* 1. Manual override for specific date */
if(cfg.dailyGoals&&cfg.dailyGoals[dk]!==undefined)return cfg.dailyGoals[dk];
/* 2. Preset rules — last match wins (more specific presets go later) */
var d=new Date(dk+'T12:00:00');var dow=d.getDay();var nth=Math.ceil(d.getDate()/7);
var presets=cfg.goalPresets||[];var match=null;
for(var i=0;i<presets.length;i++){
var p=presets[i];if(!p.active)continue;
/* New format: dayRules [{day,pattern}] — each day has its own week pattern */
var rules=p.dayRules||[];
/* Backward compat: old format had days[] + weekPattern */
if(!rules.length&&p.days&&p.days.length){
rules=p.days.map(function(d2){return{day:d2,pattern:p.weekPattern||'all'}});
}
var matched=false;
for(var j=0;j<rules.length;j++){
var r=rules[j];if(r.day!==dow)continue;
if(r.pattern&&r.pattern!=='all'){
if(r.pattern==='even'&&nth%2!==0)continue;
if(r.pattern==='odd'&&nth%2!==1)continue;
}
matched=true;break;
}
if(matched)match=p.hours;
}
if(match!==null)return match;
/* 3. Default fallback */
return(cfg.dailyGoals&&cfg.dailyGoals['default'])||6;
}
/* Per-day wake/bed time: manual override → default */
function getWakeForDate(dk){
  var cfg=gl().config||{};
  if(cfg.dailyWake&&cfg.dailyWake[dk]!==undefined)return cfg.dailyWake[dk];
  return cfg.wakeTime||6;
}
function getBedForDate(dk){
  var cfg=gl().config||{};
  if(cfg.dailyBed&&cfg.dailyBed[dk]!==undefined)return cfg.dailyBed[dk];
  return cfg.bedtime||21.5;
}
return{getLocal:gl,withUsed:withUsed,saveLocal:sl,todayKey:tk,getSess:getSess,todayS:todayS,addSession:addS,deleteSession:delS,getCfg:getCfg,setCfg:setCfg,getDL:getDL,setDL:setDL,getSyl:getSyl,setSyl:setSyl,getRevs:getRevs,setRevs:setRevs,addRev:addRev,getRC:getRC,setRC:setRC,addRC:addRC,getRCDone:getRCDone,setRCDone:setRCDone,markRCDone:markRCDone,getGistId:gid,setGistId:sgid,setToken:stok,getToken:tok,isCloud:cloud,autoConn:autoConn,sync:sync,push:push,validate:validate,makeG:makeG,exportJSON:exportJSON,trigImp:trigImp,doImp:doImp,clearAll:clearAll,disc:disc,getGoalForDate:getGoalForDate,getWakeForDate:getWakeForDate,getBedForDate:getBedForDate,getExams:getExams,setExams:setExams,getAllSubjects:getAllSubjects,getExamForSubject:getExamForSubject,addExam:addExam,removeExam:removeExam,addSubjectToExam:addSubjectToExam,removeSubjectFromExam:removeSubjectFromExam}})();
