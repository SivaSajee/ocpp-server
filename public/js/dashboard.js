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
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <button class="history-download-btn" onclick="event.stopPropagation(); downloadChargerHistory('${id}', '${displayName}')" title="Download History">
                                <svg viewBox="0 0 24 24" style="width: 20px; height: 20px;">
                                    <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
                                </svg>
                            </button>
                            <div style="color: #10b981; font-weight: 600;">View ></div>
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
                updateDLBModeToggles(data.modes);
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
                    startTime: null
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
                        timerSetAt: c.timerSetAt
                    });
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
                    if (!chargingTimer) startChargingTimer();
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

            // Refresh DLB UI if we have data
            if (charger.dlbData) {
                updateDLBUI(chargerId, charger.dlbData);
            }

            // Always fetch latest DLB status from API to be sure
            fetchDLBStatus();


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

        function renderDailyList(chartData, viewType, period) {
            const container = document.getElementById('daily-usage-list');
            if (!container) return;

            container.innerHTML = '';

            // Only show detailed list for monthly view
            if (viewType !== 'month') {
                container.parentElement.style.display = 'none';
                return;
            }

            container.parentElement.style.display = 'block';

            if (chartData.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px;">No daily records</div>';
                return;
            }

            const maxEnergy = Math.max(...chartData.map(d => parseFloat(d.energy)), 0.1);

            // Get days in month for the given period (YYYY-MM)
            const [year, month] = period.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();

            // Show all days or just those with data? Usually better to show only those with data or reversed list
            // Let's show all days that have energy > 0, sorted by day (descending)
            const activeDays = chartData.filter(d => parseFloat(d.energy) > 0).sort((a, b) => b.label - a.label);

            if (activeDays.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px;">No energy usage recorded this month</div>';
                return;
            }

            activeDays.forEach(dayData => {
                const day = dayData.label;
                const energy = parseFloat(dayData.energy);
                const date = new Date(year, month - 1, day);
                const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                const percentage = (energy / maxEnergy) * 100;

                const item = document.createElement('div');
                item.className = 'daily-item';
                item.innerHTML = `
                    <div class="daily-day-info">
                        <div class="daily-day-circle">${day}</div>
                        <div class="daily-day-text">
                            <span class="daily-date">${dateStr}</span>
                            <span class="daily-weekday">${weekday}</span>
                        </div>
                    </div>
                    <div class="daily-usage-info">
                        <div class="daily-energy">${energy.toFixed(2)} kWh</div>
                        <div class="daily-bar-mini">
                            <div class="daily-bar-fill" style="width: 0%"></div>
                        </div>
                    </div>
                `;
                container.appendChild(item);

                // Trigger animation
                setTimeout(() => {
                    item.querySelector('.daily-bar-fill').style.width = percentage + '%';
                }, 100);
            });
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
            } catch (error) {
                console.error('Error fetching DLB status:', error);
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
            if (modes.antiOverload !== undefined && document.getElementById('dlb-anti-overload')) {
                document.getElementById('dlb-anti-overload').checked = modes.antiOverload;
            }
        }

        async function updateDLBMode(modeName, value) {
            try {
                const update = {};
                update[modeName] = value;

                const response = await fetch('/api/dlb/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(update)
                });

                const result = await response.json();
                if (result.success) {
                    console.log(`DLB Mode ${modeName} updated to ${value}`);
                }
            } catch (error) {
                console.error('Error updating DLB mode:', error);
            }
        }

        // --- POWER LIMIT SETTINGS FUNCTIONS ---
        function updatePowerLimitDisplay(value) {
            // Clamp value between 6 and 32
            value = Math.max(6, Math.min(32, parseInt(value)));

            // Update display
            document.getElementById('power-limit-display').innerText = value;

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

        async function loadPowerLimit() {
            try {
                const response = await fetch('/api/settings/power-limit');
                const data = await response.json();
                if (data.maxChargeAmps) {
                    updatePowerLimitDisplay(data.maxChargeAmps);
                }
            } catch (error) {
                console.log('Using default power limit (32A)');
            }
        }

        async function savePowerLimit() {
            const value = parseInt(document.getElementById('power-limit-slider').value);
            const statusDiv = document.getElementById('power-limit-status');

            try {
                const response = await fetch('/api/settings/power-limit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ maxChargeAmps: value })
                });

                const result = await response.json();

                if (result.success) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))';
                    statusDiv.style.color = '#10b981';
                    statusDiv.style.border = '2px solid rgba(16, 185, 129, 0.3)';
                    statusDiv.innerText = `✅ Power limit saved: ${value}A`;

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
                loadPowerLimit();
            } else if (screenName === 'history') {
                loadHistoryChargers();
            }
        };

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
