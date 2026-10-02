#!/usr/bin/env node
/**
 * Tests unitaires CRM V2 (migration, relances, dossiers)
 * Usage: node tests/crm-v2.test.js
 */

function crmNewId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function ensureProspectShape(prospect) {
    if (!prospect.activities) prospect.activities = [];
    if (prospect.responsibleUserId === undefined) prospect.responsibleUserId = null;
    if (prospect.followUpDate === undefined) prospect.followUpDate = null;
    if (prospect.followUpNote === undefined) prospect.followUpNote = '';
    if (prospect.followUpAssigneeUserId === undefined) prospect.followUpAssigneeUserId = null;
}

function getCrmFollowUpAssigneeUserId(entity, isProspect) {
    if (!entity) return null;
    if (entity.followUpAssigneeUserId != null && entity.followUpAssigneeUserId !== '') {
        return String(entity.followUpAssigneeUserId);
    }
    if (isProspect && entity.responsibleUserId) return String(entity.responsibleUserId);
    return null;
}

function crmFollowUpMatchesScope(entity, isProspect, mineOnly, currentUserId) {
    if (!mineOnly) return true;
    var uid = currentUserId ? String(currentUserId) : null;
    if (!uid) return true;
    return getCrmFollowUpAssigneeUserId(entity, isProspect) === uid;
}

function migrateCrmData(crmData) {
    if (!crmData) return;
    if (!Array.isArray(crmData.deals)) crmData.deals = [];
    (crmData.lists || []).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            ensureProspectShape(p);
            if (p.notes && String(p.notes).trim()) {
                var hasLegacy = p.activities.some(function(a) { return a.legacyNotes; });
                if (!hasLegacy) {
                    p.activities.unshift({
                        id: crmNewId('act'),
                        type: 'note',
                        text: String(p.notes).trim(),
                        authorId: null,
                        authorName: 'Import',
                        createdAt: p.createdAt || new Date().toISOString(),
                        legacyNotes: true
                    });
                }
            }
        });
    });
}

function getCrmFollowUps(crmData, currentUserId, options) {
    options = options || {};
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var items = [];

    (crmData.lists || []).forEach(function(list) {
        (list.prospects || []).forEach(function(p) {
            ensureProspectShape(p);
            if (!p.followUpDate) return;
            if (!crmFollowUpMatchesScope(p, true, options.mineOnly, currentUserId)) return;
            var d = new Date(p.followUpDate);
            d.setHours(0, 0, 0, 0);
            items.push({
                kind: 'prospect',
                id: p.id,
                title: p.organisme,
                date: p.followUpDate,
                overdue: d < today
            });
        });
    });
    (crmData.deals || []).forEach(function(deal) {
        if (deal.status !== 'open' || !deal.followUpDate) return;
        if (!crmFollowUpMatchesScope(deal, false, options.mineOnly, currentUserId)) return;
        var d = new Date(deal.followUpDate);
        d.setHours(0, 0, 0, 0);
        items.push({
            kind: 'deal',
            id: deal.id,
            title: deal.title,
            date: deal.followUpDate,
            overdue: d < today
        });
    });
    items.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    return items;
}

function assert(cond, msg) {
    if (!cond) throw new Error('FAIL: ' + msg);
    console.log('  OK:', msg);
}

console.log('CRM V2 tests\n');

// Test 1: migration notes -> activité
(function() {
    var data = {
        lists: [{ id: 'l1', prospects: [{ id: 'p1', organisme: 'Test', notes: 'Ancienne note', createdAt: '2025-01-01' }] }],
        deals: []
    };
    migrateCrmData(data);
    var p = data.lists[0].prospects[0];
    assert(p.activities.length === 1, 'notes migrées en 1 activité');
    assert(p.activities[0].text === 'Ancienne note', 'texte note conservé');
    assert(p.activities[0].legacyNotes === true, 'flag legacyNotes');
    migrateCrmData(data);
    assert(p.activities.length === 1, 'pas de doublon migration');
})();

// Test 2: ensureProspectShape
(function() {
    var p = { organisme: 'X' };
    ensureProspectShape(p);
    assert(Array.isArray(p.activities), 'activities array');
    assert(p.responsibleUserId === null, 'responsibleUserId null par défaut');
})();

// Test 3: deals array créé
(function() {
    var data = { lists: [] };
    migrateCrmData(data);
    assert(Array.isArray(data.deals), 'deals array initialisé');
})();

// Test 4: relances triées + filtre mine
(function() {
    var data = {
        lists: [{
            id: 'l1',
            prospects: [
                { id: 'p1', organisme: 'A', followUpDate: '2026-12-01', followUpAssigneeUserId: '1', activities: [] },
                { id: 'p2', organisme: 'B', followUpDate: '2026-06-01', followUpAssigneeUserId: '2', activities: [] }
            ]
        }],
        deals: [
            { id: 'd1', title: 'Deal', status: 'open', followUpDate: '2026-09-01', followUpAssigneeUserId: '1' }
        ]
    };
    var all = getCrmFollowUps(data, '1', { mineOnly: false });
    assert(all.length === 3, '3 relances totales');
    assert(all[0].date === '2026-06-01', 'tri par date croissante');
    var mine = getCrmFollowUps(data, '1', { mineOnly: true });
    assert(mine.length === 2, '2 relances pour user 1');
})();

// Test 5: statut deal gagné/perdu (logique kanban)
(function() {
    function applyStage(deal, stage) {
        var lostStages = ['perdu', 'lost', 'perdue'];
        var wonStages = ['gagné', 'gagne', 'contrat signé', 'clôturé', 'cloture', 'livré', 'livre'];
        var sl = stage.toLowerCase();
        if (lostStages.some(function(s) { return sl.indexOf(s) !== -1; })) deal.status = 'lost';
        else if (wonStages.some(function(s) { return sl.indexOf(s) !== -1; })) deal.status = 'won';
        else deal.status = 'open';
    }
    var d = { status: 'open' };
    applyStage(d, 'Gagné');
    assert(d.status === 'won', 'étape Gagné -> won');
    applyStage(d, 'Perdu');
    assert(d.status === 'lost', 'étape Perdu -> lost');
})();

console.log('\nTous les tests CRM V2 sont passés.');
