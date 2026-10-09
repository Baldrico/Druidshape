// App State & Data Storage
const SourceDB = {
    db: null,
    async init() {
        if (!window.indexedDB) return false;
        return new Promise(resolve => {
            try {
                const req = indexedDB.open('DruidshapeSourcesDB', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('sources')) {
                        db.createObjectStore('sources', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => {
                    SourceDB.db = e.target.result;
                    resolve(true);
                };
                req.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    },
    async getAll() {
        if (SourceDB.db) {
            return new Promise(resolve => {
                try {
                    const tx = SourceDB.db.transaction('sources', 'readonly');
                    const store = tx.objectStore('sources');
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve(SourceDB.getFallback());
                } catch (err) {
                    resolve(SourceDB.getFallback());
                }
            });
        }
        return SourceDB.getFallback();
    },
    async put(source) {
        if (SourceDB.db) {
            await new Promise(resolve => {
                try {
                    const tx = SourceDB.db.transaction('sources', 'readwrite');
                    const store = tx.objectStore('sources');
                    const req = store.put(source);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                } catch (err) {
                    resolve(false);
                }
            });
        }
        SourceDB.putFallback(source);
    },
    async delete(id) {
        if (SourceDB.db) {
            await new Promise(resolve => {
                try {
                    const tx = SourceDB.db.transaction('sources', 'readwrite');
                    const store = tx.objectStore('sources');
                    const req = store.delete(id);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                } catch (err) {
                    resolve(false);
                }
            });
        }
        SourceDB.deleteFallback(id);
    },
    getFallback() {
        try {
            const raw = localStorage.getItem('druidshape_sources_cache');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },
    putFallback(source) {
        try {
            const list = SourceDB.getFallback().filter(s => s.id !== source.id);
            list.push(source);
            localStorage.setItem('druidshape_sources_cache', JSON.stringify(list));
        } catch (e) {
            console.warn("Storage fallback quota exceeded", e);
        }
    },
    deleteFallback(id) {
        try {
            const list = SourceDB.getFallback().filter(s => s.id !== id);
            localStorage.setItem('druidshape_sources_cache', JSON.stringify(list));
        } catch (e) {
            console.warn("Storage fallback error", e);
        }
    }
};

let state = {
    darkMode: false,
    characters: [
        { id: 1, name: 'Default', level: 0, isMoon: false, favs: {}, seen: {} }
    ],
    selectedCharacterId: 1,
    dataSources: [],
    filters: {
        search: '',
        seenOnly: false,
        favOnly: false,
        fly: false,
        swim: false
    }
};

let currentTab = 'beasts';

// Load State from LocalStorage
function loadState() {
    const saved = localStorage.getItem('druidshape_prefs');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Merge defaults with saved
            state = { ...state, ...parsed };
            // Ensure characters array exists and is valid
            if (!state.characters || state.characters.length === 0) {
                state.characters = [{ id: 1, name: 'Default', level: 0, isMoon: false, favs: {}, seen: {} }];
                state.selectedCharacterId = 1;
            }
            // Ensure all characters have favs/seen objects
            state.characters.forEach(c => {
                c.favs = c.favs || {};
                c.seen = c.seen || {};
            });
        } catch (e) {
            console.error("Failed to load state", e);
        }
    }
}

function saveState() {
    localStorage.setItem('druidshape_prefs', JSON.stringify(state));
}

// Get currently active character
function getCharacter() {
    return state.characters.find(c => c.id === state.selectedCharacterId) || state.characters[0];
}

// Update current character
function updateCharacter(updates) {
    const char = getCharacter();
    Object.assign(char, updates);
    saveState();
    renderApp();
}

function cleanText(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/Roth[ÃǸ][©]?/g, 'Rothé')
        .replace(/roth[ÃǸ][©]?/g, 'rothé')
        .replace(/Ã©/g, 'é')
        .replace(/Ǹ/g, 'é')
        .replace(/â€™/g, "'")
        .replace(/â€“/g, "-")
        .replace(/â€”/g, "—")
        .replace(/â€œ/g, '"')
        .replace(/â€ /g, '"')
        .replace(/\?T/g, "'")
        .replace(/\?\"/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2013\u2212]/g, "-")
        .replace(/(?<!\p{L})Deep\s+Roth(e)?('s)?(?!\p{L})/gui, (m, e, s) => {
            const isLower = m[0] === 'd';
            return (isLower ? 'deep rothé' : 'Deep Rothé') + (s || '');
        })
        .replace(/(?<!\p{L})Roth(e)?('s)?(?!\p{L})/gu, (m, e, s) => 'Rothé' + (s || ''))
        .replace(/(?<!\p{L})roth(e)?('s)?(?!\p{L})/gu, (m, e, s) => 'rothé' + (s || ''))
        .replace(/as well as i to all divination spells/g, 'as well as to all divination spells');
}

function normalizeBeasts(rawArray, sourceId, sourceName) {
    if (!Array.isArray(rawArray)) return [];
    return rawArray.filter(b => b && b.name).map(b => {
        const actions = b.actions || b.action || [];
        const traits = b.traits || b.trait || [];
        const bonusActions = b.bonus_actions || b.bonus_action || [];
        const reactions = b.reactions || b.reaction || [];
        const normalized = {
            ...b,
            name: cleanText((b.name || '').trim()),
            cr: (b.cr !== undefined ? b.cr : '0').toString().trim(),
            size: b.size ? b.size.trim() : 'Medium',
            type: b.type ? b.type.trim() : 'beast',
            senses: b.senses ? cleanText(b.senses.trim()) : undefined,
            spells: b.spells ? cleanText(b.spells.trim()) : undefined,
            actions: Array.isArray(actions) ? actions.map(a => ({
                ...a,
                name: cleanText(a.name),
                text: cleanText(a.text)
            })) : [],
            traits: Array.isArray(traits) ? traits.map(t => ({
                ...t,
                name: cleanText(t.name),
                text: cleanText(t.text)
            })) : [],
            bonus_actions: Array.isArray(bonusActions) ? bonusActions.map(ba => ({
                ...ba,
                name: cleanText(ba.name),
                text: cleanText(ba.text)
            })) : [],
            reactions: Array.isArray(reactions) ? reactions.map(r => ({
                ...r,
                name: cleanText(r.name),
                text: cleanText(r.text)
            })) : [],
            _sourceId: sourceId,
            _sourceName: sourceName
        };
        delete normalized.action;
        delete normalized.trait;
        delete normalized.bonus_action;
        delete normalized.reaction;
        return normalized;
    });
}

function getHomebrewSource() {
    let hbSource = (state.dataSources || []).find(s => s.id === 'homebrew');
    if (!hbSource) {
        hbSource = {
            id: 'homebrew',
            name: 'Homebrew',
            filename: 'homebrew.json',
            isDefault: true,
            isHomebrew: true,
            enabled: true,
            beasts: []
        };
        state.dataSources.push(hbSource);
        SourceDB.put(hbSource);
    }
    return hbSource;
}

function getActiveBeasts() {
    const active = [];
    (state.dataSources || []).forEach(src => {
        if (src.enabled && Array.isArray(src.beasts)) {
            active.push(...src.beasts);
        }
    });
    return active;
}

function getAllAvailableBeasts() {
    const all = [];
    (state.dataSources || []).forEach(src => {
        if (Array.isArray(src.beasts)) {
            all.push(...src.beasts);
        }
    });
    return all;
}

async function fetchDefaultSources() {
    const loaded = [];
    let beastsData = null;
    let volosData = null;
    let srd55Data = null;

    // 1. Attempt to fetch from JSON files (available when running on a web server or GitHub Pages)
    try {
        const [beastsRes, volosRes, srd55Res] = await Promise.allSettled([
            fetch('data/2014_beasts.json'),
            fetch('data/volos.json'),
            fetch('data/2024_beasts.json')
        ]);
        
        if (beastsRes.status === 'fulfilled' && beastsRes.value.ok) {
            beastsData = await beastsRes.value.json();
        }
        if (volosRes.status === 'fulfilled' && volosRes.value.ok) {
            volosData = await volosRes.value.json();
        }
        if (srd55Res.status === 'fulfilled' && srd55Res.value.ok) {
            srd55Data = await srd55Res.value.json();
        }
    } catch (e) {
        console.warn("Network fetch not available", e);
    }

    // 2. Fallback to preloaded window.DEFAULT_DATA if running on file:// or offline
    if (window.DEFAULT_DATA) {
        if (!beastsData && window.DEFAULT_DATA['core-5e']) beastsData = window.DEFAULT_DATA['core-5e'];
        if (!srd55Data && window.DEFAULT_DATA['core-5.5e']) srd55Data = window.DEFAULT_DATA['core-5.5e'];
        if (!volosData && window.DEFAULT_DATA['volos-guide']) volosData = window.DEFAULT_DATA['volos-guide'];
    }

    if (beastsData) {
        const coreSource = {
            id: 'core-5e',
            name: 'Core 5e SRD Beasts',
            filename: '2014_beasts.json',
            isDefault: true,
            enabled: true,
            beasts: normalizeBeasts(beastsData, 'core-5e', 'Core 5e SRD')
        };
        await SourceDB.put(coreSource);
        loaded.push(coreSource);
    }

    if (srd55Data) {
        const srd55Source = {
            id: 'core-5.5e',
            name: 'Core 5.5e SRD Beasts',
            filename: '2024_beasts.json',
            isDefault: true,
            enabled: true,
            beasts: normalizeBeasts(srd55Data, 'core-5.5e', 'Core 5.5e SRD')
        };
        await SourceDB.put(srd55Source);
        loaded.push(srd55Source);
    }

    if (volosData) {
        const volosSource = {
            id: 'volos-guide',
            name: "Volo's Guide to Monsters",
            filename: 'volos.json',
            isDefault: true,
            enabled: true,
            beasts: normalizeBeasts(volosData, 'volos-guide', "Volo's Guide")
        };
        await SourceDB.put(volosSource);
        loaded.push(volosSource);
    }

    // Always include a blank homebrew.json source
    const hbSource = {
        id: 'homebrew',
        name: 'Homebrew',
        filename: 'homebrew.json',
        isDefault: true,
        isHomebrew: true,
        enabled: true,
        beasts: []
    };
    await SourceDB.put(hbSource);
    loaded.push(hbSource);

    return loaded;
}

// DOM Elements
const els = {
    body: document.body,
    druidLevel: document.getElementById('druid-level'),
    moonToggle: document.getElementById('moon-toggle'),
    searchInput: document.getElementById('search-input'),
    beastsList: document.getElementById('beasts-list'),
    homebrewList: document.getElementById('homebrew-list'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    filtersBar: document.getElementById('filters-bar'),
    fab: document.getElementById('main-fab'),
    charName: document.getElementById('current-character-name'),
    darkModeToggle: document.getElementById('dark-mode-toggle'),
    
    // Modals
    modalChars: document.getElementById('modal-characters'),
    modalFilters: document.getElementById('modal-filters'),
    modalDetails: document.getElementById('modal-details'),
    modalHomebrew: document.getElementById('modal-homebrew-editor'),
    modalTipJar: document.getElementById('modal-tip-jar'),
    modalDataSources: document.getElementById('modal-data-sources'),
    sourcesListContainer: document.getElementById('sources-list-container'),
    sourceUploadInput: document.getElementById('source-upload-input'),
    
    // Filter toggles
    filterSeen: document.getElementById('filter-seen'),
    filterFav: document.getElementById('filter-fav'),
    filterFly: document.getElementById('filter-fly'),
    filterSwim: document.getElementById('filter-swim')
};

// Initialize App
async function init() {
    loadState();
    setupEventListeners();
    populateDruidLevels();
    applyTheme();
    switchTab('beasts');
    
    // Initialize Data Sources
    await SourceDB.init();
    let sources = await SourceDB.getAll();
    // If no sources exist, or existing sources have 0 beasts, populate defaults
    if (!sources || sources.length === 0 || sources.every(s => !s.beasts || s.beasts.length === 0)) {
        sources = await fetchDefaultSources();
    }
    state.dataSources = sources || [];
    
    // Ensure core-5.5e is loaded if not already present
    if (!state.dataSources.some(s => s.id === 'core-5.5e')) {
        let srd55Data = null;
        try {
            const res = await fetch('data/2024_beasts.json');
            if (res.ok) {
                srd55Data = await res.json();
            }
        } catch (e) {
            // fetch fails on file:// protocol
        }
        
        if (!srd55Data && window.DEFAULT_DATA && window.DEFAULT_DATA['core-5.5e']) {
            srd55Data = window.DEFAULT_DATA['core-5.5e'];
        }

        if (srd55Data) {
            const srd55Source = {
                id: 'core-5.5e',
                name: 'Core 5.5e SRD Beasts',
                filename: '2024_beasts.json',
                isDefault: true,
                enabled: true,
                beasts: normalizeBeasts(srd55Data, 'core-5.5e', 'Core 5.5e SRD')
            };
            await SourceDB.put(srd55Source);
            const coreIdx = state.dataSources.findIndex(s => s.id === 'core-5e');
            if (coreIdx >= 0) {
                state.dataSources.splice(coreIdx + 1, 0, srd55Source);
            } else {
                state.dataSources.unshift(srd55Source);
            }
        }
    }

    // Auto-migrate stored filenames to new standard naming convention
    state.dataSources.forEach(src => {
        if (src.id === 'core-5e' && src.filename !== '2014_beasts.json') {
            src.filename = '2014_beasts.json';
            SourceDB.put(src);
        } else if (src.id === 'core-5.5e' && src.filename !== '2024_beasts.json') {
            src.filename = '2024_beasts.json';
            SourceDB.put(src);
        } else if (src.id === 'homebrew' && src.filename !== 'homebrew.json') {
            src.filename = 'homebrew.json';
            SourceDB.put(src);
        }
    });
    
    // Ensure homebrew.json source is always present and active
    const hb = getHomebrewSource();
    if (Array.isArray(state.homebrew) && state.homebrew.length > 0) {
        state.homebrew.forEach(b => {
            if (!hb.beasts.some(ex => ex.name === b.name)) {
                b._sourceId = 'homebrew';
                b._sourceName = 'Homebrew';
                hb.beasts.push(b);
            }
        });
        await SourceDB.put(hb);
        delete state.homebrew;
        saveState();
    }
    
    // Auto-heal any legacy mojibake/corrupted encodings in existing stored sources
    let needsSourceSave = false;
    (state.dataSources || []).forEach(src => {
        if (Array.isArray(src.beasts)) {
            let srcModified = false;
            src.beasts.forEach(b => {
                const oldName = b.name;
                const newName = cleanText(b.name);
                if (oldName !== newName) {
                    b.name = newName;
                    srcModified = true;
                    // Migrate seen/favs across characters if name was repaired
                    state.characters.forEach(c => {
                        if (c.seen && c.seen[oldName]) { c.seen[newName] = true; delete c.seen[oldName]; }
                        if (c.favs && c.favs[oldName]) { c.favs[newName] = true; delete c.favs[oldName]; }
                    });
                }
                if (b.cr !== undefined && typeof b.cr === 'string') {
                    const trimmedCr = b.cr.trim();
                    if (trimmedCr !== b.cr) { b.cr = trimmedCr; srcModified = true; }
                }
                if (Array.isArray(b.traits)) {
                    b.traits.forEach(t => {
                        if (t.name) {
                            const cleaned = cleanText(t.name);
                            if (cleaned !== t.name) { t.name = cleaned; srcModified = true; }
                        }
                        if (t.text) {
                            const cleaned = cleanText(t.text);
                            if (cleaned !== t.text) { t.text = cleaned; srcModified = true; }
                        }
                    });
                }
                const actions = b.actions || b.action;
                if (Array.isArray(actions)) {
                    actions.forEach(a => {
                        if (a.name) {
                            const cleaned = cleanText(a.name);
                            if (cleaned !== a.name) { a.name = cleaned; srcModified = true; }
                        }
                        if (a.text) {
                            const cleaned = cleanText(a.text);
                            if (cleaned !== a.text) { a.text = cleaned; srcModified = true; }
                        }
                    });
                }
                if (b.spells) {
                    const cleaned = cleanText(b.spells);
                    if (cleaned !== b.spells) { b.spells = cleaned; srcModified = true; }
                }
                if (b.senses) {
                    const cleaned = cleanText(b.senses);
                    if (cleaned !== b.senses) { b.senses = cleaned; srcModified = true; }
                }
            });
            if (srcModified) {
                SourceDB.put(src);
                needsSourceSave = true;
            }
        }
    });
    if (needsSourceSave) {
        saveState();
    }
    
    renderApp();
}

function setupEventListeners() {
    // Tabs
    els.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Home Button (App Title)
    document.getElementById('btn-home').addEventListener('click', () => {
        switchTab('beasts');
        // Clear just the search text like a typical 'Home' refresh, keep other filters intact
        state.filters.search = '';
        els.searchInput.value = '';
        renderApp();
    });

    // Character Select
    document.getElementById('btn-character-select').addEventListener('click', () => openModal(els.modalChars));
    document.getElementById('btn-add-character').addEventListener('click', addCharacter);
    
    // Filters Menu
    document.getElementById('btn-filter-menu').addEventListener('click', () => openModal(els.modalFilters));
    document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);
    
    // Header Inputs
    els.druidLevel.addEventListener('change', (e) => updateCharacter({ level: parseInt(e.target.value) }));
    els.moonToggle.addEventListener('change', (e) => updateCharacter({ isMoon: e.target.checked }));
    els.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase();
        renderBeasts();
    });

    // Filter Modal Inputs
    els.filterSeen.addEventListener('change', e => { state.filters.seenOnly = e.target.checked; renderBeasts(); saveState(); });
    els.filterFav.addEventListener('change', e => { state.filters.favOnly = e.target.checked; renderBeasts(); saveState(); });
    els.filterFly.addEventListener('change', e => { state.filters.fly = e.target.checked; renderBeasts(); saveState(); });
    els.filterSwim.addEventListener('change', e => { state.filters.swim = e.target.checked; renderBeasts(); saveState(); });

    // FAB
    els.fab.addEventListener('click', handleFabClick);

    // Settings
    els.darkModeToggle.addEventListener('change', (e) => {
        state.darkMode = e.target.checked;
        applyTheme();
        saveState();
    });
    
    // Data Sources
    document.getElementById('btn-data-sources').addEventListener('click', () => {
        openModal(els.modalDataSources);
        renderDataSources();
    });
    document.getElementById('btn-import-source').addEventListener('click', () => {
        els.sourceUploadInput.click();
    });
    document.getElementById('btn-quick-import-source').addEventListener('click', () => {
        els.sourceUploadInput.click();
    });
    els.sourceUploadInput.addEventListener('change', handleSourceUpload);
    document.getElementById('btn-reset-sources').addEventListener('click', reloadDefaultSources);
    
    document.getElementById('btn-tip-jar').addEventListener('click', () => {
        const list = document.getElementById('tip-list');
        list.innerHTML = '';
        const iapList = [
            "com.adpyke.druidshape.tip.nice",
            "com.adpyke.druidshape.tip.kind",
            "com.adpyke.druidshape.tip.generous",
            "com.adpyke.druidshape.tip.amazing",
            "com.adpyke.druidshape.tip.godzilla"
        ];
        iapList.forEach(productId => {
            const parts = productId.split('.');
            const namePart = parts[parts.length - 1];
            const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1) + ' Tip';
            
            const li = document.createElement('li');
            li.className = 'list-item clickable';
            li.innerHTML = `
                <div class="list-item-content">
                    <div class="list-item-title">${displayName}</div>
                </div>
                <span class="material-icons" style="color: var(--star-color);">favorite</span>
            `;
            li.onclick = () => {
                alert(`Thank you for selecting the ${displayName}! (In-App Purchases are simulated on the web version)`);
                closeModal(els.modalTipJar);
            };
            list.appendChild(li);
        });
        openModal(els.modalTipJar);
    });
    
    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal);
        });
    });
    
    // Homebrew Editor
    document.getElementById('btn-save-homebrew').addEventListener('click', saveHomebrew);
    document.getElementById('hb-copy-from').addEventListener('change', handleCopyFromChanged);

    // Keyboard shortcut (Ctrl+A / Cmd+A) to select all text in the stat block when open
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            const modal = els.modalDetails;
            if (modal && modal.classList.contains('open')) {
                const active = document.activeElement;
                if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
                    e.preventDefault();
                    selectStatBlockText();
                }
            }
        }
    });
}

function applyTheme() {
    if (state.darkMode) {
        els.body.setAttribute('data-theme', 'dark');
    } else {
        els.body.removeAttribute('data-theme');
    }
    els.darkModeToggle.checked = state.darkMode;
}

function populateDruidLevels() {
    for (let i = 2; i <= 20; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i.toString();
        els.druidLevel.appendChild(option);
    }
}

function switchTab(tabId) {
    currentTab = tabId;
    
    els.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    els.tabContents.forEach(content => content.classList.toggle('active', content.id === `tab-${tabId}`));
    
    els.filtersBar.style.display = tabId === 'beasts' ? 'flex' : 'none';
    
    if (tabId === 'beasts') {
        els.fab.innerHTML = '<span class="material-icons">add</span>'; // It doesn't do anything in Beasts tab in original, just shows char picker sometimes. We'll hide or use for char picker.
        els.fab.style.display = 'none'; // Original app doesn't have FAB on Beasts tab
    } else if (tabId === 'homebrew') {
        els.fab.innerHTML = '<span class="material-icons">add</span>';
        els.fab.style.display = 'flex';
    } else {
        els.fab.style.display = 'none';
    }
}

function handleFabClick() {
    if (currentTab === 'homebrew') {
        openHomebrewEditor();
    }
}

function openModal(modal) {
    modal.classList.add('open');
    if (modal === els.modalChars) renderCharacters();
}

function closeModal(modal) {
    modal.classList.remove('open');
}

function renderApp() {
    const char = getCharacter();
    els.charName.textContent = char.name;
    els.druidLevel.value = char.level.toString();
    els.moonToggle.checked = char.isMoon;
    
    // Sync filter UI with state
    els.filterSeen.checked = state.filters.seenOnly;
    els.filterFav.checked = state.filters.favOnly;
    els.filterFly.checked = state.filters.fly;
    els.filterSwim.checked = state.filters.swim;
    els.searchInput.value = state.filters.search;

    renderBeasts();
    renderHomebrewList();
}

// D&D Logic
const fractions = { '0': 0, '1/8': 0.125, '1/4': 0.25, '1/2': 0.5 };
function getCRValue(cr) {
    const trimmed = (cr || '').toString().trim();
    return fractions[trimmed] !== undefined ? fractions[trimmed] : parseFloat(trimmed);
}

function getMaxCR(level, isMoon) {
    if (level === 0) return 99; // All
    if (isMoon) {
        if (level < 6) return 1;
        return Math.floor(level / 3);
    }
    if (level < 4) return 0.25;
    if (level < 8) return 0.5;
    return 1;
}

function canSwim(level) {
    return level === 0 || level >= 4;
}

function canFly(level) {
    return level === 0 || level >= 8;
}

function canBeElemental(level, isMoon) {
    return level === 0 || (isMoon && level >= 10);
}

function filterBeasts() {
    const char = getCharacter();
    const maxCR = getMaxCR(char.level, char.isMoon);
    const swimAllowed = canSwim(char.level);
    const flyAllowed = canFly(char.level);
    const elementalsAllowed = canBeElemental(char.level, char.isMoon);
    
    let combined = getActiveBeasts();

    return combined.filter(b => {
        // Name Search
        if (state.filters.search && !b.name.toLowerCase().includes(state.filters.search)) return false;
        
        // Druid Level Rules
        const crValue = getCRValue(b.cr);
        if (crValue > maxCR) return false;
        
        const hasSwim = b.swim !== undefined || (b.speed && b.speed.toString().toLowerCase().includes('swim'));
        const hasFly = b.fly !== undefined || (b.speed && b.speed.toString().toLowerCase().includes('fly'));
        
        if (hasSwim && !swimAllowed) return false;
        if (hasFly && !flyAllowed) return false;
        
        const type = (b.type || 'beast').toLowerCase();
        if (type.includes('elemental') && !elementalsAllowed) return false;
        if (!type.includes('beast') && !type.includes('elemental')) return false; // Basic safeguard

        // Manual Filters
        if (state.filters.seenOnly && !char.seen[b.name]) return false;
        if (state.filters.favOnly && !char.favs[b.name]) return false;
        if (state.filters.fly && !hasFly) return false;
        if (state.filters.swim && !hasSwim) return false;

        return true;
    });
}

function renderBeasts() {
    const filtered = filterBeasts();
    
    // Group by CR
    const grouped = {};
    filtered.forEach(b => {
        if (!grouped[b.cr]) grouped[b.cr] = [];
        grouped[b.cr].push(b);
    });

    const sortedCRs = Object.keys(grouped).sort((a, b) => getCRValue(a) - getCRValue(b));

    els.beastsList.innerHTML = '';
    
    if (sortedCRs.length === 0) {
        els.beastsList.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:#888;">No beasts found matching your filters.</div>';
        return;
    }

    const char = getCharacter();

    sortedCRs.forEach(cr => {
        const header = document.createElement('div');
        header.className = 'list-header';
        header.textContent = `CR ${cr}`;
        els.beastsList.appendChild(header);

        grouped[cr].sort((a, b) => a.name.localeCompare(b.name)).forEach(b => {
            const item = document.createElement('div');
            item.className = 'list-item';
            
            const isSeen = !!char.seen[b.name];
            const isFav = !!char.favs[b.name];

            item.innerHTML = `
                <div class="list-item-content" onclick="showBeastDetails('${b.name.replace(/'/g, "\\'")}')">
                    <div class="list-item-title">${b.name}</div>
                    <div class="list-item-subtitle">${b.size} ${b.type || 'beast'}${b._sourceName ? ` • ${b._sourceName}` : ''}</div>
                </div>
                <div class="list-item-actions">
                    <button class="icon-button btn-seen ${isSeen ? 'active' : ''}" onclick="toggleSeen('${b.name.replace(/'/g, "\\'")}', event)">
                        <span class="material-icons">${isSeen ? 'visibility' : 'visibility_off'}</span>
                    </button>
                    <button class="icon-button btn-fav ${isFav ? 'active' : ''}" onclick="toggleFav('${b.name.replace(/'/g, "\\'")}', event)">
                        <span class="material-icons">${isFav ? 'star' : 'star_border'}</span>
                    </button>
                </div>
            `;
            els.beastsList.appendChild(item);
        });
    });
}

function toggleSeen(name, event) {
    event.stopPropagation();
    const char = getCharacter();
    if (char.seen[name]) delete char.seen[name];
    else char.seen[name] = true;
    saveState();
    renderBeasts();
}

function toggleFav(name, event) {
    event.stopPropagation();
    const char = getCharacter();
    if (char.favs[name]) delete char.favs[name];
    else char.favs[name] = true;
    saveState();
    renderBeasts();
}

function clearFilters() {
    state.filters = { search: '', seenOnly: false, favOnly: false, fly: false, swim: false };
    els.searchInput.value = '';
    renderApp();
    closeModal(els.modalFilters);
}

// Characters
function renderCharacters() {
    const list = document.getElementById('characters-list');
    list.innerHTML = '';
    
    state.characters.forEach(c => {
        const li = document.createElement('li');
        li.className = 'list-item clickable' + (c.id === state.selectedCharacterId ? ' active' : '');
        li.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${c.name}</div>
                <div class="list-item-subtitle">Level ${c.level} ${c.isMoon ? '(Moon)' : ''}</div>
            </div>
            ${state.characters.length > 1 ? `
            <div class="list-item-actions">
                <button class="icon-button" onclick="deleteCharacter(${c.id}, event)">
                    <span class="material-icons" style="color:var(--error-color);">delete</span>
                </button>
            </div>` : ''}
        `;
        li.onclick = (e) => {
            if (!e.target.closest('button')) {
                state.selectedCharacterId = c.id;
                saveState();
                renderApp();
                closeModal(els.modalChars);
            }
        };
        list.appendChild(li);
    });
}

function addCharacter() {
    const input = document.getElementById('new-character-name');
    const name = input.value.trim();
    if (name) {
        const id = Date.now();
        state.characters.push({ id, name, level: 0, isMoon: false, favs: {}, seen: {} });
        state.selectedCharacterId = id;
        input.value = '';
        saveState();
        renderApp();
        renderCharacters();
    }
}

function deleteCharacter(id, event) {
    event.stopPropagation();
    state.characters = state.characters.filter(c => c.id !== id);
    if (state.selectedCharacterId === id) {
        state.selectedCharacterId = state.characters[0].id;
    }
    saveState();
    renderApp();
    renderCharacters();
}

// Beast Details
let currentDetailBeast = null;

const CR_XP_MAP = {
    '0': '10',
    '1/8': '25',
    '1/4': '50',
    '1/2': '100',
    '1': '200',
    '2': '450',
    '3': '700',
    '4': '1,100',
    '5': '1,800',
    '6': '2,300',
    '7': '2,900',
    '8': '3,900',
    '9': '5,000',
    '10': '5,900'
};

function formatSpeed(beast) {
    if (!beast) return '30 ft.';
    if (typeof beast.speed === 'string' && beast.speed.includes('ft')) {
        return beast.speed;
    }
    const parts = [];
    if (beast.speed !== undefined && beast.speed !== null && beast.speed !== '') {
        parts.push(`${beast.speed} ft.`);
    }
    if (beast.burrow) parts.push(`burrow ${beast.burrow} ft.`);
    if (beast.climb) parts.push(`climb ${beast.climb} ft.`);
    if (beast.fly) parts.push(`fly ${beast.fly} ft.${beast.flyDetails ? ` (${beast.flyDetails})` : ''}`);
    if (beast.swim) parts.push(`swim ${beast.swim} ft.`);
    return parts.length > 0 ? parts.join(', ') : `${beast.speed || 30} ft.`;
}

function formatSenses(beast) {
    if (!beast) return 'passive Perception 10';
    let s = beast.senses ? cleanText(beast.senses) : '';
    const passiveText = `passive Perception ${beast.passive || 10}`;
    if (!s) return passiveText;
    if (s.toLowerCase().includes('passive perception')) return s;
    return `${s}, ${passiveText}`;
}

function formatActionText(text) {
    if (!text) return '';
    return cleanText(text)
        .replace(/(?<!\*)\b(Melee or Ranged|Melee|Ranged)( Weapon| Spell)? Attack( Roll)?:/g, '*$1$2 Attack$3:*')
        .replace(/(?<!\*)\bHit:/g, '*Hit:*')
        .replace(/(?<!\*)\bTrigger:/g, '*Trigger:*')
        .replace(/(?<!\*)\bResponse:/g, '*Response:*')
        .replace(/(\d+d\d+)\s*([+-])\s*(\d+)/g, '$1 $2 $3');
}

function formatBeastMarkdown(beast) {
    if (!beast) return '';
    
    let md = `## ${cleanText(beast.name)}  \n`;
    
    const size = beast.size ? `${beast.size} ` : '';
    const type = beast.type || 'beast';
    const align = beast.alignment || 'unaligned';
    md += `*${size}${type}, ${align}*  \n`;
    md += `___\n`;
    
    md += `**Armor Class** :: ${beast.ac}\n`;
    
    const roll = beast.hd || (beast.roll ? beast.roll.replace(/([+-])/g, ' $1 ').replace(/\s+/g, ' ') : '');
    md += `**Hit Points** :: ${beast.hp}${roll ? ` (${roll})` : ''}\n`;
    
    md += `**Speed** :: ${formatSpeed(beast)}\n`;
    md += `___\n`;
    
    md += `|  STR  |  DEX  |  CON  |  INT  |  WIS  |  CHA  |\n`;
    md += `|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|\n`;
    md += `|  ${beast.str || 10} (${getModifier(beast.str || 10)})  |  ${beast.dex || 10} (${getModifier(beast.dex || 10)})  |  ${beast.con || 10} (${getModifier(beast.con || 10)})  |  ${beast.int || 10} (${getModifier(beast.int || 10)})  |  ${beast.wis || 10} (${getModifier(beast.wis || 10)})  |  ${beast.cha || 10} (${getModifier(beast.cha || 10)})  |\n`;
    md += `___\n`;
    
    if (beast.saves) md += `**Saving Throws** :: ${cleanText(beast.saves)}\n`;
    if (beast.skills) md += `**Skills** :: ${cleanText(beast.skills)}\n`;
    if (beast.damage_vulnerabilities) md += `**Damage Vulnerabilities** :: ${beast.damage_vulnerabilities}\n`;
    if (beast.damage_resistances) md += `**Damage Resistances** :: ${beast.damage_resistances}\n`;
    if (beast.damage_immunities) md += `**Damage Immunities** :: ${beast.damage_immunities}\n`;
    if (beast.condition_immunities) md += `**Condition Immunities** :: ${beast.condition_immunities}\n`;
    
    md += `**Senses** :: ${formatSenses(beast)}\n`;
    md += `**Languages** :: ${beast.languages || '—'}\n`;
    
    const crClean = (beast.cr || '0').toString().trim();
    const xp = CR_XP_MAP[crClean];
    md += `**Challenge** :: ${crClean}${xp ? ` (${xp} XP)` : ''}\n`;
    md += `___\n`;
    
    const traits = beast.traits || beast.trait || [];
    if (traits.length > 0) {
        traits.forEach(t => {
            md += `***${cleanText(t.name)}.*** ${cleanText(t.text)}\n\n`;
        });
        md += `___\n`;
    }
    
    const actions = beast.actions || beast.action || [];
    if (actions.length > 0) {
        md += `### Actions\n`;
        actions.forEach(a => {
            md += `***${cleanText(a.name)}.*** ${formatActionText(a.text)}\n\n`;
        });
    }

    const bonusActions = beast.bonus_actions || [];
    if (bonusActions.length > 0) {
        md += `### Bonus Actions\n`;
        bonusActions.forEach(ba => {
            md += `***${cleanText(ba.name)}.*** ${formatActionText(ba.text)}\n\n`;
        });
    }

    const reactions = beast.reactions || [];
    if (reactions.length > 0) {
        md += `### Reactions\n`;
        reactions.forEach(r => {
            md += `***${cleanText(r.name)}.*** ${formatActionText(r.text)}\n\n`;
        });
    }
    
    return md.trim();
}

function selectStatBlockText() {
    const sb = document.getElementById('stat-block-content');
    if (!sb) return;
    const range = document.createRange();
    range.selectNodeContents(sb);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

async function copyStatBlockText(beast) {
    if (!beast) return;
    const textToCopy = formatBeastMarkdown(beast);
    if (textToCopy) {
        try {
            await navigator.clipboard.writeText(textToCopy);
        } catch (err) {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
    }
}

function showBeastDetails(name) {
    const beast = getActiveBeasts().find(b => b.name === name) || getAllAvailableBeasts().find(b => b.name === name);
    if (!beast) return;
    
    currentDetailBeast = beast;
    const char = getCharacter();
    
    document.getElementById('detail-name').textContent = beast.name;
    
    const btnCopy = document.getElementById('detail-btn-copy');
    const btnSeen = document.getElementById('detail-btn-seen');
    const btnFav = document.getElementById('detail-btn-fav');
    
    if (btnCopy) {
        btnCopy.innerHTML = `<span class="material-icons">content_copy</span>`;
        const newBtnCopy = btnCopy.cloneNode(true);
        btnCopy.parentNode.replaceChild(newBtnCopy, btnCopy);
        newBtnCopy.onclick = async () => {
            await copyStatBlockText(beast);
            newBtnCopy.innerHTML = `<span class="material-icons" style="color:var(--star-color);">check</span>`;
            setTimeout(() => {
                newBtnCopy.innerHTML = `<span class="material-icons">content_copy</span>`;
            }, 1200);
        };
    }

    const isSeen = !!char.seen[beast.name];
    const isFav = !!char.favs[beast.name];
    
    btnSeen.innerHTML = `<span class="material-icons">${isSeen ? 'visibility' : 'visibility_off'}</span>`;
    btnFav.innerHTML = `<span class="material-icons">${isFav ? 'star' : 'star_border'}</span>`;
    
    // Clear old listeners
    const newBtnSeen = btnSeen.cloneNode(true);
    btnSeen.parentNode.replaceChild(newBtnSeen, btnSeen);
    newBtnSeen.onclick = () => {
        toggleSeen(beast.name, {stopPropagation:()=>{}});
        const updatedIsSeen = !!char.seen[beast.name];
        newBtnSeen.innerHTML = `<span class="material-icons">${updatedIsSeen ? 'visibility' : 'visibility_off'}</span>`;
    };
    
    const newBtnFav = btnFav.cloneNode(true);
    btnFav.parentNode.replaceChild(newBtnFav, btnFav);
    newBtnFav.onclick = () => {
        toggleFav(beast.name, {stopPropagation:()=>{}});
        const updatedIsFav = !!char.favs[beast.name];
        newBtnFav.innerHTML = `<span class="material-icons">${updatedIsFav ? 'star' : 'star_border'}</span>`;
    };

    renderStatBlock(beast);
    openModal(els.modalDetails);
}

function getModifier(score) {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatStatBlockText(text) {
    if (!text) return '';
    return cleanText(text)
        .replace(/(?<!\*)\b(Melee or Ranged|Melee|Ranged)( Weapon| Spell)? Attack( Roll)?:/g, '<em>$1$2 Attack$3:</em>')
        .replace(/\bHit:/g, '<em>Hit:</em>')
        .replace(/\bTrigger:/g, '<em>Trigger:</em>')
        .replace(/\bResponse:/g, '<em>Response:</em>');
}

function renderStatBlock(beast) {
    const sb = document.getElementById('stat-block-content');
    
    const renderArray = (arr, title) => {
        if (!arr || arr.length === 0) return '';
        return `
            <div class="stat-section-header">${title}</div>
            ${arr.map(a => `
                <div class="trait-item">
                    <span class="trait-title">${cleanText(a.name)}.</span> 
                    ${formatStatBlockText(a.text)}
                    ${a.roll ? `<br><small>Roll: ${a.roll}</small>` : ''}
                    ${a.damage ? `<br><small>Damage: ${a.damage}</small>` : ''}
                </div>
            `).join('')}
            <div class="stat-divider"></div>
        `;
    };

    sb.innerHTML = `
        <div class="details-container">
            <div class="beast-title">${cleanText(beast.name)}</div>
            <div class="beast-subtitle">${beast.size} ${beast.type || 'beast'}, ${beast.alignment || 'unaligned'}</div>
            
            <div class="stat-divider"></div>
            
            <div class="attribute-line"><span class="attribute-label">Armor Class</span> ${beast.ac}</div>
            <div class="attribute-line"><span class="attribute-label">Hit Points</span> ${beast.hp} ${beast.hd ? `(${beast.hd})` : (beast.roll ? `(${beast.roll.replace(/([+-])/g, ' $1 ').replace(/\s+/g, ' ')})` : '')}</div>
            <div class="attribute-line"><span class="attribute-label">Speed</span> ${formatSpeed(beast)}</div>
            
            <div class="stat-divider"></div>
            
            <div class="stat-table-wrapper">
                <table class="stat-table">
                    <thead>
                        <tr>
                            <th>STR</th>
                            <th>DEX</th>
                            <th>CON</th>
                            <th>INT</th>
                            <th>WIS</th>
                            <th>CHA</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${beast.str || 10} (${getModifier(beast.str || 10)})</td>
                            <td>${beast.dex || 10} (${getModifier(beast.dex || 10)})</td>
                            <td>${beast.con || 10} (${getModifier(beast.con || 10)})</td>
                            <td>${beast.int || 10} (${getModifier(beast.int || 10)})</td>
                            <td>${beast.wis || 10} (${getModifier(beast.wis || 10)})</td>
                            <td>${beast.cha || 10} (${getModifier(beast.cha || 10)})</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="stat-divider"></div>
            
            ${beast.saves ? `<div class="attribute-line"><span class="attribute-label">Saving Throws</span> ${cleanText(beast.saves)}</div>` : ''}
            ${beast.skills ? `<div class="attribute-line"><span class="attribute-label">Skills</span> ${cleanText(beast.skills)}</div>` : ''}
            ${beast.damage_vulnerabilities ? `<div class="attribute-line"><span class="attribute-label">Damage Vulnerabilities</span> ${beast.damage_vulnerabilities}</div>` : ''}
            ${beast.damage_resistances ? `<div class="attribute-line"><span class="attribute-label">Damage Resistances</span> ${beast.damage_resistances}</div>` : ''}
            ${beast.damage_immunities ? `<div class="attribute-line"><span class="attribute-label">Damage Immunities</span> ${beast.damage_immunities}</div>` : ''}
            ${beast.condition_immunities ? `<div class="attribute-line"><span class="attribute-label">Condition Immunities</span> ${beast.condition_immunities}</div>` : ''}
            <div class="attribute-line"><span class="attribute-label">Senses</span> ${cleanText(formatSenses(beast))}</div>
            <div class="attribute-line"><span class="attribute-label">Languages</span> ${beast.languages ? cleanText(beast.languages) : '—'}</div>
            <div class="attribute-line"><span class="attribute-label">Challenge</span> ${beast.cr}${CR_XP_MAP[(beast.cr || '0').toString().trim()] ? ` (${CR_XP_MAP[(beast.cr || '0').toString().trim()]} XP)` : ''}</div>
            <div class="attribute-line"><span class="attribute-label">Source</span> ${beast._sourceName || beast.source || 'Core 5e'}</div>
            
            <div class="stat-divider"></div>
            
            ${renderArray(beast.traits, 'Traits')}
            ${renderArray(beast.actions || beast.action, 'Actions')}
            ${renderArray(beast.bonus_actions, 'Bonus Actions')}
            ${renderArray(beast.reactions, 'Reactions')}
        </div>
    `;
}

// Homebrew Management (Stores directly into homebrew.json Data Source)
function renderHomebrewList() {
    els.homebrewList.innerHTML = '';
    const hbSource = getHomebrewSource();
    const beasts = hbSource.beasts || [];
    
    if (beasts.length === 0) {
        els.homebrewList.innerHTML = `
            <div id="empty-homebrew" class="empty-state">
                <span class="material-icons empty-icon">pets</span>
                <p>No homebrew beasts yet.</p>
                <p>Tap the + button to add one.</p>
            </div>
        `;
        return;
    }

    beasts.forEach((b, index) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        
        item.innerHTML = `
            <div class="list-item-content" onclick="showBeastDetails('${b.name.replace(/'/g, "\\'")}')">
                <div class="list-item-title">${b.name}</div>
                <div class="list-item-subtitle">CR ${b.cr} | ${b.size} ${b.type || 'beast'}</div>
            </div>
            <div class="list-item-actions">
                <button class="icon-button" onclick="editHomebrew(${index}, event)">
                    <span class="material-icons">edit</span>
                </button>
                <button class="icon-button" onclick="deleteHomebrew(${index}, event)">
                    <span class="material-icons" style="color:var(--error-color);">delete</span>
                </button>
            </div>
        `;
        els.homebrewList.appendChild(item);
    });
}

let editingHomebrewIndex = -1;

function openHomebrewEditor(index = -1) {
    editingHomebrewIndex = index;
    const modal = els.modalHomebrew;
    const copySelect = document.getElementById('hb-copy-from');
    const hbSource = getHomebrewSource();
    
    // Populate copy select
    copySelect.innerHTML = '<option value="">-- Copy from existing --</option>';
    getActiveBeasts().sort((a, b) => a.name.localeCompare(b.name)).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = `${b.name} (${b._sourceName || 'Core'})`;
        copySelect.appendChild(opt);
    });

    if (index >= 0 && hbSource.beasts && hbSource.beasts[index]) {
        document.getElementById('homebrew-editor-title').textContent = 'Edit Homebrew';
        populateHomebrewForm(hbSource.beasts[index]);
    } else {
        document.getElementById('homebrew-editor-title').textContent = 'Add Homebrew';
        populateHomebrewForm({});
    }

    openModal(modal);
}

function handleCopyFromChanged(e) {
    const name = e.target.value;
    if (!name) return;
    const beast = getActiveBeasts().find(b => b.name === name);
    if (beast) {
        populateHomebrewForm(beast);
    }
}

function populateHomebrewForm(b) {
    document.getElementById('hb-name').value = b.name || '';
    document.getElementById('hb-cr').value = b.cr || '';
    document.getElementById('hb-size').value = b.size || 'Medium';
    document.getElementById('hb-type').value = b.type || 'beast';
    document.getElementById('hb-ac').value = b.ac || '';
    document.getElementById('hb-hp').value = b.hp || '';
    document.getElementById('hb-hd').value = b.hd || '';
    document.getElementById('hb-speed').value = b.speed || '';
    
    document.getElementById('hb-str').value = b.str || 10;
    document.getElementById('hb-dex').value = b.dex || 10;
    document.getElementById('hb-con').value = b.con || 10;
    document.getElementById('hb-int').value = b.int || 10;
    document.getElementById('hb-wis').value = b.wis || 10;
    document.getElementById('hb-cha').value = b.cha || 10;
    
    document.getElementById('hb-senses').value = b.senses || '';
    document.getElementById('hb-skills').value = b.skills || '';
    
    document.getElementById('hb-traits').value = b.traits ? JSON.stringify(b.traits, null, 2) : '';
    document.getElementById('hb-actions').value = b.actions ? JSON.stringify(b.actions, null, 2) : '';
}

async function saveHomebrew() {
    const name = document.getElementById('hb-name').value.trim();
    if (!name) {
        alert("Name is required");
        return;
    }

    const parseJSON = (str) => {
        try { return str ? JSON.parse(str) : []; }
        catch (e) { return []; }
    };

    const beast = {
        name: name,
        cr: document.getElementById('hb-cr').value || '0',
        size: document.getElementById('hb-size').value,
        type: document.getElementById('hb-type').value,
        ac: parseInt(document.getElementById('hb-ac').value) || 10,
        hp: parseInt(document.getElementById('hb-hp').value) || 1,
        hd: document.getElementById('hb-hd').value,
        speed: document.getElementById('hb-speed').value,
        str: parseInt(document.getElementById('hb-str').value) || 10,
        dex: parseInt(document.getElementById('hb-dex').value) || 10,
        con: parseInt(document.getElementById('hb-con').value) || 10,
        int: parseInt(document.getElementById('hb-int').value) || 10,
        wis: parseInt(document.getElementById('hb-wis').value) || 10,
        cha: parseInt(document.getElementById('hb-cha').value) || 10,
        senses: document.getElementById('hb-senses').value,
        skills: document.getElementById('hb-skills').value,
        traits: parseJSON(document.getElementById('hb-traits').value),
        actions: parseJSON(document.getElementById('hb-actions').value),
        isHomebrew: true,
        _sourceId: 'homebrew',
        _sourceName: 'Homebrew'
    };

    const hbSource = getHomebrewSource();
    if (!Array.isArray(hbSource.beasts)) hbSource.beasts = [];

    if (editingHomebrewIndex >= 0) {
        // If name changed, migrate seen/fav
        const oldName = hbSource.beasts[editingHomebrewIndex] ? hbSource.beasts[editingHomebrewIndex].name : '';
        if (oldName && oldName !== name) {
            state.characters.forEach(c => {
                if (c.seen[oldName]) { c.seen[name] = true; delete c.seen[oldName]; }
                if (c.favs[oldName]) { c.favs[name] = true; delete c.favs[oldName]; }
            });
            saveState();
        }
        hbSource.beasts[editingHomebrewIndex] = beast;
    } else {
        hbSource.beasts.push(beast);
    }

    await SourceDB.put(hbSource);
    renderApp();
    closeModal(els.modalHomebrew);
}

function editHomebrew(index, event) {
    event.stopPropagation();
    openHomebrewEditor(index);
}

async function deleteHomebrew(index, event) {
    event.stopPropagation();
    const hbSource = getHomebrewSource();
    if (!hbSource || !hbSource.beasts || !hbSource.beasts[index]) return;
    
    if (confirm("Are you sure you want to delete this homebrew beast?")) {
        const name = hbSource.beasts[index].name;
        hbSource.beasts.splice(index, 1);
        
        // Clean up refs
        state.characters.forEach(c => {
            delete c.seen[name];
            delete c.favs[name];
        });
        saveState();
        
        await SourceDB.put(hbSource);
        renderApp();
    }
}

// ============================================================
// Data Sources Management
// ============================================================
function renderDataSources() {
    const container = els.sourcesListContainer;
    if (!container) return;
    container.innerHTML = '';
    
    const sources = state.dataSources || [];
    
    if (sources.length === 0) {
        container.innerHTML = `
            <div class="source-empty-state">
                <span class="material-icons">folder_off</span>
                <h3 style="margin: 0; color: var(--text-color);">No Data Sources Active</h3>
                <p style="margin: 0; max-width: 320px;">Load default sources from the data folder or import your own custom JSON compendiums.</p>
                <div style="display:flex; gap:10px; margin-top:8px;">
                    <button class="btn btn-primary" onclick="reloadDefaultSources()">Reload Defaults</button>
                    <button class="btn" onclick="els.sourceUploadInput.click()">Import JSON</button>
                </div>
            </div>
        `;
        return;
    }
    
    sources.forEach(src => {
        const card = document.createElement('div');
        card.className = `source-card ${src.enabled ? 'active' : 'disabled'}`;
        card.innerHTML = `
            <div class="source-card-main">
                <div class="source-icon">
                    <span class="material-icons">menu_book</span>
                </div>
                <div class="source-details">
                    <div class="source-title-row">
                        <span class="source-title">${src.name}</span>
                        <span class="source-badge ${src.id === 'homebrew' ? 'custom' : (src.isDefault ? 'default' : 'custom')}">${src.id === 'homebrew' ? 'Homebrew' : (src.isDefault ? 'Default' : 'Custom')}</span>
                    </div>
                    <div class="source-meta">
                        ${src.beasts ? src.beasts.length : 0} beasts • ${src.filename || 'Custom JSON'}
                    </div>
                </div>
            </div>
            <div class="source-controls">
                <label class="switch" title="${src.enabled ? 'Enabled in main list' : 'Disabled'}">
                    <input type="checkbox" ${src.enabled ? 'checked' : ''} onchange="toggleSource('${src.id}')">
                    <span class="slider round"></span>
                </label>
                <button class="icon-button" title="Export Source JSON" onclick="exportSource('${src.id}', event)">
                    <span class="material-icons">download</span>
                </button>
                <button class="icon-button source-btn-delete" title="${src.id === 'homebrew' ? 'Clear Homebrew Beasts' : 'Delete Source'}" onclick="deleteSource('${src.id}', event)">
                    <span class="material-icons">delete_outline</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function toggleSource(sourceId) {
    const src = state.dataSources.find(s => s.id === sourceId);
    if (!src) return;
    src.enabled = !src.enabled;
    await SourceDB.put(src);
    renderDataSources();
    renderBeasts();
}

async function deleteSource(sourceId, event) {
    if (event) event.stopPropagation();
    const src = state.dataSources.find(s => s.id === sourceId);
    if (!src) return;
    
    if (src.id === 'homebrew') {
        const count = src.beasts ? src.beasts.length : 0;
        if (!confirm(`Clear all ${count} custom beasts from homebrew.json?`)) return;
        src.beasts = [];
        await SourceDB.put(src);
        renderDataSources();
        renderApp();
        return;
    }

    const confirmMsg = src.isDefault
        ? `Remove default source "${src.name}"? You can restore it anytime with "Reload Defaults".`
        : `Are you sure you want to delete the source "${src.name}" (${src.beasts ? src.beasts.length : 0} beasts)?`;
    
    if (!confirm(confirmMsg)) return;
    
    await SourceDB.delete(sourceId);
    state.dataSources = state.dataSources.filter(s => s.id !== sourceId);
    renderDataSources();
    renderBeasts();
}

function exportSource(sourceId, event) {
    if (event) event.stopPropagation();
    const src = state.dataSources.find(s => s.id === sourceId);
    if (!src) return;
    
    const exportData = {
        name: src.name,
        count: src.beasts.length,
        beasts: src.beasts
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (src.filename || src.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function reloadDefaultSources() {
    const loaded = await fetchDefaultSources();
    if (loaded && loaded.length > 0) {
        loaded.forEach(newSrc => {
            const idx = state.dataSources.findIndex(s => s.id === newSrc.id);
            if (idx >= 0) {
                state.dataSources[idx] = newSrc;
            } else {
                state.dataSources.unshift(newSrc);
            }
        });
        renderDataSources();
        renderBeasts();
        alert(`Successfully reloaded ${loaded.length} default sources!`);
    } else {
        alert("Could not fetch default JSON files automatically. If running directly from the filesystem (file://), use 'Import JSON' to select 2014_beasts.json, 2024_beasts.json, or volos.json from your data folder.");
    }
}

async function handleSourceUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    let importedCount = 0;
    for (const file of files) {
        try {
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
            
            const parsed = JSON.parse(text);
            let rawBeasts = [];
            let sourceName = '';
            
            if (Array.isArray(parsed)) {
                rawBeasts = parsed;
                const baseName = file.name.replace(/\.[^/.]+$/, "");
                sourceName = baseName.replace(/[-_]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            } else if (typeof parsed === 'object' && parsed !== null) {
                sourceName = parsed.name || parsed.title || parsed.source || file.name.replace(/\.[^/.]+$/, "");
                rawBeasts = parsed.beasts || parsed.monsters || parsed.creatures || parsed.data || [];
            }
            
            if (!Array.isArray(rawBeasts) || rawBeasts.length === 0) {
                alert(`No beasts found in "${file.name}". Please ensure the JSON contains an array of beast objects.`);
                continue;
            }
            
            const sourceId = 'src-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
            const newSource = {
                id: sourceId,
                name: sourceName,
                filename: file.name,
                isDefault: false,
                enabled: true,
                beasts: normalizeBeasts(rawBeasts, sourceId, sourceName)
            };
            
            await SourceDB.put(newSource);
            state.dataSources.push(newSource);
            importedCount++;
        } catch (err) {
            console.error("Error reading file", file.name, err);
            alert(`Failed to import "${file.name}": Invalid JSON format.`);
        }
    }
    
    event.target.value = ''; // Reset file input
    if (importedCount > 0) {
        renderDataSources();
        renderBeasts();
        alert(`Successfully imported ${importedCount} data source(s)!`);
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
