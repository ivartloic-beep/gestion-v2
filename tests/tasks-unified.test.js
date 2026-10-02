#!/usr/bin/env node
/** Tests unitaires — Tâches unifiées */

function normalizeTaskStatus(status, completed) {
    if (completed || status === 'done') return 'done';
    if (status === 'in_progress' || status === 'inprogress') return 'in_progress';
    return 'todo';
}

function isTaskDone(task) {
    if (!task) return false;
    return task.status === 'done' || task.completed === true;
}

function isTaskOverdue(task) {
    if (!task || !task.dueDate || isTaskDone(task)) return false;
    var d = new Date(task.dueDate);
    d.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

function applyTemplateDueDates(tasks, baseDate) {
    var base = baseDate ? new Date(baseDate) : new Date();
    return (tasks || []).map(function(t) {
        var copy = Object.assign({}, t);
        if (t.dueDays != null && t.dueDays !== '') {
            var d = new Date(base);
            d.setDate(d.getDate() + parseInt(t.dueDays, 10));
            copy.dueDate = d.toISOString().slice(0, 10);
        }
        return copy;
    });
}

function assert(cond, msg) {
    if (!cond) throw new Error('FAIL: ' + msg);
    console.log('  OK:', msg);
}

console.log('Tasks unified tests\n');

(function() {
    assert(normalizeTaskStatus('inprogress', false) === 'in_progress', 'inprogress → in_progress');
    assert(normalizeTaskStatus('todo', true) === 'done', 'completed → done');
    assert(normalizeTaskStatus('in_progress', false) === 'in_progress', 'in_progress stable');
})();

(function() {
    assert(isTaskDone({ status: 'done' }), 'status done');
    assert(isTaskDone({ status: 'todo', completed: true }), 'completed flag');
    assert(!isTaskDone({ status: 'todo' }), 'todo not done');
})();

(function() {
    var past = new Date();
    past.setDate(past.getDate() - 2);
    assert(isTaskOverdue({ dueDate: past.toISOString().slice(0, 10), status: 'todo' }), 'past due');
    var future = new Date();
    future.setDate(future.getDate() + 5);
    assert(!isTaskOverdue({ dueDate: future.toISOString().slice(0, 10), status: 'todo' }), 'future not overdue');
    assert(!isTaskOverdue({ dueDate: past.toISOString().slice(0, 10), status: 'done' }), 'done not overdue');
})();

(function() {
    var base = new Date('2026-04-01');
    var out = applyTemplateDueDates([
        { title: 'A', dueDays: 0 },
        { title: 'B', dueDays: 7 }
    ], base);
    assert(out[0].dueDate === '2026-04-01', 'dueDays 0 = base date');
    assert(out[1].dueDate === '2026-04-08', 'dueDays 7 = +7 jours');
})();

console.log('\nTous les tests tasks-unified sont passés.');
