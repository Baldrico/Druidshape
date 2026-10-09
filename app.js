// App State & Data
const ALL_BEASTS = (window.DEFAULT_BEASTS || []).concat(window.DEFAULT_VOLOS || []);
let state = {
    darkMode: false,
    characters: [
        { id: 1, name: 'Default', level: 0, isMoon: false, favs: {}, seen: {} }
    ],
    selectedCharacterId: 1,
    homebrew: [],
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
    
    // Filter toggles
    filterSeen: document.getElementById('filter-seen'),
    filterFav: document.getElementById('filter-fav'),
    filterFly: document.getElementById('filter-fly'),
    filterSwim: document.getElementById('filter-swim')
};

// Initialize App
function init() {
    loadState();
    setupEventListeners();
    populateDruidLevels();
    applyTheme();
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
    
    document.getElementById('btn-export-homebrew').addEventListener('click', exportHomebrew);
    document.getElementById('btn-import-homebrew').addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input').addEventListener('change', importHomebrew);
    
    document.getElementById('btn-tip-jar').addEventListener('click', () => {
        const list = document.getElementById('tip-list');
        list.innerHTML = '';
        (window.DEFAULT_IAP || []).forEach(productId => {
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
    
    let combined = [...ALL_BEASTS, ...state.homebrew];

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
                    <div class="list-item-subtitle">${b.size} ${b.type || 'beast'}</div>
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

function showBeastDetails(name) {
    const beast = [...ALL_BEASTS, ...state.homebrew].find(b => b.name === name);
    if (!beast) return;
    
    currentDetailBeast = beast;
    const char = getCharacter();
    
    document.getElementById('detail-name').textContent = beast.name;
    
    const btnSeen = document.getElementById('detail-btn-seen');
    const btnFav = document.getElementById('detail-btn-fav');
    
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

function renderStatBlock(beast) {
    const sb = document.getElementById('stat-block-content');
    
    const renderArray = (arr, title) => {
        if (!arr || arr.length === 0) return '';
        return `
            <div class="stat-section-header">${title}</div>
            ${arr.map(a => `
                <div class="trait-item">
                    <span class="trait-title">${a.name}.</span> 
                    ${a.text}
                    ${a.roll ? `<br><small>Roll: ${a.roll}</small>` : ''}
                    ${a.damage ? `<br><small>Damage: ${a.damage}</small>` : ''}
                </div>
            `).join('')}
            <div class="stat-divider"></div>
        `;
    };

    sb.innerHTML = `
        <div class="details-container">
            <div class="beast-title">${beast.name}</div>
            <div class="beast-subtitle">${beast.size} ${beast.type || 'beast'}${beast.alignment ? `, ${beast.alignment}` : ''}</div>
            
            <div class="stat-divider"></div>
            
            <div class="attribute-line"><span class="attribute-label">Armor Class</span> ${beast.ac}</div>
            <div class="attribute-line"><span class="attribute-label">Hit Points</span> ${beast.hp} ${beast.hd ? `(${beast.hd})` : ''}</div>
            <div class="attribute-line"><span class="attribute-label">Speed</span> ${beast.speed}</div>
            
            <div class="stat-divider"></div>
            
            <div class="stats-grid">
                <div><div class="stat-box-title">STR</div><div class="stat-box-val">${beast.str || 10} (${getModifier(beast.str || 10)})</div></div>
                <div><div class="stat-box-title">DEX</div><div class="stat-box-val">${beast.dex || 10} (${getModifier(beast.dex || 10)})</div></div>
                <div><div class="stat-box-title">CON</div><div class="stat-box-val">${beast.con || 10} (${getModifier(beast.con || 10)})</div></div>
                <div><div class="stat-box-title">INT</div><div class="stat-box-val">${beast.int || 10} (${getModifier(beast.int || 10)})</div></div>
                <div><div class="stat-box-title">WIS</div><div class="stat-box-val">${beast.wis || 10} (${getModifier(beast.wis || 10)})</div></div>
                <div><div class="stat-box-title">CHA</div><div class="stat-box-val">${beast.cha || 10} (${getModifier(beast.cha || 10)})</div></div>
            </div>
            
            <div class="stat-divider"></div>
            
            ${beast.saves ? `<div class="attribute-line"><span class="attribute-label">Saving Throws</span> ${beast.saves}</div>` : ''}
            ${beast.skills ? `<div class="attribute-line"><span class="attribute-label">Skills</span> ${beast.skills}</div>` : ''}
            ${beast.damage_vulnerabilities ? `<div class="attribute-line"><span class="attribute-label">Damage Vulnerabilities</span> ${beast.damage_vulnerabilities}</div>` : ''}
            ${beast.damage_resistances ? `<div class="attribute-line"><span class="attribute-label">Damage Resistances</span> ${beast.damage_resistances}</div>` : ''}
            ${beast.damage_immunities ? `<div class="attribute-line"><span class="attribute-label">Damage Immunities</span> ${beast.damage_immunities}</div>` : ''}
            ${beast.condition_immunities ? `<div class="attribute-line"><span class="attribute-label">Condition Immunities</span> ${beast.condition_immunities}</div>` : ''}
            ${beast.senses ? `<div class="attribute-line"><span class="attribute-label">Senses</span> ${beast.senses}</div>` : ''}
            ${beast.languages ? `<div class="attribute-line"><span class="attribute-label">Languages</span> ${beast.languages}</div>` : ''}
            <div class="attribute-line"><span class="attribute-label">Challenge</span> ${beast.cr}</div>
            
            <div class="stat-divider"></div>
            
            ${renderArray(beast.traits, 'Traits')}
            ${renderArray(beast.actions, 'Actions')}
        </div>
    `;
}

// Homebrew
function renderHomebrewList() {
    els.homebrewList.innerHTML = '';
    
    if (state.homebrew.length === 0) {
        els.homebrewList.innerHTML = `
            <div id="empty-homebrew" class="empty-state">
                <span class="material-icons empty-icon">pets</span>
                <p>No homebrew beasts yet.</p>
                <p>Tap the + button to add one.</p>
            </div>
        `;
        return;
    }

    state.homebrew.forEach((b, index) => {
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
    
    // Populate copy select
    copySelect.innerHTML = '<option value="">-- Copy from existing --</option>';
    ALL_BEASTS.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        copySelect.appendChild(opt);
    });

    if (index >= 0) {
        document.getElementById('homebrew-editor-title').textContent = 'Edit Homebrew';
        populateHomebrewForm(state.homebrew[index]);
    } else {
        document.getElementById('homebrew-editor-title').textContent = 'Add Homebrew';
        populateHomebrewForm({});
    }

    openModal(modal);
}

function handleCopyFromChanged(e) {
    const name = e.target.value;
    if (!name) return;
    const beast = ALL_BEASTS.find(b => b.name === name);
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

function saveHomebrew() {
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
        isHomebrew: true
    };

    if (editingHomebrewIndex >= 0) {
        // If name changed, migrate seen/fav
        const oldName = state.homebrew[editingHomebrewIndex].name;
        if (oldName !== name) {
            state.characters.forEach(c => {
                if (c.seen[oldName]) { c.seen[name] = true; delete c.seen[oldName]; }
                if (c.favs[oldName]) { c.favs[name] = true; delete c.favs[oldName]; }
            });
        }
        state.homebrew[editingHomebrewIndex] = beast;
    } else {
        state.homebrew.push(beast);
    }

    saveState();
    renderApp();
    closeModal(els.modalHomebrew);
}

function editHomebrew(index, event) {
    event.stopPropagation();
    openHomebrewEditor(index);
}

function deleteHomebrew(index, event) {
    event.stopPropagation();
    if (confirm("Are you sure you want to delete this homebrew beast?")) {
        const name = state.homebrew[index].name;
        state.homebrew.splice(index, 1);
        
        // Clean up refs
        state.characters.forEach(c => {
            delete c.seen[name];
            delete c.favs[name];
        });
        
        saveState();
        renderApp();
    }
}

// Import / Export
function exportHomebrew() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.homebrew, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "druidshape_homebrew.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importHomebrew(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                state.homebrew = [...state.homebrew, ...imported];
                saveState();
                renderApp();
                alert("Homebrew imported successfully!");
            } else {
                alert("Invalid format. Expected a JSON array.");
            }
        } catch (err) {
            alert("Error parsing JSON file.");
        }
        event.target.value = ''; // Reset
    };
    reader.readAsText(file);
}

// Start app
document.addEventListener('DOMContentLoaded', init);
