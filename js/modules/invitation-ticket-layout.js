/**
 * Billet invitation — layout personnalisé (fond + zones en %)
 * Utilisé par invitations.js (impression) et spectacles.js (aperçu + éditeur).
 */
(function (global) {
    'use strict';

    var INV_TICKET_ZONE_TYPES = [
        { id: 'event', label: 'Titre du spectacle' },
        { id: 'guest', label: 'Nom de l’invité' },
        { id: 'lieu', label: 'Lieu' },
        { id: 'date', label: 'Date / heure' },
        { id: 'badge', label: 'Texte badge' },
        { id: 'labelValid', label: 'Libellé « valable pour »' },
        { id: 'footer', label: 'Pied de page (notes)' },
        { id: 'poster', label: 'Affiche' },
        { id: 'qr', label: 'QR code' },
        { id: 'code', label: 'Code invitation' },
        { id: 'partners', label: 'Logos partenaires' },
        { id: 'logo', label: 'Logo (L&Co / principal)' }
    ];

    function _zoneLabel(typeId) {
        var t = INV_TICKET_ZONE_TYPES.find(function (x) { return x.id === typeId; });
        return t ? t.label : typeId;
    }

    function _escape(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /** Multiplicateur d’échelle du visuel de fond (0,25× à 4×), défaut 1 */
    function invitationTicketNormalizeBgScale(s) {
        var n = Number(s);
        if (!isFinite(n) || n <= 0) return 1;
        return Math.max(0.25, Math.min(4, n));
    }

    /** Couleur zone → #rrggbb (compatible <input type="color"> et impression fidèle) */
    function invitationTicketNormalizeZoneColor(c) {
        var s = String(c == null ? '' : c).trim();
        if (!s) return '#0f172a';
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return '#' + s.slice(1).toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(s)) {
            var h = s.slice(1).toLowerCase();
            return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        var m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
            function clamp255(n) {
                return Math.max(0, Math.min(255, n));
            }
            var r = clamp255(parseInt(m[1], 10));
            var g = clamp255(parseInt(m[2], 10));
            var b = clamp255(parseInt(m[3], 10));
            return '#' + ('0' + r.toString(16)).slice(-2) + ('0' + g.toString(16)).slice(-2) + ('0' + b.toString(16)).slice(-2);
        }
        return '#0f172a';
    }

    /**
     * Résout la mise en page effective : défauts globaux (Admin) ou template spectacle.
     * @param {object} tpl — template spectacle (champs layout + invitationLayoutUseGlobal)
     */
    function invitationTicketMergeEffectiveTemplate(tpl) {
        if (!tpl || typeof tpl !== 'object') tpl = {};
        var out = Object.assign({}, tpl);
        var useGlobal = tpl.invitationLayoutUseGlobal !== false;
        var d = (global.appSettings && global.appSettings.invitationTicketDefaults)
            ? global.appSettings.invitationTicketDefaults
            : {};
        if (!useGlobal) {
            out.layoutMode = (tpl.layoutMode === 'custom') ? 'custom' : 'classic';
            if (out.layoutMode === 'custom') {
                out.customBackground = String(tpl.customBackground || '').trim();
                out.customBackgroundScale = invitationTicketNormalizeBgScale(tpl.customBackgroundScale);
                out.customZones = Array.isArray(tpl.customZones)
                    ? tpl.customZones.map(invitationTicketNormalizeZone).filter(Boolean)
                    : [];
            }
            return out;
        }
        out.layoutMode = (d.layoutMode === 'custom') ? 'custom' : 'classic';
        if (out.layoutMode === 'custom') {
            out.customBackground = String(d.customBackground || '').trim();
            out.customBackgroundScale = invitationTicketNormalizeBgScale(d.customBackgroundScale);
            out.customZones = Array.isArray(d.customZones)
                ? d.customZones.map(invitationTicketNormalizeZone).filter(Boolean)
                : [];
        }
        return out;
    }

    function invitationTicketNormalizeZone(z) {
        if (!z || typeof z !== 'object') return null;
        var x = Math.max(0, Math.min(100, Number(z.x) || 0));
        var y = Math.max(0, Math.min(100, Number(z.y) || 0));
        var w = Math.max(2, Math.min(100, Number(z.w) || 20));
        var h = Math.max(2, Math.min(100, Number(z.h) || 10));
        if (x + w > 100) w = 100 - x;
        if (y + h > 100) h = 100 - y;
        return {
            id: z.id || ('z_' + Math.random().toString(36).slice(2, 10)),
            type: z.type || 'event',
            x: x,
            y: y,
            w: w,
            h: h,
            fontSize: Math.max(8, Math.min(64, Number(z.fontSize) || 14)),
            align: z.align === 'center' || z.align === 'right' ? z.align : 'left',
            color: invitationTicketNormalizeZoneColor(z.color),
            posterFit: z.posterFit === 'cover' ? 'cover' : 'contain'
        };
    }

    function _flexAlign(align) {
        if (align === 'center') return { jc: 'center', ta: 'center' };
        if (align === 'right') return { jc: 'flex-end', ta: 'right' };
        return { jc: 'flex-start', ta: 'left' };
    }

    function _renderZoneInner(zone, ctx, tpl) {
        var fs = zone.fontSize || 14;
        var al = _flexAlign(zone.align);
        var color = invitationTicketNormalizeZoneColor(zone.color);
        var fit = zone.posterFit === 'cover' || (!zone.posterFit && tpl.posterFit === 'cover') ? 'cover' : 'contain';

        switch (zone.type) {
            case 'event':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';font-weight:800;line-height:1.15;">' + _escape(ctx.eventName) + '</div>';
            case 'guest':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';font-weight:800;line-height:1.15;">' + _escape(ctx.guestFullName) + '</div>';
            case 'lieu':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';line-height:1.2;">' + _escape(ctx.lieuTxt) + '</div>';
            case 'date':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';line-height:1.2;">' + _escape(ctx.dateLine) + '</div>';
            case 'badge':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';font-weight:800;letter-spacing:1px;">' + _escape(ctx.badgeText) + '</div>';
            case 'labelValid':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';">' + _escape(ctx.labelValid) + '</div>';
            case 'footer':
                return '<div style="width:100%;height:100%;display:flex;align-items:flex-start;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + Math.min(fs, 13) + 'px;color:' + color + ';line-height:1.35;white-space:pre-wrap;overflow:auto;">' + (ctx.footerHtml || '') + '</div>';
            case 'poster':
                if (!tpl.showPoster || !ctx.affiche) {
                    return '<div style="width:100%;height:100%;background:#1e293b;color:#94a3b8;display:flex;align-items:center;justify-content:center;font-size:11px;">Affiche</div>';
                }
                return '<img src="' + _escape(ctx.affiche) + '" alt="" style="width:100%;height:100%;object-fit:' + fit + ';object-position:center;display:block;background-color:transparent;">';
            case 'qr':
                if (!tpl.showQr) {
                    return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;border:1px dashed #94a3b8;">QR</div>';
                }
                if (ctx.qrDataUrl) {
                    return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><img src="' + _escape(ctx.qrDataUrl) + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>';
                }
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;">QR</div>';
            case 'code':
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:' + al.jc + ';text-align:' + al.ta + ';font-size:' + fs + 'px;color:' + color + ';font-family:ui-monospace,monospace;font-weight:800;">' + _escape(ctx.code) + '</div>';
            case 'partners':
                return '<div style="width:100%;height:100%;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;overflow:hidden;">' + (ctx.partnersInnerHtml || '') + '</div>';
            case 'logo':
                if (!ctx.logoFinal) {
                    return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;">Logo</div>';
                }
                return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><img src="' + _escape(ctx.logoFinal) + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>';
            default:
                return '<div style="font-size:12px;color:#64748b;">?</div>';
        }
    }

    function invitationTicketRenderCustomTicketInnerHtml(tpl, ctx) {
        var zones = Array.isArray(tpl.customZones) ? tpl.customZones.map(invitationTicketNormalizeZone).filter(Boolean) : [];
        if (!zones.length) {
            return '<div style="padding:12mm;color:#64748b;font-size:14px;">Ajoutez des zones dans l’éditeur visuel.</div>';
        }
        var bg = (tpl.customBackground || '').trim();
        var bgScale = invitationTicketNormalizeBgScale(tpl.customBackgroundScale);
        var bgBlock = '';
        if (bg) {
            bgBlock = '<div class="inv-tpl-bg-wrap" style="position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none;">'
                + '<img class="inv-tpl-bg" src="' + _escape(bg) + '" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(' + bgScale + ');transform-origin:center center;">'
                + '</div>';
        }
        var parts = [bgBlock];
        zones.forEach(function (zone) {
            var inner = _renderZoneInner(zone, ctx, tpl);
            var pad = zone.type === 'poster' ? '0' : '2px';
            var st = 'position:absolute;left:' + zone.x + '%;top:' + zone.y + '%;width:' + zone.w + '%;height:' + zone.h + '%;box-sizing:border-box;overflow:hidden;z-index:1;padding:' + pad + ';';
            if (zone.type === 'poster') {
                st += 'background:transparent;';
            }
            parts.push('<div class="inv-tpl-zone inv-tpl-z-' + _escape(zone.type) + '" style="' + st + '">' + inner + '</div>');
        });
        return parts.join('');
    }

    /** Format page éditeur / impression billet personnalisé : A4 (21 × 29,7 cm) */
    var INV_PAGE_W_MM = 210;
    var INV_PAGE_H_MM = 297;

    function invitationTicketCustomTicketPrintCss() {
        var pca = '-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;';
        return [
            '.ticket.ticket-custom{position:relative;width:' + INV_PAGE_W_MM + 'mm;height:' + INV_PAGE_H_MM + 'mm;margin:0 auto 10mm;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 0 10px rgba(0,0,0,0.1);' + pca + '}',
            '.ticket.ticket-custom .inv-tpl-bg-wrap{z-index:0;' + pca + '}',
            '.ticket.ticket-custom .inv-tpl-zone{' + pca + '}',
            '.ticket.ticket-custom .inv-tpl-z-poster{background:transparent!important;}',
            '.ticket.ticket-custom .inv-tpl-z-poster img{background-color:transparent!important;}',
            '.page-break{page-break-after:always;}',
            '@media print{body{background:#fff;margin:0;padding:0;}.ticket.ticket-custom{box-shadow:none;margin:0;border-radius:0;' + pca + '}}'
        ].join('\n');
    }

    var _ed = {
        scope: 'spectacle',
        zones: [],
        background: '',
        bgScale: 1,
        selectedId: null,
        drag: null,
        canvasW: 400
    };

    function _loadEditorCanvasW() {
        try {
            var w = parseInt(localStorage.getItem('invLayoutEditorCanvasW'), 10);
            if (isFinite(w) && w >= 240 && w <= 640) return w;
        } catch (e) {}
        return 400;
    }

    function _saveEditorCanvasW(w) {
        try {
            localStorage.setItem('invLayoutEditorCanvasW', String(w));
        } catch (e) {}
    }

    function _clampZone(z) {
        return invitationTicketNormalizeZone(z);
    }

    function _syncFormFromSelection() {
        var z = _ed.zones.find(function (x) { return x.id === _ed.selectedId; });
        var fs = document.getElementById('invLayoutFontSize');
        var al = document.getElementById('invLayoutAlign');
        var co = document.getElementById('invLayoutColor');
        var pf = document.getElementById('invLayoutZonePosterFit');
        var ty = document.getElementById('invLayoutZoneType');
        var del = document.getElementById('invLayoutDeleteZone');
        var side = document.getElementById('invLayoutProps');
        if (!side) return;
        if (!z) {
            side.style.opacity = '0.5';
            if (ty) ty.disabled = true;
            if (fs) fs.disabled = true;
            if (al) al.disabled = true;
            if (co) co.disabled = true;
            if (pf) pf.disabled = true;
            if (del) del.disabled = true;
            return;
        }
        side.style.opacity = '1';
        if (ty) { ty.disabled = false; ty.value = z.type; }
        if (fs) { fs.disabled = false; fs.value = z.fontSize; }
        if (al) { al.disabled = false; al.value = z.align; }
        if (co) { co.disabled = false; co.value = invitationTicketNormalizeZoneColor(z.color); }
        if (pf) {
            pf.disabled = z.type !== 'poster';
            pf.value = z.posterFit || 'contain';
        }
        if (del) del.disabled = false;
    }

    function _renderEditorCanvas() {
        var canvas = document.getElementById('invLayoutCanvas');
        var bgEl = document.getElementById('invLayoutCanvasBg');
        var host = document.getElementById('invLayoutZonesHost');
        if (!canvas || !bgEl || !host) return;

        canvas.style.width = _ed.canvasW + 'px';
        canvas.style.height = '';

        bgEl.style.overflow = 'hidden';
        if (_ed.background) {
            bgEl.style.display = '';
            bgEl.style.background = '';
            var sc = invitationTicketNormalizeBgScale(_ed.bgScale);
            var src = String(_ed.background).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            bgEl.innerHTML = '<img class="inv-layout-bg-img" src="' + src + '" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(' + sc + ');transform-origin:center center;">';
        } else {
            bgEl.style.display = '';
            bgEl.innerHTML = '';
            bgEl.style.background = '#f8fafc';
        }

        var scaleInput = document.getElementById('invLayoutBgScale');
        if (scaleInput) scaleInput.disabled = !_ed.background;

        host.innerHTML = '';
        _ed.zones.forEach(function (zone) {
            var z = _clampZone(zone);
            var el = document.createElement('div');
            el.className = 'inv-layout-zone' + (_ed.selectedId === z.id ? ' selected' : '');
            el.dataset.zoneId = z.id;
            el.style.left = z.x + '%';
            el.style.top = z.y + '%';
            el.style.width = z.w + '%';
            el.style.height = z.h + '%';
            var lab = document.createElement('div');
            lab.className = 'inv-layout-zone-label';
            lab.textContent = _zoneLabel(z.type);
            el.appendChild(lab);

            var rz = document.createElement('div');
            rz.className = 'inv-layout-resize';
            rz.dataset.zoneId = z.id;
            el.appendChild(rz);

            el.addEventListener('mousedown', function (e) {
                if (e.target.classList.contains('inv-layout-resize')) return;
                e.preventDefault();
                _ed.selectedId = z.id;
                var rect = canvas.getBoundingClientRect();
                var cur = _ed.zones.find(function (q) { return q.id === z.id; }) || z;
                _ed.drag = {
                    kind: 'move',
                    id: z.id,
                    sx: e.clientX,
                    sy: e.clientY,
                    zx: cur.x,
                    zy: cur.y,
                    zw: cur.w,
                    zh: cur.h,
                    cw: rect.width,
                    ch: rect.height
                };
                _bindDragDoc();
                _renderEditorCanvas();
                _syncFormFromSelection();
            });

            rz.addEventListener('mousedown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                _ed.selectedId = z.id;
                var rect = canvas.getBoundingClientRect();
                var cur = _ed.zones.find(function (q) { return q.id === z.id; }) || z;
                _ed.drag = {
                    kind: 'resize',
                    id: z.id,
                    sx: e.clientX,
                    sy: e.clientY,
                    zx: cur.x,
                    zy: cur.y,
                    zw: cur.w,
                    zh: cur.h,
                    cw: rect.width,
                    ch: rect.height
                };
                _bindDragDoc();
                _renderEditorCanvas();
                _syncFormFromSelection();
            });

            host.appendChild(el);
        });
        _syncFormFromSelection();
        invitationTicketLayoutEditorBindForm();
    }

    function _onDocMouseMove(e) {
        if (!_ed.drag) return;
        var d = _ed.drag;
        var zi = _ed.zones.findIndex(function (x) { return x.id === d.id; });
        if (zi < 0) return;
        var z = _ed.zones[zi];
        var dx = ((e.clientX - d.sx) / d.cw) * 100;
        var dy = ((e.clientY - d.sy) / d.ch) * 100;

        if (d.kind === 'move') {
            z.x = d.zx + dx;
            z.y = d.zy + dy;
        } else {
            z.w = d.zw + dx;
            z.h = d.zh + dy;
        }
        z = _clampZone(z);
        _ed.zones[zi] = z;
        _renderEditorCanvas();
    }

    function _onDocMouseUp() {
        if (_ed.drag) {
            _ed.drag = null;
            document.removeEventListener('mousemove', _onDocMouseMove);
            document.removeEventListener('mouseup', _onDocMouseUp);
        }
    }

    function _bindDragDoc() {
        document.removeEventListener('mousemove', _onDocMouseMove);
        document.removeEventListener('mouseup', _onDocMouseUp);
        document.addEventListener('mousemove', _onDocMouseMove);
        document.addEventListener('mouseup', _onDocMouseUp);
    }

    function invitationTicketLayoutEditorAddZone(type) {
        var t = type || 'event';
        _ed.zones.push(_clampZone({
            id: 'z_' + Math.random().toString(36).slice(2, 11),
            type: t,
            x: 8,
            y: 8,
            w: 84,
            h: t === 'qr' || t === 'logo' ? 18 : 10,
            fontSize: t === 'guest' ? 20 : 14,
            align: 'center',
            color: '#0f172a',
            posterFit: 'contain'
        }));
        _ed.selectedId = _ed.zones[_ed.zones.length - 1].id;
        _renderEditorCanvas();
    }

    function invitationTicketLayoutEditorDeleteSelected() {
        if (!_ed.selectedId) return;
        _ed.zones = _ed.zones.filter(function (z) { return z.id !== _ed.selectedId; });
        _ed.selectedId = null;
        _renderEditorCanvas();
    }

    function invitationTicketLayoutEditorReadBgFile(input) {
        var f = input && input.files && input.files[0];
        if (!f || !f.type.match(/^image\//)) return;
        var r = new FileReader();
        r.onload = function () {
            _ed.background = r.result || '';
            _renderEditorCanvas();
        };
        r.readAsDataURL(f);
        input.value = '';
    }

    function _populateZoneTypeSelect() {
        var sel = document.getElementById('invLayoutZoneType');
        if (!sel) return;
        sel.innerHTML = '';
        INV_TICKET_ZONE_TYPES.forEach(function (t) {
            var o = document.createElement('option');
            o.value = t.id;
            o.textContent = t.label;
            sel.appendChild(o);
        });
    }

    function openInvitationTicketLayoutEditor(scope) {
        var sc = scope === 'global' ? 'global' : 'spectacle';
        _ed.scope = sc;

        if (sc === 'spectacle') {
            if (typeof global.currentBilletterieSpectacle === 'undefined' || !global.currentBilletterieSpectacle) {
                alert('Sélectionnez un spectacle (billetterie).');
                return;
            }
        }

        _populateZoneTypeSelect();

        if (sc === 'global') {
            var d = (global.appSettings && global.appSettings.invitationTicketDefaults) ? global.appSettings.invitationTicketDefaults : {};
            _ed.background = String(d.customBackground || '').trim();
            _ed.bgScale = invitationTicketNormalizeBgScale(d.customBackgroundScale);
            _ed.zones = Array.isArray(d.customZones)
                ? d.customZones.map(function (z) { return invitationTicketNormalizeZone(z); }).filter(Boolean)
                : [];
        } else {
            var ensure = typeof global.ensureInvitationTicketTemplateOnSpectacle === 'function'
                ? global.ensureInvitationTicketTemplateOnSpectacle
                : null;
            var tpl = ensure ? ensure() : (global.currentBilletterieSpectacle.invitationTicketTemplate || {});
            _ed.background = (tpl.customBackground || '').trim();
            _ed.bgScale = invitationTicketNormalizeBgScale(tpl.customBackgroundScale);
            _ed.zones = Array.isArray(tpl.customZones)
                ? tpl.customZones.map(function (z) { return invitationTicketNormalizeZone(z); }).filter(Boolean)
                : [];
        }

        _ed.selectedId = _ed.zones[0] ? _ed.zones[0].id : null;

        _ed.canvasW = _loadEditorCanvasW();
        var cwRange = document.getElementById('invLayoutCanvasW');
        var cwLabel = document.getElementById('invLayoutCanvasWLabel');
        if (cwRange) cwRange.value = String(_ed.canvasW);
        if (cwLabel) cwLabel.textContent = _ed.canvasW + ' px';

        var urlEl = document.getElementById('invLayoutBgUrl');
        if (urlEl) urlEl.value = _ed.background && _ed.background.indexOf('data:') !== 0 ? _ed.background : '';

        var scaleEl = document.getElementById('invLayoutBgScale');
        var scalePct = document.getElementById('invLayoutBgScalePct');
        if (scaleEl) scaleEl.value = String(Math.round(_ed.bgScale * 100));
        if (scalePct) scalePct.textContent = Math.round(_ed.bgScale * 100) + '%';

        var titleEl = document.getElementById('invLayoutEditorTitle');
        var subEl = document.getElementById('invLayoutEditorSubtitle');
        if (titleEl) titleEl.textContent = sc === 'global' ? '🎨 Modèle billet (tous spectacles)' : '🎨 Mise en page — ce spectacle';
        if (subEl) {
            subEl.textContent = sc === 'global'
                ? 'Défini dans Administration → Billets & invitations. S’applique aux spectacles qui suivent le modèle global.'
                : 'Remplace le modèle global pour ce spectacle uniquement (coche « propre mise en page » dans le billet).';
        }

        invitationTicketLayoutEditorBindForm();
        _renderEditorCanvas();

        var modal = document.getElementById('invitationTicketLayoutEditorModal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }

        document.addEventListener('keydown', _invLayoutKeydown);
    }

    function _invLayoutKeydown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            var m = document.getElementById('invitationTicketLayoutEditorModal');
            if (m && m.classList.contains('active') && e.target && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                invitationTicketLayoutEditorDeleteSelected();
            }
        }
    }

    function closeInvitationTicketLayoutEditor() {
        var modal = document.getElementById('invitationTicketLayoutEditorModal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        document.removeEventListener('keydown', _invLayoutKeydown);
    }

    function invitationTicketLayoutEditorSave() {
        var zonesNorm = _ed.zones.map(function (z) { return invitationTicketNormalizeZone(z); }).filter(Boolean);

        if (_ed.scope === 'global') {
            if (!global.appSettings) global.appSettings = {};
            if (!global.appSettings.invitationTicketDefaults) global.appSettings.invitationTicketDefaults = {};
            var d = global.appSettings.invitationTicketDefaults;
            d.layoutMode = 'custom';
            d.customBackground = _ed.background || '';
            d.customBackgroundScale = invitationTicketNormalizeBgScale(_ed.bgScale);
            d.customZones = zonesNorm;
            if (typeof global.saveSettings === 'function') global.saveSettings();
            if (typeof global.showToast === 'function') global.showToast('Modèle billet global enregistré', 'success');
            closeInvitationTicketLayoutEditor();
            if (typeof global.renderAdminBillets === 'function') global.renderAdminBillets();
            return;
        }

        if (typeof global.currentBilletterieSpectacle === 'undefined' || !global.currentBilletterieSpectacle) return;
        var ensure = typeof global.ensureInvitationTicketTemplateOnSpectacle === 'function'
            ? global.ensureInvitationTicketTemplateOnSpectacle
            : null;
        var tpl = ensure ? ensure() : (global.currentBilletterieSpectacle.invitationTicketTemplate || {});

        tpl.layoutMode = 'custom';
        tpl.invitationLayoutUseGlobal = false;
        tpl.customBackground = _ed.background || '';
        tpl.customBackgroundScale = invitationTicketNormalizeBgScale(_ed.bgScale);
        tpl.customZones = zonesNorm;

        global.currentBilletterieSpectacle.invitationTicketTemplate = tpl;
        if (typeof global.saveBilletterieData === 'function') global.saveBilletterieData();

        var lm = document.getElementById('invTplLayoutMode');
        if (lm) lm.value = 'custom';
        var ug = document.getElementById('invTplUseGlobalLayout');
        if (ug) ug.checked = false;

        if (typeof global.showToast === 'function') global.showToast('Mise en page enregistrée pour ce spectacle', 'success');
        closeInvitationTicketLayoutEditor();
        if (typeof global.invTplOnLayoutModeChange === 'function') global.invTplOnLayoutModeChange();
        if (typeof global.renderInvitationTicketPreview === 'function') global.renderInvitationTicketPreview();
    }

    function invitationTicketLayoutEditorBindForm() {
        var ty = document.getElementById('invLayoutZoneType');
        var fs = document.getElementById('invLayoutFontSize');
        var al = document.getElementById('invLayoutAlign');
        var co = document.getElementById('invLayoutColor');
        var pf = document.getElementById('invLayoutZonePosterFit');
        if (ty && !ty._bound) {
            ty._bound = true;
            ty.addEventListener('change', function () {
                var z = _ed.zones.find(function (x) { return x.id === _ed.selectedId; });
                if (!z) return;
                z.type = ty.value;
                _renderEditorCanvas();
            });
        }
        if (fs && !fs._bound) {
            fs._bound = true;
            fs.addEventListener('input', function () {
                var z = _ed.zones.find(function (x) { return x.id === _ed.selectedId; });
                if (!z) return;
                z.fontSize = parseInt(fs.value, 10) || 14;
                _renderEditorCanvas();
            });
        }
        if (al && !al._bound) {
            al._bound = true;
            al.addEventListener('change', function () {
                var z = _ed.zones.find(function (x) { return x.id === _ed.selectedId; });
                if (!z) return;
                z.align = al.value;
                _renderEditorCanvas();
            });
        }
        if (co && !co._bound) {
            co._bound = true;
            co.addEventListener('input', function () {
                var z = _ed.zones.find(function (x) { return x.id === _ed.selectedId; });
                if (!z) return;
                z.color = invitationTicketNormalizeZoneColor(co.value);
                _renderEditorCanvas();
            });
        }
        if (pf && !pf._bound) {
            pf._bound = true;
            pf.addEventListener('change', function () {
                var z = _ed.zones.find(function (x) { return x.id === _ed.selectedId; });
                if (!z) return;
                z.posterFit = pf.value;
                _renderEditorCanvas();
            });
        }
        var del = document.getElementById('invLayoutDeleteZone');
        if (del && !del._bound) {
            del._bound = true;
            del.addEventListener('click', invitationTicketLayoutEditorDeleteSelected);
        }
        var bgs = document.getElementById('invLayoutBgScale');
        var bgsPct = document.getElementById('invLayoutBgScalePct');
        if (bgs && !bgs._bound) {
            bgs._bound = true;
            bgs.addEventListener('input', function () {
                var v = parseInt(bgs.value, 10);
                if (!isFinite(v)) v = 100;
                _ed.bgScale = invitationTicketNormalizeBgScale(v / 100);
                if (bgsPct) bgsPct.textContent = Math.round(_ed.bgScale * 100) + '%';
                _renderEditorCanvas();
            });
        }
        var cwR = document.getElementById('invLayoutCanvasW');
        var cwL = document.getElementById('invLayoutCanvasWLabel');
        if (cwR && !cwR._bound) {
            cwR._bound = true;
            cwR.addEventListener('input', function () {
                var v = parseInt(cwR.value, 10);
                if (!isFinite(v)) return;
                _ed.canvasW = Math.max(240, Math.min(640, v));
                _saveEditorCanvasW(_ed.canvasW);
                if (cwL) cwL.textContent = _ed.canvasW + ' px';
                _renderEditorCanvas();
            });
        }
    }

    global.INV_TICKET_ZONE_TYPES = INV_TICKET_ZONE_TYPES;
    global.invitationTicketNormalizeZone = invitationTicketNormalizeZone;
    global.invitationTicketNormalizeZoneColor = invitationTicketNormalizeZoneColor;
    global.invitationTicketNormalizeBgScale = invitationTicketNormalizeBgScale;
    global.invitationTicketMergeEffectiveTemplate = invitationTicketMergeEffectiveTemplate;
    global.invitationTicketRenderCustomTicketInnerHtml = invitationTicketRenderCustomTicketInnerHtml;
    global.invitationTicketCustomTicketPrintCss = invitationTicketCustomTicketPrintCss;
    global.openInvitationTicketLayoutEditor = openInvitationTicketLayoutEditor;
    global.closeInvitationTicketLayoutEditor = closeInvitationTicketLayoutEditor;
    global.invitationTicketLayoutEditorSave = invitationTicketLayoutEditorSave;
    global.invitationTicketLayoutEditorAddZone = invitationTicketLayoutEditorAddZone;
    global.invitationTicketLayoutEditorReadBgFile = invitationTicketLayoutEditorReadBgFile;
    global.invitationTicketLayoutEditorApplyBgUrl = function () {
        var urlEl = document.getElementById('invLayoutBgUrl');
        _ed.background = (urlEl && urlEl.value) ? urlEl.value.trim() : '';
        _renderEditorCanvas();
    };
})(window);
