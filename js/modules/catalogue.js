// ========== CATALOGUE SPECTACLES ==========

let catalogueData = [];
let currentCatalogueFiche = null;
let currentCatalogueFolderView = null; // { folderId, type: 'visuel'|'document', folderName }
let catalogueMigrationDone = false;

const BUDGET_CATEGORIES_CATALOGUE = ['Cachet', 'Voyage', 'Hôtel', 'Repas', 'Location salle', 'Technique', 'Sécurité', 'Communication', 'L&Co', 'Autre'];

// ========== CHARGEMENT & SAUVEGARDE ==========

async function loadCatalogueData() {
    try {
        const data = await apiCall('catalogue.php', 'GET');
        if (data && data.success && Array.isArray(data.catalogue)) {
            catalogueData = data.catalogue;
            appSettings.catalogue = catalogueData;
            return;
        }
    } catch (e) {
        console.error('Catalogue: erreur chargement', e);
    }
    if (!Array.isArray(catalogueData)) catalogueData = [];
    appSettings.catalogue = catalogueData;
}

async function saveCatalogueData() {
    isSaving = true;
    lastSaveTimestamp = Date.now();
    appSettings.catalogue = catalogueData;
    try {
        await apiCall('catalogue.php', 'POST', { catalogue: catalogueData });
        console.log('Catalogue: données sauvegardées');
    } catch (e) {
        console.error('Catalogue: erreur sauvegarde', e);
        alert('Erreur lors de la sauvegarde du catalogue. Vérifiez votre connexion.');
    } finally {
        isSaving = false;
    }
}

// ========== MIGRATION DES PROJETS EXISTANTS ==========

async function migrateToCatalogue() {
    if (catalogueMigrationDone) return;
    if (appSettings.catalogueMigrated) return;

    await loadCatalogueData();
    if (!projects || projects.length === 0) return;

    const existingNames = new Set(catalogueData.map(c => c.name.toLowerCase().trim()));
    let migrated = 0;

    const tournees = projects.filter(p => p.type === 'tournee');
    tournees.forEach(t => {
        const nameKey = (t.name || '').toLowerCase().trim();
        if (!nameKey || existingNames.has(nameKey)) return;

        const fiche = createCatalogueEntry({
            name: t.name,
            visuels: deepCopyFiles(t.visuels || []),
            documents: deepCopyFiles(t.documents || []),
            budgetModel: (t.fraisFixesTournee || []).map(ff => ({
                id: 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                designation: ff.label || ff.designation || '',
                category: ff.category || 'Autre',
                montant: ff.montant || 0,
                tvaRate: ff.tvaRate || 0
            })),
            migratedFrom: t.id
        });

        catalogueData.push(fiche);
        existingNames.add(nameKey);

        t.catalogueId = fiche.id;
        const childSpectacles = projects.filter(p => p.parentId === t.id);
        childSpectacles.forEach(s => { s.catalogueId = fiche.id; });

        migrated++;
    });

    const isoles = projects.filter(p => p.type !== 'tournee' && !p.parentId);
    const grouped = {};
    isoles.forEach(s => {
        let baseName = extractBaseName(s.name || '');
        const key = baseName.toLowerCase().trim();
        if (!key) return;
        if (!grouped[key]) grouped[key] = { name: baseName, spectacles: [] };
        grouped[key].spectacles.push(s);
    });

    Object.values(grouped).forEach(group => {
        if (existingNames.has(group.name.toLowerCase().trim())) {
            const existing = catalogueData.find(c => c.name.toLowerCase().trim() === group.name.toLowerCase().trim());
            if (existing) {
                group.spectacles.forEach(s => { s.catalogueId = existing.id; });
            }
            return;
        }

        const representative = group.spectacles[0];
        const fiche = createCatalogueEntry({
            name: group.name,
            visuels: deepCopyFiles(representative.visuels || []),
            documents: deepCopyFiles(representative.documents || []),
            budgetModel: [],
            migratedFrom: representative.id
        });

        catalogueData.push(fiche);
        existingNames.add(group.name.toLowerCase().trim());
        group.spectacles.forEach(s => { s.catalogueId = fiche.id; });
        migrated++;
    });

    if (migrated > 0) {
        appSettings.catalogue = catalogueData;
        appSettings.catalogueMigrated = true;
        await saveCatalogueData();
        await saveSettings();
        await saveProjectsAsync();
        console.log(`Migration catalogue : ${migrated} fiche(s) créée(s)`);
    } else {
        appSettings.catalogueMigrated = true;
        await saveSettings();
    }

    catalogueMigrationDone = true;
}

function extractBaseName(name) {
    const separators = [' - ', ' — ', ' – '];
    for (const sep of separators) {
        const idx = name.indexOf(sep);
        if (idx > 0) return name.substring(0, idx).trim();
    }
    return name.trim();
}

function deepCopyFiles(files) {
    return files.map(f => {
        const copy = { ...f };
        if (copy.id) copy.id = 'cat_' + copy.id;
        return copy;
    });
}

function createCatalogueEntry(data) {
    return {
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: data.name || '',
        description: data.description || '',
        genre: data.genre || '',
        duree: data.duree || '',
        notes: data.notes || '',
        visuels: data.visuels || [],
        documents: data.documents || [],
        visuelsFolders: data.visuelsFolders ? JSON.parse(JSON.stringify(data.visuelsFolders)) : [],
        documentsFolders: data.documentsFolders ? JSON.parse(JSON.stringify(data.documentsFolders)) : [],
        budgetModel: data.budgetModel || [],
        contactsCrm: data.contactsCrm || [],
        migratedFrom: data.migratedFrom || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function getCatalogueVisuelReference(fiche) {
    if (!fiche || !fiche.visuels) return null;
    return fiche.visuels.find(v => v.isReference) || fiche.visuels[0];
}

// ========== PAGE CATALOGUE (LISTE) ==========

async function openCataloguePage() {
    if (window.hasPermission && !window.hasPermission('catalogue')) {
        alert("Vous n'avez pas accès au Catalogue Spectacles.");
        return;
    }
    if (typeof closeAllPages === 'function') closeAllPages();
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();

    document.getElementById('homeWelcome').style.display = 'none';
    if (typeof setEvenementielNavActive === 'function') setEvenementielNavActive();

    await loadCatalogueData();
    document.getElementById('cataloguePage').classList.add('active');
    renderCatalogueGrid();
}

function closeCataloguePage() {
    document.getElementById('cataloguePage').classList.remove('active');
    if (typeof returnToEvenementielHome === 'function') returnToEvenementielHome();
    else {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const homeItem = document.querySelector('.nav-item[onclick="navigateTo(\'home\')"]');
        if (homeItem) homeItem.classList.add('active');
        document.getElementById('homeWelcome').style.display = '';
        if (typeof updateHomeTiles === 'function') updateHomeTiles();
    }
}

function filterCatalogue() {
    renderCatalogueGrid();
}

function renderCatalogueGrid() {
    const container = document.getElementById('catalogueGrid');
    const statsEl = document.getElementById('catalogueStats');
    if (!container) return;

    const filter = (document.getElementById('catalogueSearchInput')?.value || '').toLowerCase();
    const filtered = catalogueData.filter(f => {
        if (!filter) return true;
        return (f.name || '').toLowerCase().includes(filter) ||
               (f.genre || '').toLowerCase().includes(filter) ||
               (f.description || '').toLowerCase().includes(filter);
    });

    if (statsEl) {
        const totalLinked = catalogueData.reduce((sum, f) => sum + getLinkedProjectsCount(f.id), 0);
        statsEl.innerHTML = `
            <span>📚 ${catalogueData.length} spectacle(s) en catalogue</span>
            <span>🎭 ${totalLinked} événement(s) lié(s)</span>
        `;
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="catalogue-empty">
                <span class="catalogue-empty-icon">📚</span>
                <div>${catalogueData.length === 0 ? 'Aucun spectacle dans le catalogue.' : 'Aucun résultat pour cette recherche.'}</div>
                ${catalogueData.length === 0 ? '<div style="margin-top: 0.5rem;"><button class="btn" onclick="openCatalogueFicheModal()">+ Ajouter un spectacle</button></div>' : ''}
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(fiche => {
        const refVisuel = getCatalogueVisuelReference(fiche);
        const displayVisuel = refVisuel && (refVisuel.url || refVisuel.base64 || refVisuel.file_id) ? refVisuel : null;
        const visuelUrl = displayVisuel ? getFileDisplayUrl(displayVisuel) : '';
        const linkedCount = getLinkedProjectsCount(fiche.id);
        const visuelHtml = visuelUrl
            ? `<div class="catalogue-card-visual"><img src="${visuelUrl}" alt="${esc(fiche.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='🎭';"></div>`
            : `<div class="catalogue-card-visual">🎭</div>`;

        return `
            <div class="catalogue-card" onclick="viewCatalogueFiche('${fiche.id}')">
                ${visuelHtml}
                ${linkedCount > 0 ? `<span class="catalogue-card-badge">${linkedCount} événement(s)</span>` : ''}
                <div class="catalogue-card-name">${esc(fiche.name)}</div>
                <div class="catalogue-card-genre">${esc(fiche.genre || 'Non renseigné')}</div>
                <div class="catalogue-card-meta">
                    ${fiche.duree ? `<span>⏱ ${esc(fiche.duree)}</span>` : ''}
                    <span>🖼 ${(fiche.visuels || []).length}</span>
                    <span>📄 ${(fiche.documents || []).length}</span>
                    <span>💰 ${(fiche.budgetModel || []).length} ligne(s)</span>
                </div>
            </div>
        `;
    }).join('');
}

function esc(s) {
    return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getLinkedProjectsCount(catalogueId) {
    if (!projects) return 0;
    return projects.filter(p => p.catalogueId === catalogueId).length;
}

function getLinkedProjects(catalogueId) {
    if (!projects) return [];
    return projects.filter(p => p.catalogueId === catalogueId);
}

function getFileDisplayUrl(file) {
    if (!file) return '';
    const isValidUrl = (val) => {
        if (!val || typeof val !== 'string') return false;
        return val.startsWith('data:') || val.startsWith('http') || val.startsWith('/') ||
               val.includes('download.php') || val.includes('api/');
    };
    if (file.file_id && typeof resolveMediaUrl === 'function') {
        const fromId = resolveMediaUrl(null, file.file_id);
        if (fromId) return fromId;
    }
    if (file.url && isValidUrl(file.url)) {
        if (typeof resolveMediaUrl === 'function') return resolveMediaUrl(file.url, file.file_id);
        return file.url;
    }
    if (file.file_id) {
        if (typeof resolveMediaUrl === 'function') return resolveMediaUrl(null, file.file_id);
        if (typeof getDownloadFileUrl === 'function') return getDownloadFileUrl(file.file_id);
        const url = `${typeof API_URL !== 'undefined' ? API_URL : 'api'}/download.php?id=${file.file_id}`;
        return url;
    }
    if (file.base64) {
        let data = file.base64;
        if (!isValidUrl(data) && !/^[A-Za-z0-9+/=]+$/.test(data)) return '';
        if (!data.startsWith('data:')) {
            const mime = file.fileType || file.type || 'image/jpeg';
            data = `data:${mime};base64,${data}`;
        }
        return data;
    }
    return '';
}

// ========== PAGE DETAIL FICHE ==========

function viewCatalogueFiche(id) {
    const fiche = catalogueData.find(f => f.id === id);
    if (!fiche) return;

    currentCatalogueFiche = fiche;
    if (typeof ensureFoldersAndFolderIds === 'function') ensureFoldersAndFolderIds(fiche);

    document.getElementById('cataloguePage').classList.remove('active');
    document.getElementById('catalogueFichePage').classList.add('active');

    const canEdit = !window.hasPermission || window.hasPermission('catalogue', 'edit');
    document.getElementById('catalogueFicheEditBtn').style.display = canEdit ? '' : 'none';
    document.getElementById('catalogueFicheDeleteBtn').style.display = canEdit ? '' : 'none';
    document.getElementById('catalogueAddVisuelBtn').style.display = canEdit ? '' : 'none';
    document.getElementById('catalogueAddDocBtn').style.display = canEdit ? '' : 'none';
    const addFolderVisuelBtn = document.getElementById('catalogueAddFolderVisuelBtn');
    const addFolderDocBtn = document.getElementById('catalogueAddFolderDocBtn');
    if (addFolderVisuelBtn) addFolderVisuelBtn.style.display = canEdit ? '' : 'none';
    if (addFolderDocBtn) addFolderDocBtn.style.display = canEdit ? '' : 'none';
    document.getElementById('catalogueAddBudgetBtn').style.display = canEdit ? '' : 'none';
    const addContactBtn = document.getElementById('catalogueAddContactBtn');
    if (addContactBtn) addContactBtn.style.display = (canEdit && typeof hasCrmAccess === 'function' && hasCrmAccess()) ? '' : 'none';

    renderCatalogueFicheDetail();
}

function closeCatalogueFichePage() {
    document.getElementById('catalogueFichePage').classList.remove('active');
    document.getElementById('catalogueFolderPage').classList.remove('active');
    const contactsModal = document.getElementById('catalogueContactsModal');
    if (contactsModal) contactsModal.classList.remove('active');
    currentCatalogueFiche = null;
    currentCatalogueFolderView = null;
    openCataloguePage();
}

function renderCatalogueFicheDetail() {
    const f = currentCatalogueFiche;
    if (!f) return;

    document.getElementById('catalogueFicheTitle').textContent = f.name || 'Sans nom';

    const linkedProjects = getLinkedProjects(f.id);
    const linkedEl = document.getElementById('catalogueFicheLinkedProjects');
    if (linkedProjects.length > 0) {
        linkedEl.innerHTML = `<span style="margin-right: 0.5rem;">Événements liés :</span>` +
            linkedProjects.map(p => `<span class="linked-badge">${p.type === 'tournee' ? '🎭' : '📍'} ${esc(p.name)}</span>`).join('');
    } else {
        linkedEl.innerHTML = '<span style="color: var(--mn-text-light);">Aucun événement lié</span>';
    }

    document.getElementById('catalogueFicheInfo').innerHTML = `
        <div class="catalogue-fiche-info-grid">
            <div class="catalogue-info-item">
                <span class="catalogue-info-label">Nom</span>
                <span class="catalogue-info-value">${esc(f.name)}</span>
            </div>
            <div class="catalogue-info-item">
                <span class="catalogue-info-label">Genre / Type</span>
                <span class="catalogue-info-value">${esc(f.genre || '—')}</span>
            </div>
            <div class="catalogue-info-item">
                <span class="catalogue-info-label">Durée</span>
                <span class="catalogue-info-value">${esc(f.duree || '—')}</span>
            </div>
            <div class="catalogue-info-item" style="grid-column: 1 / -1;">
                <span class="catalogue-info-label">Description</span>
                <span class="catalogue-info-value" style="white-space: pre-wrap;">${esc(f.description || '—')}</span>
            </div>
            ${f.notes ? `
            <div class="catalogue-info-item" style="grid-column: 1 / -1;">
                <span class="catalogue-info-label">Notes</span>
                <span class="catalogue-info-value" style="white-space: pre-wrap;">${esc(f.notes)}</span>
            </div>` : ''}
        </div>
    `;

    renderCatalogueVisuels();
    renderCatalogueDocuments();
    renderCatalogueBudget();
    renderCatalogueContacts();
}

// ========== VISUELS ==========

function createCatalogueVisuelsFolder() {
    if (!currentCatalogueFiche || typeof createFolder !== 'function') return;
    const name = prompt('Nom du dossier :', 'Nouveau dossier');
    if (!name || !name.trim()) return;
    createFolder(currentCatalogueFiche, name.trim(), 'visuel');
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    renderCatalogueVisuels();
}

function createCatalogueDocumentsFolder() {
    if (!currentCatalogueFiche || typeof createFolder !== 'function') return;
    const name = prompt('Nom du dossier :', 'Nouveau dossier');
    if (!name || !name.trim()) return;
    createFolder(currentCatalogueFiche, name.trim(), 'document');
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    renderCatalogueDocuments();
}

function handleCatalogueFolderDrop(e, targetFolderId, itemType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { itemId, type } = data;
        if (type !== itemType || !currentCatalogueFiche) return;
        const items = itemType === 'document' ? currentCatalogueFiche.documents : currentCatalogueFiche.visuels;
        const item = items.find(x => (x.id || '') === String(itemId));
        if (item) {
            item.folderId = targetFolderId;
            currentCatalogueFiche.updatedAt = new Date().toISOString();
            saveCatalogueData();
            if (itemType === 'document') {
                renderCatalogueDocuments();
                syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'documents');
            } else {
                renderCatalogueVisuels();
                syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
            }
        }
    } catch (err) { console.error('handleCatalogueFolderDrop:', err); }
}

function renderCatalogueVisuels() {
    const container = document.getElementById('catalogueVisuelsGrid');
    const f = currentCatalogueFiche;
    if (!f) return;
    const visuels = f.visuels || [];
    const folders = (typeof getFoldersForType === 'function' ? getFoldersForType(f, 'visuel') : (f.visuelsFolders || f.folders || []));
    const rootVisuels = visuels.filter(v => !v.folderId);
    const hasContent = visuels.length > 0 || folders.length > 0;
    const canEdit = !window.hasPermission || window.hasPermission('catalogue', 'edit');

    if (!hasContent) {
        container.innerHTML = '<div class="catalogue-budget-empty">Aucun visuel</div>';
        return;
    }

    let html = '<div class="catalogue-visuels-wrapper">';
    if (folders.length > 0) {
        html += '<div class="file-explorer catalogue-visuels-folders">';
        folders.forEach(fd => {
            const inFolder = visuels.filter(v => v.folderId === fd.id);
            html += `<div class="folder-card folder-drop-zone catalogue-folder" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleCatalogueFolderDrop(event, '${fd.id}', 'visuel')">
                <div class="explorer-row folder-row" onclick="openCatalogueFolderPage('${fd.id}', 'visuel')" style="cursor:pointer;">
                    <span class="expand-icon">→</span>
                    <span class="file-icon">📁</span>
                    <span class="item-name">${esc(fd.name || '')}</span>
                    <span style="color:#999;font-size:0.85rem;">(${inFolder.length})</span>
                    ${canEdit ? `<span class="item-actions" onclick="event.stopPropagation();">
                        <button class="btn btn-secondary btn-sm" onclick="renameCatalogueVisuelsFolder('${fd.id}')" title="Renommer">✏️</button>
                        <button class="btn btn-sm" onclick="deleteCatalogueVisuelsFolder('${fd.id}')" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                    </span>` : ''}
                </div>
            </div>`;
        });
        html += '</div>';
    }
    if (rootVisuels.length > 0) {
        html += '<div class="catalogue-folder-grid catalogue-folder-grid-visuels">';
        rootVisuels.forEach(v => {
            const i = visuels.findIndex(x => x.id === v.id);
            const url = getFileDisplayUrl(v);
            const safeId = (v.id || i).toString().replace(/'/g, "\\'");
            html += `<div class="catalogue-folder-card file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'visuel', 'catalogue')" ondragend="handleFileDragEnd(event)">
                <div class="catalogue-folder-card-preview" onclick="viewCatalogueVisuelFullscreen('${v.id || i}')">${url ? `<img src="${url}" alt="" onerror="this.parentElement.innerHTML='🖼️'">` : '<span>🖼️</span>'}</div>
                <div class="catalogue-folder-card-body">
                    <div class="catalogue-folder-card-name" onclick="viewCatalogueVisuelFullscreen('${v.id || i}')" title="${esc(v.titre || v.name || 'Sans titre')}">${esc(v.titre || v.name || 'Sans titre')}</div>
                    ${canEdit ? `<label class="catalogue-ref-checkbox" onclick="event.stopPropagation();"><input type="checkbox" ${v.isReference ? 'checked' : ''} onchange="setCatalogueVisuelReference(${i}, this.checked)"> <span>⭐ Référence</span></label>` : ''}
                    <div class="catalogue-folder-card-actions" onclick="event.stopPropagation();">
                        <button class="btn btn-secondary btn-sm" onclick="downloadCatalogueVisuel(${i})" title="Télécharger">⬇️</button>
                        ${canEdit ? `<button class="btn btn-sm" onclick="deleteCatalogueVisuel(${i})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>` : ''}
                    </div>
                </div>
            </div>`;
        });
        html += '</div>';
    }
    html += '<div class="root-drop-zone explorer-drop catalogue-root-zone" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleCatalogueFolderDrop(event, null, \'visuel\')">Glissez les visuels ici</div>';
    html += '</div>';
    container.innerHTML = html;
}

function renameCatalogueVisuelsFolder(folderId) {
    if (!currentCatalogueFiche || typeof renameFolder !== 'function') return;
    const f = (currentCatalogueFiche.visuelsFolders || []).find(x => x.id === folderId);
    if (!f) return;
    const name = prompt('Nom du dossier :', f.name);
    if (name !== null && name.trim()) {
        renameFolder(currentCatalogueFiche, folderId, name.trim(), 'visuel');
        currentCatalogueFiche.updatedAt = new Date().toISOString();
        saveCatalogueData();
        renderCatalogueVisuels();
    }
}

function deleteCatalogueVisuelsFolder(folderId) {
    if (!currentCatalogueFiche || !confirm('Supprimer ce dossier ? Les visuels seront déplacés à la racine.') || typeof deleteFolder !== 'function') return;
    deleteFolder(currentCatalogueFiche, folderId, 'visuel');
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
    renderCatalogueVisuels();
    renderCatalogueGrid();
}

function viewCatalogueVisuelFullscreen(fileId) {
    if (!currentCatalogueFiche || !currentCatalogueFiche.visuels) return;
    const visuel = currentCatalogueFiche.visuels.find(v => (v.id || '') === String(fileId)) ||
        currentCatalogueFiche.visuels[parseInt(fileId, 10)];
    if (!visuel) return;
    const imageUrl = getFileDisplayUrl(visuel);
    if (!imageUrl) return;
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = visuel.titre || visuel.name || 'Visuel';
    img.style.cssText = 'max-width:95%;max-height:95%;object-fit:contain;border-radius:10px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);border:none;color:white;font-size:2rem;width:50px;height:50px;border-radius:50%;cursor:pointer;';
    const closeModal = () => { modal.remove(); document.body.style.overflow = ''; };
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    closeBtn.onclick = closeModal;
    document.body.style.overflow = 'hidden';
    modal.appendChild(img);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
}

function updateCatalogueVisuelTitre(index, value) {
    if (!currentCatalogueFiche?.visuels?.[index]) return;
    currentCatalogueFiche.visuels[index].titre = value;
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
}

function downloadCatalogueVisuel(index) {
    if (typeof downloadFile !== 'function' || !currentCatalogueFiche?.visuels?.[index]) return;
    downloadFile(currentCatalogueFiche.visuels[index], index);
}

function setCatalogueVisuelReference(index, isReference) {
    if (!currentCatalogueFiche || !currentCatalogueFiche.visuels) return;
    currentCatalogueFiche.visuels.forEach((v, i) => { v.isReference = (i === index && isReference); });
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
    if (currentCatalogueFolderView) renderCatalogueFolderContents();
    else { renderCatalogueVisuels(); renderCatalogueGrid(); }
}

function uploadCatalogueVisuels() {
    document.getElementById('catalogueVisuelInput').click();
}

async function handleCatalogueVisuelUpload() {
    const input = document.getElementById('catalogueVisuelInput');
    const files = Array.from(input.files);
    if (!files.length || !currentCatalogueFiche) return;

    for (const file of files) {
        try {
            const uploaded = await uploadFile(file, 'visuels');
            const baseName = (uploaded.name || file.name).replace(/\.[^/.]+$/, '');
            const isFirst = currentCatalogueFiche.visuels.length === 0;
            const visuelData = {
                id: uploaded.stored_externally ? uploaded.file_id : 'catv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: uploaded.name || file.name,
                titre: baseName,
                isReference: isFirst,
                stored_externally: uploaded.stored_externally || false,
                folderId: null
            };
            visuelData.file_id = uploaded.file_id;
            visuelData.url = uploaded.url;
            visuelData.stored_externally = true;
            currentCatalogueFiche.visuels.push(visuelData);
        } catch (err) {
            console.error('Erreur upload visuel catalogue:', err);
            alert('Erreur lors de l\'upload. Vérifiez votre connexion.');
        }
    }

    currentCatalogueFiche.updatedAt = new Date().toISOString();
    await saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
    renderCatalogueVisuels();
    input.value = '';
}

function deleteCatalogueVisuel(index) {
    if (!currentCatalogueFiche || !confirm('Supprimer ce visuel du catalogue ?')) return;
    currentCatalogueFiche.visuels.splice(index, 1);
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
    if (currentCatalogueFolderView) renderCatalogueFolderContents();
    else { renderCatalogueVisuels(); renderCatalogueGrid(); }
}

// ========== PAGE DOSSIER CATALOGUE ==========

function openCatalogueFolderPage(folderId, type) {
    if (!currentCatalogueFiche) return;
    const folders = type === 'visuel'
        ? (typeof getFoldersForType === 'function' ? getFoldersForType(currentCatalogueFiche, 'visuel') : (currentCatalogueFiche.visuelsFolders || []))
        : (typeof getFoldersForType === 'function' ? getFoldersForType(currentCatalogueFiche, 'document') : (currentCatalogueFiche.documentsFolders || []));
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    currentCatalogueFolderView = { folderId, type, folderName: folder.name || 'Dossier' };

    document.getElementById('catalogueFichePage').classList.remove('active');
    document.getElementById('catalogueFolderPage').classList.add('active');

    const canEdit = !window.hasPermission || window.hasPermission('catalogue', 'edit');
    const addBtn = document.getElementById('catalogueFolderAddBtn');
    const renameBtn = document.getElementById('catalogueFolderRenameBtn');
    const deleteBtn = document.getElementById('catalogueFolderDeleteBtn');
    if (addBtn) addBtn.style.display = canEdit ? '' : 'none';
    if (renameBtn) renameBtn.style.display = canEdit ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = canEdit ? '' : 'none';

    const input = document.getElementById('catalogueFolderItemInput');
    if (input) input.setAttribute('accept', type === 'visuel' ? 'image/*' : '*');

    const sectionLabel = type === 'visuel' ? 'Visuels' : 'Documents';
    document.getElementById('catalogueFolderPageTitle').textContent = `${type === 'visuel' ? '🖼️' : '📄'} ${folder.name || 'Dossier'}`;
    document.getElementById('catalogueFolderBreadcrumb').innerHTML = `<span style="color:var(--mn-text-light);">${esc(currentCatalogueFiche.name || '')} › ${sectionLabel} › ${esc(folder.name || '')}</span>`;

    renderCatalogueFolderContents();
}

function closeCatalogueFolderPage() {
    document.getElementById('catalogueFolderPage').classList.remove('active');
    document.getElementById('catalogueFichePage').classList.add('active');
    currentCatalogueFolderView = null;
    renderCatalogueVisuels();
    renderCatalogueDocuments();
}

function renderCatalogueFolderContents() {
    const container = document.getElementById('catalogueFolderContent');
    if (!container || !currentCatalogueFolderView || !currentCatalogueFiche) return;

    const { folderId, type } = currentCatalogueFolderView;
    const canEdit = !window.hasPermission || window.hasPermission('catalogue', 'edit');

    if (type === 'visuel') {
        const visuels = (currentCatalogueFiche.visuels || []).filter(v => v.folderId === folderId);
        if (visuels.length === 0) {
            container.innerHTML = '<div class="catalogue-budget-empty">Aucun visuel dans ce dossier.</div>';
            return;
        }
        let html = '<div class="catalogue-folder-grid catalogue-folder-grid-visuels">';
        visuels.forEach(v => {
            const i = currentCatalogueFiche.visuels.findIndex(x => x.id === v.id);
            const url = getFileDisplayUrl(v);
            const safeId = (v.id || i).toString().replace(/'/g, "\\'");
            html += `<div class="catalogue-folder-card file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'visuel', 'catalogue')" ondragend="handleFileDragEnd(event)">
                <div class="catalogue-folder-card-preview" onclick="viewCatalogueVisuelFullscreen('${v.id || i}')">${url ? `<img src="${url}" alt="" onerror="this.parentElement.innerHTML='🖼️'">` : '<span>🖼️</span>'}</div>
                <div class="catalogue-folder-card-body">
                    <div class="catalogue-folder-card-name" onclick="viewCatalogueVisuelFullscreen('${v.id || i}')" title="${esc(v.titre || v.name || 'Sans titre')}">${esc(v.titre || v.name || 'Sans titre')}</div>
                    ${canEdit ? `<label class="catalogue-ref-checkbox" onclick="event.stopPropagation();"><input type="checkbox" ${v.isReference ? 'checked' : ''} onchange="setCatalogueVisuelReference(${i}, this.checked)"> <span>⭐ Référence</span></label>` : ''}
                    <div class="catalogue-folder-card-actions" onclick="event.stopPropagation();">
                        <button class="btn btn-secondary btn-sm" onclick="downloadCatalogueVisuel(${i})" title="Télécharger">⬇️</button>
                        ${canEdit ? `<button class="btn btn-sm" onclick="deleteCatalogueVisuel(${i})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>` : ''}
                    </div>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } else {
        const docs = (currentCatalogueFiche.documents || []).filter(d => d.folderId === folderId);
        const docIcons = { 'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗', 'ppt': '📙', 'pptx': '📙', 'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️' };
        if (docs.length === 0) {
            container.innerHTML = '<div class="catalogue-budget-empty">Aucun document dans ce dossier.</div>';
            return;
        }
        let html = '<div class="catalogue-folder-grid catalogue-folder-grid-docs">';
        docs.forEach(d => {
            const i = currentCatalogueFiche.documents.findIndex(x => x.id === d.id);
            const ext = (d.name || '').split('.').pop().toLowerCase();
            const icon = docIcons[ext] || '📄';
            const url = getFileDisplayUrl(d);
            const safeId = (d.id || i).toString().replace(/'/g, "\\'");
            html += `<div class="catalogue-folder-card file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'document', 'catalogue')" ondragend="handleFileDragEnd(event)">
                <div class="catalogue-folder-card-preview catalogue-folder-card-preview-doc">${icon}</div>
                <div class="catalogue-folder-card-body">
                    <div class="catalogue-folder-card-name" ${url ? `onclick="window.open('${url.replace(/'/g, "\\'")}', '_blank')" style="cursor:pointer;"` : ''} title="${esc(d.name)}">${esc(d.titre || d.name || 'Document')}</div>
                    <div class="catalogue-folder-card-actions" onclick="event.stopPropagation();">
                        ${url ? `<button class="btn btn-secondary btn-sm" onclick="window.open('${url}', '_blank')" title="Ouvrir">📥</button>` : ''}
                        ${canEdit ? `<button class="btn btn-sm" onclick="deleteCatalogueDocument(${i})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>` : ''}
                    </div>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }
}

function renameCatalogueFolderFromPage() {
    if (!currentCatalogueFolderView) return;
    const { folderId, type } = currentCatalogueFolderView;
    if (type === 'visuel') renameCatalogueVisuelsFolder(folderId);
    else renameCatalogueDocumentsFolder(folderId);
    if (currentCatalogueFolderView) {
        const folders = type === 'visuel' ? (currentCatalogueFiche?.visuelsFolders || []) : (currentCatalogueFiche?.documentsFolders || []);
        const folder = folders.find(f => f.id === folderId);
        if (folder) {
            document.getElementById('catalogueFolderPageTitle').textContent = `${type === 'visuel' ? '🖼️' : '📄'} ${folder.name || 'Dossier'}`;
            document.getElementById('catalogueFolderBreadcrumb').innerHTML = `<span style="color:var(--mn-text-light);">${esc(currentCatalogueFiche?.name || '')} › ${type === 'visuel' ? 'Visuels' : 'Documents'} › ${esc(folder.name || '')}</span>`;
        }
    }
}

function deleteCatalogueFolderFromPage() {
    if (!currentCatalogueFolderView) return;
    const { folderId, type } = currentCatalogueFolderView;
    if (type === 'visuel') {
        if (confirm('Supprimer ce dossier ? Les visuels seront déplacés à la racine.')) {
            if (typeof deleteFolder === 'function') {
                deleteFolder(currentCatalogueFiche, folderId, 'visuel');
                currentCatalogueFiche.updatedAt = new Date().toISOString();
                saveCatalogueData();
                syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
                renderCatalogueVisuels();
                renderCatalogueGrid();
                closeCatalogueFolderPage();
            }
        }
    } else {
        if (confirm('Supprimer ce dossier ? Les documents seront déplacés à la racine.')) {
            if (typeof deleteFolder === 'function') {
                deleteFolder(currentCatalogueFiche, folderId, 'document');
                currentCatalogueFiche.updatedAt = new Date().toISOString();
                saveCatalogueData();
                syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'documents');
                renderCatalogueDocuments();
                closeCatalogueFolderPage();
            }
        }
    }
}

function uploadCatalogueFolderItem() {
    document.getElementById('catalogueFolderItemInput').click();
}

async function handleCatalogueFolderItemUpload() {
    const input = document.getElementById('catalogueFolderItemInput');
    const files = Array.from(input.files);
    if (!files.length || !currentCatalogueFiche || !currentCatalogueFolderView) return;

    const { folderId, type } = currentCatalogueFolderView;

    if (type === 'visuel') {
        for (const file of files) {
            try {
                const uploaded = await uploadFile(file, 'visuels');
                const baseName = (uploaded.name || file.name).replace(/\.[^/.]+$/, '');
                const visuels = currentCatalogueFiche.visuels || [];
                const isFirst = visuels.length === 0;
                const visuelData = {
                    id: uploaded.stored_externally ? uploaded.file_id : 'catv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    name: uploaded.name || file.name,
                    titre: baseName,
                    isReference: isFirst,
                    stored_externally: uploaded.stored_externally || false,
                    folderId: folderId
                };
                visuelData.file_id = uploaded.file_id;
                visuelData.url = uploaded.url;
                visuelData.stored_externally = true;
                currentCatalogueFiche.visuels.push(visuelData);
            } catch (err) {
                console.error('Erreur upload visuel catalogue:', err);
                alert('Erreur lors de l\'upload. Vérifiez votre connexion.');
            }
        }
        currentCatalogueFiche.updatedAt = new Date().toISOString();
        await saveCatalogueData();
        syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'visuels');
        renderCatalogueFolderContents();
    } else {
        for (const file of files) {
            try {
                const uploaded = await uploadFile(file, 'documents');
                const docData = {
                    id: uploaded.stored_externally ? uploaded.file_id : 'catd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    name: uploaded.name || file.name,
                    titre: (uploaded.name || file.name).replace(/\.[^/.]+$/, ''),
                    stored_externally: uploaded.stored_externally || false,
                    folderId: folderId
                };
                docData.file_id = uploaded.file_id;
                docData.url = uploaded.url;
                docData.stored_externally = true;
                currentCatalogueFiche.documents.push(docData);
            } catch (err) {
                console.error('Erreur upload document catalogue:', err);
                alert('Erreur lors de l\'upload. Vérifiez votre connexion.');
            }
        }
        currentCatalogueFiche.updatedAt = new Date().toISOString();
        await saveCatalogueData();
        syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'documents');
        renderCatalogueFolderContents();
    }
    input.value = '';
}

// ========== CONTACTS CRM ==========

function getCrmProspectById(listId, prospectId) {
    if (typeof crmData === 'undefined' || !crmData?.lists) return null;
    const list = crmData.lists.find(l => l.id === listId);
    if (!list?.prospects) return null;
    return list.prospects.find(p => p.id === prospectId) || null;
}

function resolveCatalogueContactsToDisplay(contactsCrm) {
    if (!contactsCrm || !Array.isArray(contactsCrm)) return [];
    return contactsCrm.map(c => {
        if (c.prospectId && c.listId) {
            const p = getCrmProspectById(c.listId, c.prospectId);
            const contactName = [p?.contactPrenom, p?.contactNom].filter(Boolean).join(' ').trim();
            return p ? {
                name: p.organisme || contactName || 'Sans nom',
                nom: contactName || p.organisme || '',
                role: c.role || 'Contact',
                tel: p.tel || '',
                email: p.email || '',
                adresse: [p.adresse, p.cp, p.ville].filter(Boolean).join(', '),
                notes: p.notes || '',
                prospectId: c.prospectId,
                listId: c.listId
            } : { name: 'Prospect introuvable', nom: '', role: c.role || '', prospectId: c.prospectId, listId: c.listId };
        }
        return { name: c.name || c.nom || '', role: c.role || 'Contact', tel: c.tel || '', email: c.email || '', adresse: c.adresse || '', notes: c.notes || '' };
    });
}

function renderCatalogueContacts() {
    const container = document.getElementById('catalogueContactsList');
    if (!container) return;
    const contacts = resolveCatalogueContactsToDisplay(currentCatalogueFiche?.contactsCrm || []);

    if (contacts.length === 0) {
        container.innerHTML = '<div class="catalogue-budget-empty">Aucun contact lié. Cliquez sur "Lier un contact" pour ajouter des prospects du CRM.</div>';
        return;
    }

    const canEdit = !window.hasPermission || window.hasPermission('catalogue', 'edit');
    const hasCrm = typeof hasCrmAccess === 'function' && hasCrmAccess();
    container.innerHTML = contacts.map((c, i) => `
        <div class="catalogue-contact-item">
            <div class="catalogue-contact-info">
                <div class="catalogue-contact-name">${esc(c.name || c.nom || 'Sans nom')}</div>
                <div class="catalogue-contact-role">${esc(c.role || '')}</div>
                ${c.tel ? `<div><a href="tel:${esc(c.tel)}">📞 ${esc(c.tel)}</a></div>` : ''}
                ${c.email ? `<div><a href="mailto:${esc(c.email)}">✉️ ${esc(c.email)}</a></div>` : ''}
                ${c.adresse ? `<div class="catalogue-contact-addr">📮 ${esc(c.adresse)}</div>` : ''}
            </div>
            ${canEdit && hasCrm ? `<button class="btn btn-sm" onclick="removeCatalogueContact(${i})" title="Retirer" style="background:var(--accent);color:white;">✕</button>` : ''}
        </div>
    `).join('');
}

function openCatalogueContactsModal() {
    if (!currentCatalogueFiche) return;
    if (typeof loadCrmData === 'function') loadCrmData();
    const listSelect = document.getElementById('catalogueCrmListSelect');
    if (!listSelect) return;
    listSelect.innerHTML = '<option value="">-- Choisir une liste --</option>';
    (typeof crmData !== 'undefined' && crmData?.lists || []).filter(l => typeof hasCrmListAccess === 'function' ? hasCrmListAccess(l) : true).forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name + ' (' + (l.prospects || []).length + ')';
        listSelect.appendChild(opt);
    });
    document.getElementById('catalogueCrmProspectSelect').innerHTML = '<option value="">-- Choisir un prospect --</option>';
    document.getElementById('catalogueCrmContactRole').value = '';
    document.getElementById('catalogueContactsModal').classList.add('active');
}

function closeCatalogueContactsModal() {
    document.getElementById('catalogueContactsModal').classList.remove('active');
}

function populateCatalogueCrmProspects() {
    const listId = document.getElementById('catalogueCrmListSelect')?.value;
    const prospectSelect = document.getElementById('catalogueCrmProspectSelect');
    if (!prospectSelect) return;
    prospectSelect.innerHTML = '<option value="">-- Choisir un prospect --</option>';
    if (!listId || typeof crmData === 'undefined') return;
    const list = crmData.lists.find(l => l.id === listId);
    if (!list?.prospects) return;
    list.prospects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = (p.organisme || 'Sans nom') + (p.ville ? ' — ' + p.ville : '');
        prospectSelect.appendChild(opt);
    });
}

function addCatalogueContactFromCrm() {
    const listId = document.getElementById('catalogueCrmListSelect')?.value;
    const prospectId = document.getElementById('catalogueCrmProspectSelect')?.value;
    const role = document.getElementById('catalogueCrmContactRole')?.value.trim() || 'Contact';
    if (!listId || !prospectId || !currentCatalogueFiche) return;
    if (!currentCatalogueFiche.contactsCrm) currentCatalogueFiche.contactsCrm = [];
    const exists = currentCatalogueFiche.contactsCrm.some(c => c.prospectId === prospectId && c.listId === listId);
    if (exists) { alert('Ce contact est déjà lié.'); return; }
    currentCatalogueFiche.contactsCrm.push({ prospectId, listId, role });
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'contacts');
    renderCatalogueContacts();
    closeCatalogueContactsModal();
}

function removeCatalogueContact(index) {
    if (!currentCatalogueFiche || !confirm('Retirer ce contact du catalogue ? (Le prospect reste dans le CRM)')) return;
    currentCatalogueFiche.contactsCrm.splice(index, 1);
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'contacts');
    renderCatalogueContacts();
}

// ========== DOCUMENTS ==========

function renameCatalogueDocumentsFolder(folderId) {
    if (!currentCatalogueFiche || typeof renameFolder !== 'function') return;
    const f = (currentCatalogueFiche.documentsFolders || []).find(x => x.id === folderId);
    if (!f) return;
    const name = prompt('Nom du dossier :', f.name);
    if (name !== null && name.trim()) {
        renameFolder(currentCatalogueFiche, folderId, name.trim(), 'document');
        currentCatalogueFiche.updatedAt = new Date().toISOString();
        saveCatalogueData();
        renderCatalogueDocuments();
    }
}

function deleteCatalogueDocumentsFolder(folderId) {
    if (!currentCatalogueFiche || !confirm('Supprimer ce dossier ? Les documents seront déplacés à la racine.') || typeof deleteFolder !== 'function') return;
    deleteFolder(currentCatalogueFiche, folderId, 'document');
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'documents');
    renderCatalogueDocuments();
}

function renderCatalogueDocuments() {
    const container = document.getElementById('catalogueDocumentsList');
    const f = currentCatalogueFiche;
    if (!f) return;
    const docs = f.documents || [];
    const folders = (typeof getFoldersForType === 'function' ? getFoldersForType(f, 'document') : (f.documentsFolders || f.folders || []));
    const rootDocs = docs.filter(d => !d.folderId);
    const hasContent = docs.length > 0 || folders.length > 0;
    const canEdit = !window.hasPermission || window.hasPermission('catalogue', 'edit');
    const docIcons = { 'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗', 'ppt': '📙', 'pptx': '📙', 'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️' };

    if (!hasContent) {
        container.innerHTML = '<div class="catalogue-budget-empty">Aucun document</div>';
        return;
    }

    let html = '<div class="file-explorer">';
    folders.forEach(fd => {
        const inFolder = docs.filter(d => d.folderId === fd.id);
        html += `<div class="folder-card folder-drop-zone catalogue-folder" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleCatalogueFolderDrop(event, '${fd.id}', 'document')">
            <div class="explorer-row folder-row" onclick="openCatalogueFolderPage('${fd.id}', 'document')" style="cursor:pointer;">
                <span class="expand-icon">→</span>
                <span class="file-icon">📁</span>
                <span class="item-name">${esc(fd.name || '')}</span>
                <span style="color:#999;font-size:0.85rem;">(${inFolder.length})</span>
                ${canEdit ? `<span class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary btn-sm" onclick="renameCatalogueDocumentsFolder('${fd.id}')" title="Renommer">✏️</button>
                    <button class="btn btn-sm" onclick="deleteCatalogueDocumentsFolder('${fd.id}')" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>
                </span>` : ''}
            </div>
        </div>`;
    });
    rootDocs.forEach(d => {
        const i = docs.findIndex(x => x.id === d.id);
        const ext = (d.name || '').split('.').pop().toLowerCase();
        const icon = docIcons[ext] || '📄';
        const url = getFileDisplayUrl(d);
        const safeId = (d.id || i).toString().replace(/'/g, "\\'");
        html += `<div class="explorer-row file-draggable" draggable="true" ondragstart="handleFileDragStart(event, '${safeId}', 'document', 'catalogue')" ondragend="handleFileDragEnd(event)">
            <span class="file-icon">${icon}</span>
            <span class="item-name" ${url ? `onclick="window.open('${url.replace(/'/g, "\\'")}', '_blank')" style="cursor:pointer;"` : ''} title="${esc(d.name)}">${esc(d.titre || d.name || 'Document')}</span>
            <span class="item-actions" onclick="event.stopPropagation();">
                ${url ? `<button class="btn btn-secondary btn-sm" onclick="window.open('${url}', '_blank')" title="Ouvrir">📥</button>` : ''}
                ${canEdit ? `<button class="btn btn-sm" onclick="deleteCatalogueDocument(${i})" title="Supprimer" style="background:var(--accent);color:white;">🗑️</button>` : ''}
            </span>
        </div>`;
    });
    html += '</div>';
    html += '<div class="root-drop-zone explorer-drop catalogue-root-zone" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleCatalogueFolderDrop(event, null, \'document\')">Glissez les documents ici</div>';
    container.innerHTML = html;
}

function uploadCatalogueDocuments() {
    document.getElementById('catalogueDocInput').click();
}

async function handleCatalogueDocUpload() {
    const input = document.getElementById('catalogueDocInput');
    const files = Array.from(input.files);
    if (!files.length || !currentCatalogueFiche) return;

    for (const file of files) {
        try {
            const uploaded = await uploadFile(file, 'documents');
            const docData = {
                id: uploaded.stored_externally ? uploaded.file_id : 'catd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: uploaded.name || file.name,
                titre: (uploaded.name || file.name).replace(/\.[^/.]+$/, ''),
                stored_externally: uploaded.stored_externally || false,
                folderId: null
            };
            docData.file_id = uploaded.file_id;
            docData.url = uploaded.url;
            docData.stored_externally = true;
            currentCatalogueFiche.documents.push(docData);
        } catch (err) {
            console.error('Erreur upload document catalogue:', err);
            alert('Erreur lors de l\'upload. Vérifiez votre connexion.');
        }
    }

    currentCatalogueFiche.updatedAt = new Date().toISOString();
    await saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'documents');
    renderCatalogueDocuments();
    input.value = '';
}

function deleteCatalogueDocument(index) {
    if (!currentCatalogueFiche || !confirm('Supprimer ce document du catalogue ?')) return;
    currentCatalogueFiche.documents.splice(index, 1);
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    syncCatalogueToLinkedProjects(currentCatalogueFiche.id, 'documents');
    if (currentCatalogueFolderView) renderCatalogueFolderContents();
    else renderCatalogueDocuments();
}

// ========== BUDGET MODELE ==========

function renderCatalogueBudget() {
    const container = document.getElementById('catalogueBudgetTable');
    const lines = currentCatalogueFiche?.budgetModel || [];

    if (lines.length === 0) {
        container.innerHTML = '<div class="catalogue-budget-empty">Aucune ligne de budget modèle. Ajoutez des coûts récurrents pour ce spectacle.</div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Désignation</th>
                    <th style="width: 150px;">Catégorie</th>
                    <th style="width: 110px;">Montant HT</th>
                    <th style="width: 90px;">TVA</th>
                    <th style="width: 40px;"></th>
                </tr>
            </thead>
            <tbody>
                ${lines.map((line, i) => `
                    <tr>
                        <td><input type="text" value="${esc(line.designation)}" onchange="updateCatalogueBudgetLine(${i}, 'designation', this.value)" placeholder="Désignation"></td>
                        <td>
                            <select onchange="updateCatalogueBudgetLine(${i}, 'category', this.value)">
                                ${BUDGET_CATEGORIES_CATALOGUE.map(c => `<option value="${c}" ${line.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </td>
                        <td><input type="number" value="${line.montant || 0}" onchange="updateCatalogueBudgetLine(${i}, 'montant', parseFloat(this.value) || 0)" step="0.01"></td>
                        <td>
                            <select onchange="updateCatalogueBudgetLine(${i}, 'tvaRate', parseFloat(this.value))">
                                <option value="0" ${line.tvaRate === 0 ? 'selected' : ''}>0%</option>
                                <option value="5.5" ${line.tvaRate === 5.5 ? 'selected' : ''}>5.5%</option>
                                <option value="10" ${line.tvaRate === 10 ? 'selected' : ''}>10%</option>
                                <option value="20" ${line.tvaRate === 20 ? 'selected' : ''}>20%</option>
                            </select>
                        </td>
                        <td><button onclick="deleteCatalogueBudgetLine(${i})" style="background: none; border: none; cursor: pointer; color: var(--accent, #e94560);">✕</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function addCatalogueBudgetLine() {
    if (!currentCatalogueFiche) return;
    if (!currentCatalogueFiche.budgetModel) currentCatalogueFiche.budgetModel = [];

    currentCatalogueFiche.budgetModel.push({
        id: 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        designation: '',
        category: 'Autre',
        montant: 0,
        tvaRate: 0
    });

    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    renderCatalogueBudget();
}

function updateCatalogueBudgetLine(index, field, value) {
    if (!currentCatalogueFiche?.budgetModel?.[index]) return;
    currentCatalogueFiche.budgetModel[index][field] = value;
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
}

function deleteCatalogueBudgetLine(index) {
    if (!currentCatalogueFiche || !confirm('Supprimer cette ligne ?')) return;
    currentCatalogueFiche.budgetModel.splice(index, 1);
    currentCatalogueFiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
    renderCatalogueBudget();
}

// ========== MODAL CREATION/EDITION ==========

function openCatalogueFicheModal(fiche = null) {
    const modal = document.getElementById('catalogueFicheModal');
    const form = document.getElementById('catalogueFicheForm');
    form.reset();

    if (fiche) {
        document.getElementById('catalogueFicheModalTitle').textContent = 'Modifier la fiche';
        document.getElementById('catalogueFicheId').value = fiche.id;
        document.getElementById('catalogueFicheName').value = fiche.name || '';
        document.getElementById('catalogueFicheDescription').value = fiche.description || '';
        document.getElementById('catalogueFicheGenre').value = fiche.genre || '';
        document.getElementById('catalogueFicheDuree').value = fiche.duree || '';
        document.getElementById('catalogueFicheNotes').value = fiche.notes || '';
    } else {
        document.getElementById('catalogueFicheModalTitle').textContent = 'Nouvelle fiche spectacle';
        document.getElementById('catalogueFicheId').value = '';
    }

    modal.classList.add('active');
}

function closeCatalogueFicheModal() {
    document.getElementById('catalogueFicheModal').classList.remove('active');
}

async function saveCatalogueFiche(event) {
    event.preventDefault();

    const id = document.getElementById('catalogueFicheId').value;
    const name = document.getElementById('catalogueFicheName').value.trim();
    if (!name) { alert('Le nom est requis.'); return; }

    if (id) {
        const fiche = catalogueData.find(f => f.id === id);
        if (fiche) {
            fiche.name = name;
            fiche.description = document.getElementById('catalogueFicheDescription').value.trim();
            fiche.genre = document.getElementById('catalogueFicheGenre').value.trim();
            fiche.duree = document.getElementById('catalogueFicheDuree').value.trim();
            fiche.notes = document.getElementById('catalogueFicheNotes').value.trim();
            fiche.updatedAt = new Date().toISOString();
        }
    } else {
        const newFiche = createCatalogueEntry({
            name: name,
            description: document.getElementById('catalogueFicheDescription').value.trim(),
            genre: document.getElementById('catalogueFicheGenre').value.trim(),
            duree: document.getElementById('catalogueFicheDuree').value.trim(),
            notes: document.getElementById('catalogueFicheNotes').value.trim()
        });
        catalogueData.push(newFiche);

        if (window._catalogueReturnToProject) {
            window._catalogueCreatedId = newFiche.id;
        }
    }

    await saveCatalogueData();
    closeCatalogueFicheModal();

    if (window._catalogueReturnToProject) {
        window._catalogueReturnToProject = false;
        await populateCatalogueSelect();
        const select = document.getElementById('projectCatalogueId');
        if (select && window._catalogueCreatedId) {
            select.value = window._catalogueCreatedId;
            onCatalogueSelectChange();
            window._catalogueCreatedId = null;
        }
    } else if (currentCatalogueFiche) {
        renderCatalogueFicheDetail();
    } else {
        renderCatalogueGrid();
    }
}

function editCatalogueFiche() {
    if (!currentCatalogueFiche) return;
    openCatalogueFicheModal(currentCatalogueFiche);
}

// ========== SUPPRESSION AVEC PROTECTION ==========

async function deleteCatalogueFiche() {
    if (!currentCatalogueFiche) return;

    const linked = getLinkedProjects(currentCatalogueFiche.id);
    if (linked.length > 0) {
        alert(`Impossible de supprimer cette fiche : elle est liée à ${linked.length} événement(s).\n\nÉvénements liés :\n${linked.map(p => '- ' + p.name).join('\n')}\n\nDissociez d'abord ces événements avant de supprimer.`);
        return;
    }

    const canDelete = (currentUser && currentUser.role === 'admin') ||
        (!window.hasPermission || window.hasPermission('catalogue', 'edit'));
    if (!canDelete) {
        alert('Vous n\'avez pas les droits pour supprimer des fiches du catalogue.');
        return;
    }

    if (!confirm(`Supprimer définitivement la fiche "${currentCatalogueFiche.name}" du catalogue ?\n\nCette action est irréversible.`)) return;

    catalogueData = catalogueData.filter(f => f.id !== currentCatalogueFiche.id);
    await saveCatalogueData();
    closeCatalogueFichePage();
}

// ========== SYNCHRONISATION CATALOGUE <-> PROJETS ==========

function syncCatalogueToLinkedProjects(catalogueId, type) {
    const fiche = catalogueData.find(f => f.id === catalogueId);
    if (!fiche) return;

    const linked = getLinkedProjects(catalogueId);
    if (linked.length === 0) return;

    linked.forEach(project => {
        if (type === 'visuels') {
            const catalogueVisuels = (fiche.visuels || []).map(v => ({
                ...v,
                fromCatalogue: true,
                catalogueId: catalogueId
            }));
            const localVisuels = (project.visuels || []).filter(v => !v.fromCatalogue);
            const hasLocalReference = localVisuels.some(v => v.isReference);
            if (hasLocalReference) {
                catalogueVisuels.forEach(v => { v.isReference = false; });
            }
            project.visuels = [...catalogueVisuels, ...localVisuels];
        }

        if (type === 'documents') {
            const catalogueDocs = (fiche.documents || []).map(d => ({
                ...d,
                fromCatalogue: true,
                catalogueId: catalogueId
            }));
            const localDocs = (project.documents || []).filter(d => !d.fromCatalogue);
            project.documents = [...catalogueDocs, ...localDocs];
        }

        if (type === 'contacts') {
            const resolved = resolveCatalogueContactsToDisplay(fiche.contactsCrm || []);
            const catalogueContacts = resolved.filter(c => c.name || c.nom).map(c => ({
                name: c.name || c.nom,
                nom: c.nom || c.name,
                role: c.role || 'Contact',
                tel: c.tel || '',
                email: c.email || '',
                adresse: c.adresse || '',
                notes: c.notes || '',
                fromCatalogue: true,
                catalogueId: catalogueId
            }));
            const localContacts = (project.contactsCrm || []).filter(c => !c.fromCatalogue);
            project.contactsCrm = [...catalogueContacts, ...localContacts];
        }

        project.updatedAt = new Date().toISOString();
    });

    if (typeof saveProjectsAsync === 'function') saveProjectsAsync();
}

function applyCatalogueToNewProject(projectData, catalogueId) {
    const fiche = catalogueData.find(f => f.id === catalogueId);
    if (!fiche) return;

    projectData.catalogueId = catalogueId;

    if (fiche.visuels && fiche.visuels.length > 0) {
        projectData.visuels = fiche.visuels.map(v => ({
            ...v,
            fromCatalogue: true,
            catalogueId: catalogueId,
            folderId: v.folderId ?? null
        }));
    }

    if (fiche.documents && fiche.documents.length > 0) {
        projectData.documents = fiche.documents.map(d => ({
            ...d,
            fromCatalogue: true,
            catalogueId: catalogueId,
            folderId: d.folderId ?? null
        }));
    }

    if (fiche.visuelsFolders && fiche.visuelsFolders.length > 0) {
        projectData.visuelsFolders = JSON.parse(JSON.stringify(fiche.visuelsFolders));
    }
    if (fiche.documentsFolders && fiche.documentsFolders.length > 0) {
        projectData.documentsFolders = JSON.parse(JSON.stringify(fiche.documentsFolders));
    }

    if (fiche.contactsCrm && fiche.contactsCrm.length > 0) {
        const resolved = resolveCatalogueContactsToDisplay(fiche.contactsCrm);
        projectData.contactsCrm = resolved.filter(c => c.name || c.nom).map(c => ({
            name: c.name || c.nom,
            nom: c.nom || c.name,
            role: c.role || 'Contact',
            tel: c.tel || '',
            email: c.email || '',
            adresse: c.adresse || '',
            notes: c.notes || '',
            fromCatalogue: true,
            catalogueId: catalogueId
        }));
    }

    if (fiche.budgetModel && fiche.budgetModel.length > 0) {
        if (!projectData.budget) projectData.budget = [];
        fiche.budgetModel.forEach(bm => {
            projectData.budget.push({
                id: 'budget_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                designation: bm.designation,
                category: bm.category,
                montantType: 'fixe',
                montantFixe: bm.montant || 0,
                montantInputType: 'HT',
                tvaRate: bm.tvaRate || 0,
                isEstimatif: true,
                isReel: false,
                fromCatalogue: true,
                catalogueId: catalogueId
            });
        });
    }

    if (typeof ensureFoldersAndFolderIds === 'function') {
        ensureFoldersAndFolderIds(projectData);
    }
}

function syncProjectToCatalogue(project) {
    if (!project.catalogueId) return;
    const fiche = catalogueData.find(f => f.id === project.catalogueId);
    if (!fiche) return;

    const newProjectVisuels = (project.visuels || []).filter(v => !v.fromCatalogue);
    newProjectVisuels.forEach(v => {
        const exists = fiche.visuels.some(fv =>
            (fv.file_id && fv.file_id === v.file_id) ||
            (fv.name && fv.name === v.name && fv.id === v.id)
        );
        if (!exists) {
            fiche.visuels.push({ ...v, id: v.id || ('catv_sync_' + Date.now()) });
        }
    });

    const newProjectDocs = (project.documents || []).filter(d => !d.fromCatalogue);
    newProjectDocs.forEach(d => {
        const exists = fiche.documents.some(fd =>
            (fd.file_id && fd.file_id === d.file_id) ||
            (fd.name && fd.name === d.name && fd.id === d.id)
        );
        if (!exists) {
            fiche.documents.push({ ...d, id: d.id || ('catd_sync_' + Date.now()) });
        }
    });

    fiche.updatedAt = new Date().toISOString();
    saveCatalogueData();
}

// ========== INTÉGRATION FORMULAIRE PROJET ==========

async function populateCatalogueSelect(allowEmpty) {
    const select = document.getElementById('projectCatalogueId');
    if (!select) return;

    await loadCatalogueData();
    const currentVal = select.value;

    select.innerHTML = allowEmpty ? '<option value="">-- Nouveau spectacle --</option>' : '<option value="">-- Sélectionner un spectacle (obligatoire) --</option>';
    catalogueData.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name + (f.genre ? ' (' + f.genre + ')' : '');
        select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
}

/** Remplit un select catalogue pour changement (sans option création). Retourne l'élément. */
async function populateCatalogueSelectForChange(selectEl, currentCatalogueId) {
    if (!selectEl) return null;
    await loadCatalogueData();
    const currentVal = selectEl.value || currentCatalogueId || '';
    selectEl.innerHTML = '<option value="">-- Sélectionner --</option>';
    catalogueData.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name + (f.genre ? ' (' + f.genre + ')' : '');
        selectEl.appendChild(opt);
    });
    if (currentVal) selectEl.value = currentVal;
    return selectEl;
}

function onCatalogueSelectChange() {
    const catalogueId = document.getElementById('projectCatalogueId')?.value;
    const nameInput = document.getElementById('projectName');
    const nameGroup = document.getElementById('nameGroup');

    if (catalogueId) {
        const fiche = catalogueData.find(f => f.id === catalogueId);
        if (fiche && nameInput) {
            nameInput.value = fiche.name;
        }
    }
}

function openCatalogueModalFromProject() {
    window._catalogueReturnToProject = true;
    openCatalogueFicheModal();
}

async function showCatalogueSelector(show) {
    const group = document.getElementById('catalogueSelectGroup');
    if (group) {
        group.style.display = show ? 'block' : 'none';
        if (show) await populateCatalogueSelect(false); // Sélection obligatoire dans le catalogue
    }
}

function catalogueGlobalSearchAppend(query, results, pushResult) {
    if (window.hasPermission && !window.hasPermission('catalogue')) return;
    if (typeof catalogueData === 'undefined' || !Array.isArray(catalogueData)) return;
    var q = (query || '').toLowerCase();
    var push = typeof pushResult === 'function'
        ? pushResult
        : function(key, item) { results.push(item); };

    catalogueData.forEach(function(f) {
        var hay = [f.name, f.genre, f.duree, f.synopsis, f.resume, f.notes].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return;
        push('cat_' + f.id, {
            type: 'catalogue',
            icon: '📚',
            title: f.name || 'Fiche catalogue',
            subtitle: 'Événementiel · Catalogue' + (f.genre ? ' · ' + f.genre : ''),
            action: function() {
                if (typeof openEvenementielHomePage === 'function') openEvenementielHomePage();
                setTimeout(function() {
                    if (typeof loadCatalogueData === 'function') {
                        loadCatalogueData().then(function() { viewCatalogueFiche(f.id); });
                    } else {
                        viewCatalogueFiche(f.id);
                    }
                }, 200);
            }
        });
    });
}
if (typeof window !== 'undefined') window.catalogueGlobalSearchAppend = catalogueGlobalSearchAppend;
