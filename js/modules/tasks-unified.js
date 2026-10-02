// ========== TÂCHES UNIFIÉES — agrégation, statuts, espaces de travail ==========

function normalizeTaskStatus(status, completed) {
    if (completed || status === 'done') return 'done';
    if (status === 'in_progress' || status === 'inprogress') return 'in_progress';
    return 'todo';
}

function isTaskInProgress(taskOrStatus) {
    var s = typeof taskOrStatus === 'object' ? taskOrStatus.status : taskOrStatus;
    return s === 'in_progress' || s === 'inprogress';
}

function isTaskDone(task) {
    if (!task) return false;
    return task.status === 'done' || task.completed === true;
}

function isWorkProjectId(id) {
    return id && String(id).startsWith('wp_');
}

function isTaskOverdue(task) {
    if (!task || !task.dueDate || isTaskDone(task)) return false;
    var d = new Date(task.dueDate);
    d.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

function migrateUnifiedTaskShape(task, projectId, projectType, projectName) {
    var assignedTo = typeof getAssignedUserIds === 'function'
        ? getAssignedUserIds(task)
        : (function() {
            var raw = task.assignedTo != null ? task.assignedTo : (task.assignees || []);
            if (!Array.isArray(raw)) raw = raw ? [raw] : [];
            return raw.map(String);
        })();
    var status = normalizeTaskStatus(task.status, task.completed);
    return {
        id: task.id,
        title: task.title || 'Sans titre',
        description: task.description || '',
        projectId: projectId,
        projectType: projectType,
        projectName: projectName || '',
        taskSource: projectType === 'work_project' ? 'work_project' : (projectType === 'bureau' ? 'personal' : 'spectacle'),
        category: task.category || '',
        dueDate: task.dueDate || null,
        priority: task.priority || 'normal',
        status: status,
        completed: status === 'done',
        assignedTo: assignedTo,
        assignees: assignedTo,
        subtasks: task.subtasks || [],
        attachments: task.attachments || [],
        comments: task.comments || [],
        followUpDate: task.followUpDate || null,
        followUpNote: task.followUpNote || '',
        createdBy: task.createdBy || null,
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || new Date().toISOString(),
        order: task.order || 0
    };
}

function loadWorkProjectTasksIntoAllTasks(target) {
    if (typeof workProjectsData === 'undefined' || !workProjectsData.projects) return;
    (workProjectsData.projects || []).filter(function(p) { return !p.archived; }).forEach(function(wp) {
        (wp.tasks || []).forEach(function(task) {
            var normalized = migrateUnifiedTaskShape(task, wp.id, 'work_project', wp.title);
            // Persister la normalisation dans le stockage
            if (task.status !== normalized.status) task.status = normalized.status;
            if (task.completed !== normalized.completed) task.completed = normalized.completed;
            target.push(normalized);
        });
    });
}

function findWorkProjectTask(projectId, taskId) {
    if (typeof getWorkProjectById !== 'function') return null;
    var wp = getWorkProjectById(projectId);
    if (!wp || !wp.tasks) return null;
    var t = wp.tasks.find(function(x) { return String(x.id) === String(taskId); });
    return t ? { project: wp, task: t } : null;
}

function saveTaskToWorkProjectStorage(task) {
    var wp = typeof getWorkProjectById === 'function' ? getWorkProjectById(task.projectId) : null;
    if (!wp) return false;
    if (!wp.tasks) wp.tasks = [];
    task.status = normalizeTaskStatus(task.status, task.completed);
    task.completed = task.status === 'done';
    var idx = wp.tasks.findIndex(function(t) { return t.id === task.id; });
    var payload = {
        id: task.id,
        title: task.title,
        description: task.description || '',
        category: task.category || '',
        dueDate: task.dueDate || null,
        priority: task.priority || 'normal',
        status: task.status,
        completed: task.completed,
        assignedTo: (task.assignedTo || []).map(String),
        subtasks: task.subtasks || [],
        attachments: task.attachments || [],
        comments: task.comments || [],
        notes: task.notes || '',
        documents: task.documents || [],
        activities: task.activities || [],
        followUpDate: task.followUpDate || null,
        followUpNote: task.followUpNote || '',
        order: task.order != null ? task.order : idx >= 0 ? idx : wp.tasks.length,
        createdBy: task.createdBy,
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString()
    };
    if (idx >= 0) Object.assign(wp.tasks[idx], payload);
    else wp.tasks.push(payload);
    wp.updatedAt = new Date().toISOString();
    if (typeof logWpActivity === 'function') {
        var label = idx >= 0 ? 'Tâche modifiée' : 'Tâche créée';
        logWpActivity(wp, 'task', label + ' : « ' + task.title + ' »');
    }
    return true;
}

function deleteTaskFromWorkProject(projectId, taskId) {
    var wp = typeof getWorkProjectById === 'function' ? getWorkProjectById(projectId) : null;
    if (!wp) return false;
    wp.tasks = (wp.tasks || []).filter(function(t) { return t.id !== taskId; });
    wp.updatedAt = new Date().toISOString();
    return true;
}

function notifyNewTaskAssignees(task, prevAssigned, projectName) {
    if (typeof notifyUserAssigned !== 'function') return;
    var prev = (prevAssigned || []).map(String);
    var next = (task.assignedTo || []).map(String);
    next.filter(function(id) { return !prev.includes(id); }).forEach(function(uid) {
        notifyUserAssigned(uid, 'Nouvelle tâche assignée',
            'Vous avez été assigné(e) à « ' + (task.title || 'Sans titre') + ' » — ' + projectName + '.',
            'assignment', { type: 'task', projectId: task.projectId, taskId: task.id });
    });
}

function openWorkProjectFromTask(projectId, tab) {
    if (typeof openWorkProjectPage === 'function') {
        openWorkProjectPage(projectId);
        if (tab && typeof switchWpTab === 'function') switchWpTab(tab || 'tasks');
    }
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

// --- Patches ---
(function() {
    // getAllTasks
    var origGetAllTasks = getAllTasks;
    getAllTasks = function() {
        var list = origGetAllTasks();
        var ids = new Set(list.map(function(t) { return t.id; }));
        loadWorkProjectTasksIntoAllTasks([]);
        (workProjectsData && workProjectsData.projects ? workProjectsData.projects : []).forEach(function(wp) {
            if (wp.archived) return;
            (wp.tasks || []).forEach(function(task) {
                if (ids.has(task.id)) return;
                list.push(migrateUnifiedTaskShape(task, wp.id, 'work_project', wp.title));
                ids.add(task.id);
            });
        });
        if (typeof appendCrmDealTasksToList === 'function') {
            var crmBuf = [];
            appendCrmDealTasksToList(crmBuf, { includeDone: true });
            crmBuf.forEach(function(task) {
                if (!ids.has(task.id)) {
                    list.push(task);
                    ids.add(task.id);
                }
            });
        } else if (typeof getCrmDealTasksForAggregation === 'function') {
            getCrmDealTasksForAggregation({ includeDone: true }).forEach(function(task) {
                if (!ids.has(task.id)) list.push(task);
            });
        }
        return list;
    };

    // loadAllTasks
    var origLoadAllTasks = loadAllTasks;
    loadAllTasks = function() {
        origLoadAllTasks();
        var ids = new Set(allTasks.map(function(t) { return t.id; }));
        loadWorkProjectTasksIntoAllTasks(allTasks);
        if (typeof appendCrmDealTasksToList === 'function') {
            var crmBuf = [];
            appendCrmDealTasksToList(crmBuf, { includeDone: true });
            crmBuf.forEach(function(task) {
                if (!ids.has(task.id)) {
                    allTasks.push(task);
                    ids.add(task.id);
                }
            });
        } else if (typeof getCrmDealTasksForAggregation === 'function') {
            getCrmDealTasksForAggregation({ includeDone: true }).forEach(function(task) {
                if (!ids.has(task.id)) {
                    allTasks.push(task);
                    ids.add(task.id);
                }
            });
        }
        allTasks.sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
        return allTasks;
    };

    // migrateTaskToNewStructure — normaliser statut
    var origMigrate = migrateTaskToNewStructure;
    migrateTaskToNewStructure = function(oldTask, projectId, projectType) {
        var t = origMigrate(oldTask, projectId, projectType);
        t.status = normalizeTaskStatus(t.status, t.completed);
        t.completed = t.status === 'done';
        if (isTaskInProgress(t.status)) t.status = 'in_progress';
        return t;
    };

    // saveTaskToProject
    var origSaveTaskToProject = saveTaskToProject;
    saveTaskToProject = function(task) {
        if (isWorkProjectId(task.projectId) || task.projectType === 'work_project' || task.taskSource === 'work_project') {
            task.projectType = 'work_project';
            task.status = normalizeTaskStatus(task.status, task.completed);
            task.completed = task.status === 'done';
            var idx = allTasks.findIndex(function(t) { return t.id === task.id; });
            if (idx >= 0) allTasks[idx] = task;
            else allTasks.push(task);
            saveTaskToWorkProjectStorage(task);
            return;
        }
        origSaveTaskToProject(task);
    };

    // saveTask
    var origSaveTask = saveTask;
    saveTask = async function(event) {
        event.preventDefault();
        var taskId = document.getElementById('taskId').value;
        var isEdit = !!taskId;
        var projectSelect = document.getElementById('taskProjectSelect');
        if (!projectSelect || !projectSelect.value) {
            alert('Veuillez sélectionner un projet pour cette tâche.');
            return;
        }
        var selectedOption = projectSelect.options[projectSelect.selectedIndex];
        var projectId = projectSelect.value;
        var projectType = selectedOption && selectedOption.dataset ? selectedOption.dataset.type : 'spectacle';

        if (isWorkProjectId(projectId)) projectType = 'work_project';

        var priorityRadio = document.querySelector('input[name="taskPriority"]:checked');
        var priority = priorityRadio ? priorityRadio.value : 'normal';
        var statusEl = document.getElementById('taskStatus');
        var status = statusEl && statusEl.value ? normalizeTaskStatus(statusEl.value, false) : 'todo';

        var task = {
            id: taskId || ('task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim() || '',
            projectId: projectId,
            projectType: projectType,
            taskSource: projectType === 'work_project' ? 'work_project' : 'spectacle',
            category: document.getElementById('taskCategory').value || '',
            dueDate: document.getElementById('taskDueDate').value || null,
            priority: priority,
            status: status,
            completed: status === 'done',
            assignedTo: getSelectedAssignees().map(String),
            assignees: getSelectedAssignees().map(String),
            subtasks: (typeof currentSubtasks !== 'undefined' ? currentSubtasks : []).map(function(st) {
                return { id: st.id, title: st.title, assignee: st.assignee || null, completed: st.completed || false, order: st.order || 0 };
            }),
            attachments: (typeof currentAttachments !== 'undefined' ? currentAttachments : []).filter(function(a) { return !a.isNew; }),
            comments: [],
            updatedAt: new Date().toISOString()
        };

        var existingTask = isEdit ? allTasks.find(function(t) { return t.id === taskId; }) : null;
        if (existingTask && existingTask.comments) task.comments = existingTask.comments;
        if (!isEdit) {
            task.createdBy = typeof getCurrentUserId === 'function' ? getCurrentUserId() : (currentUser ? currentUser.id : null);
            task.createdAt = new Date().toISOString();
        } else if (existingTask) {
            task.createdBy = existingTask.createdBy;
            task.createdAt = existingTask.createdAt;
            task.attachments = existingTask.attachments || task.attachments;
            task.comments = existingTask.comments || [];
        }

        var projectName = 'Projet';
        if (projectType === 'work_project') {
            var wp = typeof getWorkProjectById === 'function' ? getWorkProjectById(projectId) : null;
            projectName = wp ? wp.title : 'Espace de travail';
            task.projectName = projectName;
            var prevAssigned = existingTask ? (existingTask.assignedTo || []).map(String) : [];
            notifyNewTaskAssignees(task, prevAssigned, projectName);
            saveTaskToProject(task);
            if (typeof saveWorkProjectsData === 'function') await saveWorkProjectsData();
            if (typeof showToast === 'function') showToast(isEdit ? 'Tâche modifiée' : 'Tâche créée', 'success');
            if (typeof closeTaskModal === 'function') closeTaskModal();
            loadAllTasks();
            if (typeof renderHomeTasksList === 'function') renderHomeTasksList();
            else if (typeof renderHomeTasks === 'function') renderHomeTasks();
            if (typeof updateTasksBadge === 'function') updateTasksBadge();
            if (typeof renderWorkProjectPage === 'function' && typeof wpCurrentId !== 'undefined' && wpCurrentId === projectId) renderWorkProjectPage();
            if (typeof renderBureauProjectTasks === 'function') renderBureauProjectTasks();
            return;
        }

        return origSaveTask(event);
    };

    // deleteTaskFromProject
    var origDeleteTaskFromProject = deleteTaskFromProject;
    deleteTaskFromProject = function(taskId) {
        var t = allTasks.find(function(x) { return x.id === taskId; });
        if (t && isWorkProjectId(t.projectId)) {
            allTasks = allTasks.filter(function(x) { return x.id !== taskId; });
            deleteTaskFromWorkProject(t.projectId, taskId);
            if (typeof saveWorkProjectsData === 'function') saveWorkProjectsData();
            return;
        }
        origDeleteTaskFromProject(taskId);
    };

    // canEditTask
    var origCanEditTask = canEditTask;
    canEditTask = function(task, projectId) {
        if (isWorkProjectId(projectId || task.projectId)) {
            return typeof hasWorkProjectsAccess === 'function' && hasWorkProjectsAccess();
        }
        return origCanEditTask(task, projectId);
    };

    // openTaskDetailModal
    var origOpenTaskDetailModal = openTaskDetailModal;
    openTaskDetailModal = function(projectId, taskId) {
        if (projectId === 'bureau') return origOpenTaskDetailModal(projectId, taskId);
        if (isWorkProjectId(projectId)) {
            var found = findWorkProjectTask(projectId, taskId);
            if (!found) {
                loadAllTasks();
                var fromAll = allTasks.find(function(t) { return t.id === taskId; });
                if (fromAll) {
                    renderTaskDetailModal(fromAll, projectId, false);
                    return;
                }
                return;
            }
            var task = migrateUnifiedTaskShape(found.task, projectId, 'work_project', found.project.title);
            if (typeof canEditTask === 'function' && canEditTask(task, projectId)) {
                editTask(projectId, taskId);
            } else {
                renderTaskDetailModal(task, projectId, false);
            }
            return;
        }
        origOpenTaskDetailModal(projectId, taskId);
    };

    // editTask
    var origEditTask = editTask;
    editTask = async function(projectId, taskId) {
        if (isWorkProjectId(projectId)) {
            if (typeof openTaskFiche === 'function') {
                await openTaskFiche('work_project', projectId, taskId);
                return;
            }
            return origEditTask(projectId, taskId);
        }
        return origEditTask(projectId, taskId);
    };

    // deleteTask
    var origDeleteTask = deleteTask;
    deleteTask = function(projectId, taskId) {
        if (!confirm('Supprimer cette tâche ?')) return;
        if (isWorkProjectId(projectId)) {
            deleteTaskFromWorkProject(projectId, taskId);
            if (typeof saveWorkProjectsData === 'function') saveWorkProjectsData();
            loadAllTasks();
            if (typeof renderHomeTasks === 'function') renderHomeTasks();
            if (typeof renderWorkProjectPage === 'function' && wpCurrentId === projectId) renderWorkProjectPage();
            if (typeof renderBureauProjectTasks === 'function') renderBureauProjectTasks();
            return;
        }
        origDeleteTask(projectId, taskId);
    };

    // populateTaskProjectSelect
    var origPopulateTaskProjectSelect = populateTaskProjectSelect;
    populateTaskProjectSelect = function(selectedId, disabled) {
        origPopulateTaskProjectSelect(selectedId, disabled);
        var sel = document.getElementById('taskProjectSelect');
        if (!sel || typeof getActiveWorkProjects !== 'function') return;
        var group = document.createElement('optgroup');
        group.label = 'Espaces de travail';
        getActiveWorkProjects().forEach(function(wp) {
            var opt = document.createElement('option');
            opt.value = wp.id;
            opt.textContent = '📁 ' + (wp.title || 'Projet');
            opt.dataset.type = 'work_project';
            if (selectedId && String(wp.id) === String(selectedId)) opt.selected = true;
            group.appendChild(opt);
        });
        if (group.children.length) sel.appendChild(group);
    };

    // detectCurrentContext — espace de travail
    var origDetect = detectCurrentContext;
    detectCurrentContext = function() {
        var ctx = origDetect();
        var wpPage = document.getElementById('workProjectPage');
        if (wpPage && wpPage.classList.contains('active') && typeof wpCurrentId !== 'undefined' && wpCurrentId) {
            return { projectId: wpCurrentId, projectType: 'work_project', category: null };
        }
        return ctx;
    };

    // renderTaskDetailModal — statut unifié + retard
    var origRenderTaskDetailModal = renderTaskDetailModal;
    renderTaskDetailModal = function(task, projectId, isBureau) {
        var statusKey = normalizeTaskStatus(task.status, task.completed);
        var statusText = { todo: '⏳ À faire', in_progress: '🔄 En cours', done: '✅ Terminé' }[statusKey] || '⏳ À faire';
        if (isTaskOverdue(task)) statusText += ' ⚠️ En retard';
        origRenderTaskDetailModal(task, projectId, isBureau);
        var content = document.getElementById('taskDetailContent');
        if (content && task.projectType === 'work_project') {
            var h = content.innerHTML.replace('📁 ', '📁 ');
            if (h.indexOf('Espace de travail') === -1 && task.projectName) {
                content.innerHTML = content.innerHTML.replace('📁 ' + (task.projectName || ''), '📁 ' + (task.projectName || '') + ' <span style="font-size:0.8rem;color:#6c5ce7;">(espace de travail)</span>');
            }
        }
    };

    // openTaskModal — pré-sélection work project
    var origOpenTaskModal = openTaskModal;
    openTaskModal = async function(options) {
        await origOpenTaskModal(options || {});
        if (options && options.projectId && isWorkProjectId(options.projectId)) {
            setTimeout(function() {
                var sel = document.getElementById('taskProjectSelect');
                if (sel) sel.value = options.projectId;
            }, 60);
        }
    };

    // Accueil — nom projet espace de travail + toggle
    var origRenderTaskItemCompact = renderTaskItemCompact;
    renderTaskItemCompact = function(task) {
        var html = origRenderTaskItemCompact(task);
        if (isWorkProjectId(task.projectId)) {
            var wpName = task.projectName;
            if (!wpName && typeof getWorkProjectById === 'function') {
                var wp = getWorkProjectById(task.projectId);
                wpName = wp ? wp.title : null;
            }
            if (wpName) {
                html = html.replace('Projet inconnu', typeof escapeHtml === 'function' ? escapeHtml(wpName) : wpName);
                html = html.replace(/<span class="task-tag task-project-tag">[^<]*<\/span>/,
                    '<span class="task-tag task-project-tag">📁 ' + (typeof escapeHtml === 'function' ? escapeHtml(wpName) : wpName) + '</span>');
            }
        }
        return html;
    };

    var origToggleTaskStatusGlobal = toggleTaskStatusGlobal;
    toggleTaskStatusGlobal = function(projectId, taskId) {
        if (isWorkProjectId(projectId)) {
            wpToggleTaskComplete(projectId, taskId);
            return;
        }
        origToggleTaskStatusGlobal(projectId, taskId);
    };

    // Global search — déjà dans wpGlobalSearch; ensure loadAllTasks used in handleGlobalSearch via getAllTasks patch

    // handleGlobalSearch patch in app.js done separately
})();

if (typeof window !== 'undefined') {
    if (typeof openTaskModal === 'function') window.openTaskModal = openTaskModal;
    if (typeof editTask === 'function') window.editTask = editTask;
    if (typeof closeTaskModal === 'function') window.closeTaskModal = closeTaskModal;
    if (typeof saveTask === 'function') window.saveTask = saveTask;
}

// Toggle rapide tâche espace de travail
function wpToggleTaskComplete(projectId, taskId, ev) {
    if (ev) ev.stopPropagation();
    var found = findWorkProjectTask(projectId, taskId);
    if (!found) return;
    var t = found.task;
    var nowDone = !isTaskDone(t);
    t.status = nowDone ? 'done' : 'todo';
    t.completed = nowDone;
    t.updatedAt = new Date().toISOString();
    if (typeof saveWorkProjectsData === 'function') saveWorkProjectsData();
    if (typeof renderWorkProjectPage === 'function' && wpCurrentId === projectId) renderWorkProjectPage();
    loadAllTasks();
    if (typeof renderHomeTasks === 'function') renderHomeTasks();
}

function wpDuplicateTask(projectId, taskId) {
    var found = findWorkProjectTask(projectId, taskId);
    if (!found) return;
    var t = found.task;
    var copy = Object.assign({}, t, {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: (t.title || '') + ' (copie)',
        status: 'todo',
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    found.project.tasks.push(copy);
    if (typeof logWpActivity === 'function') logWpActivity(found.project, 'task', 'Tâche dupliquée : « ' + copy.title + ' »');
    if (typeof saveWorkProjectsData === 'function') saveWorkProjectsData();
    if (typeof renderWorkProjectPage === 'function') renderWorkProjectPage();
}

function wpMoveTaskStatus(projectId, taskId, status) {
    var found = findWorkProjectTask(projectId, taskId);
    if (!found) return;
    found.task.status = normalizeTaskStatus(status, status === 'done');
    found.task.completed = found.task.status === 'done';
    found.task.updatedAt = new Date().toISOString();
    if (typeof saveWorkProjectsData === 'function') saveWorkProjectsData();
    if (typeof renderWorkProjectPage === 'function' && wpCurrentId === projectId) renderWorkProjectPage();
}

function toggleWorkProjectTaskFromBureau(projectId, taskId) {
    wpToggleTaskComplete(projectId, taskId);
    if (typeof renderBureauProjectTasks === 'function') renderBureauProjectTasks();
}
