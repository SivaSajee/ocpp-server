// --- APP LOGIC ---
let historyChargerId = null; // Currently selected charger for history view

function goToScreen(screenName) {
    // Hide ALL screens
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('listView').style.display = 'none';
    document.getElementById('detailView').style.display = 'none';
    document.getElementById('historyView').style.display = 'none';
    document.getElementById('dlbView').style.display = 'none';
    if (document.getElementById('settingView')) {
        document.getElementById('settingView').style.display = 'none';
    }

    // Reset Nav active states
    document.getElementById('nav-home').classList.remove('active');
    document.getElementById('nav-history').classList.remove('active');
    document.getElementById('nav-dlb').classList.remove('active');
    if (document.getElementById('nav-setting')) {
        document.getElementById('nav-setting').classList.remove('active');
    }

    if (screenName === 'empty') {
        document.getElementById('emptyState').style.display = 'flex';
    }
    else if (screenName === 'list') {
        document.getElementById('listView').style.display = 'block';
        document.getElementById('nav-home').classList.add('active');
    }
    else if (screenName === 'detail') {
        document.getElementById('detailView').style.display = 'block';
        document.getElementById('nav-home').classList.add('active');
    }
    else if (screenName === 'history') {
        document.getElementById('historyView').style.display = 'block';
        document.getElementById('nav-history').classList.add('active');

        const picker = document.getElementById('periodPicker');
        if (picker && !picker.value) {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            picker.value = currentMonth;
            currentPeriod = currentMonth;
        }

        // Auto-selection: If a charger is selected, go straight to its history
        if (selectedChargerId) {
            showHistoryStats(selectedChargerId);
        } else if (!historyChargerId) {
            showHistorySelection();
        } else {
            showHistoryStats(historyChargerId);
        }

    }
    else if (screenName === 'dlb') {
        document.getElementById('dlbView').style.display = 'block';
        document.getElementById('nav-dlb').classList.add('active');
        fetchDLBStatus();
    }
    else if (screenName === 'setting') {
        if (document.getElementById('settingView')) {
            document.getElementById('settingView').style.display = 'block';
        }
        if (document.getElementById('nav-setting')) {
            document.getElementById('nav-setting').classList.add('active');
        }
        // Load charger-specific power limit
        loadChargerPowerLimit();
    }
}

function showHistorySelection() {
    historyChargerId = null;
    document.getElementById('history-selector').style.display = 'block';
    document.getElementById('history-stats').style.display = 'none';
    renderHistoryChargerList();
}

function showHistoryStats(chargerId) {
    historyChargerId = chargerId;
    document.getElementById('history-selector').style.display = 'none';
    document.getElementById('history-stats').style.display = 'block';

    // Update title
    const savedNames = JSON.parse(localStorage.getItem('chargerNames') || '{}');
    document.getElementById('history-title').innerText = (savedNames[chargerId] || chargerId) + " History";

    // Ensure currentPeriod is set before calling updateHistoryData
    if (!currentPeriod) {
        const now = new Date();
        currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    updateHistoryData(currentPeriod);
}

function backToHistorySelection() {
    showHistorySelection();
}

function showDailyBreakdownPage() {
    document.getElementById('history-stats').style.display = 'none';
    document.getElementById('history-daily-breakdown').style.display = 'block';
}

function backToHistoryStats() {
    document.getElementById('history-daily-breakdown').style.display = 'none';
    document.getElementById('history-stats').style.display = 'block';
}

function downloadCurrentChargerHistory() {
    if (historyChargerId) {
        const savedNames = JSON.parse(localStorage.getItem('chargerNames') || '{}');
        const displayName = savedNames[historyChargerId] || historyChargerId;
        downloadChargerHistory(historyChargerId, displayName);
    }
}

function selectChargerHistory(chargerId) {
    showHistoryStats(chargerId);
}

async function renderHistoryChargerList() {
    const container = document.getElementById('history-charger-list');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">Loading chargers...</div>';

    try {
        const response = await fetch('/api/chargers/all');
        const chargerIds = await response.json();

        container.innerHTML = '';
        if (chargerIds.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">No chargers found in history</div>';
            return;
        }

        chargerIds.forEach(id => {
            const savedNames = JSON.parse(localStorage.getItem('chargerNames') || '{}');
            const displayName = savedNames[id] || id;

            const deletedChargers = JSON.parse(localStorage.getItem('deletedChargers') || '[]');
            if (deletedChargers.includes(id)) return;

            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.cursor = 'pointer';
            card.onclick = () => selectChargerHistory(id);

            card.innerHTML = `
                        <div class="device-icon-box" style="background: #e5e7eb;">
                            <svg viewBox="0 0 24 24" style="width: 24px; color: #4b5563;">
                                <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                            </svg>
                        </div>
                        <div class="device-info">
                            <h3>${displayName}</h3>
                            <p style="color: #6b7280; font-size: 13px;">${id}</p>
                        </div>
                    `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error fetching chargers for history:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load chargers</div>';
    }
}

// Download charger history as CSV
async function downloadChargerHistory(chargerId, chargerName) {
    try {
        // Show loading state (optional - could add a spinner)
        console.log(`📥 Downloading history for ${chargerId}...`);

        // Fetch all sessions for this charger
        const response = await fetch(`/api/history/download?chargerId=${chargerId}`);

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const sessions = await response.json();
        console.log('Received sessions:', sessions.length);

        // Convert to CSV
        const csvContent = convertToCSV(sessions);

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `${chargerId}_charging_history.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`✅ Downloaded ${sessions.length} sessions for ${chargerId}`);

        // Show success message
        if (sessions.length === 0) {
            alert(`No charging history found for ${chargerId}. Downloaded empty CSV file.`);
        } else {
            alert(`✅ Downloaded ${sessions.length} charging sessions for ${chargerId}`);
        }
    } catch (error) {
        console.error('Error downloading history:', error);
        console.error('Error details:', error.message);
        alert('Failed to download charging history. Please check the console for details.');
    }
}

// Helper function to convert JSON to CSV
function convertToCSV(sessions) {
    // Safety check: ensure sessions is an array
    if (!Array.isArray(sessions)) {
        console.error('convertToCSV received non-array:', typeof sessions, sessions);
        return 'Date,Start Time,End Time,Duration (min),Energy (kWh)\n';
    }

    if (sessions.length === 0) {
        return 'Date,Start Time,End Time,Duration (min),Energy (kWh)\n';
    }

    // CSV Headers
    const headers = ['Date', 'Start Time', 'End Time', 'Duration (min)', 'Energy (kWh)'];
    const csvRows = [headers.join(',')];

    // Add data rows
    sessions.forEach(session => {
        const row = [
            session.date,
            session.startTime,
            session.endTime,
            session.duration,
            session.energy.toFixed(2)
        ];
        csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
}

// --- RENAME LOGIC (UPDATED) ---
function toggleMenu(menuId) {
    event.stopPropagation();
    var menu = document.getElementById(menuId);
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
}
window.onclick = function (event) {
    if (!event.target.matches('.menu-dots')) {
        var dropdowns = document.getElementsByClassName("dropdown-menu");
        for (var i = 0; i < dropdowns.length; i++) { dropdowns[i].style.display = "none"; }
    }
}

// *** NEW: Rename Function Updates All 3 Screens ***
function renameDevice() {
    let currentName = document.getElementById('list-name').innerText;
    let newName = prompt("Rename Device:", currentName);
    if (newName) {
        document.getElementById('list-name').innerText = newName;   // Update List
        document.getElementById('detail-title').innerText = newName; // Update Detail Header
        document.getElementById('history-title').innerText = newName; // Update History Header
    }
}

function deleteDevice() { if (confirm("Delete?")) goToScreen('empty'); }

// --- WEBSOCKET CONNECTION ---
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = protocol + '//' + window.location.host + '/dashboard-ui';
const ws = new WebSocket(wsUrl);

// Multi-charger support
let selectedChargerId = null;  // Currently selected charger
let chargersData = {};          // All charger data: { chargerId: { status, isCharging, timer, sessionData, ... } }

// Legacy variables (will be moved to per-charger)
let isCharging = false;
let chargingStartTime = null;
let chargingTimer = null;
let sessionEnergy = 0; // Total energy in kWh for current session
let lastEnergyReading = 0; // Last energy meter reading

ws.onopen = () => {
    console.log('✅ Dashboard connected to server');
    // Hide connection banner if it was showing
    document.getElementById('connection-banner').classList.remove('show');
};

ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
    // Show connection banner
    document.getElementById('connection-banner').classList.add('show');
};

ws.onclose = () => {
    console.log('🔌 Dashboard disconnected from server');
    // Show connection banner
    document.getElementById('connection-banner').classList.add('show');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('📩 received:', data);

    // A. CHARGER LIST UPDATE
    if (data.type === 'chargerList') {
        updateChargerDataFromList(data.chargers);
        return;
    }

    // 3. DLB UPDATE
    if (data.type === 'dlb') {
        updateDLBUI(data.chargerId, data.data, data.modes);
        return;
    }



    // 4. DLB CONFIG UPDATE
    if (data.type === 'dlbConfig') {
        // Store modes in the specific charger's data
        if (data.chargerId && chargersData[data.chargerId]) {
            chargersData[data.chargerId].dlbModes = data.modes;
        }

        // Only update UI if this is for the currently selected charger
        if (data.chargerId === selectedChargerId) {
            updateDLBModeToggles(data.modes);
        }
        return;
    }

    // 4b. FAULT UPDATE
    if (data.type === 'fault') {
        if (data.chargerId && chargersData[data.chargerId]) {
            chargersData[data.chargerId].currentFault = data.fault;
        }

        // Update UI if it's the selected charger
        if (data.chargerId === selectedChargerId) {
            updateDashboardFaultBanner(data.fault);
        }

        // Refresh charger list to show fault icons
        renderChargerListUI();
        return;
    }

    if (data.type === 'faultCleared') {
        if (data.chargerId && chargersData[data.chargerId]) {
            chargersData[data.chargerId].currentFault = null;
        }

        // Update UI if it's the selected charger
        if (data.chargerId === selectedChargerId) {
            updateDashboardFaultBanner(null);
        }

        // Refresh charger list to hide fault icons
        renderChargerListUI();
        return;
    }

    // 5. POWER LIMIT UPDATE
    if (data.type === 'powerLimitUpdate') {
        // Store power limit in the specific charger's data
        if (data.chargerId && chargersData[data.chargerId]) {
            chargersData[data.chargerId].maxChargeAmps = data.maxChargeAmps;
        }

        // Only update UI if this is for the currently selected charger
        if (data.chargerId === selectedChargerId) {
            updatePowerLimitDisplay(data.maxChargeAmps);
        }
        return;
    }

    // 6. SETTINGS UPDATE
    if (data.type === 'settingsUpdate') {
        // Store settings in the specific charger's data
        if (data.chargerId && chargersData[data.chargerId]) {
            chargersData[data.chargerId].settings = data.settings;
        }

        // Only update UI if this is for the currently selected charger
        if (data.chargerId === selectedChargerId) {
            updateSettingsToggles(data.settings);
        }
        return;
    }

    // 7. CHARGER INFO UPDATE (firmware version, model, etc.)
    if (data.type === 'chargerInfo') {
        if (data.chargerId && chargersData[data.chargerId]) {
            if (!chargersData[data.chargerId].info) {
                chargersData[data.chargerId].info = {};
            }
            chargersData[data.chargerId].info.firmwareVersion = data.firmwareVersion;
            chargersData[data.chargerId].info.model = data.model;
            chargersData[data.chargerId].info.vendor = data.vendor;

            // Update settings firmware version
            if (chargersData[data.chargerId].settings) {
                chargersData[data.chargerId].settings.firmwareVersion = data.firmwareVersion;
            }
        }

        // Update firmware display in settings if this charger is selected
        if (data.chargerId === selectedChargerId && data.firmwareVersion) {
            // Updated only in modal now
            if (document.getElementById('current-firmware-version')) {
                document.getElementById('current-firmware-version').textContent = data.firmwareVersion;
            }
            console.log(`✅ [${data.chargerId}] Firmware version updated: ${data.firmwareVersion}`);
        }
        return;
    }

    // All other messages should have a chargerId
    const chargerId = data.chargerId;
    if (!chargerId) return;

    // Ensure charger exists in our local store
    if (!chargersData[chargerId]) {
        chargersData[chargerId] = {
            id: chargerId,
            status: 'Unknown',
            isCharging: false,
            voltage: 0,
            current: 0,
            power: 0,
            sessionEnergy: 0,
            startTime: null,
            // Per-charger DLB modes
            dlbModes: {
                pvDynamicBalance: false,
                extremeMode: false,
                nightFullSpeed: false,
                antiOverload: false
            },
            // Per-charger power limit
            maxChargeAmps: 32  // Default: 32A
        };
    }

    const charger = chargersData[chargerId];

    // 1. STATUS UPDATE
    if (data.type === 'status') {
        charger.status = data.status;

        // If this is the selected charger, update UI
        if (chargerId === selectedChargerId) {
            updateStatusUI(data.status);

            // Update button and timer visibility for offline status
            const isOffline = data.status === 'Offline';
            const btn = document.getElementById('main-btn');
            const timerBtn = document.querySelector('.timer-btn');
            if (isOffline) {
                if (btn) {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                    btn.innerText = 'Charger Offline';
                }
                if (timerBtn) timerBtn.style.display = 'none';
            } else {
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    // Note: text will be updated by charging block or sync
                }
                if (timerBtn) timerBtn.style.display = 'block';
            }
        }
        checkDLBVisibility();
        renderChargerListUI();
    }

    // 1b. CHARGING STATUS UPDATE
    if (data.type === 'charging') {
        const isNowCharging = (data.status === 'Charging');
        charger.isCharging = isNowCharging;
        charger.status = data.status || (isNowCharging ? 'Charging' : 'Online');

        if (isNowCharging) {
            if (data.sessionData && data.sessionData.startTime) {
                charger.startTime = new Date(data.sessionData.startTime);
            }
        } else {
            // Reset charger metrics on stop
            charger.startTime = null;
            charger.sessionEnergy = 0;
            charger.power = 0;
            charger.current = 0;
        }

        if (chargerId === selectedChargerId) {
            isCharging = charger.isCharging;
            chargingStartTime = charger.startTime;

            const btn = document.getElementById('main-btn');
            const wave = document.getElementById('wave-fill');

            if (isNowCharging) {
                btn.innerText = "Stop Charging";
                btn.classList.add('active');
                wave.style.transform = "translateY(20%)";
                wave.style.opacity = "0.8";
                updateStatusUI('Charging');
                if (!chargingTimer) startChargingTimer();
            } else {
                btn.innerText = "Start Charging";
                btn.classList.remove('active');
                wave.style.transform = "translateY(80%)";
                wave.style.opacity = "0.3";
                updateStatusUI(data.status || 'Online');
                stopChargingTimer();
                // Reset UI values
                document.getElementById('energy-val').innerText = '0.000';
                document.getElementById('charging-time').innerText = '0h 0m';
                document.getElementById('power-val').innerText = '0';
                document.getElementById('current-val').innerText = '0.00';
                document.getElementById('power-big').innerText = '0.00';
                document.getElementById('voltage-val').innerText = '0';
            }
        }
        renderChargerListUI();
    }

    // 2. METER VALUES update
    if (data.type === 'meter') {
        charger.voltage = data.voltage || 0;
        charger.current = data.current || 0;
        charger.power = data.power || 0;
        // Sync session energy from server if available
        if (data.sessionEnergy !== undefined) {
            charger.sessionEnergy = data.sessionEnergy;
        }

        if (chargerId === selectedChargerId) {
            if (document.getElementById('voltage-val')) document.getElementById('voltage-val').innerText = charger.voltage || 0;
            if (document.getElementById('current-val')) document.getElementById('current-val').innerText = (charger.current || 0).toFixed(2);
            if (document.getElementById('power-val')) document.getElementById('power-val').innerText = (charger.power || 0).toFixed(0);

            const powerKw = (charger.power / 1000).toFixed(2);
            if (document.getElementById('power-big')) document.getElementById('power-big').innerText = powerKw;

            if (document.getElementById('energy-val')) {
                document.getElementById('energy-val').innerText = (charger.sessionEnergy || 0).toFixed(3);
            }
        }
        renderChargerListUI();
    }
};

// UI Update Helpers
function updateStatusUI(status) {
    const statusEl = document.getElementById('list-status'); // This might move to detail status
    const gaugeStatusText = document.getElementById('gauge-status-text');

    let label = status;
    let color = '#6b7280';

    if (status === 'Online' || status === 'Charging') {
        color = '#10b981';
        if (status === 'Online') label = 'Online';
        if (status === 'Charging') label = 'Charging';
    } else if (status === 'Preparing') {
        label = 'Waiting for Connection';
        color = '#3b82f6';
    } else if (status === 'Stopping') {
        label = 'Stopping...';
        color = '#f59e0b';
    } else if (status === 'Offline') {
        label = 'Offline';
        color = '#ef4444';
    }

    if (gaugeStatusText) {
        gaugeStatusText.innerText = label;
        gaugeStatusText.style.color = color;
    }
}

function updateChargerDataFromList(chargers) {
    chargers.forEach(c => {
        if (!chargersData[c.id]) {
            chargersData[c.id] = {
                ...c,
                voltage: c.voltage || 0,
                current: c.current || 0,
                power: c.power || 0,
                sessionEnergy: c.sessionEnergy || 0,
                startTime: c.startTime ? new Date(c.startTime) : null
            };
        } else {
            // Update metrics from server list
            chargersData[c.id].voltage = c.voltage !== undefined ? c.voltage : chargersData[c.id].voltage;
            chargersData[c.id].current = c.current !== undefined ? c.current : chargersData[c.id].current;
            chargersData[c.id].power = c.power !== undefined ? c.power : chargersData[c.id].power;
            chargersData[c.id].sessionEnergy = c.sessionEnergy !== undefined ? c.sessionEnergy : chargersData[c.id].sessionEnergy;
            chargersData[c.id].startTime = c.startTime ? new Date(c.startTime) : chargersData[c.id].startTime;

            // Merge other properties
            Object.assign(chargersData[c.id], {
                status: c.status,
                isCharging: c.isCharging,
                activeTimer: c.activeTimer,
                timerSetAt: c.timerSetAt,
                currentFault: c.currentFault !== undefined ? c.currentFault : chargersData[c.id].currentFault,
                faultHistory: c.faultHistory !== undefined ? c.faultHistory : chargersData[c.id].faultHistory
            });

            // If this charger is currently displayed in detail view, refresh its fault banner
            if (c.id === selectedChargerId) {
                updateDashboardFaultBanner(chargersData[c.id].currentFault);
            }
        }

        // If server says it's charging, ensure local state reflects it
        if (c.status === 'Charging') {
            chargersData[c.id].isCharging = true;
        }

        if (c.id === selectedChargerId) {
            updateStatusUI(c.status);
        }

        // Restore persistent timer if it exists and we haven't already
        if (c.activeTimer && (!chargersData[c.id].activeTimerCalculated)) {
            chargersData[c.id].scheduledEndTime = new Date(c.activeTimer.endTime);
            chargersData[c.id].activeTimerCalculated = true;
            if (c.id === selectedChargerId) {
                activeChargingTimer = c.activeTimer;
                scheduledEndTime = chargersData[c.id].scheduledEndTime;
                updateTimerStatus();
                startTimerCheck();
            }
        } else if (!c.activeTimer) {
            chargersData[c.id].scheduledEndTime = null;
            chargersData[c.id].activeTimerCalculated = false;
            if (c.id === selectedChargerId) {
                activeChargingTimer = null;
                scheduledEndTime = null;
            }
        }
    });

    // NEW: Auto-select first charger if nothing is selected
    if (!selectedChargerId && Object.keys(chargersData).length > 0) {
        const firstId = Object.keys(chargersData)[0];
        console.log(`🎯 Auto-selecting charger: ${firstId}`);
        selectedChargerId = firstId;
        historyChargerId = firstId;

        // If we already have DLB data for this charger, update the UI now
        const charger = chargersData[selectedChargerId];
        if (charger && charger.dlbData) {
            updateDLBUI(selectedChargerId, charger.dlbData);
        }

        // NEW: Also pull freshest data from API
        fetchDLBStatus();
    }



    checkDLBVisibility();
    renderChargerListUI();

    // Auto-switch to list view if we were in empty state and now have chargers
    if (Object.keys(chargersData).length > 0 && document.getElementById('emptyState').style.display !== 'none') {
        goToScreen('list');
    }
}


function renderChargerListUI() {
    const container = document.getElementById('charger-list-container');
    if (!container) return;

    const chargers = Object.values(chargersData);
    if (chargers.length === 0) {
        container.innerHTML = `<div class="empty-text" style="text-align:center; padding: 40px; color: #9ca3af;">Searching for chargers...</div>`;
        return;
    }

    // Remove empty text if present
    const emptyText = container.querySelector('.empty-text');
    if (emptyText) emptyText.remove();

    chargers.forEach(charger => {
        // Support local deletion (hiding)
        const deletedChargers = JSON.parse(localStorage.getItem('deletedChargers') || '[]');
        if (deletedChargers.includes(charger.id)) {
            const existing = document.getElementById(`card-${charger.id}`);
            if (existing) existing.remove();
            return;
        }

        const savedNames = JSON.parse(localStorage.getItem('chargerNames') || '{}');
        const displayName = savedNames[charger.id] || charger.id;

        const isOnline = charger.status === 'Online' || charger.status === 'Charging' || charger.status === 'Preparing';
        const statusColor = charger.status === 'Charging' ? '#10b981' : (charger.status === 'Preparing' ? '#3b82f6' : (isOnline ? '#10b981' : '#ef4444'));
        const statusLabel = charger.status === 'Online' ? 'Online' : (charger.status === 'Preparing' ? 'Waiting' : charger.status);

        let card = document.getElementById(`card-${charger.id}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `card-${charger.id}`;
            card.className = 'device-card';
            card.innerHTML = `
                        <div class="device-icon-box" onclick="selectCharger('${charger.id}')">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M13 2L3 14h9v8l10-12h-9z" />
                            </svg>
                        </div>
                        <div class="device-info" onclick="selectCharger('${charger.id}')">
                            <h3 class="card-name"></h3>
                            <p>ID: <span>${charger.id}</span></p>
                            <div class="status-badge">
                                <span class="card-status"></span>
                            </div>
                            <div class="fault-badge-container" style="display: none; margin-top: 4px;">
                                <span class="fault-badge" style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: white;">⚠️ FAULT</span>
                            </div>
                        </div>
                        <div class="menu-dots" onclick="event.stopPropagation(); toggleCardMenu('${charger.id}')">•••</div>
                        <div id="menu-${charger.id}" class="dropdown-menu">
                            <div class="dropdown-item" onclick="event.stopPropagation(); renameCharger('${charger.id}')">Rename</div>
                            <div class="dropdown-item text-red" onclick="event.stopPropagation(); deleteCharger('${charger.id}')">Delete</div>
                        </div>
                    `;
            container.appendChild(card);
        }

        // Update styles and content efficiently
        card.style.borderColor = (selectedChargerId === charger.id) ? '#10b981' : 'rgba(255, 255, 255, 0.5)';

        const icon = card.querySelector('.icon');
        icon.setAttribute('class', `icon ${charger.isCharging ? 'icon-green' : 'icon-blue'}`);

        card.querySelector('.card-name').innerText = displayName;

        const statusSpan = card.querySelector('.card-status');
        statusSpan.innerText = statusLabel;
        statusSpan.style.color = statusColor;

        const faultBadge = card.querySelector('.fault-badge-container');
        if (charger.currentFault) {
            faultBadge.style.display = 'block';
            const badgeSpan = faultBadge.querySelector('.fault-badge');

            // Set badge color based on severity
            const severity = charger.currentFault.severity || 'critical';
            if (severity === 'critical') badgeSpan.style.background = '#ef4444';
            else if (severity === 'warning') badgeSpan.style.background = '#f59e0b';
            else badgeSpan.style.background = '#3b82f6';

            statusSpan.style.color = (severity === 'critical') ? '#ef4444' : (severity === 'warning' ? '#f59e0b' : '#3b82f6');
        } else {
            faultBadge.style.display = 'none';
        }
    });

    // Cleanup cards for chargers that no longer exist
    const currentIds = chargers.map(c => `card-${c.id}`);
    const allCards = container.querySelectorAll('.device-card');
    allCards.forEach(c => {
        if (!currentIds.includes(c.id)) c.remove();
    });
}


function toggleCardMenu(chargerId) {
    const menu = document.getElementById(`menu-${chargerId}`);
    const allMenus = document.querySelectorAll('.dropdown-menu');
    allMenus.forEach(m => { if (m !== menu) m.style.display = 'none'; });

    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

// Close menus when clicking anywhere else
window.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
});

function renameCharger(chargerId) {
    const savedNames = JSON.parse(localStorage.getItem('chargerNames') || '{}');
    const currentName = savedNames[chargerId] || chargerId;
    const newName = prompt("Rename Charger:", currentName);
    if (newName && newName.trim()) {
        savedNames[chargerId] = newName.trim();
        localStorage.setItem('chargerNames', JSON.stringify(savedNames));
        renderChargerListUI();
        if (selectedChargerId === chargerId) {
            document.getElementById('detail-title').innerText = newName.trim();
        }
    }
}

function deleteCharger(chargerId) {
    if (confirm(`Are you sure you want to hide charger ${chargerId}?`)) {
        const deletedChargers = JSON.parse(localStorage.getItem('deletedChargers') || '[]');
        if (!deletedChargers.includes(chargerId)) {
            deletedChargers.push(chargerId);
            localStorage.setItem('deletedChargers', JSON.stringify(deletedChargers));
        }
        renderChargerListUI();
        if (selectedChargerId === chargerId) goToScreen('list');
    }
}

function selectCharger(chargerId) {
    selectedChargerId = chargerId;
    const charger = chargersData[chargerId];
    if (!charger) return;

    // Update Detail Header with Custom Name
    const savedNames = JSON.parse(localStorage.getItem('chargerNames') || '{}');
    document.getElementById('detail-title').innerText = savedNames[chargerId] || chargerId;

    // Update Metrics instantly
    if (document.getElementById('voltage-val')) document.getElementById('voltage-val').innerText = charger.voltage || 0;
    if (document.getElementById('current-val')) document.getElementById('current-val').innerText = (charger.current || 0).toFixed(2);
    if (document.getElementById('power-val')) document.getElementById('power-val').innerText = (charger.power || 0).toFixed(0);
    const powerKw = (charger.power / 1000).toFixed(2);
    if (document.getElementById('power-big')) document.getElementById('power-big').innerText = powerKw;
    if (document.getElementById('energy-val')) document.getElementById('energy-val').innerText = (charger.sessionEnergy || 0).toFixed(3);

    // Update UI components
    updateStatusUI(charger.status);
    updateDashboardFaultBanner(charger.currentFault);

    // Restore local charging state variables
    isCharging = charger.isCharging;
    chargingStartTime = charger.startTime;

    // Sync Button and gauge
    const btn = document.getElementById('main-btn');
    const wave = document.getElementById('wave-fill');
    const timerBtn = document.querySelector('.timer-btn');
    const isOffline = charger.status === 'Offline';

    if (isOffline) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.innerText = 'Charger Offline';
        wave.style.filter = 'grayscale(1)';
        if (timerBtn) timerBtn.style.display = 'none';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        wave.style.filter = 'none';
        if (timerBtn) timerBtn.style.display = 'block';

        if (isCharging) {
            btn.innerText = "Stop Charging";
            btn.classList.add('active');
            wave.style.transform = "translateY(20%)";
            wave.style.opacity = "0.8";
            startChargingTimer(); // Always restart so it picks up correct chargingStartTime
        } else {
            btn.innerText = "Start Charging";
            btn.classList.remove('active');
            wave.style.transform = "translateY(80%)";
            wave.style.opacity = "0.3";

            // Show final time if we have a start time
            updateTimeDisplay(charger.startTime);
            stopChargingTimer();
        }
    }

    activeChargingTimer = charger.activeTimer;
    scheduledEndTime = charger.scheduledEndTime;
    updateTimerStatus();
    if (activeChargingTimer && !timerCheckInterval) startTimerCheck();

    // Setup History context
    historyChargerId = chargerId;

    // Load charger-specific DLB modes
    if (charger.dlbModes) {
        updateDLBModeToggles(charger.dlbModes);
    }

    // Refresh DLB UI if we have data
    if (charger.dlbData) {
        updateDLBUI(chargerId, charger.dlbData);
    }

    // Always fetch latest DLB status from API to be sure
    fetchDLBStatus();

    // Load charger-specific settings (if on settings screen)
    const currentScreen = document.getElementById('settingView').style.display;
    if (currentScreen === 'block') {
        loadChargerSettings();
    }

    // Screen Navigation
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('listView').style.display = 'none';
    document.getElementById('detailView').style.display = 'block';
}


// --- HISTORY VIEW FUNCTIONS ---
let currentViewType = 'month'; // 'month' or 'year'
let currentPeriod = '2026-01'; // YYYY-MM or YYYY

function switchView(viewType, event) {
    currentViewType = viewType;

    // Update toggle buttons
    document.querySelectorAll('.toggle-opt').forEach(opt => opt.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback for code calls - find by text
        document.querySelectorAll('.toggle-opt').forEach(opt => {
            if (opt.innerText.toLowerCase().includes(viewType)) opt.classList.add('active');
        });
    }

    // Update label and picker type
    const label = document.getElementById('usage-label');
    const picker = document.getElementById('periodPicker');

    if (viewType === 'month') {
        label.innerText = 'Total Monthly Usage';
        picker.type = 'month';
        currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
    } else {
        label.innerText = 'Total Yearly Usage';
        picker.type = 'number';
        picker.min = '2020';
        picker.max = '2030';
        currentPeriod = new Date().getFullYear().toString(); // YYYY
    }

    updateHistoryData(currentPeriod);
}

function openPicker() {
    const picker = document.getElementById('periodPicker');
    picker.showPicker ? picker.showPicker() : picker.click();
}

function changePeriod(step) {
    if (currentViewType === 'month') {
        // Change month
        let date = new Date(currentPeriod + "-01");
        date.setMonth(date.getMonth() + step);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        currentPeriod = `${year}-${month}`;
    } else {
        // Change year
        let year = parseInt(currentPeriod);
        year += step;
        currentPeriod = year.toString();
    }

    document.getElementById('periodPicker').value = currentPeriod;
    updateHistoryData(currentPeriod);
}

async function updateHistoryData(period) {
    currentPeriod = period;
    document.getElementById('displayPeriod').innerText = period;

    try {
        // Fetch real data from API with chargerId filter
        let url = `/api/history?period=${period}&type=${currentViewType}`;
        if (historyChargerId) {
            url += `&chargerId=${historyChargerId}`;
        }
        const response = await fetch(url);
        const data = await response.json();

        // Update total
        document.getElementById('totalUsage').innerText = data.totalEnergy + " kW·h";

        // Sort chart data by label (day or month) if it's not sorted
        const sortedChartData = [...data.chartData].sort((a, b) => a.label - b.label);

        // Render chart
        renderChart(sortedChartData, currentViewType);

        // Render daily list
        renderDailyList(sortedChartData, currentViewType, period);
    } catch (error) {
        console.error('Error fetching history:', error);
        document.getElementById('totalUsage').innerText = "0.00 kW·h";
        renderChart([], currentViewType);
        const listContainer = document.getElementById('daily-usage-list');
        if (listContainer) listContainer.innerHTML = '';
    }
}

async function renderDailyList(chartData, viewType, period) {
    const container = document.getElementById('daily-usage-list');
    if (!container) return;

    container.innerHTML = '';

    // Only show detailed list for monthly view
    if (viewType !== 'month') {
        container.parentElement.style.display = 'none';
        return;
    }

    container.parentElement.style.display = 'block';

    if (!historyChargerId) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px;">No charger selected</div>';
        return;
    }

    // Show loading state
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px;">Loading sessions...</div>';

    try {
        // Fetch all sessions for this charger and period
        const response = await fetch(`/api/history/download?chargerId=${historyChargerId}`);
        const sessions = await response.json();

        if (sessions.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px;">No charging sessions found</div>';
            return;
        }

        // Group sessions by date
        const sessionsByDate = {};
        sessions.forEach(session => {
            const date = session.date; // e.g., "2026-02-11"
            if (!sessionsByDate[date]) {
                sessionsByDate[date] = [];
            }
            sessionsByDate[date].push(session);
        });

        // Filter for current period and sort by date (descending)
        const [year, month] = period.split('-').map(Number);
        const periodPrefix = `${year}-${String(month).padStart(2, '0')}`;

        const datesInPeriod = Object.keys(sessionsByDate)
            .filter(date => date.startsWith(periodPrefix))
            .sort((a, b) => b.localeCompare(a)); // Descending order

        if (datesInPeriod.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px;">No sessions in this month</div>';
            return;
        }

        container.innerHTML = '';

        // Render each day with its sessions
        datesInPeriod.forEach(dateStr => {
            const daySessions = sessionsByDate[dateStr];
            const totalDayEnergy = daySessions.reduce((sum, s) => sum + parseFloat(s.energy), 0);

            const date = new Date(dateStr + 'T00:00:00');
            const day = date.getDate();
            const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            // Create day container
            const dayContainer = document.createElement('div');
            dayContainer.style.marginBottom = '20px';
            dayContainer.style.padding = '16px';
            dayContainer.style.background = '#f9fafb';
            dayContainer.style.borderRadius = '12px';
            dayContainer.style.border = '1px solid #e5e7eb';

            // Day header
            const dayHeader = document.createElement('div');
            dayHeader.style.display = 'flex';
            dayHeader.style.justifyContent = 'space-between';
            dayHeader.style.alignItems = 'center';
            dayHeader.style.marginBottom = '12px';
            dayHeader.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 16px;">${day}</div>
                    <div>
                        <div style="font-weight: 600; color: #1f2937; font-size: 15px;">${formattedDate}</div>
                        <div style="font-size: 13px; color: #6b7280;">${weekday}</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: #667eea; font-size: 16px;">${totalDayEnergy.toFixed(2)} kWh</div>
                    <div style="font-size: 12px; color: #6b7280;">${daySessions.length} session${daySessions.length > 1 ? 's' : ''}</div>
                </div>
            `;
            dayContainer.appendChild(dayHeader);

            // Sessions list
            daySessions.forEach((session, index) => {
                const sessionItem = document.createElement('div');
                sessionItem.style.padding = '10px 12px';
                sessionItem.style.background = 'white';
                sessionItem.style.borderRadius = '8px';
                sessionItem.style.marginBottom = index < daySessions.length - 1 ? '8px' : '0';
                sessionItem.style.border = '1px solid #e5e7eb';
                sessionItem.style.display = 'flex';
                sessionItem.style.justifyContent = 'space-between';
                sessionItem.style.alignItems = 'center';

                sessionItem.innerHTML = `
                    <div style="flex: 1; margin-right: 12px;">
                        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; background: rgba(16, 185, 129, 0.08); padding: 2px 6px; border-radius: 4px; color: #10b981; font-weight: 700; font-size: 11px; border: 1px solid rgba(16, 185, 129, 0.1); white-space: nowrap;">
                                <span style="margin-right: 2px;">⚡</span>${session.startTime}
                            </div>
                            <span style="color: #9ca3af; font-size: 11px;">→</span>
                            <div style="display: flex; align-items: center; background: rgba(239, 68, 68, 0.08); padding: 2px 6px; border-radius: 4px; color: #ef4444; font-weight: 700; font-size: 11px; border: 1px solid rgba(239, 68, 68, 0.1); white-space: nowrap;">
                                <span style="margin-right: 2px;">⏹</span>${session.endTime}
                            </div>
                        </div>
                        <div style="font-size: 12px; color: #9ca3af; font-weight: 500;">
                            Duration: <span style="color: #6b7280; font-weight: 600;">${session.duration} min</span>
                        </div>
                    </div>
                    <div style="text-align: right; min-width: 70px;">
                        <div style="font-size: 16px; font-weight: 800; color: #1f2937;">
                            ${parseFloat(session.energy).toFixed(2)}
                        </div>
                        <div style="font-size: 10px; color: #9ca3af; font-weight: 700; text-transform: uppercase; margin-top: -2px;">kWh</div>
                    </div>
                `;

                dayContainer.appendChild(sessionItem);
            });

            container.appendChild(dayContainer);
        });

    } catch (error) {
        console.error('Error fetching sessions:', error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 14px;">Failed to load sessions</div>';
    }
}

function renderChart(chartData, viewType) {
    const container = document.getElementById('chart-container');
    container.innerHTML = '';

    if (chartData.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af; font-size: 14px;">No data available for this period</div>';
        return;
    }

    if (viewType === 'month') {
        // Improved Single Row Column Graph for Month
        container.style.flexDirection = 'row';
        container.style.gap = '8px';
        container.style.height = '200px';
        container.style.padding = '20px 0 30px 0';
        container.style.overflowX = 'auto';
        container.style.justifyContent = 'flex-start';
        container.style.alignItems = 'flex-end';
        container.style.borderBottom = 'none';

        // Get days in month
        const [year, month] = currentPeriod.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const maxEnergy = Math.max(...chartData.map(d => parseFloat(d.energy)), 0.1);

        for (let i = 1; i <= daysInMonth; i++) {
            const dataPoint = chartData.find(d => d.label === i);
            const energy = dataPoint ? parseFloat(dataPoint.energy) : 0;
            const height = energy > 0 ? Math.max((energy / maxEnergy) * 100, 5) : 0;

            const barGroup = document.createElement('div');
            barGroup.className = 'bar-group';
            barGroup.style.width = '32px';
            barGroup.style.minWidth = '32px';
            barGroup.style.height = '100%';
            barGroup.style.display = 'flex';
            barGroup.style.flexDirection = 'column';
            barGroup.style.justifyContent = 'flex-end';
            barGroup.style.alignItems = 'center';
            barGroup.style.flex = '0 0 auto';

            const bar = document.createElement('div');
            bar.className = energy > 0 ? 'bar highlight' : 'bar';
            bar.style.height = '0%'; // Start at 0 for animation
            bar.style.width = '14px';
            bar.style.borderRadius = '6px 6px 0 0';
            bar.style.flexShrink = '0';
            bar.title = `Day ${i}: ${energy} kWh`;

            const label = document.createElement('span');
            label.className = 'bar-label';
            label.innerText = i;
            label.style.fontSize = '10px';
            label.style.marginTop = '8px';
            label.style.fontWeight = '600';
            label.style.color = '#9ca3af';

            barGroup.appendChild(bar);
            barGroup.appendChild(label);
            container.appendChild(barGroup);

            // Animate bars
            setTimeout(() => {
                bar.style.height = height + '%';
            }, 50 * (i % 10)); // Staggered animation
        }
    } else {
        // Year View (Monthly distribution)
        container.style.flexDirection = 'row';
        container.style.gap = '5px';
        container.style.height = '180px';
        container.style.overflowX = 'hidden';
        container.style.justifyContent = 'space-around';
        container.style.padding = '0 10px';
        container.style.borderBottom = '2px solid rgba(102, 126, 234, 0.2)';

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const maxEnergyYear = Math.max(...chartData.map(d => parseFloat(d.energy)), 1);

        for (let i = 1; i <= 12; i++) {
            const dataPoint = chartData.find(d => d.label === i);
            const energy = dataPoint ? parseFloat(dataPoint.energy) : 0;
            const height = energy > 0 ? Math.max((energy / maxEnergyYear) * 100, 5) : 0;

            const barGroup = document.createElement('div');
            barGroup.className = 'bar-group';
            barGroup.style.width = 'auto';
            barGroup.style.height = '100%';
            barGroup.style.display = 'flex';
            barGroup.style.flexDirection = 'column';
            barGroup.style.justifyContent = 'flex-end';
            barGroup.style.alignItems = 'center';

            const bar = document.createElement('div');
            bar.className = energy > 0 ? 'bar highlight' : 'bar';
            bar.style.height = height + '%';
            bar.style.width = '20px';
            bar.style.borderRadius = '10px 10px 0 0';
            bar.title = `${months[i - 1]}: ${energy} kWh`;

            const label = document.createElement('span');
            label.className = 'bar-label';
            label.innerText = months[i - 1];
            label.style.marginTop = '8px';

            barGroup.appendChild(bar);
            barGroup.appendChild(label);
            container.appendChild(barGroup);
        }
    }
}

// --- OTHER FUNCTIONS ---

// Function to update charging timer display
function startChargingTimer() {
    // Clear any existing timer
    if (chargingTimer) {
        clearInterval(chargingTimer);
    }

    // ✅ Immediately show correct elapsed time (don't wait 1s for first tick)
    if (chargingStartTime) {
        const now = new Date();
        const elapsed = Math.floor((now - chargingStartTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        document.getElementById('charging-time').innerText = `${hours}h ${minutes}m`;
    }

    chargingTimer = setInterval(() => {
        if (chargingStartTime) {
            const now = new Date();
            const elapsed = Math.floor((now - chargingStartTime) / 1000); // seconds
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);

            // Update elapsed time display
            let timeDisplay = `${hours}h ${minutes}m`;

            // If there's an active charging timer, also show countdown
            if (activeChargingTimer && activeChargingTimer.mode === 'duration' && scheduledEndTime) {
                const remaining = Math.max(0, Math.floor((scheduledEndTime - now) / 1000 / 60));
                timeDisplay = `${hours}h ${minutes}m (${remaining} min left)`;
            }

            document.getElementById('charging-time').innerText = timeDisplay;
        }
    }, 1000); // Update every second
}

function updateTimeDisplay(startTime) {
    if (startTime) {
        const now = new Date();
        const elapsed = Math.floor((now - startTime) / 1000); // seconds
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        document.getElementById('charging-time').innerText = `${hours}h ${minutes}m`;
    } else {
        document.getElementById('charging-time').innerText = '0h 0m';
    }
}

function stopChargingTimer() {
    if (chargingTimer) {
        clearInterval(chargingTimer);
        chargingTimer = null;
    }
    // Note: We no longer clear chargingStartTime here
    // chargingStartTime = null; 
}

function toggleCharging() {
    if (!selectedChargerId) {
        alert("Please select a charger from the list first!");
        goToScreen('list');
        return;
    }

    const btn = document.getElementById('main-btn');
    const statusText = document.getElementById('gauge-status-text');
    const wave = document.getElementById('wave-fill');

    if (!isCharging) {
        console.log(`🚀 Starting charger: ${selectedChargerId}`);
        ws.send(JSON.stringify({
            action: "START",
            chargerId: selectedChargerId
        }));

        isCharging = true;
        const charger = chargersData[selectedChargerId];
        if (charger) {
            charger.isCharging = true;
            charger.startTime = new Date();
            charger.sessionEnergy = 0; // Reset energy for new session
            charger.lastMeterTime = null;
        }
        chargingStartTime = charger ? charger.startTime : new Date();

        btn.innerText = "Stop Charging"; btn.classList.add('active');
        statusText.innerText = "Charging"; statusText.style.color = "#10b981";
        wave.style.transform = "translateY(20%)"; wave.style.opacity = "0.8";

        startChargingTimer(); // Start timer immediately

        if (!activeChargingTimer) {
            scheduledEndTime = null;
            if (timerCheckInterval) {
                clearInterval(timerCheckInterval);
                timerCheckInterval = null;
            }
        }
    } else {
        console.log(`🛑 Stopping charger: ${selectedChargerId}`);
        ws.send(JSON.stringify({
            action: "STOP",
            chargerId: selectedChargerId
        }));

        isCharging = false;
        const charger = chargersData[selectedChargerId];
        if (charger) {
            charger.isCharging = false;
            charger.activeTimer = null;
            charger.scheduledEndTime = null;
            charger.activeTimerCalculated = false;
            charger.startTime = null;
            charger.sessionEnergy = 0;
        }

        btn.innerText = "Start Charging"; btn.classList.remove('active');
        statusText.innerText = "Stopping..."; statusText.style.color = "#6b7280";
        wave.style.transform = "translateY(100%)";

        // Reset UI values immediately
        document.getElementById('voltage-val').innerText = '0';
        document.getElementById('current-val').innerText = '0.00';
        document.getElementById('power-val').innerText = '0';
        document.getElementById('power-big').innerText = '0.00';
        document.getElementById('energy-val').innerText = '0.000';
        document.getElementById('charging-time').innerText = '0h 0m';

        if (chargingTimer) {
            clearInterval(chargingTimer);
            chargingTimer = null;
        }
        chargingStartTime = null;

        if (activeChargingTimer) {
            cancelTimer();
        }
    }
}

// --- TIMER FUNCTIONS ---

let currentTimerMode = 'duration';
let activeChargingTimer = null;
let timerCheckInterval = null;
let scheduledEndTime = null;

function openTimerModal() {
    document.getElementById('timer-modal-overlay').classList.add('active');
    updateTimerStatus();
}

function closeTimerModal() {
    document.getElementById('timer-modal-overlay').classList.remove('active');
}

function switchTimerMode(mode) {
    currentTimerMode = mode;

    // Update toggle buttons
    document.getElementById('mode-duration').classList.toggle('active', mode === 'duration');
    document.getElementById('mode-schedule').classList.toggle('active', mode === 'schedule');

    // Update sections
    document.getElementById('duration-section').classList.toggle('active', mode === 'duration');
    document.getElementById('schedule-section').classList.toggle('active', mode === 'schedule');
}

function setTimer() {
    if (!selectedChargerId) {
        alert("Please select a charger first");
        return;
    }

    if (currentTimerMode === 'duration') {
        const minutes = parseInt(document.getElementById('duration-input').value);
        if (!minutes || minutes < 1) {
            alert('Please enter a valid duration in minutes');
            return;
        }

        // Calculate end time
        scheduledEndTime = new Date();
        scheduledEndTime.setMinutes(scheduledEndTime.getMinutes() + minutes);

        activeChargingTimer = {
            mode: 'duration',
            duration: minutes,
            endTime: scheduledEndTime.toISOString()
        };

        // Store in local data
        if (chargersData[selectedChargerId]) {
            chargersData[selectedChargerId].activeTimer = activeChargingTimer;
            chargersData[selectedChargerId].scheduledEndTime = scheduledEndTime;
            chargersData[selectedChargerId].activeTimerCalculated = true;
        }

        // Send to server for persistence
        ws.send(JSON.stringify({
            action: "SET_TIMER",
            chargerId: selectedChargerId,
            timer: activeChargingTimer
        }));

        // Start charging immediately
        if (!isCharging) {
            toggleCharging();
        }

        startTimerCheck();
        updateTimerStatus();
        closeTimerModal();

        console.log(`⏱ Timer set for ${selectedChargerId}: ${minutes} minutes`);
    } else {
        const startTime = document.getElementById('start-time-input').value;
        const endTime = document.getElementById('end-time-input').value;

        if (!startTime || !endTime) {
            alert('Please set both start and end times');
            return;
        }

        activeChargingTimer = {
            mode: 'schedule',
            startTime: startTime,
            endTime: endTime
        };

        // Store in local data
        if (chargersData[selectedChargerId]) {
            chargersData[selectedChargerId].activeTimer = activeChargingTimer;
        }

        // Send to server for persistence
        ws.send(JSON.stringify({
            action: "SET_TIMER",
            chargerId: selectedChargerId,
            timer: activeChargingTimer
        }));

        startTimerCheck();
        updateTimerStatus();
        closeTimerModal();

        console.log(`⏱ Schedule set for ${selectedChargerId}: ${startTime} to ${endTime}`);
    }
}

function cancelTimer() {
    if (!selectedChargerId) return;

    activeChargingTimer = null;
    scheduledEndTime = null;

    if (chargersData[selectedChargerId]) {
        chargersData[selectedChargerId].activeTimer = null;
        chargersData[selectedChargerId].scheduledEndTime = null;
        chargersData[selectedChargerId].activeTimerCalculated = false;
    }

    // Send to server
    ws.send(JSON.stringify({
        action: "CANCEL_TIMER",
        chargerId: selectedChargerId
    }));

    if (timerCheckInterval) {
        clearInterval(timerCheckInterval);
        timerCheckInterval = null;
    }

    updateTimerStatus();
    console.log(`⏱ Timer cancelled for ${selectedChargerId}`);
}

function startTimerCheck() {
    // Clear any existing interval
    if (timerCheckInterval) {
        clearInterval(timerCheckInterval);
    }

    // Check every 10 seconds
    timerCheckInterval = setInterval(checkChargingTimer, 10000);
}

function checkChargingTimer() {
    if (!activeChargingTimer) return;

    const now = new Date();

    if (activeChargingTimer.mode === 'duration') {
        // Check if duration has elapsed
        if (now >= scheduledEndTime) {
            console.log('⏱ Duration timer completed - stopping charging');
            if (isCharging) {
                toggleCharging();
            }
            cancelTimer();
        }
    } else if (activeChargingTimer.mode === 'schedule') {
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const startTime = activeChargingTimer.startTime;
        const endTime = activeChargingTimer.endTime;

        // Check if it's time to start
        if (!isCharging && currentTime === startTime) {
            console.log('⏱ Schedule timer: starting charging');
            toggleCharging();
        }

        // Check if it's time to stop
        if (isCharging && currentTime === endTime) {
            console.log('⏱ Schedule timer: stopping charging');
            toggleCharging();
            cancelTimer();
        }
    }

    updateTimerStatus();
}

function updateTimerStatus() {
    const statusDiv = document.getElementById('timer-status');
    const statusText = document.getElementById('timer-status-text');

    if (!activeChargingTimer) {
        statusDiv.style.display = 'none';
        return;
    }

    statusDiv.style.display = 'block';

    if (activeChargingTimer.mode === 'duration') {
        const now = new Date();
        const remaining = Math.max(0, Math.floor((scheduledEndTime - now) / 1000 / 60));
        statusText.innerText = `Active: ${remaining} minutes remaining`;
    } else {
        statusText.innerText = `Active: ${activeChargingTimer.startTime} to ${activeChargingTimer.endTime}`;
    }
}

// --- DLB FUNCTIONS ---
async function fetchDLBStatus() {
    if (!selectedChargerId) return;
    try {
        const response = await fetch(`/api/dlb/status?chargerId=${selectedChargerId}`);
        const data = await response.json();
        updateDLBUI(selectedChargerId, data, data.config);
        updateDLBModeToggles(data.config);

        // Populate fuse rating and badge
        const fuseInput = document.getElementById('fuse-rating-input');
        const fuseDisplay = document.getElementById('fuse-rating-display');
        if (data.mainFuseAmps) {
            if (fuseInput) fuseInput.value = data.mainFuseAmps;
            if (fuseDisplay) {
                fuseDisplay.innerText = `${data.mainFuseAmps}A`;
                fuseDisplay.style.display = data.config && data.config.antiOverload ? 'inline-block' : 'none';
            }
        }
    } catch (error) {
        console.error('Error fetching DLB status:', error);
    }
}

async function updateFuseRating() {
    if (!selectedChargerId) return;
    const fuseInput = document.getElementById('fuse-rating-input');
    const statusEl = document.getElementById('fuse-rating-status');
    if (!fuseInput) return;

    const value = parseInt(fuseInput.value);
    if (isNaN(value) || value < 6 || value > 200) {
        if (statusEl) { statusEl.innerText = '⚠️ Enter a value between 6–200A'; statusEl.style.color = '#f59e0b'; }
        return;
    }

    try {
        const response = await fetch('/api/settings/charger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chargerId: selectedChargerId, settings: { mainFuseAmps: value } })
        });
        const result = await response.json();
        if (result.success) {
            if (chargersData[selectedChargerId] && chargersData[selectedChargerId].settings) {
                chargersData[selectedChargerId].settings.mainFuseAmps = value;
            }
            // Update the badge and close edit
            const fuseDisplay = document.getElementById('fuse-rating-display');
            if (fuseDisplay) fuseDisplay.innerText = `${value}A`;
            showFuseDisplayMode();
            console.log(`✅ Fuse rating updated to ${value}A for ${selectedChargerId}`);
        }
    } catch (error) {
        console.error('Error saving fuse rating:', error);
        if (statusEl) { statusEl.innerText = '❌ Save failed'; statusEl.style.color = '#ef4444'; }
    }
}

function checkDLBVisibility() {
    const overlay = document.getElementById('dlb-offline-overlay');
    const content = document.getElementById('dlb-content');

    if (!selectedChargerId) {
        if (content) content.style.display = 'none';
        if (overlay) {
            overlay.style.display = 'block';
            overlay.querySelector('h3').innerText = "No Charger Selected";
            overlay.querySelector('p').innerText = "Please select a charger from the Device List to view its DLB site data.";
        }
        return;
    }

    const charger = chargersData[selectedChargerId];
    const isOnline = charger && charger.status !== 'Offline' && charger.status !== 'Unknown';

    if (!isOnline) {
        if (content) content.style.display = 'none';
        if (overlay) {
            overlay.style.display = 'block';
            overlay.querySelector('h3').innerText = "Charger Offline";
            overlay.querySelector('p').innerText = "This charger is currently offline. DLB data is unavailable until it reconnects.";
        }
    } else {
        if (content) content.style.display = 'block';
        if (overlay) overlay.style.display = 'none';
    }
}

// ── Fuse rating display / edit helpers ──────────────────────────────────────
function showFuseDisplayMode() {
    const editRow = document.getElementById('fuse-edit-row');
    if (editRow) editRow.style.display = 'none';
}

function showFuseEditMode() {
    const editRow = document.getElementById('fuse-edit-row');
    if (editRow) editRow.style.display = 'flex';
    const fuseInput = document.getElementById('fuse-rating-input');
    if (fuseInput) { fuseInput.focus(); fuseInput.select(); }
}

function openFuseEdit() { showFuseEditMode(); }
function closeFuseEdit() { showFuseDisplayMode(); }



function updateDLBUI(chargerId, dlbData, modes) {
    // Save data to local cache
    if (chargersData[chargerId]) {
        chargersData[chargerId].dlbData = dlbData;
    }

    // Only update UI if it's the selected charger
    if (chargerId !== selectedChargerId) return;

    checkDLBVisibility();
    // Don't update values if overlay is showing
    if (document.getElementById('dlb-offline-overlay').style.display === 'block') return;

    // Update power values
    if (document.getElementById('dlb-grid-power')) {
        document.getElementById('dlb-grid-power').innerText = (dlbData.gridPower / 1000).toFixed(2) + 'kW';
    }
    if (document.getElementById('dlb-pv-power')) {
        document.getElementById('dlb-pv-power').innerText = (dlbData.pvPower / 1000).toFixed(2) + 'kW';
    }
    if (document.getElementById('dlb-home-power')) {
        document.getElementById('dlb-home-power').innerText = (dlbData.homeLoad / 1000).toFixed(2) + 'kW';
    }
    if (document.getElementById('dlb-charger-power')) {
        document.getElementById('dlb-charger-power').innerText = (dlbData.totalChargerLoad / 1000).toFixed(2) + 'kW';
    }

    // Sync Flow Dots visibility
    // Grid: Show correct direction based on import/export
    if (document.getElementById('dot-grid-import') && document.getElementById('dot-grid-export')) {
        const isImporting = dlbData.gridPower > 100;  // Positive = importing from grid
        const isExporting = dlbData.gridPower < -100; // Negative = exporting to grid

        document.getElementById('dot-grid-import').classList.toggle('active', isImporting);
        document.getElementById('dot-grid-export').classList.toggle('active', isExporting);
    }
    if (document.getElementById('dot-pv')) {
        document.getElementById('dot-pv').classList.toggle('active', dlbData.pvPower > 100);
    }
    if (document.getElementById('dot-charger')) {
        document.getElementById('dot-charger').classList.toggle('active', dlbData.totalChargerLoad > 100);
    }
    if (document.getElementById('dot-home')) {
        document.getElementById('dot-home').classList.toggle('active', dlbData.homeLoad > 100);
    }
}


function updateDLBModeToggles(modes) {
    if (modes.pvDynamicBalance !== undefined && document.getElementById('dlb-pv-balance')) {
        document.getElementById('dlb-pv-balance').checked = modes.pvDynamicBalance;
    }
    if (modes.extremeMode !== undefined && document.getElementById('dlb-extreme-mode')) {
        document.getElementById('dlb-extreme-mode').checked = modes.extremeMode;
    }
    if (modes.nightFullSpeed !== undefined && document.getElementById('dlb-night-mode')) {
        document.getElementById('dlb-night-mode').checked = modes.nightFullSpeed;
    }
    const antiOverloadEl = document.getElementById('dlb-anti-overload');
    if (antiOverloadEl) {
        antiOverloadEl.checked = !!modes.antiOverload;
        antiOverloadEl.disabled = false; // User-controlled
    }
    // Show/hide the badge and close edit when Anti Overload is toggled
    const fuseDisplay = document.getElementById('fuse-rating-display');
    const fuseEditRow = document.getElementById('fuse-edit-row');
    if (fuseDisplay) fuseDisplay.style.display = modes.antiOverload ? 'inline-block' : 'none';
    if (fuseEditRow && !modes.antiOverload) fuseEditRow.style.display = 'none';
}

async function updateDLBMode(modeName, value) {
    if (!selectedChargerId) {
        console.error('No charger selected');
        return;
    }

    const EXCLUSIVE = ['pvDynamicBalance', 'extremeMode', 'nightFullSpeed'];

    // Preserve current antiOverload state; only change it if that's the toggle being flipped
    const currentModes = chargersData[selectedChargerId]?.dlbModes || {};
    const modes = {
        antiOverload: modeName === 'antiOverload' ? value : !!currentModes.antiOverload
    };

    if (EXCLUSIVE.includes(modeName)) {
        // Mutually exclusive: enabling one disables the other two
        EXCLUSIVE.forEach(m => { modes[m] = (m === modeName) ? value : false; });
        if (!value) modes[modeName] = false;
    } else if (modeName !== 'antiOverload') {
        modes[modeName] = value;
    }

    // Immediately update UI
    updateDLBModeToggles({ ...currentModes, ...modes });
    if (chargersData[selectedChargerId]) {
        Object.assign(chargersData[selectedChargerId].dlbModes, modes);
    }

    try {
        const response = await fetch('/api/dlb/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chargerId: selectedChargerId, modes })
        });

        const result = await response.json();
        if (result.success) {
            console.log(`✅ DLB modes updated for ${selectedChargerId}:`, result.modes);
            if (chargersData[selectedChargerId]) {
                Object.assign(chargersData[selectedChargerId].dlbModes, result.modes);
            }
            updateDLBModeToggles(result.modes);
        }
    } catch (error) {
        console.error('Error updating DLB mode:', error);
    }
}

// --- POWER LIMIT SETTINGS FUNCTIONS ---
function updatePowerLimitDisplay(value) {
    // Clamp value between 6 and 32
    value = Math.max(6, Math.min(32, parseInt(value)));

    // Update modal display
    document.getElementById('power-limit-display').innerText = value;
    // Update settings page display
    if (document.getElementById('power-limit-display-value')) {
        document.getElementById('power-limit-display-value').innerText = value + 'A';
    }
    // Sync slider and input
    document.getElementById('power-limit-slider').value = value;
    document.getElementById('power-limit-input').value = value;
}

function updatePowerLimitFromInput(value) {
    // Validate and update
    if (value >= 6 && value <= 32) {
        updatePowerLimitDisplay(value);
    }
}

async function loadChargerPowerLimit() {
    if (!selectedChargerId) {
        console.log('No charger selected, using default power limit (32A)');
        updatePowerLimitDisplay(32);
        return;
    }

    try {
        const response = await fetch(`/api/settings/power-limit?chargerId=${selectedChargerId}`);
        const data = await response.json();
        if (data.maxChargeAmps) {
            updatePowerLimitDisplay(data.maxChargeAmps);
            // Update local charger data
            if (chargersData[selectedChargerId]) {
                chargersData[selectedChargerId].maxChargeAmps = data.maxChargeAmps;
            }
        }
    } catch (error) {
        console.log('Using default power limit (32A)');
        updatePowerLimitDisplay(32);
    }
}

async function savePowerLimit() {
    if (!selectedChargerId) {
        console.error('No charger selected');
        return;
    }

    const value = parseInt(document.getElementById('power-limit-slider').value);
    const statusDiv = document.getElementById('power-limit-status');

    try {
        const response = await fetch('/api/settings/power-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                maxChargeAmps: value
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update local charger data
            if (chargersData[selectedChargerId]) {
                chargersData[selectedChargerId].maxChargeAmps = value;
            }

            statusDiv.style.display = 'block';
            statusDiv.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))';
            statusDiv.style.color = '#10b981';
            statusDiv.style.border = '2px solid rgba(16, 185, 129, 0.3)';
            statusDiv.innerText = `✅ Power limit saved: ${value}A for ${selectedChargerId}`;

            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        } else {
            throw new Error(result.error || 'Failed to save');
        }
    } catch (error) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1))';
        statusDiv.style.color = '#ef4444';
        statusDiv.style.border = '2px solid rgba(239, 68, 68, 0.3)';
        statusDiv.innerText = `❌ Error: ${error.message}`;
    }
}

// Load power limit when settings screen is opened
const originalGoToScreen = goToScreen;
goToScreen = function (screenName) {
    originalGoToScreen(screenName);
    if (screenName === 'setting') {
        loadChargerSettings();
    } else if (screenName === 'history') {
        loadHistoryChargers();
    }
};

// --- CHARGER SETTINGS FUNCTIONS ---
async function loadChargerSettings() {
    if (!selectedChargerId) {
        console.log('No charger selected, using default settings');
        setDefaultSettings();
        return;
    }

    try {
        const response = await fetch(`/api/settings/charger?chargerId=${selectedChargerId}`);
        const data = await response.json();

        // Load power limit
        if (data.maxChargeAmps) {
            updatePowerLimitDisplay(data.maxChargeAmps);
        }

        // Load toggle settings
        if (data.settings) {
            updateSettingsToggles(data.settings);
            // Update local charger data
            if (chargersData[selectedChargerId]) {
                chargersData[selectedChargerId].settings = data.settings;
            }
        }
    } catch (error) {
        console.log('Using default settings');
        setDefaultSettings();
    }
}

function setDefaultSettings() {
    updatePowerLimitDisplay(32);
    updateSettingsToggles({
        groundingDetection: true,
        emergencyStop: true,
        plugAndPlay: false,
        autoResumeAfterPowerLoss: true,
        chargingCompatibility: false,
        spotTariffEnabled: false,
        peakRate: 8.50,
        offPeakRate: 4.20,
        peakHours: '6-10,18-22',
        ledBrightness: 80,
        firmwareVersion: 'v1.2.3'
    });
}

function updateSettingsToggles(settings) {
    document.getElementById('setting-grounding').checked = settings.groundingDetection;
    document.getElementById('setting-emergency').checked = settings.emergencyStop;
    document.getElementById('setting-plug-play').checked = settings.plugAndPlay;
    document.getElementById('setting-auto-resume').checked = settings.autoResumeAfterPowerLoss;
    document.getElementById('setting-compatibility').checked = settings.chargingCompatibility;
}

async function saveChargerSetting(settingKey, value) {
    if (!selectedChargerId) {
        console.error('No charger selected');
        return;
    }

    try {
        const settings = {};
        settings[settingKey] = value;

        const response = await fetch('/api/settings/charger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                settings: settings
            })
        });

        const result = await response.json();
        if (result.success) {
            // Update local charger data
            if (chargersData[selectedChargerId]) {
                chargersData[selectedChargerId].settings = { ...chargersData[selectedChargerId].settings, ...settings };
            }
            console.log(`✅ Setting saved: ${settingKey} = ${value} for ${selectedChargerId}`);
        } else {
            throw new Error(result.error || 'Failed to save setting');
        }
    } catch (error) {
        console.error(`❌ Error saving setting ${settingKey}:`, error.message);
        // Revert the toggle
        loadChargerSettings();
    }
}

// --- HISTORY FUNCTIONS ---
async function loadHistoryChargers() {
    const chargerListDiv = document.getElementById('history-charger-list');
    chargerListDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">Loading chargers...</div>';

    try {
        // Get list of unique chargers from database
        const response = await fetch('/api/history/chargers');
        const chargers = await response.json();

        if (chargers.length === 0) {
            chargerListDiv.innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">No charging history found</div>';
            return;
        }

        chargerListDiv.innerHTML = chargers.map(charger => `
                    <div onclick="selectHistoryCharger('${charger.chargerId}')"
                         style="padding: 20px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
                                border-radius: 12px; cursor: pointer; border: 2px solid rgba(102, 126, 234, 0.2);
                                transition: all 0.3s ease;">
                        <div style="font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 8px;">
                            ${charger.chargerId}
                        </div>
                        <div style="font-size: 14px; color: #6b7280;">
                            ${charger.sessionCount} sessions • ${charger.totalEnergy.toFixed(2)} kWh total
                        </div>
                    </div>
                `).join('');
    } catch (error) {
        console.error('Error loading chargers:', error);
        chargerListDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Error loading chargers</div>';
    }
}

async function selectHistoryCharger(chargerId) {
    document.getElementById('history-charger-selection').style.display = 'none';
    document.getElementById('history-session-list').style.display = 'block';
    document.getElementById('history-charger-name').innerText = chargerId;

    window.currentHistoryChargerId = chargerId;
    window.currentHistoryPeriod = 'day';
    await loadChargingSessions(chargerId);
}

function showChargerSelection() {
    document.getElementById('history-charger-selection').style.display = 'block';
    document.getElementById('history-session-list').style.display = 'none';
}

async function changeHistoryPeriod(period) {
    window.currentHistoryPeriod = period;

    // Update button styles
    ['day', 'week', 'month'].forEach(p => {
        const btn = document.getElementById(`period-${p}`);
        if (p === period) {
            btn.style.background = '#667eea';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#e5e7eb';
            btn.style.color = '#6b7280';
        }
    });

    await loadChargingSessions(window.currentHistoryChargerId);
}

async function loadChargingSessions(chargerId) {
    const container = document.getElementById('history-sessions-container');
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">Loading sessions...</div>';

    try {
        const response = await fetch(`/api/history/download?chargerId=${chargerId}`);
        const sessions = await response.json();

        if (sessions.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">No sessions found</div>';
            document.getElementById('history-chart').innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">No data to display</div>';
            return;
        }

        // Calculate total energy
        const totalEnergy = sessions.reduce((sum, s) => sum + (s.energy || 0), 0);
        document.getElementById('history-total-energy').innerText = totalEnergy.toFixed(2);

        // Render chart based on period
        renderHistoryChart(sessions, window.currentHistoryPeriod || 'day');

        // Display sessions
        container.innerHTML = sessions.map(session => `
                    <div style="padding: 16px; background: #f9fafb; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e5e7eb;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div style="font-size: 16px; font-weight: 700; color: #1f2937;">
                                ${session.date}
                            </div>
                            <div style="font-size: 18px; font-weight: 800; background: linear-gradient(135deg, #667eea, #764ba2);
                                        -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                                ${session.energy.toFixed(2)} kWh
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 13px; color: #6b7280;">
                            <div>
                                <div style="font-weight: 600;">Start</div>
                                <div>${session.startTime}</div>
                            </div>
                            <div>
                                <div style="font-weight: 600;">End</div>
                                <div>${session.endTime}</div>
                            </div>
                            <div>
                                <div style="font-weight: 600;">Duration</div>
                                <div>${session.duration} min</div>
                            </div>
                        </div>
                    </div>
                `).join('');
    } catch (error) {
        console.error('Error loading sessions:', error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Error loading sessions</div>';
    }
}

function renderHistoryChart(sessions, period) {
    const chartDiv = document.getElementById('history-chart');

    // Aggregate data by period
    const aggregated = {};
    sessions.forEach(session => {
        const date = new Date(session.date);
        let key;

        if (period === 'day') {
            key = session.date; // Use full date
        } else if (period === 'week') {
            // Get week number
            const weekNum = Math.ceil((date.getDate()) / 7);
            const monthYear = date.toISOString().substring(0, 7);
            key = `${monthYear} W${weekNum}`;
        } else { // month
            key = date.toISOString().substring(0, 7); // YYYY-MM
        }

        aggregated[key] = (aggregated[key] || 0) + (session.energy || 0);
    });

    // Sort keys
    const sortedKeys = Object.keys(aggregated).sort();
    const maxEnergy = Math.max(...Object.values(aggregated));

    // Render bars
    chartDiv.innerHTML = `
                <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 100%; gap: 4px;">
                    ${sortedKeys.map(key => {
        const energy = aggregated[key];
        const height = (energy / maxEnergy) * 100;
        const label = period === 'day' ? key.substring(8, 10) :
            period === 'week' ? key.substring(8) :
                key.substring(5, 7);

        return `
                            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                                <div style="width: 100%; background: linear-gradient(180deg, #667eea, #764ba2); 
                                            border-radius: 8px 8px 0 0; position: relative; height: ${height}%; min-height: 20px;
                                            display: flex; align-items: center; justify-content: center;">
                                    <span style="color: white; font-size: 11px; font-weight: 700; writing-mode: ${height > 30 ? 'horizontal-tb' : 'vertical-rl'};">
                                        ${energy.toFixed(1)}
                                    </span>
                                </div>
                                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">${label}</div>
                            </div>
                        `;
    }).join('')}
                </div>
            `;
}

// DLB Help Modal Functions
function openDLBHelp() {
    document.getElementById('dlb-help-modal').style.display = 'flex';
}


function closeDLBHelp() {
    document.getElementById('dlb-help-modal').style.display = 'none';
}

// Power Limit Modal Functions
function openPowerLimitModal() {
    document.getElementById('power-limit-modal').style.display = 'flex';
    // Load current power limit for selected charger
    loadChargerPowerLimit();
}

function closePowerLimitModal() {
    document.getElementById('power-limit-modal').style.display = 'none';
}

// --- FAULT UI FUNCTIONS ---
function updateDashboardFaultBanner(fault) {
    const banner = document.getElementById('charger-fault-banner');
    const codeSpan = document.getElementById('fault-banner-code');

    if (fault) {
        banner.style.display = 'block';

        // Remove old severity classes
        banner.classList.remove('fault-severity-critical', 'fault-severity-warning', 'fault-severity-info');

        // Add new severity class
        const severity = fault.severity || 'critical';
        banner.classList.add(`fault-severity-${severity}`);

        codeSpan.innerText = `${fault.message || fault.errorCode}`;
    } else {
        banner.style.display = 'none';
    }
}

function openFaultDetails() {
    if (!selectedChargerId || !chargersData[selectedChargerId]) return;

    const charger = chargersData[selectedChargerId];
    const fault = charger.currentFault;
    if (!fault) return;

    document.getElementById('fault-modal-charger-id').innerText = `Charger: ${selectedChargerId}`;
    document.getElementById('fault-modal-code').innerText = fault.errorCode;
    document.getElementById('fault-modal-time').innerText = fault.timestamp;
    document.getElementById('fault-modal-status').innerText = fault.status.toUpperCase();

    // Set status color based on severity in modal
    const statusEl = document.getElementById('fault-modal-status');
    const severity = fault.severity || 'critical';
    if (severity === 'critical') statusEl.style.color = '#ef4444';
    else if (severity === 'warning') statusEl.style.color = '#f59e0b';
    else statusEl.style.color = '#3b82f6';

    const infoText = fault.message ? `${fault.message}.${fault.info ? '\n\n' + fault.info : ''}` : (fault.info || 'No additional information provided by charger.');
    document.getElementById('fault-modal-info').innerText = infoText;

    document.getElementById('fault-details-modal').style.display = 'flex';
}

function closeFaultDetails() {
    document.getElementById('fault-details-modal').style.display = 'none';
}

async function clearChargerFault() {
    if (!selectedChargerId) return;

    if (!confirm('Are you sure you want to clear this fault record? If the hardware issue persists, the charger will report the fault again.')) {
        return;
    }

    try {
        const response = await fetch('/api/faults/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chargerId: selectedChargerId })
        });

        const result = await response.json();
        if (result.success) {
            closeFaultDetails();
            // The server will broadcast 'faultCleared' which will update our local data and UI
        } else {
            alert('Failed to clear fault: ' + result.error);
        }
    } catch (error) {
        console.error('Error clearing fault:', error);
        alert('An error occurred while clearing the fault.');
    }
}

// --- SETTINGS EVENT HANDLERS ---
function onGroundingDetectionChange(checkbox) {
    saveChargerSetting('groundingDetection', checkbox.checked);
}

function onEmergencyStopChange(checkbox) {
    saveChargerSetting('emergencyStop', checkbox.checked);
}

function onPlugAndPlayChange(checkbox) {
    saveChargerSetting('plugAndPlay', checkbox.checked);
}

function onAutoResumeChange(checkbox) {
    saveChargerSetting('autoResumeAfterPowerLoss', checkbox.checked);
}

function onChargingCompatibilityChange(checkbox) {
    saveChargerSetting('chargingCompatibility', checkbox.checked);
}

// --- ADDITIONAL SETTINGS FUNCTIONS ---

// Switch Mode Functions (OCPP to Bluetooth)
function openBluetoothModal() {
    if (!selectedChargerId) {
        alert('Please select a charger first');
        return;
    }

    // Check if charger is currently charging
    const charger = chargersData[selectedChargerId];
    if (charger && charger.isCharging) {
        alert('Cannot switch mode while charging is active. Please stop charging first.');
        return;
    }

    document.getElementById('bluetooth-modal').style.display = 'flex';
}

function closeBluetoothModal() {
    document.getElementById('bluetooth-modal').style.display = 'none';
}

async function switchToBluetoothMode() {
    if (!selectedChargerId) {
        alert('No charger selected');
        return;
    }

    try {
        // Send disconnect command to server
        const response = await fetch('/api/charger/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                reason: 'Switching to Bluetooth mode'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to disconnect charger');
        }

        // Show success message
        alert(`Charger ${selectedChargerId} has been disconnected from OCPP server. You can now connect directly via Bluetooth using your mobile app.`);

        // Update UI to show disconnected state
        if (chargersData[selectedChargerId]) {
            chargersData[selectedChargerId].status = 'Offline';
            updateStatusUI('Offline');
            renderChargerListUI();
        }

        closeBluetoothModal();

    } catch (error) {
        console.error('Switch to Bluetooth mode failed:', error);
        alert('Failed to switch to Bluetooth mode: ' + error.message);
    }
}

// Spot Tariff Functions
function openSpotTariffModal() {
    if (!selectedChargerId) {
        alert('Please select a charger first');
        return;
    }
    document.getElementById('spot-tariff-modal').style.display = 'flex';

    // Load current settings
    const charger = chargersData[selectedChargerId];
    const spotTariffEnabled = charger?.settings?.spotTariffEnabled || false;
    document.getElementById('spot-tariff-enabled').checked = spotTariffEnabled;
    document.getElementById('spot-tariff-config').style.display = spotTariffEnabled ? 'block' : 'none';

    // Load tariff rates
    document.getElementById('peak-rate').value = charger?.settings?.peakRate || 8.50;
    document.getElementById('off-peak-rate').value = charger?.settings?.offPeakRate || 4.20;
    document.getElementById('peak-hours').value = charger?.settings?.peakHours || '6-10,18-22';

    // Update status display
    document.getElementById('spot-tariff-status').textContent = spotTariffEnabled ? 'ON' : 'OFF';
}

function closeSpotTariffModal() {
    document.getElementById('spot-tariff-modal').style.display = 'none';
}

// Toggle spot tariff config visibility
document.addEventListener('change', function (event) {
    if (event.target.id === 'spot-tariff-enabled') {
        document.getElementById('spot-tariff-config').style.display =
            event.target.checked ? 'block' : 'none';
    }
});

async function saveSpotTariff() {
    const enabled = document.getElementById('spot-tariff-enabled').checked;
    const settings = {
        spotTariffEnabled: enabled,
        peakRate: parseFloat(document.getElementById('peak-rate').value),
        offPeakRate: parseFloat(document.getElementById('off-peak-rate').value),
        peakHours: document.getElementById('peak-hours').value
    };

    for (const [key, value] of Object.entries(settings)) {
        await saveChargerSetting(key, value);
    }

    document.getElementById('spot-tariff-status').textContent = enabled ? 'ON' : 'OFF';
    closeSpotTariffModal();
}

// LED Brightness Functions
function openLEDBrightnessModal() {
    if (!selectedChargerId) {
        alert('Please select a charger first');
        return;
    }
    document.getElementById('led-brightness-modal').style.display = 'flex';

    // Load current brightness settings
    const charger = chargersData[selectedChargerId];
    const settings = charger?.settings || {};

    // Day settings (default 80%)
    const dayBrightness = settings.ledBrightnessDay !== undefined ? settings.ledBrightnessDay : 80;
    document.getElementById('day-brightness-slider').value = dayBrightness;
    document.getElementById('day-brightness-display').textContent = dayBrightness + '%';

    // Night settings (default 50%)
    const nightBrightness = settings.ledBrightnessNight !== undefined ? settings.ledBrightnessNight : 50;
    document.getElementById('night-brightness-slider').value = nightBrightness;
    document.getElementById('night-brightness-display').textContent = nightBrightness + '%';

    // Time settings
    document.getElementById('night-start-time').value = settings.ledNightStartTime || '20:00';
    document.getElementById('night-end-time').value = settings.ledNightEndTime || '06:00';

    // Update dashboard display to show current applied brightness
    document.getElementById('led-brightness-value').textContent = (charger?.settings?.currentLEDBrightness || dayBrightness) + '%';
}

function closeLEDBrightnessModal() {
    document.getElementById('led-brightness-modal').style.display = 'none';
}

function updateBrightnessDisplay(mode, value) {
    if (mode === 'day') {
        document.getElementById('day-brightness-display').textContent = value + '%';
    } else {
        document.getElementById('night-brightness-display').textContent = value + '%';
    }
}

async function saveLEDBrightness() {
    const dayBrightness = parseInt(document.getElementById('day-brightness-slider').value);
    const nightBrightness = parseInt(document.getElementById('night-brightness-slider').value);
    const nightStartTime = document.getElementById('night-start-time').value;
    const nightEndTime = document.getElementById('night-end-time').value;

    const settings = {
        ledBrightnessDay: dayBrightness,
        ledBrightnessNight: nightBrightness,
        ledNightStartTime: nightStartTime,
        ledNightEndTime: nightEndTime
    };

    // Save all settings at once
    for (const [key, value] of Object.entries(settings)) {
        await saveChargerSetting(key, value);
    }

    // Update local display immediately (will be overwritten by server response later)
    document.getElementById('led-brightness-value').textContent = 'Updating...'; // Show updating state

    closeLEDBrightnessModal();
}

// --- RFID BIND MODAL ---
function openRFIDBindModal() {
    if (!selectedChargerId) {
        alert('Please select a charger first');
        return;
    }
    document.getElementById('rfid-bind-modal').style.display = 'flex';
    showRFIDListView(); // Reset to list view
    loadRFIDTags(selectedChargerId);
}

function closeRFIDBindModal() {
    document.getElementById('rfid-bind-modal').style.display = 'none';
}

function showAddRFIDView() {
    document.getElementById('rfid-list-view').style.display = 'none';
    document.getElementById('rfid-add-view').style.display = 'block';
    document.getElementById('new-rfid-input').value = '';
    document.getElementById('new-rfid-input').focus();
}

function showRFIDListView() {
    document.getElementById('rfid-add-view').style.display = 'none';
    document.getElementById('rfid-list-view').style.display = 'block';
}

async function loadRFIDTags(chargerId) {
    const listContainer = document.getElementById('rfid-tags-list');
    listContainer.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">Loading tags...</div>';

    try {
        // Always fetch fresh from server so any device (phone/laptop) sees the latest list
        const response = await fetch(`/api/settings/charger?chargerId=${chargerId}`);
        const data = await response.json();
        const whitelist = data.settings?.rfidWhitelist || [];

        // Sync into local cache
        if (chargersData[chargerId]) {
            if (!chargersData[chargerId].settings) chargersData[chargerId].settings = {};
            chargersData[chargerId].settings.rfidWhitelist = whitelist;
        }

        // Update the count in the settings list
        const countEl = document.getElementById('rfid-bind-count');
        if (countEl) countEl.textContent = `${whitelist.length} Tags`;

        renderRFIDList(whitelist);
    } catch (error) {
        console.error('Error loading RFID tags:', error);
        listContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 20px;">Error loading tags</div>';
    }
}

function renderRFIDList(tags) {
    const listContainer = document.getElementById('rfid-tags-list');
    listContainer.innerHTML = '';

    if (!tags || tags.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #9ca3af; background: #f9fafb; border-radius: 8px; border: 1px dashed #d1d5db;">
                <div style="font-size: 24px; margin-bottom: 8px;">📇</div>
                <div>No RFID tags bound</div>
                <div style="font-size: 12px; margin-top: 4px;">Add a card to allow access</div>
            </div>
        `;
        return;
    }

    tags.forEach(tag => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);';
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; background: #ecfdf5; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #10b981;">
                    <svg viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                        <path fill="currentColor" d="M4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M4,6V18H20V6H4M12,12A2,2 0 0,1 14,14A2,2 0 0,1 12,16A2,2 0 0,1 10,14A2,2 0 0,1 12,12Z" />
                    </svg>
                </div>
                <div style="font-weight: 600; font-family: monospace; letter-spacing: 1px; color: #374151;">${tag}</div>
            </div>
            <button onclick="deleteRFIDTag('${tag}')" style="padding: 6px; background: transparent; border: none; color: #ef4444; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: opacity 0.2s;">
                <svg viewBox="0 0 24 24" style="width: 20px; height: 20px;">
                    <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                </svg>
            </button>
        `;

        // Add hover effect for delete button
        const btn = item.querySelector('button');
        btn.onmouseover = () => { btn.style.background = '#fee2e2'; btn.style.opacity = '1'; };
        btn.onmouseout = () => { btn.style.background = 'transparent'; btn.style.opacity = '0.7'; };

        listContainer.appendChild(item);
    });
}

async function saveNewRFID() {
    const input = document.getElementById('new-rfid-input');
    const tag = input.value.trim().toUpperCase();

    if (!tag) {
        alert('Please enter an RFID code');
        return;
    }

    // Basic validation (alphanumeric)
    if (!/^[A-Z0-9]+$/.test(tag)) {
        alert('Invalid format. Use only alphanumeric characters (A-Z, 0-9).');
        return;
    }

    try {
        const response = await fetch('/api/settings/rfid/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                tag: tag
            })
        });

        if (response.ok) {
            const data = await response.json();
            // Update local cache
            if (chargersData[selectedChargerId] && chargersData[selectedChargerId].settings) {
                chargersData[selectedChargerId].settings.rfidWhitelist = data.whitelist;
            }

            // Refresh list
            renderRFIDList(data.whitelist);
            showRFIDListView();

            // Update count in background
            const countEl = document.getElementById('rfid-bind-count');
            if (countEl) countEl.textContent = `${data.whitelist.length} Tags`;
        } else {
            alert('Failed to add RFID tag');
        }
    } catch (error) {
        console.error('Error adding RFID tag:', error);
        alert('Error connecting to server');
    }
}

async function deleteRFIDTag(tag) {
    if (!confirm(`Are you sure you want to delete RFID tag "${tag}"?`)) {
        return;
    }

    try {
        const response = await fetch('/api/settings/rfid/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                tag: tag
            })
        });

        if (response.ok) {
            const data = await response.json();
            // Update local cache
            if (chargersData[selectedChargerId] && chargersData[selectedChargerId].settings) {
                chargersData[selectedChargerId].settings.rfidWhitelist = data.whitelist;
            }

            // Refresh list
            renderRFIDList(data.whitelist);

            // Update count in background
            const countEl = document.getElementById('rfid-bind-count');
            if (countEl) countEl.textContent = `${data.whitelist.length} Tags`;
        } else {
            alert('Failed to delete RFID tag');
        }
    } catch (error) {
        console.error('Error deleting RFID tag:', error);
        alert('Error connecting to server');
    }
}

// Firmware Auto-Download Functions
let selectedFirmwareVersion = null;

async function openFirmwareUpgradeModal() {
    if (!selectedChargerId) {
        alert('Please select a charger first');
        return;
    }
    document.getElementById('firmware-upgrade-modal').style.display = 'flex';

    // Load current firmware version
    const charger = chargersData[selectedChargerId];
    const version = charger?.settings?.firmwareVersion || charger?.info?.firmwareVersion || 'v1.2.3';
    document.getElementById('current-firmware-version').textContent = version;

    // Reset state
    document.getElementById('firmware-versions-container').style.display = 'none';
    document.getElementById('selected-firmware-info').style.display = 'none';
    document.getElementById('firmware-progress').style.display = 'none';
    document.getElementById('firmware-upgrade-btn').disabled = true;
    selectedFirmwareVersion = null;

    // Load firmware repositories
    await loadFirmwareRepositories();
}

function closeFirmwareUpgradeModal() {
    document.getElementById('firmware-upgrade-modal').style.display = 'none';
}

async function loadFirmwareRepositories() {
    try {
        const response = await fetch('/api/firmware/repositories');
        const repositories = await response.json();

        const select = document.getElementById('firmware-repository');
        select.innerHTML = '<option value="">Select a repository...</option>';

        repositories.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.id;
            option.textContent = `${repo.name} (${repo.versions.length} versions)`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Failed to load firmware repositories:', error);
        document.getElementById('firmware-repository').innerHTML = '<option value="">Failed to load repositories</option>';
    }
}

async function loadFirmwareVersions() {
    const repositoryId = document.getElementById('firmware-repository').value;
    if (!repositoryId) {
        document.getElementById('firmware-versions-container').style.display = 'none';
        return;
    }

    try {
        const response = await fetch('/api/firmware/repositories');
        const repositories = await response.json();
        const repository = repositories.find(r => r.id === repositoryId);

        if (!repository) return;

        const container = document.getElementById('firmware-versions-list');
        container.innerHTML = '';

        repository.versions.forEach(version => {
            const versionCard = document.createElement('div');
            versionCard.className = 'firmware-version-card';
            versionCard.style.cssText = `
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: all 0.2s;
            `;

            versionCard.innerHTML = `
                <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${version.version}</div>
                <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">${version.changelog}</div>
                <div style="font-size: 12px; color: #9ca3af;">
                    ${version.size} • ${version.releaseDate}
                    ${version.channel === 'beta' ? ' • <span style="color: #f59e0b; font-weight: 600;">BETA</span>' : ''}
                </div>
            `;

            versionCard.onclick = () => selectFirmwareVersion(version, versionCard);
            container.appendChild(versionCard);
        });

        document.getElementById('firmware-versions-container').style.display = 'block';

    } catch (error) {
        console.error('Failed to load firmware versions:', error);
    }
}

function selectFirmwareVersion(version, cardElement) {
    // Clear previous selection
    document.querySelectorAll('.firmware-version-card').forEach(card => {
        card.style.borderColor = '#e5e7eb';
        card.style.backgroundColor = 'white';
    });

    // Highlight selected
    cardElement.style.borderColor = '#8b5cf6';
    cardElement.style.backgroundColor = '#f3f4f6';

    // Store selection
    selectedFirmwareVersion = version;

    // Show selected version info
    document.getElementById('selected-firmware-version').textContent = version.version;
    document.getElementById('selected-firmware-changelog').textContent = version.changelog;
    document.getElementById('selected-firmware-size').textContent = version.size;
    document.getElementById('selected-firmware-date').textContent = `Released ${version.releaseDate}`;
    document.getElementById('selected-firmware-info').style.display = 'block';

    // Enable upgrade button
    document.getElementById('firmware-upgrade-btn').disabled = false;
}

async function startAutoFirmwareUpdate() {
    if (!selectedFirmwareVersion) {
        alert('Please select a firmware version first');
        return;
    }

    if (!confirm(`Are you sure you want to upgrade to ${selectedFirmwareVersion.version}? The charger will automatically download and install the firmware.`)) {
        return;
    }

    // Show progress
    document.getElementById('firmware-progress').style.display = 'block';
    document.getElementById('firmware-upgrade-btn').disabled = true;
    document.getElementById('firmware-upgrade-btn').textContent = 'Starting Update...';

    try {
        // Send UpdateFirmware command via OCPP
        const response = await fetch('/api/firmware/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                version: selectedFirmwareVersion.version,
                url: selectedFirmwareVersion.downloadUrl
            })
        });

        if (!response.ok) {
            throw new Error('Failed to initiate firmware update');
        }

        // Start progress simulation
        let progress = 0;
        let progressStep = 'Sending update command...';

        document.getElementById('firmware-progress-text').textContent = progressStep;
        document.getElementById('firmware-upgrade-btn').textContent = 'Update in Progress...';

        const updateProgress = () => {
            if (progress < 30) {
                progressStep = 'Charger downloading firmware...';
                progress += Math.random() * 5;
            } else if (progress < 60) {
                progressStep = 'Validating firmware file...';
                progress += Math.random() * 3;
            } else if (progress < 90) {
                progressStep = 'Installing firmware...';
                progress += Math.random() * 2;
            } else if (progress < 100) {
                progressStep = 'Finalizing installation...';
                progress += 1;
            } else {
                progressStep = 'Update complete! Charger restarting...';
                progress = 100;
                setTimeout(() => {
                    alert('Firmware auto-update completed successfully! The charger is restarting with the new firmware.');
                    closeFirmwareUpgradeModal();
                    document.getElementById('firmware-upgrade-btn').disabled = false;
                    document.getElementById('firmware-upgrade-btn').textContent = 'Start Auto-Update';
                }, 2000);
                return;
            }

            document.getElementById('firmware-progress-bar').style.width = progress + '%';
            document.getElementById('firmware-progress-text').textContent = progressStep;

            setTimeout(updateProgress, 800 + Math.random() * 1200);
        };

        updateProgress();

    } catch (error) {
        console.error('Firmware update failed:', error);
        alert('Failed to start firmware update: ' + error.message);
        document.getElementById('firmware-progress').style.display = 'none';
        document.getElementById('firmware-upgrade-btn').disabled = false;
        document.getElementById('firmware-upgrade-btn').textContent = 'Start Auto-Update';
    }
}

// Enhanced settings saving with additional settings support
async function saveChargerSetting(settingKey, settingValue) {
    if (!selectedChargerId) {
        console.error('No charger selected');
        return;
    }

    try {
        const response = await fetch('/api/settings/charger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chargerId: selectedChargerId,
                settings: { [settingKey]: settingValue }
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update local charger data
            if (chargersData[selectedChargerId]) {
                if (!chargersData[selectedChargerId].settings) {
                    chargersData[selectedChargerId].settings = {};
                }
                chargersData[selectedChargerId].settings[settingKey] = settingValue;
            }
            console.log(`✅ Setting saved: ${settingKey} = ${settingValue} for ${selectedChargerId}`);
        } else {
            throw new Error(result.error || 'Failed to save setting');
        }
    } catch (error) {
        console.error('Error saving setting:', error);
        alert(`Error saving setting: ${error.message}`);
    }
}

// Load charger settings when charger is selected
async function loadChargerSettings() {
    if (!selectedChargerId) return;

    try {
        const response = await fetch(`/api/settings/charger?chargerId=${selectedChargerId}`);
        const data = await response.json();

        if (data.settings) {
            // Update toggle switches
            updateSettingsToggles(data.settings);

            // Update local charger data
            if (chargersData[selectedChargerId]) {
                chargersData[selectedChargerId].settings = data.settings;
            }
        }
    } catch (error) {
        console.log('Using default settings for charger');
    }
}

// Update settings toggles based on charger data
function updateSettingsToggles(settings) {
    if (!settings) return;

    // Update toggle switches
    if (document.getElementById('setting-grounding'))
        document.getElementById('setting-grounding').checked = settings.groundingDetection !== false;
    if (document.getElementById('setting-emergency'))
        document.getElementById('setting-emergency').checked = settings.emergencyStop !== false;
    if (document.getElementById('setting-plug-play'))
        document.getElementById('setting-plug-play').checked = settings.plugAndPlay === true;
    if (document.getElementById('setting-auto-resume'))
        document.getElementById('setting-auto-resume').checked = settings.autoResumeAfterPowerLoss !== false;
    if (document.getElementById('setting-compatibility'))
        document.getElementById('setting-compatibility').checked = settings.chargingCompatibility === true;
}
