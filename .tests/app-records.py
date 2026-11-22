# No data loss: every kind of record the app's own screens write survives a backup import unchanged.
#
# How to use:  python -I .tests/app-records.py [app folder]      exit 0 = PASS
#              Needs Python Playwright + Chromium. It passes on the code before and after the import repair.
#
# Made-up data only. Every request to another host is blocked.
import functools
import http.server
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
root = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).resolve().parent.parent)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=root))
threading.Thread(target=server.serve_forever, daemon=True).start()
ORIGIN = "http://127.0.0.1:%d/" % server.server_address[1]

CREATE = """async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (id) => document.getElementById(id);
  const set = (values) => { for (const [id, v] of Object.entries(values)) el(id).value = v; };
  window.confirm = () => true;
  window.prompt = () => "Exam 'two' & co";
  await wait(170);
  App.skip();
  App.addExam();
  await wait(2);
  set({ addStudy: "Newton's laws" }); App.addCat('study');
  set({ addWork: 'R&D "lab"' }); App.addCat('work');
  set({ addKnowledge: 'Notes <misc>' }); App.addCat('knowledge');
  set({ rcNewType: "Kid's class" }); RECUR.addType();
  UI.renderAll();
  const today = D.todayKey();
  PLAN.init();

  set({ sylSubj: 'General' }); SYL.setupSubj();
  set({ sylLecCount: '12' }); SYL.saveSetup();
  SYL.toggleLec('General', 2);

  set({ planSubj: 'General', planTopic: 'Topic one', planHours: '1.5', planPriority: 'high', planNotes: 'a note',
        planStartTime: '09:00', planEndTime: '10:30', planSource: 'https://example.com/x' });
  PLAN.onSubjChange(); PLAN.add();
  await wait(2);
  set({ planSubj: 'General', planType: 'lecture', planStartTime: '', planEndTime: '' });
  PLAN.onSubjChange();
  document.querySelectorAll('.plan-lec-cb')[3].checked = true;
  document.querySelectorAll('.plan-lec-cb')[4].checked = true;
  PLAN.add();
  await wait(2);
  set({ planFor: 'work' }); PLAN.onPlanForChange();
  set({ planSubj: 'General', planTopic: '' }); PLAN.add();
  const plans = PLAN.getForDate(today);
  PLAN.openEdit(today, plans[0].id);
  set({ peStatus: 'carried', peType: 'revision' }); PLAN.saveEdit();

  CAL.init(); CAL.selectDay(today);
  CAL.onHourClick(today, 23);
  set({ hvSubj: 'General', hvLecCount: '2' }); CAL._onLecCountChange(); CAL.quickAddPlan(today);
  await wait(2);
  CAL.onHourClick(today, 9); CAL.setQuickType('work');
  set({ hvSubj: 'General' }); CAL.quickAddPlan(today);
  await wait(2);
  CAL.onHourClick(today, 11); CAL.setQuickType('knowledge');
  set({ hvSubj: 'General', hvTopic: 'Learnt' }); CAL.quickAddPlan(today);
  set({ hvWake: '05:40', hvBed: '23:10' }); CAL.setDayWake(today);
  set({ hvBed: '23:10' }); CAL.setDayBed(today);

  for (const repeat of ['', 'daily', 'weekly', 'monthly']) {
    TODO.quickAdd('study');
    set({ todoInpTitle: 'Todo ' + repeat, todoInpDue: today, todoInpEstMins: '45', todoInpRepeat: repeat, todoInpPriority: 'critical' });
    TODO.saveFromModal();
    await wait(2);
  }
  const parent = TODO.getTodos().study[0];
  TODO.addChild(parent.id, 'study');
  set({ todoInpTitle: 'Child', todoInpEstMins: '10', todoInpRepeat: '' }); TODO.saveFromModal();
  TODO.toggleDone(TODO.getTodos().study[1].id, 'study');
  TODO.quickAdd('work');
  set({ todoInpTitle: 'Note', todoInpType: 'note', todoInpContent: 'two\\nlines', todoInpRepeat: '' }); TODO.saveFromModal();

  set({ knAddCat: 'General', knAddTopic: 'Fact', knAddMins: '20', knAddSource: 'Book', knAddNotes: 'n' }); KNOW.add();

  PAST.open('study');
  set({ pastCat: 'General', pastNote: 'Past topic', pastMins: '30', pastStart: '07:05' }); PAST.setDiff('easy'); PAST.save();
  PAST.open('work');
  set({ pastCat: 'General', pastNote: '', pastMins: '15' }); PAST.save();
  REV.markDone(D.getRevs()[0].id); REV.setRevDiff('medium'); REV.confirmRev();

  for (const type of ['study', 'work', 'personal']) {
    set({ dlTitle: 'Deadline ' + type, dlType: type, dlDate: today + 'T18:30' }); DL.add();
    await wait(2);
  }
  for (const pattern of ['daily', 'weekly', 'specific', 'fortnightly', 'monthly', 'yearly']) {
    set({ rcTitle: 'Task ' + pattern, rcType: 'General', rcPattern: pattern, rcTime: pattern === 'daily' ? '' : '06:45' });
    RECUR.patternChange(); RECUR.add();
    await wait(2);
  }
  RECUR.toggle(D.getRC()[0].id);
  RECUR.edit(D.getRC()[1].id); set({ rcEditPattern: 'monthly' }); RECUR.editPatternChange(); RECUR.saveEdit();

  SUM.init();
  SUM.setRating(4);
  for (const mood of ['😤', '😞', '😐', '😊', '🤩']) SUM.setMood(mood);
  SUM.toggleTag('focused');
  set({ sumRight: 'Went "well" & fast', sumWrong: "didn't stretch", sumNotes: 'C:\\\\notes' }); SUM.saveJournal();

  set({ goalDate: today, goalHrs: '4.5' }); REM.setGoal();
  set({ cfgWakeTime: '6.5', cfgBedtime: '24', cfgEffective: '45' }); App.saveCfgExtra(true);
  PLAN.openAddPreset();
  set({ gpName: 'Rule', gpHours: '3' });
  PLAN.cycleDayChip(document.querySelector('#gpDayChips .day-chip'));
  PLAN.saveGoalPreset();
  return D.getLocal();
}"""

IMPORT = """async (backup) => {
  localStorage.clear();
  const toast = UI.toast;
  const said = await new Promise((done) => {
    UI.toast = done;
    D.doImp({ target: { files: [new File([JSON.stringify(backup)], 'backup.json')], value: '' } });
  });
  UI.toast = toast;
  return { said, got: D.getLocal() };
}"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(service_workers="block")
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
    page = context.new_page()
    page.goto(ORIGIN + "index.html", wait_until="load")
    made = page.evaluate(CREATE)
    result = page.evaluate(IMPORT, made)
    browser.close()
server.shutdown()

failed = 0


def check(name, ok):
    global failed
    failed += not ok
    print(("PASS " if ok else "FAIL ") + name, flush=True)


got = result["got"]
check("the backup was accepted", result["said"].startswith("Imported"))
MINIMUM = {"deadlines": 3, "revisions": 1, "recurring": 6, "knowledge": 2, "syllabus": 1, "study": 1, "work": 1, "journal": 1}
for key, least in MINIMUM.items():
    check("the screens made %s and all of it survives" % key, len(made.get(key) or []) >= least and got.get(key) == made[key])
check("the screens made plans and all of them survive",
      sum(len(v) for v in made.get("plans", {}).values()) >= 7 and got.get("plans") == made["plans"])
check("the screens made to-dos and all of them survive",
      len(made["todos"]["study"]) >= 5 and made["todos"]["study"][0]["children"] and got.get("todos") == made["todos"])
for key in ("studySubjects", "workCategories", "knowledgeCategories", "recurringTypes", "exams", "dailyGoals", "wakeTime",
            "bedtime", "effectiveMins", "dailyWake", "dailyBed", "goalPresets"):
    check("settings: %s survives" % key, key in made["config"] and got["config"].get(key) == made["config"][key])
print("FAILED" if failed else "PASS: no data loss")
sys.exit(1 if failed else 0)
