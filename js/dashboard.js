import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";
var $ = function (id) {
    return document.getElementById(id);
};
function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
}
function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
var MAX_NAME = 120;

// Returns a trimmed string, or null if the user cancelled the prompt
function askName(message, initial) {
    var v = prompt(message, initial || "");
    return v === null ? null : v.trim().slice(0, MAX_NAME);
}

function closeMenu() {
    $("boardMenu").hidden = true;
    $("boardMenuBtn").setAttribute("aria-expanded", "false");
}
/* ---------- Sidebar toggle ---------- */
var narrow = window.matchMedia("(max-width: 760px)");
function setSidebar(open) {
    document.body.classList.toggle("side-closed", !open);
    document.querySelectorAll("[data-toggle-sidebar]").forEach(function (b) {
        b.setAttribute("aria-expanded", String(open));
    });
}
function sidebarOpen() {
    return !document.body.classList.contains("side-closed");
}
// Open by default on desktop, closed (drawer) on small screens
setSidebar(!narrow.matches);
narrow.addEventListener("change", function () {
    setSidebar(!narrow.matches);
});

var T = function (t, d, n) {
    return { t: t, d: d, n: n };
};
var boards = [
    {
        name: "Example Board",
        cols: [
            {
                n: "Todo",
                c: "--c-todo",
                cards: [
                    T("Build UI for onboarding flow", 1, 3),
                    T("Build UI for search", 0, 1),
                    T("Do something", 1, 2),
                    T("", 0, 2),
                ],
            },
            {
                n: "Doing",
                c: "--c-doing",
                cards: [
                    T("Design settings and search pages", 2, 3),
                    T("Add account management endpoints", 2, 3),
                    T("Design onboarding flow", 1, 3),
                    T("Add search endpoints", 1, 2),
                    T("Add authentication endpoints", 1, 2),
                ],
            },
            {
                n: "Done",
                c: "--c-done",
                cards: [
                    T("Conduct 5 wireframe tests", 1, 1),
                    T("Create wireframe prototype", 1, 1),
                    T("Review results of usability tests and iterate", 3, 3),
                    T(
                        "Create paper prototypes and conduct 10 usability tests with potential customers",
                        2,
                        2,
                    ),
                ],
            },
        ],
    },
];
var lists = [
    {
        name: "My Todo List",
        items: [
            { id: "s1", text: "Add your first task above", done: false },
            { id: "s2", text: "Tick me off when done", done: true },
        ],
    },
];

var view = "board"; // "board" | "list"
var cur = 0; // current board index
var curList = 0; // current todo list index
var filter = "all"; // "all" | "active" | "done"
var openId = null; // id of the todo item shown in the detail panel
var uid = null;
var saveTimer = null;

// Debounced save: waits 500ms after the last change
function save() {
    if (!uid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
        setDoc(doc(db, "users", uid, "data", "kanban"), {
            boards: boards,
            lists: lists,
        }).catch(function (err) {
            console.error("Save failed:", err);
        });
    }, 500);
}

onAuthStateChanged(auth, async function (user) {
    if (!user) {
        window.location.href = "index.html"; // not logged in
        return;
    }
    uid = user.uid;
    var name = user.displayName;
    try {
        // Fallback: read username from the Firestore profile
        if (!name) {
            var profile = await getDoc(doc(db, "users", uid));
            name = profile.exists() ? profile.data().username : null;
        }
        // Load this user's data, or save the starter data on first visit
        var snap = await getDoc(doc(db, "users", uid, "data", "kanban"));
        if (snap.exists()) {
            var data = snap.data();
            boards = data.boards || boards;
            lists = data.lists || lists; // older accounts have no lists yet
        } else save();
    } catch (err) {
        console.error(err);
    }
    $("username").textContent = name || user.email.split("@")[0];
    cur = 0;
    curList = 0;
    view = "board";
    render();
});

/* ---------- SortableJS (boards) ---------- */
var sortables = [];
var dragging = false; // true during/just after a drag so the click isn't treated as a tap

function destroySortables() {
    sortables.forEach(function (s) {
        s.destroy();
    });
    sortables = [];
}
function endDrag() {
    setTimeout(function () {
        dragging = false;
    }, 100);
}
function initSortables() {
    if (!window.Sortable) return;
    var common = {
        animation: 150,
        forceFallback: true, // makes dragging work from <button>s in Firefox too
        fallbackOnBody: true,
        delay: 120, // on touch screens, long-press to drag so scrolling still works
        delayOnTouchOnly: true,
        touchStartThreshold: 4,
        ghostClass: "sortable-ghost",
        fallbackClass: "sortable-fallback",
        onStart: function () {
            dragging = true;
        },
    };

    // Cards: reorder inside a column or move between columns
    $("board")
        .querySelectorAll(".cards")
        .forEach(function (el) {
            sortables.push(
                Sortable.create(
                    el,
                    Object.assign({}, common, {
                        group: "cards",
                        draggable: ".card",
                        onEnd: function (evt) {
                            endDrag();
                            var from = +evt.from.dataset.ci;
                            var to = +evt.to.dataset.ci;
                            if (
                                evt.oldIndex !== undefined &&
                                (from !== to || evt.oldIndex !== evt.newIndex)
                            ) {
                                var cols = boards[cur].cols;
                                var moved = cols[from].cards.splice(
                                    evt.oldIndex,
                                    1,
                                )[0];
                                if (moved) {
                                    cols[to].cards.splice(
                                        evt.newIndex,
                                        0,
                                        moved,
                                    );
                                    save();
                                }
                            }
                            // re-render so data-edit / data-delcard indexes match again
                            setTimeout(render, 0);
                        },
                    }),
                ),
            );
        });

    // Columns: reorder by dragging the column title
    sortables.push(
        Sortable.create(
            $("board"),
            Object.assign({}, common, {
                draggable: ".col",
                handle: "h3",
                onEnd: function () {
                    endDrag();
                    var b = boards[cur];
                    var order = Array.prototype.map.call(
                        $("board").querySelectorAll(":scope > .col"),
                        function (el) {
                            return +el.dataset.ci;
                        },
                    );
                    var next = order.map(function (i) {
                        return b.cols[i];
                    });
                    var changed = next.some(function (c, i) {
                        return c !== b.cols[i];
                    });
                    if (changed) {
                        b.cols = next;
                        save();
                    }
                    setTimeout(render, 0);
                },
            }),
        ),
    );
}

/* ---------- Todo detail panel ---------- */
function ensureItem(it) {
    if (!Array.isArray(it.subtasks)) it.subtasks = [];
    if (typeof it.desc !== "string") it.desc = "";
    return it;
}
function currentItem() {
    if (view !== "list" || !openId) return null;
    var l = lists[curList];
    if (!l) return null;
    return (
        l.items.find(function (x) {
            return x.id === openId;
        }) || null
    );
}
function findSub(it, id) {
    return it.subtasks.find(function (s) {
        return s.id === id;
    });
}
function hideDetail() {
    openId = null;
    $("detail").hidden = true;
    $("detail").innerHTML = "";
    document.body.classList.remove("detail-open");
}
function syncDetail() {
    if (!currentItem()) hideDetail();
}
function closeDetail() {
    if (!openId) return;
    hideDetail();
    render(); // removes the "selected" highlight
}
function renderDetail() {
    var it = currentItem();
    if (!it) return hideDetail();
    ensureItem(it);
    var done = it.subtasks.filter(function (s) {
        return s.done;
    }).length;
    var subs = it.subtasks
        .map(function (s) {
            return (
                '<li class="subtask' +
                (s.done ? " done" : "") +
                '">' +
                '<input type="checkbox" data-subdone="' +
                s.id +
                '"' +
                (s.done ? " checked" : "") +
                ' aria-label="Mark subtask done">' +
                '<input data-subtext="' +
                s.id +
                '" value="' +
                esc(s.text) +
                '" maxlength="200" aria-label="Subtask">' +
                '<button class="todo-del" data-subdel="' +
                s.id +
                '" aria-label="Delete subtask">×</button></li>'
            );
        })
        .join("");

    var p = $("detail");
    p.hidden = false;
    document.body.classList.add("detail-open");
    p.innerHTML =
        '<div class="detail-head"><h2>Task details</h2>' +
        '<button class="detail-close" id="closeDetail" aria-label="Close details">×</button></div>' +
        '<div class="detail-body">' +
        '<label class="detail-check"><input type="checkbox" id="dDone"' +
        (it.done ? " checked" : "") +
        "> Completed</label>" +
        '<label for="dName">Name</label>' +
        '<input id="dName" maxlength="200" value="' +
        esc(it.text) +
        '">' +
        '<label for="dDesc">Description</label>' +
        '<textarea id="dDesc" maxlength="2000" placeholder="Add a description…">' +
        esc(it.desc) +
        "</textarea>" +
        '<div class="detail-sub-head"><span>Subtasks</span><span>' +
        done +
        " of " +
        it.subtasks.length +
        "</span></div>" +
        '<ul class="subtasks">' +
        subs +
        "</ul>" +
        '<form class="sub-add" id="subForm">' +
        '<input id="subInput" placeholder="Add a subtask…" autocomplete="off" maxlength="200" aria-label="New subtask">' +
        '<button class="add" type="submit">Add</button></form>' +
        "</div>";
}

// Panel events (delegated, the panel is re-rendered often)
$("detail").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    var it = currentItem();
    if (!b || !it) return;
    if (b.id === "closeDetail") {
        closeDetail();
    } else if (b.dataset.subdel !== undefined) {
        it.subtasks = it.subtasks.filter(function (s) {
            return s.id !== b.dataset.subdel;
        });
        save();
        render();
        renderDetail();
    }
});
$("detail").addEventListener("input", function (e) {
    var it = currentItem();
    if (!it) return;
    var t = e.target;
    var v = t.value.trim();
    if (t.id === "dName") {
        if (!v) return; // don't allow an empty name
        it.text = v;
        var btn = document.querySelector(
            '.todo-text[data-open="' + it.id + '"]',
        );
        if (btn) btn.textContent = v;
        save();
    } else if (t.id === "dDesc") {
        it.desc = t.value;
        save();
    } else if (t.dataset.subtext !== undefined) {
        var s = findSub(it, t.dataset.subtext);
        if (s && v) {
            s.text = v;
            save();
        }
    }
});
$("detail").addEventListener("change", function (e) {
    var it = currentItem();
    if (!it) return;
    var t = e.target;
    if (t.id === "dDone") {
        it.done = t.checked;
        save();
        render();
    } else if (t.id === "dName") {
        if (!t.value.trim()) t.value = it.text; // restore if left empty
    } else if (t.dataset.subdone !== undefined) {
        var s = findSub(it, t.dataset.subdone);
        if (s) {
            s.done = t.checked;
            save();
            render();
            renderDetail();
        }
    } else if (t.dataset.subtext !== undefined) {
        var s2 = findSub(it, t.dataset.subtext);
        if (s2 && !t.value.trim()) t.value = s2.text;
    }
});
$("detail").addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id !== "subForm") return;
    var it = currentItem();
    var text = $("subInput").value.trim();
    if (!it || !text) return;
    it.subtasks.push({ id: newId(), text: text, done: false });
    save();
    render();
    renderDetail();
    $("subInput").focus();
});

/* ---------- Rendering ---------- */
var gridIcon =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/><path d="M6 1.5v13M6 8h8.5"/></svg>';
var listIcon =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4l1.5 1.5L6 3M2 10l1.5 1.5L6 9M8.5 4.5H14M8.5 10.5H14"/></svg>';

function renderSidebar() {
    $("boardCount").textContent = "ALL BOARDS (" + boards.length + ")";
    $("nav").innerHTML =
        boards
            .map(function (b, i) {
                var active = view === "board" && i === cur;
                return (
                    '<button data-b="' +
                    i +
                    '"' +
                    (active ? ' aria-current="true"' : "") +
                    ">" +
                    gridIcon +
                    "<span>" +
                    esc(b.name) +
                    "</span></button>"
                );
            })
            .join("") +
        '<button class="create" id="newBoard">' +
        gridIcon +
        "<span>+ Create new board</span></button>";

    $("listCount").textContent = "TODO LISTS (" + lists.length + ")";
    $("listNav").innerHTML =
        lists
            .map(function (l, i) {
                var active = view === "list" && i === curList;
                var open = l.items.filter(function (x) {
                    return !x.done;
                }).length;
                return (
                    '<button data-l="' +
                    i +
                    '"' +
                    (active ? ' aria-current="true"' : "") +
                    ">" +
                    listIcon +
                    "<span>" +
                    esc(l.name) +
                    "</span>" +
                    '<em class="badge">' +
                    open +
                    "</em></button>"
                );
            })
            .join("") +
        '<button class="create" id="newList">' +
        listIcon +
        "<span>+ Create new list</span></button>";
}

function renderBoard() {
    var b = boards[cur];
    return (
        b.cols
            .map(function (col, ci) {
                var cards = col.cards.length
                    ? col.cards
                          .map(function (k, ki) {
                              var pos = ci + ":" + ki;
                              return (
                                  '<div class="card">' +
                                  '<button class="card-body" data-edit="' +
                                  pos +
                                  '" title="Rename task"><strong>' +
                                  (esc(k.t) || "Untitled") +
                                  "</strong><span>" +
                                  k.d +
                                  " of " +
                                  k.n +
                                  " subtasks</span></button>" +
                                  '<button class="card-del" data-delcard="' +
                                  pos +
                                  '" aria-label="Delete task ' +
                                  esc(k.t) +
                                  '">×</button></div>'
                              );
                          })
                          .join("")
                    : '<div class="empty">No tasks yet. Add one to get started.</div>';
                return (
                    '<div class="col" data-ci="' +
                    ci +
                    '" style="--dot:var(' +
                    col.c +
                    ')"><h3><i></i>' +
                    esc(col.n) +
                    " (" +
                    col.cards.length +
                    ')</h3><div class="cards" data-ci="' +
                    ci +
                    '">' +
                    cards +
                    "</div></div>"
                );
            })
            .join("") +
        '<button class="newcol" id="newCol">+ New column</button>'
    );
}
function renderTodo() {
    var l = lists[curList];
    var total = l.items.length;
    var done = l.items.filter(function (x) {
        return x.done;
    }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    var shown = l.items.filter(function (x) {
        if (filter === "active") return !x.done;
        if (filter === "done") return x.done;
        return true;
    });

    var rows = shown.length
        ? shown
              .map(function (it) {
                  var subs = it.subtasks || [];
                  var subDone = subs.filter(function (s) {
                      return s.done;
                  }).length;
                  return (
                      '<li class="todo-item' +
                      (it.done ? " done" : "") +
                      (it.id === openId ? " selected" : "") +
                      '">' +
                      '<input type="checkbox" data-id="' +
                      it.id +
                      '"' +
                      (it.done ? " checked" : "") +
                      ' aria-label="Mark done">' +
                      '<button class="todo-text" data-open="' +
                      it.id +
                      '" title="Open details">' +
                      esc(it.text) +
                      "</button>" +
                      (subs.length
                          ? '<span class="todo-sub" title="Subtasks done">' +
                            subDone +
                            "/" +
                            subs.length +
                            "</span>"
                          : "") +
                      '<button class="todo-del" data-del="' +
                      it.id +
                      '" aria-label="Delete task">×</button></li>'
                  );
              })
              .join("")
        : '<li class="empty">' +
          (total ? "No tasks in this view." : "No tasks yet. Add one above.") +
          "</li>";

    var tabs = [
        ["all", "All"],
        ["active", "Active"],
        ["done", "Done"],
    ]
        .map(function (f) {
            return (
                '<button data-filter="' +
                f[0] +
                '" aria-pressed="' +
                (filter === f[0]) +
                '">' +
                f[1] +
                "</button>"
            );
        })
        .join("");

    return (
        '<div class="todo">' +
        '<form class="todo-add" id="todoForm">' +
        '<input id="todoInput" placeholder="Add a task…" autocomplete="off" maxlength="200" aria-label="New task">' +
        '<button class="add" type="submit">Add</button></form>' +
        '<div class="todo-meta"><span>' +
        done +
        " of " +
        total +
        ' done</span><div class="progress"><b style="width:' +
        pct +
        '%"></b></div></div>' +
        '<div class="todo-filters">' +
        tabs +
        "</div>" +
        '<ul class="todo-items">' +
        rows +
        "</ul>" +
        '<div class="todo-actions">' +
        '<button class="link-btn" id="renameList">Rename list</button>' +
        '<button class="link-btn" id="clearDone">Clear completed</button>' +
        '<button class="link-btn danger" id="deleteList">Delete list</button>' +
        "</div></div>"
    );
}

function render() {
    closeMenu();
    destroySortables();
    if (view === "list" && !lists[curList]) view = "board";
    if (view === "board" && !boards[cur] && lists.length) {
        view = "list";
        curList = 0;
        filter = "all";
    }
    syncDetail(); // hides the panel if its task is gone / we left the list
    renderSidebar();

    var onBoard = view === "board" && !!boards[cur];
    $("addTask").hidden = !onBoard; // kanban-only button
    $("boardMenuWrap").hidden = !onBoard; // kanban-only menu

    if (view === "list") {
        $("title").textContent = lists[curList].name;
        $("board").innerHTML = renderTodo();
    } else if (onBoard) {
        $("title").textContent = boards[cur].name;
        $("board").innerHTML = renderBoard();
        initSortables();
    } else {
        $("title").textContent = "No boards";
        $("board").innerHTML =
            '<div class="empty">No boards yet. Use "+ Create new board" in the sidebar.</div>';
    }
}

document.addEventListener("click", function (e) {
    if (dragging) return; // ignore the click that ends a drag
    var el = e.target.closest("button");
    if (!el || el.id !== "boardMenuBtn") closeMenu(); // click elsewhere closes menu
    if (!el) return;
    var d = el.dataset;

    if (d.toggleSidebar !== undefined) {
        setSidebar(!sidebarOpen());
    } else if (d.b !== undefined) {
        view = "board";
        cur = +d.b;
        render();
    } else if (d.l !== undefined) {
        view = "list";
        curList = +d.l;
        filter = "all";
        render();
    } else if (el.id === "newBoard") {
        var boardFallback = "Board " + (boards.length + 1);
        var boardName = askName("Name your board:", boardFallback);
        if (boardName === null) return;
        boards.push({
            name: boardName || boardFallback,
            cols: [
                { n: "Todo", c: "--c-todo", cards: [] },
                { n: "Doing", c: "--c-doing", cards: [] },
            ],
        });
        view = "board";
        cur = boards.length - 1;
        render();
        save();
    } else if (el.id === "boardMenuBtn") {
        var menu = $("boardMenu");
        var willOpen = menu.hidden;
        menu.hidden = !willOpen;
        el.setAttribute("aria-expanded", String(willOpen));
    } else if (el.id === "renameBoard") {
        var newBoardName = askName("Rename board:", boards[cur].name);
        if (!newBoardName) return; // cancelled or empty: keep old name
        boards[cur].name = newBoardName;
        render();
        save();
    } else if (el.id === "deleteBoard") {
        if (confirm('Delete "' + boards[cur].name + '" and all its tasks?')) {
            boards.splice(cur, 1);
            cur = Math.max(0, Math.min(cur, boards.length - 1));
            render();
            save();
        }
    } else if (el.id === "newCol") {
        boards[cur].cols.push({
            n: "Column " + (boards[cur].cols.length + 1),
            c: "--c-doing",
            cards: [],
        });
        render();
        save();
    } else if (el.id === "addTask") {
        var taskName = askName("Name your task:", "");
        if (!taskName) return; // cancelled or empty: don't create blank cards
        boards[cur].cols[0].cards.unshift(T(taskName, 0, 1));
        render();
        save();
    } else if (d.edit !== undefined) {
        var ep = d.edit.split(":");
        var card = boards[cur].cols[ep[0]].cards[ep[1]];
        if (!card) return;
        var newTitle = askName("Rename task:", card.t);
        if (!newTitle) return;
        card.t = newTitle;
        render();
        save();
    } else if (d.delcard !== undefined) {
        var dp = d.delcard.split(":");
        boards[cur].cols[dp[0]].cards.splice(+dp[1], 1);
        render();
        save();
    } else if (el.id === "newList") {
        var fallback = "List " + (lists.length + 1);
        var name = prompt("Name your list:", fallback);
        if (name === null) return;
        lists.push({ name: name.trim() || fallback, items: [] });
        view = "list";
        curList = lists.length - 1;
        filter = "all";
        render();
        save();
        $("todoInput").focus();
    } else if (d.open !== undefined) {
        // open the detail panel for this task
        openId = d.open;
        render();
        renderDetail();
    } else if (d.filter) {
        filter = d.filter;
        render();
    } else if (d.del !== undefined) {
        var l = lists[curList];
        l.items = l.items.filter(function (x) {
            return x.id !== d.del;
        });
        render(); // also closes the panel if this task was open
        save();
    } else if (el.id === "clearDone") {
        lists[curList].items = lists[curList].items.filter(function (x) {
            return !x.done;
        });
        render();
        save();
    } else if (el.id === "renameList") {
        var renamed = prompt("Rename list:", lists[curList].name);
        if (renamed && renamed.trim()) {
            lists[curList].name = renamed.trim();
            render();
            save();
        }
    } else if (el.id === "deleteList") {
        if (
            confirm('Delete "' + lists[curList].name + '" and all its tasks?')
        ) {
            lists.splice(curList, 1);
            curList = Math.max(0, Math.min(curList, lists.length - 1));
            if (!lists.length) view = "board";
            render();
            save();
        }
    } else if (el.id === "themeBtn") {
        var r = document.documentElement;
        r.setAttribute(
            "data-theme",
            r.getAttribute("data-theme") === "dark" ? "light" : "dark",
        );
    }
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        closeMenu();
        closeDetail();
        if (narrow.matches && sidebarOpen()) setSidebar(false);
    }
});
// Add a todo item
document.addEventListener("submit", function (e) {
    if (e.target.id !== "todoForm") return;
    e.preventDefault();
    var text = $("todoInput").value.trim();
    if (!text) return;
    lists[curList].items.push({
        id: newId(),
        text: text,
        done: false,
        desc: "",
        subtasks: [],
    });
    render();
    save();
    $("todoInput").focus();
});

// Toggle done from the list row checkbox
document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.id || view !== "list") return;
    var item = lists[curList].items.find(function (x) {
        return x.id === t.dataset.id;
    });
    if (!item || t.type !== "checkbox") return;
    item.done = t.checked;
    render();
    // keep the panel's "Completed" checkbox in sync if this task is open
    var dd = $("dDone");
    if (dd && openId === item.id) dd.checked = item.done;
    save();
});
