(()=>{var l={"__init__.py":`"""PyForge's built-in library.

Games:    from forge import *      -> screen, keyboard, mouse, sound, fx, save, load
Worlds:   from forge.world import *
Charts:   from forge.chart import bar, line, pie, scatter
Apps:     from forge.ui import App
"""
from forge._game import screen, keyboard, mouse, sound, fx, save, load, Rect, collide, clamp, distance

__all__ = ["screen", "keyboard", "mouse", "sound", "fx", "save", "load", "Rect", "collide", "clamp", "distance"]
`,"_bridge.py":`"""Messages from Python to the app (charts, tables, files). The JS side drains \`outbox\` after each run."""
import json

outbox = []


def emit(kind, **data):
    data["kind"] = kind
    outbox.append(data)


def drain():
    global outbox
    out, outbox = outbox, []
    return json.dumps(out, default=str)
`,"_game.py":`"""A tiny game engine in the spirit of Pygame Zero.

Write update(dt) to move things and draw() to paint them:

    from forge import *
    WIDTH, HEIGHT = 800, 500
    x = 100
    def update(dt):
        global x
        if keyboard.right: x += 300 * dt
    def draw():
        screen.clear("#0b1020")
        screen.circle(x, 250, 20, "orange")
"""
import json, math

_cmds = []
_events = []


class _Screen:
    """Everything you draw this frame. Coordinates start at the top-left corner."""

    def clear(self, color="#0d0b1a"):
        _cmds.append(("clear", color))

    fill = clear

    def rect(self, x, y, w, h, color="white", outline=False, width=2, radius=0):
        _cmds.append(("r", round(x, 2), round(y, 2), round(w, 2), round(h, 2), color, 1 if outline else 0, width, radius))

    def circle(self, x, y, r, color="white", outline=False, width=2):
        _cmds.append(("c", round(x, 2), round(y, 2), round(r, 2), color, 1 if outline else 0, width))

    def line(self, x1, y1, x2, y2, color="white", width=2):
        _cmds.append(("l", round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2), color, width))

    def polygon(self, points, color="white", outline=False, width=2):
        pts = [round(v, 2) for p in points for v in p]
        _cmds.append(("p", pts, color, 1 if outline else 0, width))

    def text(self, text, x, y, size=24, color="white", align="left"):
        _cmds.append(("t", str(text), round(x, 2), round(y, 2), size, color, align))

    def sprite(self, name, x, y, size=40, angle=0, color=None):
        """Built-in art: ship, alien, ufo, rock, star, heart, coin, gem, player, slime, spike, flag, bird, cloud, bolt"""
        _cmds.append(("s", name, round(x, 2), round(y, 2), size, round(angle, 3), color))


class _Keyboard:
    """keyboard.left, keyboard.space ... are True while held. keyboard.pressed("space") is True only on the first frame."""

    def __init__(self):
        self._down = set()
        self._new = set()

    def __getattr__(self, key):
        if key.startswith("_"):
            raise AttributeError(key)
        return key in self._down

    def pressed(self, key):
        return key in self._new


class _Mouse:
    def __init__(self):
        self.x = 0
        self.y = 0
        self.down = False
        self.clicked = False


class _Sound:
    """sound.play("laser") - hit, laser, explode, coin, jump, lose, win, click, powerup"""

    def play(self, name):
        _events.append(("sound", name))


class _FX:
    def burst(self, x, y, color="orange", count=18, speed=220):
        """A puff of particles. Purely visual."""
        _events.append(("burst", round(x, 1), round(y, 1), color, count, speed))

    def shake(self, amount=8):
        _events.append(("shake", amount))

    def flash(self, color="white"):
        _events.append(("flash", color))


screen = _Screen()
keyboard = _Keyboard()
mouse = _Mouse()
sound = _Sound()
fx = _FX()
_saved = {}


def save(key, value):
    """Remember a value (like a high score) between games."""
    _saved[key] = value
    _events.append(("save", key, json.dumps(value)))


def load(key, default=None):
    return _saved.get(key, default)


class Rect:
    """A rectangle with handy edges: r.left, r.right, r.top, r.bottom, r.centerx, r.centery."""

    def __init__(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h

    left = property(lambda s: s.x)
    top = property(lambda s: s.y)
    right = property(lambda s: s.x + s.w)
    bottom = property(lambda s: s.y + s.h)
    centerx = property(lambda s: s.x + s.w / 2)
    centery = property(lambda s: s.y + s.h / 2)

    def colliderect(self, other):
        return collide(self, other)

    def __repr__(self):
        return f"Rect({self.x}, {self.y}, {self.w}, {self.h})"


def collide(a, b):
    """True if two rectangles (Rect objects or (x, y, w, h) tuples) overlap."""
    ax, ay, aw, ah = (a.x, a.y, a.w, a.h) if isinstance(a, Rect) else a
    bx, by, bw, bh = (b.x, b.y, b.w, b.h) if isinstance(b, Rect) else b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def clamp(value, low, high):
    return max(low, min(high, value))


def distance(x1, y1, x2, y2):
    return math.hypot(x2 - x1, y2 - y1)


# ---- driven by the app, once per frame ----
_ns = None
_update_takes_dt = True


def _start(ns, saved_json):
    global _ns, _update_takes_dt
    _ns = ns
    _saved.clear()
    _saved.update(json.loads(saved_json or "{}"))
    keyboard._down.clear()
    keyboard._new.clear()
    upd = ns.get("update")
    if callable(upd):
        try:
            _update_takes_dt = upd.__code__.co_argcount >= 1
        except AttributeError:
            _update_takes_dt = True
    return json.dumps({"width": ns.get("WIDTH", 800), "height": ns.get("HEIGHT", 500),
                       "controls": ns.get("CONTROLS"), "title": ns.get("TITLE", "")})


def _frame(dt, input_json):
    inp = json.loads(input_json)
    down = set(inp.get("keys", []))
    keyboard._new = down - keyboard._down
    keyboard._down = down
    m = inp.get("mouse") or {}
    mouse.x, mouse.y = m.get("x", 0), m.get("y", 0)
    mouse.clicked = bool(m.get("down")) and not mouse.down
    mouse.down = bool(m.get("down"))
    _cmds.clear()
    upd = _ns.get("update")
    if callable(upd):
        upd(dt) if _update_takes_dt else upd()
    drw = _ns.get("draw")
    _cmds.clear()  # only draw() decides what's on screen
    if callable(drw):
        drw()
    out = json.dumps({"c": _cmds, "e": _events})
    _events.clear()
    return out
`,"_run.py":`"""Runs learner code, captures output, checks it against tests, and explains errors in plain English."""
import ast, builtins, difflib, io, json, os, sys, traceback

WORK = "/home/pyodide/work"
MAX_OUT = 60000


class _Out(io.StringIO):
    def write(self, s):
        if self.tell() > MAX_OUT:
            return len(s)
        return super().write(s)


def _input_factory(lines):
    queue = list(lines)

    def _input(prompt=""):
        sys.stdout.write(str(prompt))
        if not queue:
            raise EOFError("input() wanted a value but there was none left")
        value = queue.pop(0)
        sys.stdout.write(value + "\\n")  # echo, like a real terminal
        return value

    return _input


def _stdin_lines(stdin):
    if stdin is None or stdin == "":
        return []
    return stdin.split("\\n") if isinstance(stdin, str) else list(stdin)


def _fresh_ns():
    return {"__name__": "__main__", "__builtins__": builtins}


def _reset_modules():
    import forge.world as w, forge.ui as u, forge._bridge as b
    w._reset()
    u._reset()
    b.outbox.clear()


def _user_line(tb):
    line = None
    for frame in traceback.extract_tb(tb):
        if frame.filename == "<main>":
            line = frame.lineno
    return line


def explain(e, ns=None, code=""):
    """Turn an exception into {type, message, line, hint}."""
    t = type(e).__name__
    msg = str(e)
    line = getattr(e, "lineno", None) if isinstance(e, SyntaxError) else _user_line(e.__traceback__)
    hint = ""
    if isinstance(e, IndentationError):
        hint = "Python uses indentation (4 spaces) to group code. Lines inside if, for, while, def and class must be indented, and lines at the same level must line up."
        msg = e.msg
    elif isinstance(e, SyntaxError):
        msg = e.msg
        hint = "Python couldn't read this line. Check for a missing colon :, a missing bracket or quote, or a typo in a keyword."
        if "never closed" in msg:
            hint = "A bracket or quote was opened but never closed. Count your ( [ { and quotes."
        elif "expected ':'" in msg:
            hint = "Lines that start a block (if, for, while, def, class, else, elif) end with a colon :"
        elif "'=' " in msg or "Maybe you meant '==' " in msg:
            hint = "Use == to compare two values. A single = stores a value in a variable."
    elif isinstance(e, NameError):
        name = getattr(e, "name", None) or (msg.split("'")[1] if "'" in msg else "")
        known = list((ns or {}).keys()) + dir(builtins)
        close = difflib.get_close_matches(name, known, n=1)
        hint = f"Python doesn't know anything called \`{name}\` yet."
        hint += f" Did you mean \`{close[0]}\`?" if close else " Create it before you use it, check the spelling, or put quotes around it if it's text."
    elif isinstance(e, TypeError):
        if "concatenate" in msg or "can only concatenate" in msg:
            hint = "You can't join text and numbers with +. Convert with str(...), or use an f-string like f\\"Score: {score}\\"."
        elif "not callable" in msg:
            hint = "You put ( ) after something that isn't a function. Maybe a variable has the same name as a function?"
        elif "positional argument" in msg or "required" in msg:
            hint = "The function was called with the wrong number of values. Compare the call with the def line."
        elif "not subscriptable" in msg:
            hint = "You used [ ] on something that isn't a list, string or dictionary."
        elif "unsupported operand" in msg:
            hint = "Those two kinds of values can't be combined with that operator. Check their types with type(...)."
        else:
            hint = "A value has the wrong type for what you're doing with it."
    elif isinstance(e, IndexError):
        hint = "You asked for a position that doesn't exist. Positions start at 0, so the last item of a list of n items is at n - 1."
    elif isinstance(e, KeyError):
        hint = f"The dictionary has no key {msg}. Use .get(key) or check \`key in d\` first."
    elif isinstance(e, ZeroDivisionError):
        hint = "Something was divided by zero. Check the value before dividing."
    elif isinstance(e, ValueError):
        hint = "The value has the right type but the wrong content, like int(\\"hello\\")."
        if "invalid literal for int()" in msg:
            hint = "int() can only turn digit-only text into a number. Check what you're converting."
    elif isinstance(e, AttributeError):
        hint = "That kind of value doesn't have that method or property. Check the spelling, or print(type(x)) to see what it is."
    elif isinstance(e, RecursionError):
        hint = "The function called itself too many times. Make sure the base case is reached and returns without calling again."
    elif isinstance(e, EOFError):
        hint = "The program asked for input() but there was nothing to read. Type values in the Input box, one per line."
    elif t == "WorldError":
        hint = ""
    elif isinstance(e, AssertionError):
        hint = "An assert check failed."
    elif isinstance(e, ModuleNotFoundError):
        hint = "That library isn't available here. The app includes the standard library plus numpy, pandas, requests, bs4, openpyxl and pypdf."
    return {"type": t, "message": msg, "line": line, "hint": hint}


def _prepare_files(files_json):
    import shutil
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK, exist_ok=True)
    os.chdir(WORK)
    if WORK not in sys.path:
        sys.path.insert(0, WORK)
    # forget modules imported from a previous run's folder so edited files reload
    for name, mod in list(sys.modules.items()):
        if (getattr(mod, "__file__", None) or "").startswith(WORK):
            del sys.modules[name]
    import importlib
    importlib.invalidate_caches()
    files = json.loads(files_json or "{}")
    for path, content in files.items():
        full = os.path.join(WORK, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        if path.endswith("/"):
            os.makedirs(full, exist_ok=True)
            continue
        mode = "wb" if isinstance(content, dict) else "w"
        if mode == "wb":
            import base64
            with open(full, "wb") as f:
                f.write(base64.b64decode(content["b64"]))
        else:
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)


def _list_files():
    out = []
    for root, dirs, files in os.walk(WORK):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, WORK)
            size = os.path.getsize(full)
            preview = None
            if size < 4000 and not name.endswith((".xlsx", ".pdf", ".png", ".jpg")):
                try:
                    with open(full, encoding="utf-8") as f:
                        preview = f.read()
                except Exception:
                    preview = None
            out.append({"path": rel, "size": size, "preview": preview})
        for d in sorted(dirs):
            full = os.path.join(root, d)
            if not os.listdir(full):
                out.append({"path": os.path.relpath(full, WORK) + "/", "size": 0, "preview": None})
    return out


def _exec(code, stdin, ns=None):
    """Run code. Returns (ns, stdout, error_dict_or_None)."""
    ns = ns if ns is not None else _fresh_ns()
    out = _Out()
    old_out, old_err, old_input = sys.stdout, sys.stderr, builtins.input
    sys.stdout = sys.stderr = out
    builtins.input = _input_factory(_stdin_lines(stdin))
    err = None
    try:
        compiled = compile(code, "<main>", "exec")
        exec(compiled, ns)
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001 - we report everything to the learner
        if isinstance(e, KeyboardInterrupt):
            raise
        err = explain(e, ns, code)
    finally:
        sys.stdout, sys.stderr, builtins.input = old_out, old_err, old_input
    text = out.getvalue()
    if len(text) > MAX_OUT:
        text = text[:MAX_OUT] + "\\n... (output cut off)"
    return ns, text, err


def run(code, stdin="", files_json="{}"):
    """Plain run (Run button, Playground, Block World, apps)."""
    _reset_modules()
    _prepare_files(files_json)
    ns, out, err = _exec(code, stdin)
    globals()["_last_ns"] = ns
    from forge._bridge import drain
    return json.dumps({"stdout": out, "error": err, "outbox": json.loads(drain()), "files": _list_files()}, default=str)


# ---------------------------------------------------------------- step-through debugger
MAX_STEPS = 800


class _TraceLimit(BaseException):
    """Raised when a traced program takes too many steps (likely an endless loop)."""


def _vrepr(v, n=70):
    try:
        s = repr(v)
    except Exception:  # noqa: BLE001
        s = "<" + type(v).__name__ + ">"
    return s if len(s) <= n else s[: n - 1] + "\u2026"


def _snapshot(frame):
    import types
    out = {}
    for name, v in list(frame.f_locals.items()):
        if name.startswith("__") or isinstance(v, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)):
            continue
        out[name] = [type(v).__name__, _vrepr(v)]
        if len(out) >= 24:
            break
    return out


def _stack(frame):
    names = []
    f = frame
    while f is not None and f.f_code.co_filename == "<main>":
        names.append("main program" if f.f_code.co_name == "<module>" else f.f_code.co_name + "()")
        f = f.f_back
    return names[::-1]


def trace(code, stdin="", files_json="{}"):
    """Run code line by line, recording each step: the line about to run, the call stack,
    the current function's variables (and the program's top-level variables), and how much
    had been printed so far. Powers the Step-through view."""
    _reset_modules()
    _prepare_files(files_json)
    ns = _fresh_ns()
    out = _Out()
    steps = []
    truncated = False

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<main>":
            return None
        if event in ("line", "return", "exception"):
            if len(steps) >= MAX_STEPS:
                raise _TraceLimit()
            step = {"l": frame.f_lineno, "e": event, "s": _stack(frame), "v": _snapshot(frame), "o": out.tell()}
            if frame.f_code.co_name != "<module>":
                step["g"] = {k: v for k, v in _snapshot(_module_frame(frame)).items()} if _module_frame(frame) else {}
            if event == "return":
                step["r"] = _vrepr(arg)
            elif event == "exception":
                step["x"] = type(arg[1]).__name__ + ": " + _vrepr(str(arg[1]), 120)
            steps.append(step)
        return tracer

    def _module_frame(frame):
        f = frame
        while f is not None and f.f_code.co_filename == "<main>":
            if f.f_code.co_name == "<module>":
                return f
            f = f.f_back
        return None

    old_out, old_err, old_input = sys.stdout, sys.stderr, builtins.input
    sys.stdout = sys.stderr = out
    builtins.input = _input_factory(_stdin_lines(stdin))
    err = None
    try:
        compiled = compile(code, "<main>", "exec")
        sys.settrace(tracer)
        exec(compiled, ns)
    except _TraceLimit:
        truncated = True
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001
        if isinstance(e, KeyboardInterrupt):
            raise
        err = explain(e, ns, code)
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr, builtins.input = old_out, old_err, old_input
    return json.dumps({"steps": steps, "stdout": out.getvalue()[:MAX_OUT], "error": err, "truncated": truncated}, default=str)


# ---------------------------------------------------------------- code checks
def _uses(tree, kind):
    for node in ast.walk(tree):
        if kind == "for" and isinstance(node, (ast.For, ast.comprehension)):
            return True
        if kind == "while" and isinstance(node, ast.While):
            return True
        if kind == "loop" and isinstance(node, (ast.For, ast.While, ast.comprehension)):
            return True
        if kind == "def" and isinstance(node, ast.FunctionDef):
            return True
        if kind == "class" and isinstance(node, ast.ClassDef):
            return True
        if kind == "if" and isinstance(node, (ast.If, ast.IfExp)):
            return True
        if kind == "lambda" and isinstance(node, ast.Lambda):
            return True
        if kind == "comprehension" and isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)):
            return True
        if kind == "fstring" and isinstance(node, ast.JoinedStr):
            return True
        if kind == "try" and isinstance(node, ast.Try):
            return True
        if kind == "with" and isinstance(node, ast.With):
            return True
        if kind == "recursion" and isinstance(node, ast.FunctionDef):
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name) and sub.func.id == node.name:
                    return True
    return False


def _calls_name(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name) and f.id == name:
                return True
            if isinstance(f, ast.Attribute) and f.attr == name:
                return True
        if name == "[::-1]" and isinstance(node, ast.Slice) and node.step is not None:
            return True
        if name == "import" and isinstance(node, (ast.Import, ast.ImportFrom)):
            return True
    return False


_WORDS = {"for": "a for loop", "while": "a while loop", "loop": "a loop", "def": "a function (def)",
          "class": "a class", "if": "an if statement", "lambda": "a lambda", "comprehension": "a comprehension",
          "fstring": "an f-string", "try": "try/except", "with": "a with block", "recursion": "a function that calls itself"}


def _structure(code, spec):
    """Return list of failed structure rules."""
    fails = []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return fails  # the run will report it
    for kind in spec.get("require", []):
        if not _uses(tree, kind):
            fails.append(f"This challenge asks you to use {_WORDS.get(kind, kind)}.")
    for name in spec.get("forbid", []):
        if _calls_name(tree, name):
            shown = "slicing with a step like [::-1]" if name == "[::-1]" else ("import" if name == "import" else f"{name}()")
            fails.append(f"Solve it without using {shown}. Doing it by hand is the point of this one!")
    return fails


def _norm(s):
    return "\\n".join(line.rstrip() for line in s.replace("\\r", "").strip("\\n").split("\\n")).strip()


def _short(v, n=300):
    s = v if isinstance(v, str) else repr(v)
    return s if len(s) <= n else s[:n] + "..."


def _equal(a, b, approx):
    if approx and isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-6 * max(1, abs(b)) or abs(a - b) <= (approx if isinstance(approx, float) else 0.01)
    return a == b and type(a) is type(b) if isinstance(b, bool) or isinstance(a, bool) else a == b


# ---------------------------------------------------------------- style tips
_BUILTIN_NAMES = {"list", "dict", "str", "int", "float", "set", "tuple", "sum", "max", "min", "len", "input",
                  "type", "id", "map", "filter", "all", "any", "range", "sorted", "print", "open", "format",
                  "iter", "next", "object", "bool", "round", "abs", "zip", "hash", "vars", "dir", "file"}


_BLOCKS = (ast.If, ast.For, ast.While, ast.With, ast.Try)


def _depth(node, d=0):
    """How deeply blocks nest inside node (an elif doesn't count as one more level)."""
    deep = d
    elif_node = node.orelse[0] if isinstance(node, ast.If) and len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If) else None
    for child in ast.iter_child_nodes(node):
        if child is elif_node:
            deep = max(deep, _depth(child, d))
        else:
            deep = max(deep, _depth(child, d + (1 if isinstance(child, _BLOCKS) else 0)))
    return deep


def style_hints(code, limit=2):
    """Gentle code-quality tips for code that already works. Most important first."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []
    tips = []

    def add(t):
        if t not in tips:
            tips.append(t)

    for node in ast.walk(tree):
        # mutable default arguments
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for dflt in node.args.defaults + node.args.kw_defaults:
                if isinstance(dflt, (ast.List, ast.Dict, ast.Set)):
                    add(f"\`{node.name}()\` has a list or dict as a default value. Python creates it once and shares it between calls, a classic bug. Use \`None\` and create it inside the function.")
            body_lines = (node.end_lineno or node.lineno) - node.lineno
            if body_lines > 40:
                add(f"\`{node.name}()\` is {body_lines} lines long. Splitting it into smaller helper functions with clear names makes it easier to read and test.")
            if _depth(node) >= 6:
                add(f"\`{node.name}()\` nests ifs and loops 6 levels deep. An early \`return\` or \`continue\`, or a helper function, flattens it.")
            names = [a.arg for a in node.args.args]
            for n in names:
                if n in _BUILTIN_NAMES:
                    add(f"The parameter \`{n}\` hides Python's built-in \`{n}()\`. A more specific name (like \`items\` or \`text\`) avoids surprises.")
        # shadowed builtins and ambiguous names
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            if node.id in _BUILTIN_NAMES:
                add(f"You named a variable \`{node.id}\`, which hides Python's built-in \`{node.id}()\`. A more specific name (like \`items\`, \`total\` or \`text\`) avoids confusing bugs.")
            elif node.id in ("l", "O", "I"):
                add(f"The name \`{node.id}\` is easy to confuse with \`1\` or \`0\`. Pick a word that says what it holds.")
        # comparisons with None / True / False, and type() ==
        if isinstance(node, ast.Compare):
            for op, right in zip(node.ops, node.comparators):
                if isinstance(op, (ast.Eq, ast.NotEq)) and isinstance(right, ast.Constant):
                    if right.value is None:
                        add("Compare with \`None\` using \`is None\` / \`is not None\` instead of \`==\`.")
                    elif right.value is True or right.value is False:
                        add("No need for \`== True\` or \`== False\`: write \`if done:\` or \`if not done:\`.")
            if isinstance(node.left, ast.Call) and isinstance(node.left.func, ast.Name) and node.left.func.id == "type":
                add("To check a type, \`isinstance(x, int)\` is the Python way (it also works for subclasses).")
        # bare except
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            add("A bare \`except:\` also catches typos and Ctrl+C. Catch the specific error you expect, like \`except ValueError:\`.")
        # if cond: return True else: return False
        if isinstance(node, ast.If) and len(node.body) == 1 and len(node.orelse) == 1:
            a, b = node.body[0], node.orelse[0]
            if isinstance(a, ast.Return) and isinstance(b, ast.Return) and isinstance(a.value, ast.Constant) and isinstance(b.value, ast.Constant) \\
                    and {a.value.value, b.value.value} == {True, False}:
                add("\`if ...: return True else: return False\` can be just \`return <the condition>\`.")
        # for i in range(len(seq)) where i is only used as seq[i]
        if isinstance(node, ast.For) and isinstance(node.target, ast.Name) and isinstance(node.iter, ast.Call) \\
                and isinstance(node.iter.func, ast.Name) and node.iter.func.id == "range" and len(node.iter.args) == 1:
            inner = node.iter.args[0]
            if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Name) and inner.func.id == "len" \\
                    and len(inner.args) == 1 and isinstance(inner.args[0], ast.Name):
                seq, i = inner.args[0].id, node.target.id
                uses = [n for b in node.body for n in ast.walk(b) if isinstance(n, ast.Name) and n.id == i]
                subs = [n for b in node.body for n in ast.walk(b) if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name)
                        and n.value.id == seq and isinstance(n.slice, ast.Name) and n.slice.id == i]
                if uses and len(uses) == len(subs):
                    add(f"You only use \`{i}\` to get \`{seq}[{i}]\`, so \`for item in {seq}:\` is simpler (or \`enumerate({seq})\` if you need the position too).")
    return tips[:limit]


def check(code, spec_json, files_json="{}"):
    """Run tests from a spec. Returns {passed, results:[{ok, label, msg}], stdout, error}."""
    spec = json.loads(spec_json)
    tests = spec.get("tests", [])
    results = []
    _reset_modules()
    _prepare_files(files_json)
    setup = spec.get("setup", "")
    base_ns = _fresh_ns()
    if setup:
        _exec(setup, "", base_ns)
    ns, out, err = _exec(code, spec.get("stdin", ""), base_ns)
    if err:
        return json.dumps({"passed": False, "results": [], "stdout": out, "error": err, "files": _list_files()})

    for rule_fail in _structure(code, spec):
        results.append({"ok": False, "label": "How it's solved", "msg": rule_fail})

    for i, t in enumerate(tests):
        label = t.get("label") or t.get("call") or t.get("assert") or f"Test {i + 1}"
        hidden = t.get("hidden", False)
        try:
            if "stdout" in t:
                _prepare_files(files_json)  # each program run starts from the original folder
                _reset_modules()
                run_ns = _fresh_ns()
                if setup:
                    _exec(setup, "", run_ns)
                _, got, e2 = _exec(code, t.get("stdin", ""), run_ns)
                stdin_note = f" with input {t['stdin']!r}" if t.get("stdin") else ""
                label = t.get("label") or ("Output" + stdin_note)
                if e2:
                    results.append({"ok": False, "label": label, "msg": f"{e2['type']}: {e2['message']}"})
                elif _norm(got) == _norm(t["stdout"]):
                    results.append({"ok": True, "label": label, "msg": ""})
                else:
                    want = "(hidden)" if hidden else _short(_norm(t["stdout"]))
                    results.append({"ok": False, "label": label, "msg": f"Expected:\\n{want}\\nYour program printed:\\n{_short(_norm(got)) or '(nothing)'}"})
            elif "call" in t:
                got = eval(t["call"], ns)
                want = eval(t["expect"], ns)
                if _equal(got, want, t.get("approx")):
                    results.append({"ok": True, "label": label, "msg": ""})
                else:
                    shown = "the right answer" if hidden else _short(want)
                    results.append({"ok": False, "label": label, "msg": f"{t['call']} should give {shown}, but gave {_short(got)}"})
            elif "assert" in t:
                ok = bool(eval(t["assert"], ns))
                results.append({"ok": ok, "label": t.get("label", "Check"), "msg": "" if ok else t.get("msg", f"Check failed: {t['assert']}")})
            elif "exec" in t:  # multi-line check code that raises AssertionError("message") on failure
                exec(t["exec"], ns)
                results.append({"ok": True, "label": label, "msg": ""})
        except AssertionError as e:
            results.append({"ok": False, "label": t.get("label", "Check"), "msg": str(e) or t.get("msg", "Check failed")})
        except BaseException as e:  # noqa: BLE001
            if isinstance(e, KeyboardInterrupt):
                raise
            ex = explain(e, ns)
            results.append({"ok": False, "label": label, "msg": f"{ex['type']}: {ex['message']}" + (f"\\n{ex['hint']}" if ex["hint"] else "")})

    passed = all(r["ok"] for r in results) and len(results) > 0
    from forge._bridge import drain
    tips = style_hints(code) if passed else []
    return json.dumps({"passed": passed, "results": results, "stdout": out, "error": None, "tips": tips,
                       "outbox": json.loads(drain()), "files": _list_files()}, default=str)


# ---------------------------------------------------------------- games & apps
def game_start(code, saved_json="{}"):
    _reset_modules()
    _prepare_files("{}")
    ns, out, err = _exec(code, "")
    globals()["_game_ns"] = ns
    if err:
        return json.dumps({"error": err, "stdout": out})
    if not callable(ns.get("draw")):
        return json.dumps({"error": {"type": "Game", "message": "No draw() function found.", "line": None,
                                     "hint": "A game needs def draw(): to paint each frame, and usually def update(dt): to move things."},
                           "stdout": out})
    from forge import _game
    info = json.loads(_game._start(ns, saved_json))
    info["stdout"] = out
    return json.dumps(info)


def game_frame(dt, input_json):
    from forge import _game
    buf = _Out()
    old = sys.stdout
    sys.stdout = buf
    try:
        out = _game._frame(dt, input_json)
        printed = buf.getvalue()
        return out if not printed else out[:-1] + ',"o":' + json.dumps(printed[-2000:]) + "}"
    except BaseException as e:  # noqa: BLE001
        if isinstance(e, KeyboardInterrupt):
            raise
        return json.dumps({"error": explain(e, globals().get("_game_ns"))})
    finally:
        sys.stdout = old


def world_run(code):
    import forge.world as w
    r = json.loads(run(code))
    r["world"] = json.loads(w._result())
    return json.dumps(r)


def ui_start(code):
    import forge.ui as u
    r = json.loads(run(code))
    r["ui"] = json.loads(u._tree())
    return json.dumps(r)


def ui_event(wid, kind, value):
    import forge.ui as u
    buf = _Out()
    old, old_err = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = buf
    err = None
    tree = None
    try:
        tree = json.loads(u._event(wid, kind, value))
    except BaseException as e:  # noqa: BLE001
        if isinstance(e, KeyboardInterrupt):
            raise
        err = explain(e)
        tree = json.loads(u._tree())
    finally:
        sys.stdout, sys.stderr = old, old_err
    return json.dumps({"ui": tree, "stdout": buf.getvalue(), "error": err})
`,"ai.py":`"""Nova Mini: a tiny, offline practice model with the same shape as real AI chat APIs.

    from forge import ai
    reply = ai.chat([
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Summarize: ..."},
    ])
    print(reply["content"], reply["usage"])

It's simple pattern-matching, nothing like a real large language model, but the request and
response look the same, so code you write here works with a real API after small changes.
It understands requests that start with: Summarize, Classify sentiment, Extract emails,
Translate to pig latin, Count words, Answer in JSON, and simple arithmetic like "What is 12 * 7?".
"""
import json as _json
import math as _math
import re as _re

POSITIVE = {"love", "great", "excellent", "amazing", "good", "happy", "fast", "perfect", "best", "awesome", "helpful", "easy", "fantastic", "nice", "recommend", "works"}
NEGATIVE = {"hate", "bad", "terrible", "awful", "slow", "broken", "worst", "angry", "refund", "bug", "crash", "crashes", "poor", "disappointed", "useless", "late", "hard"}


def count_tokens(text):
    """Roughly how many tokens a model would count (about 4 characters each)."""
    return max(1, round(len(str(text)) / 4))


def _sentences(text):
    return [s.strip() for s in _re.split(r"(?<=[.!?])\\s+", text.strip()) if s.strip()]


def _summarize(text, n=2):
    sents = _sentences(text)
    if len(sents) <= n:
        return " ".join(sents)
    words = [w.lower() for w in _re.findall(r"[a-zA-Z']+", text) if len(w) > 3]
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    scored = sorted(range(len(sents)), key=lambda i: -sum(freq.get(w.lower(), 0) for w in _re.findall(r"[a-zA-Z']+", sents[i])))
    keep = sorted(scored[:n])
    return " ".join(sents[i] for i in keep)


def _sentiment(text):
    words = set(_re.findall(r"[a-z']+", text.lower()))
    score = len(words & POSITIVE) - len(words & NEGATIVE)
    return "positive" if score > 0 else "negative" if score < 0 else "neutral"


def _pig(word):
    if not word.isalpha():
        return word
    lower = word.lower()
    for i, ch in enumerate(lower):
        if ch in "aeiou":
            out = lower[i:] + lower[:i] + ("way" if i == 0 else "ay")
            return out.capitalize() if word[0].isupper() else out
    return lower + "ay"


def _answer(prompt, system=""):
    p = prompt.strip()
    low = p.lower()
    body = p.split(":", 1)[1].strip() if ":" in p else p
    wants_json = "json" in system.lower() or "json" in low
    if low.startswith("summarize"):
        out = _summarize(body)
        return _json.dumps({"summary": out}) if wants_json else out
    if low.startswith("classify sentiment") or low.startswith("sentiment"):
        label = _sentiment(body)
        return _json.dumps({"sentiment": label}) if wants_json else label
    if low.startswith("extract emails"):
        found = _re.findall(r"[\\w.+-]+@[\\w-]+\\.[\\w.]+", body)
        return _json.dumps({"emails": found}) if wants_json else ", ".join(found) or "No emails found."
    if low.startswith("translate to pig latin"):
        return " ".join(_pig(w) for w in body.split())
    if low.startswith("count words"):
        n = len(body.split())
        return _json.dumps({"words": n}) if wants_json else f"{n} words."
    m = _re.search(r"(-?\\d+(?:\\.\\d+)?)\\s*([-+*/x\xD7])\\s*(-?\\d+(?:\\.\\d+)?)", p)
    if m and ("what is" in low or "calculate" in low or low.rstrip("?").strip() == m.group(0)):
        a, op, b = float(m.group(1)), m.group(2), float(m.group(3))
        val = a + b if op == "+" else a - b if op == "-" else a * b if op in "*x\xD7" else (a / b if b else float("nan"))
        val = int(val) if val == int(val) else round(val, 6)
        return _json.dumps({"answer": val}) if wants_json else f"{m.group(0)} = {val}"
    if low in ("hi", "hello", "hey") or low.startswith(("hi ", "hello ", "hey ")):
        return "Hi! I'm Nova Mini, a tiny practice model. Try: Summarize: <text>"
    return "I'm a tiny practice model, so I only know a few tricks: Summarize, Classify sentiment, Extract emails, Translate to pig latin, Count words, and simple math."


def chat(messages, max_tokens=300, temperature=0):
    """Send a conversation, get the assistant's reply: {"role", "content", "usage"}."""
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages must be a non-empty list of {'role': ..., 'content': ...} dictionaries")
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ("system", "user", "assistant") or not isinstance(m.get("content"), str):
            raise ValueError(f"Bad message: {m!r}. Each needs a role (system/user/assistant) and text content.")
    if messages[-1]["role"] != "user":
        raise ValueError("The last message must come from the user.")
    system = " ".join(m["content"] for m in messages if m["role"] == "system")
    text = _answer(messages[-1]["content"], system)
    words = text.split()
    limit = max(1, int(max_tokens * 0.75))
    if len(words) > limit:
        text = " ".join(words[:limit])
    used_in = sum(count_tokens(m["content"]) for m in messages)
    return {"role": "assistant", "content": text, "usage": {"input_tokens": used_in, "output_tokens": count_tokens(text)}}


def embed(text, dims=64):
    """A tiny bag-of-words embedding: similar texts get similar vectors."""
    vec = [0.0] * dims
    for w in _re.findall(r"[a-z0-9']+", str(text).lower()):
        if len(w) < 3:
            continue
        h = 0
        for ch in w[:6]:
            h = (h * 31 + ord(ch)) % 1000003
        vec[h % dims] += 1.0
    norm = _math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]
`,"chart.py":`"""Quick charts that appear right under your output.

    from forge.chart import bar, line, pie, scatter
    bar(["Mon", "Tue", "Wed"], [3, 7, 5], title="Coffees")
"""
from forge._bridge import emit


def _vals(v):
    try:
        import numpy as np  # pandas / numpy values -> plain numbers
        if isinstance(v, np.ndarray):
            v = v.tolist()
    except Exception:
        pass
    if hasattr(v, "tolist"):
        v = v.tolist()
    return [x if isinstance(x, (int, float)) else float(x) for x in v]


def _labels(v):
    if hasattr(v, "tolist"):
        v = v.tolist()
    return [str(x) for x in v]


def bar(labels, values, title="", color=None, horizontal=False):
    emit("chart", type="bar", labels=_labels(labels), values=_vals(values), title=title, color=color, horizontal=horizontal)


def line(labels, values, title="", color=None):
    """values can be one list, or a dict of {series_name: list}."""
    if isinstance(values, dict):
        series = {k: _vals(v) for k, v in values.items()}
    else:
        series = {"": _vals(values)}
    emit("chart", type="line", labels=_labels(labels), series=series, title=title, color=color)


def pie(labels, values, title=""):
    emit("chart", type="pie", labels=_labels(labels), values=_vals(values), title=title)


def scatter(xs, ys, title="", line=None):
    """line=(slope, intercept) draws a best-fit line on top."""
    emit("chart", type="scatter", xs=_vals(xs), ys=_vals(ys), title=title, fit=list(line) if line else None)
`,"ui.py":`"""Build real apps with buttons, text boxes and labels.

    from forge.ui import App
    app = App("Counter")
    count = app.label("0", size=40)
    def add():
        count.text = str(int(count.text) + 1)
    app.button("+1", add)
    app.run()
"""
import json

_app = None


class Widget:
    _next = 0

    def __init__(self, kind, **props):
        Widget._next += 1
        self.id = Widget._next
        self.kind = kind
        self.props = props
        self.handler = None

    def __getattr__(self, name):
        props = self.__dict__.get("props")
        if props is not None and name in props:
            return props[name]
        raise AttributeError(name)

    def __setattr__(self, name, value):
        if name in ("id", "kind", "props", "handler"):
            object.__setattr__(self, name, value)
        else:
            self.props[name] = value

    def _json(self):
        d = {"id": self.id, "kind": self.kind}
        d.update(self.props)
        if self.kind == "row":
            d["children"] = [c._json() for c in self.props["children"]]
        return d


class App:
    def __init__(self, title="My app", theme="dark"):
        global _app
        _app = self
        self.title = title
        self.theme = theme
        self.children = []
        self._all = {}

    def _add(self, w, parent=None):
        self._all[w.id] = w
        if parent is None:
            self.children.append(w)
        return w

    def label(self, text="", size=18, color=None, align="left", mono=False):
        return self._add(Widget("label", text=str(text), size=size, color=color, align=align, mono=mono))

    def button(self, text, on_click=None, color=None, wide=False):
        w = Widget("button", text=str(text), color=color, wide=wide)
        w.handler = on_click
        return self._add(w)

    def input(self, placeholder="", value="", on_change=None, on_enter=None):
        w = Widget("input", placeholder=placeholder, value=str(value))
        w.handler = (on_change, on_enter)
        return self._add(w)

    def row(self, widgets):
        """Put several widgets side by side. Make them with this app first, then pass them here."""
        for w in widgets:
            if w in self.children:
                self.children.remove(w)
        r = Widget("row", children=list(widgets))
        return self._add(r)

    def list(self, items=(), on_click=None):
        w = Widget("list", items=[str(i) for i in items])
        w.handler = on_click
        return self._add(w)

    def run(self):
        pass  # the app takes over from here

    def _json(self):
        return {"title": self.title, "theme": self.theme, "children": [c._json() for c in self.children]}


def _tree():
    if _app is None:
        return "null"
    return json.dumps(_app._json())


def _call(fn, value):
    """Call a handler with the value only if it wants one."""
    code = getattr(fn, "__code__", None)
    required = 0
    if code is not None:
        required = code.co_argcount - len(fn.__defaults__ or ())
        if hasattr(fn, "__self__"):
            required -= 1
    return fn(value) if required >= 1 else fn()


def _event(wid, kind, value):
    w = _app._all.get(wid) if _app else None
    if w is None:
        return _tree()
    if w.kind == "input":
        w.props["value"] = value
        change, enter = w.handler
        fn = enter if kind == "enter" else change
        if fn:
            _call(fn, value)
    elif w.kind == "list":
        if w.handler:
            _call(w.handler, value)
    elif w.handler:
        w.handler()
    return _tree()


def _reset():
    global _app
    _app = None
    Widget._next = 0
`,"world.py":`"""Block World: build in a blocky 3D world with code.

    from forge.world import *
    for x in range(5):
        place(x, 1, 0, "brick")        # x = right, y = up, z = toward you

    bot = Bot(0, 1, 0)
    bot.pen("stone")                   # leaves a block wherever it goes
    for _ in range(4):
        bot.forward(6)
        bot.turn_right()

Blocks: grass, dirt, stone, cobble, wood, planks, leaves, glass, water, sand,
brick, gold, diamond, lava, snow, ice, obsidian, glow, wool_red, wool_blue,
wool_yellow, wool_green, wool_white, wool_black, wool_purple, wool_orange
"""

SIZE = 32          # the world is 32 x 32 blocks wide
HEIGHT = 24        # and 24 blocks tall

BLOCKS = ["grass", "dirt", "stone", "cobble", "wood", "planks", "leaves", "glass", "water", "sand",
          "brick", "gold", "diamond", "lava", "snow", "ice", "obsidian", "glow",
          "wool_red", "wool_blue", "wool_yellow", "wool_green", "wool_white", "wool_black",
          "wool_purple", "wool_orange"]

_blocks = {}
_ops = []
_count = 0
MAX_BLOCKS = 20000


class WorldError(Exception):
    pass


def _check(x, y, z, block=None):
    for v in (x, y, z):
        if not isinstance(v, int):
            raise WorldError(f"Positions must be whole numbers, got {v!r}. Try int(...) or //.")
    if not (0 <= x < SIZE and 0 <= z < SIZE and 0 <= y < HEIGHT):
        raise WorldError(f"({x}, {y}, {z}) is outside the world. x and z go from 0 to {SIZE - 1}, y from 0 to {HEIGHT - 1}.")
    if block is not None and block not in BLOCKS:
        raise WorldError(f'There is no block called "{block}". Try one of: ' + ", ".join(BLOCKS[:12]) + " ...")


def place(x, y, z, block="stone"):
    """Put a block at (x, y, z)."""
    global _count
    _check(x, y, z, block)
    if (x, y, z) not in _blocks:
        _count += 1
        if _count > MAX_BLOCKS:
            raise WorldError(f"That's more than {MAX_BLOCKS} blocks! Check your loops.")
    _blocks[(x, y, z)] = block
    _ops.append(("p", x, y, z, block))


def remove(x, y, z):
    """Take away the block at (x, y, z)."""
    _check(x, y, z)
    if _blocks.pop((x, y, z), None) is not None:
        _ops.append(("r", x, y, z))


def get(x, y, z):
    """The block at (x, y, z), or None if it's empty."""
    _check(x, y, z)
    return _blocks.get((x, y, z))


def fill(x1, y1, z1, x2, y2, z2, block="stone"):
    """Fill a whole box of blocks between two corners."""
    for x in range(min(x1, x2), max(x1, x2) + 1):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            for z in range(min(z1, z2), max(z1, z2) + 1):
                place(x, y, z, block)


def clear():
    """Empty the world completely (even the ground)."""
    global _count
    _blocks.clear()
    _count = 0
    _ops.append(("clear",))


def ground(block="grass", depth=1):
    """A flat floor across the whole world."""
    for y in range(depth):
        for x in range(SIZE):
            for z in range(SIZE):
                _blocks[(x, y, z)] = block if y == depth - 1 else "dirt"
    _ops.append(("ground", block, depth))


def blocks():
    """A dictionary of every block: {(x, y, z): name}."""
    return dict(_blocks)


_DIRS = [(0, 1), (1, 0), (0, -1), (-1, 0)]   # facing: +z (toward you), +x (right), -z (away), -x (left)
_DIR_NAMES = ["south", "east", "north", "west"]


class Bot:
    """A little builder robot. It walks, turns and climbs, and can leave blocks behind it."""

    def __init__(self, x=0, y=1, z=0, facing="east"):
        _check(x, y, z)
        self.x, self.y, self.z = x, y, z
        self.facing = _DIR_NAMES.index(facing) if isinstance(facing, str) else facing
        self.block = None
        self._show()

    def _show(self):
        _ops.append(("bot", self.x, self.y, self.z, self.facing))

    def pen(self, block="stone"):
        """Start leaving \`block\` behind on every step (and right where the bot stands)."""
        _check(self.x, self.y, self.z, block)
        self.block = block
        place(self.x, self.y, self.z, block)

    def pen_up(self):
        """Stop leaving blocks."""
        self.block = None

    def _move(self, dx, dy, dz, steps):
        for _ in range(steps):
            nx, ny, nz = self.x + dx, self.y + dy, self.z + dz
            _check(nx, ny, nz)
            self.x, self.y, self.z = nx, ny, nz
            if self.block:
                place(self.x, self.y, self.z, self.block)
            self._show()

    def forward(self, steps=1):
        dx, dz = _DIRS[self.facing]
        self._move(dx, 0, dz, steps)

    def back(self, steps=1):
        dx, dz = _DIRS[self.facing]
        self._move(-dx, 0, -dz, steps)

    def up(self, steps=1):
        self._move(0, 1, 0, steps)

    def down(self, steps=1):
        self._move(0, -1, 0, steps)

    def turn_right(self):
        self.facing = (self.facing + 3) % 4
        self._show()

    def turn_left(self):
        self.facing = (self.facing + 1) % 4
        self._show()

    def place(self, block="stone"):
        """Put a block right where the bot is standing."""
        place(self.x, self.y, self.z, block)

    def position(self):
        return (self.x, self.y, self.z)

    def __repr__(self):
        return f"Bot at {self.position()} facing {_DIR_NAMES[self.facing]}"


def _reset():
    global _count
    _blocks.clear()
    _ops.clear()
    _count = 0
    ground()


def _result():
    import json
    return json.dumps({"ops": _ops, "count": len(_blocks)})
`};importScripts("vendor/pyodide/pyodide.js");var d=self.location.href.replace(/[^/]*$/,""),p={openpyxl:["et_xmlfile-2.0.0-py3-none-any.whl","openpyxl-3.1.5-py2.py3-none-any.whl"],pypdf:["pypdf-6.20.0-py3-none-any.whl"]},s=null,o=null,f="",i=new Set;async function m(){s=await loadPyodide({indexURL:d+"vendor/pyodide/",stdout:()=>{},stderr:()=>{}}),s.FS.mkdirTree("/home/pyodide/forge");for(let[e,n]of Object.entries(l))s.FS.writeFile("/home/pyodide/forge/"+e,n);return s.runPython("import sys; sys.path.insert(0, '/home/pyodide'); import forge._run as R; import forge, forge.world, forge.ui, forge.chart"),o=s.pyimport("forge._run"),f=s.runPython("import site; site.getsitepackages()[0]"),{version:s.version}}async function _(e){let n=new Set;for(let t of e.matchAll(/^\s*(?:from|import)\s+([A-Za-z_][\w]*)/gm))n.add(t[1]);for(let[t,a]of Object.entries(p))if(n.has(t)&&!i.has(t)){for(let r of a){let u=await(await fetch(d+"vendor/wheels/"+r)).arrayBuffer();s.unpackArchive(u,"wheel",{extractDir:f})}i.add(t)}i.size&&s.runPython("import importlib; importlib.invalidate_caches()"),await s.loadPackagesFromImports(e,{messageCallback:()=>{},errorCallback:()=>{}}),n.has("requests")&&!i.has("requests")&&(await s.loadPackage(["requests","pyodide_http"],{messageCallback:()=>{}}),s.runPython("import pyodide_http; pyodide_http.patch_all()"),i.add("requests"))}var h={init:m,prepare:({code:e})=>_(e),run:({code:e,stdin:n,files:t})=>o.run(e,n||"",JSON.stringify(t||{})),trace:({code:e,stdin:n,files:t})=>o.trace(e,n||"",JSON.stringify(t||{})),check:({code:e,spec:n,files:t})=>o.check(e,JSON.stringify(n),JSON.stringify(t||{})),world:({code:e})=>o.world_run(e),ui_start:({code:e})=>o.ui_start(e),ui_event:({id:e,kind:n,value:t})=>o.ui_event(e,n,t??null),game_start:({code:e,saved:n})=>o.game_start(e,JSON.stringify(n||{})),game_frame:({dt:e,input:n})=>o.game_frame(e,JSON.stringify(n))};self.onmessage=async e=>{let{id:n,cmd:t,args:a}=e.data;try{let r=await h[t](a||{});self.postMessage({id:n,ok:!0,result:r})}catch(r){self.postMessage({id:n,ok:!1,error:String(r&&r.message||r)})}};})();
