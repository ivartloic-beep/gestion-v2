#!/usr/bin/env node
/** Tests unitaires — Espaces de travail (work-projects) */

function wpNewId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function ensureWorkProjectShape(p) {
    if (!p.members) p.members = [];
    if (!p.tasks) p.tasks = [];
    if (!p.activities) p.activities = [];
    if (!p.crm) p.crm = { listIds: [], prospectIds: [], dealIds: [] };
    if (!p.crm.listIds) p.crm.listIds = [];
    if (!p.crm.prospectIds) p.crm.prospectIds = [];
    if (!p.crm.dealIds) p.crm.dealIds = [];
}

function applyTemplate(tpl, responsibleUserId) {
    var p = {
        id: wpNewId('wp'),
        title: 'Test',
        members: ['1'],
        tasks: [],
        activities: [],
        crm: { listIds: [], prospectIds: [], dealIds: [] },
        responsibleUserId: responsibleUserId || null
    };
    if (tpl && tpl.defaultTasks) {
        p.tasks = tpl.defaultTasks.map(function(t, i) {
            return {
                id: wpNewId('task'),
                title: t.title,
                description: t.description || '',
                status: 'todo',
                completed: false,
                order: i
            };
        });
    }
    return p;
}

function wpGetLinkedProspects(p, crmData) {
    var out = [];
    var ids = new Set((p.crm.prospectIds || []).map(String));
    var listIds = new Set((p.crm.listIds || []).map(String));
    (crmData.lists || []).forEach(function(list) {
        var fromList = listIds.has(list.id);
        (list.prospects || []).forEach(function(pr) {
            if (fromList || ids.has(String(pr.id))) out.push({ prospect: pr, list: list });
        });
    });
    return out;
}

function assert(cond, msg) {
    if (!cond) throw new Error('FAIL: ' + msg);
    console.log('  OK:', msg);
}

console.log('Work Projects tests\n');

(function() {
    var p = { title: 'X' };
    ensureWorkProjectShape(p);
    assert(Array.isArray(p.tasks), 'tasks array');
    assert(p.crm.listIds.length === 0, 'crm lists vide');
})();

(function() {
    var tpl = { defaultTasks: [{ title: 'A', description: '' }, { title: 'B', description: 'x' }] };
    var p = applyTemplate(tpl, '3');
    assert(p.tasks.length === 2, '2 tâches depuis modèle');
    assert(p.tasks[0].title === 'A', 'titre tâche 1');
})();

(function() {
    var crmData = {
        lists: [{
            id: 'l1', name: 'Liste',
            prospects: [{ id: 'pr1', organisme: 'Mairie' }, { id: 'pr2', organisme: 'Asso' }]
        }]
    };
    var p = { crm: { listIds: ['l1'], prospectIds: ['pr2'], dealIds: [] } };
    var linked = wpGetLinkedProspects(p, crmData);
    assert(linked.length === 2, 'liste entière + prospect lié = 2 sans doublon si pr2 in list');
})();

(function() {
    var p = { crm: { listIds: [], prospectIds: ['pr1'], dealIds: [] } };
    var crmData = { lists: [{ id: 'l1', prospects: [{ id: 'pr1', organisme: 'X' }] }] };
    assert(wpGetLinkedProspects(p, crmData).length === 1, 'prospect seul lié');
})();

(function() {
    assert(wpNewId('wp').indexOf('wp_') === 0, 'id prefix wp_');
})();

console.log('\nTous les tests work-projects sont passés.');
