// FONCTIONS UTILITAIRES (doivent être définies en premier)
function getTotalBillets(spectacle) {
    if (!spectacle || !spectacle.releves || spectacle.releves.length === 0) return 0;
    const lastReleve = spectacle.releves[spectacle.releves.length - 1];
    let total = 0;
    const reseaux = spectacle.reseaux || [];
    
    for (let reseau of reseaux) {
        total += parseInt(lastReleve[reseau]) || 0;
    }
    
    // Guichet correction: deduct unsold guichet stock from billetweb total,
    // and add real guichet sales instead
    const guichet = spectacle.guichet;
    if (guichet && guichet.stockReserve > 0) {
        const stockReserve = guichet.stockReserve || 0;
        const ventesReelles = guichet.ventesReelles || 0;
        const invendusGuichet = Math.max(0, stockReserve - ventesReelles);
        // Deduct the unsold guichet places that are counted in billetweb
        total -= invendusGuichet;
    }
    return Math.max(0, total);
}

// Fonction pour obtenir le nombre d'invitations
function getTotalInvitations(spectacle) {
    if (!spectacle || !spectacle.invitations) return 0;
    return spectacle.invitations.length;
}

// Fonction pour obtenir le texte d'affichage des billets avec invitations
function getBilletsDisplayText(spectacle) {
    const totalBillets = getTotalBillets(spectacle);
    const totalInvitations = getTotalInvitations(spectacle);
    
    if (totalInvitations > 0) {
        return `${totalBillets} billets dont ${totalInvitations} invitation${totalInvitations > 1 ? 's' : ''}`;
    }
    return `${totalBillets} billets`;
}

function getTotalCA(spectacle) {
    if (!spectacle || !spectacle.releves || spectacle.releves.length === 0) return 0;
    const lastReleve = spectacle.releves[spectacle.releves.length - 1];
    let totalCA = 0;
    const reseaux = spectacle.reseaux || [];
    
    for (let reseau of reseaux) {
        totalCA += parseFloat(lastReleve[reseau + '_ca']) || 0;
    }
    
    // Guichet correction: if stock was reserved on billetweb,
    // deduct the CA of unsold guichet places and add real guichet CA
    const guichet = spectacle.guichet;
    if (guichet && guichet.stockReserve > 0) {
        const stockReserve = guichet.stockReserve || 0;
        const ventesReelles = guichet.ventesReelles || 0;
        const invendusGuichet = Math.max(0, stockReserve - ventesReelles);
        
        // Estimate price per guichet ticket from billetweb CA
        // (total billetweb billets in last releve includes guichet stock)
        const bwBillets = parseInt(lastReleve['billetweb']) || 0;
        const bwCA = parseFloat(lastReleve['billetweb_ca']) || 0;
        const prixMoyenBW = bwBillets > 0 ? bwCA / bwBillets : 0;
        
        // Deduct estimated CA of unsold guichet tickets
        totalCA -= invendusGuichet * prixMoyenBW;
        
        // Add real guichet CA (if tracked separately)
        totalCA += parseFloat(guichet.ca) || 0;
    }
    return Math.max(0, totalCA);
}

/** True si la date du spectacle (jour calendaire) est strictement avant aujourd'hui. */
function isSpectacleDatePast(s) {
    if (!s || !s.date) return false;
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) return false;
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

// Calcule l'évolution du nombre de billets entre les deux derniers relevés
function getEvolutionBillets(spectacle) {
    if (!spectacle || !spectacle.releves || spectacle.releves.length < 2) return null;
    const releves = spectacle.releves;
    const last = releves[releves.length - 1];
    const prev = releves[releves.length - 2];
    const totalLast = getCorrectTotalForReleve(spectacle, last);
    const totalPrev = getCorrectTotalForReleve(spectacle, prev);
    return totalLast - totalPrev;
}

// Génère le badge HTML d'évolution billets
function evolutionBadgeHtml(evolution, compact) {
    if (evolution === null || evolution === undefined) return '';
    if (evolution === 0) return compact 
        ? '<span style="color:#94a3b8;font-size:0.75rem;margin-left:0.3rem;">—</span>' 
        : '<span style="color:#94a3b8;font-size:0.8rem;margin-left:0.4rem;">(= 0)</span>';
    const isUp = evolution > 0;
    const color = isUp ? '#10b981' : '#ef4444';
    const arrow = isUp ? '▲' : '▼';
    const sign = isUp ? '+' : '';
    if (compact) {
        return `<span style="color:${color};font-size:0.75rem;font-weight:600;margin-left:0.3rem;white-space:nowrap;">${arrow} ${sign}${evolution}</span>`;
    }
    return `<span style="color:${color};font-size:0.8rem;font-weight:600;margin-left:0.4rem;white-space:nowrap;">(${sign}${evolution})</span>`;
}

function getVisuelReference(spectacle) {
    if (!spectacle || !spectacle.visuels) return null;
    return spectacle.visuels.find(v => v.isReference);
}

// Fonction utilitaire escapeHtml
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Fonction utilitaire showToast (à adapter selon votre système)
function showToast(message, type = 'info') {
    console.log(`[${type}] ${message}`);
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;top:calc(56px + 1rem);right:1.5rem;padding:0.75rem 1.25rem;border-radius:8px;background:var(--mn-text);color:white;font-size:0.9rem;z-index:99999;box-shadow:var(--mn-shadow-lg);';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3500);
}

// Format date pour affichage (fr-FR)
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
