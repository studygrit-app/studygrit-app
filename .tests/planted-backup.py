# The planted-backup test in a real browser: an imported backup is drawn as text and cannot reach the stored token.
#
# How to use:  python -I .tests/planted-backup.py [app folder | https URL of the app]      exit 0 = PASS
#              Needs Python Playwright + Chromium. A folder is served on 127.0.0.1.
#
# Every request to another host is answered locally or blocked, the token is a fake, and no real data is used.
import copy
import datetime
import functools
import http.server
import json
import pathlib
import re
import sys
import threading

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
HERE = pathlib.Path(__file__).resolve().parent
target = sys.argv[1] if len(sys.argv) > 1 else str(HERE.parent)
server = None
if target.startswith("https://"):
    URL = target.rstrip("/") + "/index.html"
else:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    class Server(http.server.ThreadingHTTPServer):
        request_queue_size = 64  # the default 5 refuses some of the ~18 files a reload asks for at once

    server = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=target))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    URL = "http://127.0.0.1:%d/index.html" % server.server_address[1]
ORIGIN = URL.rsplit("/", 1)[0] + "/"

day = datetime.date.today()
RICH = json.loads((HERE / "backup-fixture.json").read_text(encoding="utf-8")
                  .replace("@T", day.isoformat())
                  .replace("@Y", (day - datetime.timedelta(days=1)).isoformat()))
TOKEN = "FAKE_TOKEN_CANARY"
FILE = "study_timer_v3.json"
TAIL = ('"></textarea></option><option data-planted>x</option></select>'
        "<img data-planted src=x: onerror=__got(localStorage.st3_t)>")
PLANT = "P7');__got(localStorage.st3_t);//" + TAIL
SHAPES = {
    "string": PLANT,
    "backslash": "P7\\');__got(localStorage.st3_t);//" + TAIL,
    "entity": "P7&#39;);__got(localStorage.st3_t);//",
    "list": [PLANT],
}
MAPS = re.compile(r"^(config\.(dailyGoals|dailyWake|dailyBed)|syllabus|study|work|plans|journal)$")


def children(node, path):
    for key, value in (enumerate(node) if isinstance(node, list) else list(node.items())):
        part = "*" if isinstance(node, list) else "~" if MAPS.match(path) else key
        yield key, value, (path + "." + part if path else part)


def find_paths(node, path, found):
    if path:
        found[path] = node
    if isinstance(node, (dict, list)):
        for _, value, where in children(node, path):
            find_paths(value, where, found)
    return found


def planted(node, where, value, path=""):
    if isinstance(node, (dict, list)):
        for key, old, next_path in children(node, path):
            if next_path == where:
                node[key] = copy.deepcopy(value)
            else:
                planted(old, where, value, next_path)
    return node


def renamed(node, where, rename, path=""):
    if isinstance(node, (dict, list)):
        if path == where:
            for key in list(node):
                node[rename(key)] = node.pop(key)
        else:
            for _, old, next_path in children(node, path):
                renamed(old, where, rename, next_path)
    return node


def everywhere(node, old, new):
    if isinstance(node, dict):
        return {(new if k == old else k): everywhere(v, old, new) for k, v in node.items()}
    if isinstance(node, list):
        return [everywhere(v, old, new) for v in node]
    return new if node == old else node


def scenarios():
    found = find_paths(RICH, "", {})
    for path, value in found.items():
        shapes = ("string", "list") if isinstance(value, (dict, list)) else SHAPES
        for shape in shapes:
            yield "%s (%s)" % (path, shape), planted(copy.deepcopy(RICH), path, SHAPES[shape])
    for path in [p for p in found if MAPS.match(p)]:
        yield path + " key", renamed(copy.deepcopy(RICH), path, lambda key: PLANT + key)
        yield path + " key with a date in front", renamed(copy.deepcopy(RICH), path, lambda key: key + PLANT)
    # some handlers are only reached when every record that links to a name or id carries the same planted value
    strings = sorted({v for v in found.values() if isinstance(v, str) and v}
                     | {"Alpha", "Beta", "Workone", "Knowone", "Typeone"})
    for value in strings:
        for shape in ("string", "backslash"):
            yield "every '%s' (%s)" % (value, shape), everywhere(copy.deepcopy(RICH), value, SHAPES[shape])


WATCH = """
(() => {
  window.__hits = [];
  window.__got = (value) => { window.__hits.push(value === '%s' ? 'token read' : 'code ran'); };
  window.confirm = (text) => { window.__asked = text; return false; };
  window.prompt = () => null;
  window.alert = () => {};
  window.print = () => {};
  // the frozen app starts a 100 ms timer that needs scripts loaded after it: on a slow load it throws, backup or not
  const later = window.setTimeout.bind(window);
  window.setTimeout = (...args) => {
    if (document.readyState !== 'loading') return later(...args);
    document.addEventListener('DOMContentLoaded', () => later(...args), { once: true });
    return 0;
  };
  new MutationObserver((changes) => {
    for (const change of changes) for (const node of change.addedNodes)
      if (node.nodeType === 1 && (node.matches('[data-planted]') || node.querySelector('[data-planted]'))) window.__hits.push('markup built');
  }).observe(document, { childList: true, subtree: true });
})();
""" % TOKEN

IMPORT = """(backup) => new Promise((done) => {
  const toast = UI.toast;
  const end = (message) => { UI.toast = toast; done(message); };
  UI.toast = end;
  setTimeout(() => end('no answer'), 3000);
  D.doImp({ target: { files: [new File([JSON.stringify(backup)], 'backup.json')], value: '' } });
})"""

# Draw every screen that shows stored data, then run each inline handler that holds planted text, as a tap would.
SWEEP = """async () => {
  const broke = [];
  const ran = new Set();
  const event = (el) => ({ stopPropagation() {}, preventDefault() {}, currentTarget: el, target: el,
    touches: [{ clientX: 0, clientY: 0 }], changedTouches: [{ clientX: 0, clientY: 0 }],
    dataTransfer: { setData() {} } });
  const tap = () => {
    for (const el of document.querySelectorAll('*')) for (const a of el.attributes) {
      if (!a.name.startsWith('on') || !a.value.includes('P7') || ran.has(a.value)) continue;
      ran.add(a.value);
      try { if (el[a.name]) el[a.name].call(el, event(el)); } catch (e) { /* only execution matters here */ }
    }
  };
  const step = (name, action) => {
    try { action(); } catch (e) { broke.push(name + ': ' + e.message); }
    tap();
  };
  const el = (id) => document.getElementById(id);
  await new Promise((r) => setTimeout(r, 170));
  const today = D.todayKey();
  const before = new Date();
  before.setDate(before.getDate() - 1);
  const yesterday = D.todayKey(before);
  step('all', () => UI.renderAll());
  for (const id of ['study', 'work', 'report', 'rev', 'syl', 'recur', 'remind', 'plan', 'calendar', 'todo', 'summary', 'knowledge', 'sett'])
    step('tab ' + id, () => App.navTo(id));
  step('presets', () => PLAN.renderGoalPresets());
  step('templates', () => PLAN.renderTemplates());
  for (const day of [today, yesterday]) {
    step('plans ' + day, () => { el('planViewDate').value = day; PLAN.render(); });
    step('calendar ' + day, () => CAL.selectDay(day));
    for (let i = 0; i < (el('calDayDetail')._blocks || []).length; i++) step('block', () => CAL.showItemDetail(i));
    step('plan details ' + day, () => {
      for (const p of PLAN.getForDate(day)) {
        CAL.openPlanDetail(day, p.id);
        tap();
        PLAN.openEdit(day, p.id);
        tap();
      }
    });
    step('summary ' + day, () => { el('sumDate').value = day; SUM.render(); });
    step('tasks ' + day, () => { el('studyPlanDate').value = day; el('workPlanDate').value = day; App.renderStudyPlans(); });
  }
  step('quick add', () => { CAL.onHourClick(today, 9); CAL.setQuickType('work'); });
  step('quick add knowledge', () => CAL.setQuickType('knowledge'));
  step('week', () => CAL.toggleView());
  step('month', () => CAL.toggleView());
  for (const mode of ['category', 'date']) step('knowledge ' + mode, () => KNOW.setGroupBy(mode));
  step('knowledge edit', () => { for (const e of KNOW.getEntries()) { KNOW.openEdit(e.id); tap(); } });
  for (const group of ['study', 'work']) {
    step('todo ' + group, () => { el('todoTypeFilter').value = group; el('todoStatusFilter').value = 'all'; TODO.render(); });
    step('todo select', () => TODO.enterSelectMode());
    step('todo select off', () => TODO.enterSelectMode());
    step('todo edit', () => { for (const t of D.getLocal().todos?.[group] || []) { TODO.editItem(t.id, group); tap(); } });
    step('report ' + group, () => {
      el('rpType').value = group; el('rpFrom').value = '2000-01-01'; el('rpTo').value = '9999-12-31';
      el('rpCompare').checked = false; RP.apply();
    });
    step('past ' + group, () => PAST.open(group));
    step('past edit', () => {
      for (const day of [today, yesterday]) D.getSess(group, day).forEach((s, i) => { PAST.openEdit(day, group, i, s); tap(); });
    });
  }
  step('recurring edit', () => { for (const r of D.getRC()) { RECUR.edit(r.id); tap(); } });
  step('deadline edit', () => { for (const d of D.getDL()) { DL.edit(d.id); tap(); } });
  step('revision done', () => { for (const r of D.getRevs()) { REV.markDone(r.id); tap(); } });
  let subjects = [];
  step('subjects', () => { subjects = D.getAllSubjects().slice(0, 4); });
  for (const subject of subjects) {
    step('save session', () => {
      el('saveModal').classList.add('hidden');
      el('p-study').classList.add('on');
      el('smCat').textContent = subject;
    });
    await new Promise((r) => setTimeout(r, 0));
    el('saveModal').classList.remove('hidden');
    await new Promise((r) => setTimeout(r, 0));
    step('save session drawn', () => {});
    step('plan form', () => { el('planSubj').value = subject; PLAN.onSubjChange(); el('planType').value = 'revision'; PLAN.onTypeChange(); });
    step('autocomplete', () => { el('smNote').value = 'P'; el('smNote').dispatchEvent(new Event('input')); });
  }
  step('quotes', () => App.toggleQuotes());
  await new Promise((r) => setTimeout(r, 120));
  return { hits: [...new Set(window.__hits)], broke: [...new Set(broke)] };
}"""

BUTTONS = """(odd) => {
  const out = {};
  const test = (name, action) => { try { out[name] = action(); } catch (e) { out[name] = false; } };
  const press = (selector) => { window.__asked = null; document.querySelector(selector).click(); return window.__asked; };
  UI.renderAll();
  test('subject', () => press('#mngStudy .manage-x') === 'Remove "' + odd + '"?');
  test('work', () => press('#mngWork .manage-x') === 'Remove "' + odd + '"?');
  test('knowledge', () => press('#mngKnowledge .manage-x') === 'Remove "' + odd + '"?');
  test('type', () => press('#rcTypeList .manage-x') === 'Remove type "' + odd + '"?');
  test('lecture', () => { document.querySelectorAll('#sylList .syl-lec-btn')[4].click(); return D.getSyl()[odd].done === 5; });
  test('group', () => {
    KNOW.setGroupBy('date');
    document.querySelector('#knList .kn-cat-header').click();
    return !!document.querySelector('#knList .kn-cat-body.hidden');
  });
  test('journal', () => { SUM.init(); return document.getElementById('sumRight').value === odd; });
  let got = null;
  App.startFromPlan = (type, subject) => { got = subject; };
  test('start on the study tab', () => {
    App.renderStudyPlans();
    document.querySelector('#studyPlannedTasks .plan-start-btn').click();
    return got === odd;
  });
  test('start on the plan tab', () => {
    got = null;
    document.getElementById('planViewDate').value = D.todayKey();
    PLAN.render();
    [...document.querySelectorAll('#planList button')].find((b) => b.title === 'Start Timer').click();
    return got === odd;
  });
  return out;
}"""

results = []
cloud = {"content": None}
outside = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" - " + detail if detail else ""), flush=True)


def route_all(route):
    request = route.request
    if request.url.startswith(ORIGIN):
        return route.continue_()
    if not request.url.startswith("https://api.github.com/"):
        if "P7" in request.url or TOKEN in request.url:
            outside.append(request.url[:80])
        return route.abort()
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
    if request.method == "OPTIONS":
        return route.fulfill(status=204, headers=headers)
    body = {"id": "g1", "files": {}}
    if request.method in ("GET",) and request.url.split("?")[0].endswith("/gists"):
        body = [{"id": "g1", "files": {FILE: {}}}]
    elif request.method == "GET" and cloud["content"] is not None:
        body["files"][FILE] = {"content": cloud["content"]}
    return route.fulfill(status=200, headers=headers, content_type="application/json", body=json.dumps(body))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(service_workers="block")
    context.route("**/*", route_all)
    context.add_init_script(WATCH)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)[:120]))
    page.goto(URL, wait_until="load")

    def reset(local=None):
        page.evaluate("""([token, local]) => {
            localStorage.clear();
            localStorage.st3_t = token;
            localStorage.st3_g = 'g1';
            localStorage.st3_onboarded = '1';
            if (local) D.saveLocal(local);
            window.__hits = [];
        }""", [TOKEN, local])

    def load_and_sweep():
        before = page.evaluate("() => window.__hits")
        page.reload(wait_until="load")
        result = page.evaluate(SWEEP)
        result["hits"] = sorted(set(result["hits"] + before))
        return result

    # controls: the detector fires when a hole is really there, and stays quiet on a normal backup
    reset()
    page.evaluate("(x) => { const box = document.createElement('div'); box.innerHTML = x; document.body.append(box); }", PLANT)
    page.wait_for_timeout(250)
    seen = set(page.evaluate("() => window.__hits"))
    check("control: planted markup is detected, token read included", {"markup built", "token read"} <= seen)
    page.reload(wait_until="load")
    reset()
    page.evaluate(IMPORT, RICH)
    normal = load_and_sweep()
    check("control: a normal backup draws every screen with 0 hits and 0 errors",
          not normal["hits"] and not normal["broke"], "; ".join(normal["hits"] + normal["broke"][:6]))

    # 1. every field, every key, every linked value, through the real file import
    live = {}
    broken = {}
    count = 0
    for name, backup in scenarios():
        count += 1
        reset()
        del errors[:]
        page.evaluate(IMPORT, backup)
        result = load_and_sweep()
        if result["hits"]:
            live[name] = result["hits"]
        if result["broke"] or errors:
            broken[name] = (result["broke"] + errors)[0]
        if count % 50 == 0:
            print("... %d scenarios, %d live" % (count, len(live)), flush=True)
    holes = sorted({re.sub(r" \((string|backslash|entity|list)\)$", "", name) for name in live})
    token = sum("token read" in hits for hits in live.values())
    check("planted backup: no markup and no code in %d imports (%d live)" % (count, len(live)), not live, "; ".join(holes))
    check("planted backup: the stored token is never read (%d reads)" % token, not token)
    check("planted backup: no screen breaks (%d broken)" % len(broken), not broken,
          "; ".join("%s = %s" % item for item in list(broken.items())[:8]))

    # 2. the second door: the same data from the Gist, on connect and on sync, fresh device and device with data
    used = {"config": {"studySubjects": ["General"], "workCategories": ["General"], "dailyGoals": {"default": 6}},
            "deadlines": [], "revisions": [], "study": {}, "work": {}}
    worst = copy.deepcopy(RICH)
    for path in ("config.workCategories.*", "config.exams.*.id", "journal.~.wentRight", "knowledge.*.category", "plans.~.*.status"):
        worst = planted(worst, path, PLANT)
    for how in ("sync", "autoConn"):
        for label, local in (("fresh", None), ("with data", used)):
            cloud["content"] = None
            reset(local)
            cloud["content"] = json.dumps(worst)
            page.evaluate("(how) => D[how]()", how)
            result = load_and_sweep()
            check("Gist %s, device %s: inert" % (how, label), not result["hits"], ", ".join(result["hits"]))
    cloud["content"] = None

    # 3. odd but honest names still work in every button that carries them
    odd = "Newton's \"Q&A\" <b> \\ x\nline &#39;);"
    named = copy.deepcopy(RICH)
    for old in ("Alpha", "Workone", "Knowone", "Typeone", "Rightone"):
        named = everywhere(named, old, odd)
    reset()
    page.evaluate(IMPORT, named)
    page.reload(wait_until="load")
    page.wait_for_timeout(250)
    buttons = page.evaluate(BUTTONS, odd)
    for name, ok in buttons.items():
        check("a name with quotes still works: " + name, ok is True)

    check("no planted value or token left the page", not outside)
    browser.close()

if server:
    server.shutdown()
print("%s: %d of %d checks" % ("PASS" if all(results) else "FAILED", sum(results), len(results)))
sys.exit(0 if all(results) else 1)
