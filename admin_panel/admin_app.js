// 🟢 Security Check
if(sessionStorage.getItem('isAdminLoggedIn') !== 'true') {
    window.location.href = "admin_login.html";
}

// 🟢 Secure Logout
function adminLogout() {
    if(confirm("Are you sure you want to securely logout?")) {
        sessionStorage.removeItem('isAdminLoggedIn');
        window.location.href = "admin_login.html";
    }
}

let allUsers = [];

// 🟢 Fetch initial status of the toggle
async function fetchMaintenanceStatus() {
    try {
        const res = await fetch(API_BASE_URL + '/admin/maintenance-status', { headers: { 'ngrok-skip-browser-warning': '69420' }});
        const data = await res.json();
        document.getElementById('maintenanceToggle').checked = data.isMaintenance;
    } catch(e) { console.error("Error fetching maintenance status"); }
}

// 🟢 GET: Saare users ka data backend se lana
async function fetchAllUsers() {
    try {
        const response = await fetch(API_BASE_URL + '/users', {
            headers: { 'ngrok-skip-browser-warning': '69420' } 
        });
        allUsers = await response.json();
        
        // 1. Update Main Stats
        document.getElementById('totalUsersCount').innerText = allUsers.length;
        
        let activeSwaps = 0;
        let totalSystemCredits = 0;
        
        allUsers.forEach(u => {
            if(u.swaps) activeSwaps += u.swaps.filter(s => s.status === 'Active').length;
            totalSystemCredits += (u.credits !== undefined ? u.credits : 5);
        });
        
        document.getElementById('totalSwapsCount').innerText = Math.floor(activeSwaps / 2); 
        document.getElementById('totalCreditsCount').innerText = totalSystemCredits;
        
        // 2. Render Main Table
        renderUserTable();
        
        // 3. Render Newest Users (Sidebar Widget)
        renderNewestUsers();
        
        // 4. Fetch Maintenance Switch Status
        fetchMaintenanceStatus();

        // 5. 🟢 NEW: Render Live Sessions Table
        renderSessionsTable();

    } catch (err) {
        console.error("Error fetching users:", err);
        document.getElementById('userTableBody').innerHTML = "<tr><td colspan='5' style='color:#ef4444; text-align:center;'><i class='fas fa-exclamation-triangle'></i> Failed to connect to Backend Server. Make sure server is running.</td></tr>";
    }
}

// 🟢 DISPLAY: Table ke andar users ko dikhana
function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = "";
    
    if(allUsers.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align: center; color: var(--text-muted);'>No registered users found in the database.</td></tr>";
        return;
    }

    allUsers.forEach((user) => {
        let creds = user.credits !== undefined ? user.credits : 5;
        let roleClass = user.role === 'teach' ? 'badge-role' : 'badge-role learner';
        let roleName = user.role === 'teach' ? 'Teacher & Learner' : 'Only Learner';
        let pic = user.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        
        tbody.innerHTML += `
            <tr class="user-row">
                <td>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${pic}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid var(--border-color);">
                        <span style="font-weight: 800; color: #fff;">${user.name}</span>
                    </div>
                </td>
                <td style="color: #cbd5e1;" class="user-email">${user.email}</td>
                <td><span class="${roleClass}">${roleName}</span></td>
                <td><span class="badge-credits">${creds}</span></td>
                <td>
                    <button class="action-btn edit-btn" onclick="editCredits('${user.email}', ${creds})"><i class="fas fa-coins"></i> Edit Credits</button>
                    <button class="action-btn del-btn" onclick="deleteUser('${user.email}', '${user.name}')"><i class="fas fa-trash-alt"></i> Delete</button>
                </td>
            </tr>
        `;
    });
}

// 🟢 DISPLAY: Newest Users Sidebar Widget
function renderNewestUsers() {
    const list = document.getElementById('newUsersList');
    list.innerHTML = "";
    
    // Reverse array to get newest first, then take top 4
    const newest = [...allUsers].reverse().slice(0, 4);
    
    if(newest.length === 0) {
        list.innerHTML = "<p style='color:var(--text-muted); font-size:13px; text-align:center;'>No users yet.</p>";
        return;
    }

    newest.forEach(user => {
        let pic = user.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        list.innerHTML += `
            <div class="user-item-sm">
                <img src="${pic}" alt="User">
                <div class="details">
                    <h4>${user.name}</h4>
                    <p>${user.email.split('@')[0]}...</p>
                </div>
                <div class="joined-date">New</div>
            </div>
        `;
    });
}

// 🟢 NEW: DISPLAY SESSIONS TABLE
function renderSessionsTable() {
    const tbody = document.getElementById('sessionsTableBody');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    let hasSessions = false;

    allUsers.forEach((user) => {
        if(user.swaps) {
            user.swaps.forEach(swap => {
                // To avoid duplicate rows, we only render from the Provider's perspective
                if(swap.role === 'Provider' && (swap.status === 'Active' || swap.status === 'Pending Confirmation' || swap.status === 'Requested')) {
                    hasSessions = true;
                    let scheduleText = swap.scheduledTime ? new Date(swap.scheduledTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : "<span style='color:#ef4444'>Not Scheduled</span>";
                    
                    let actionBtn = "";
                    if(swap.status === 'Active') {
                        actionBtn = `<button class="action-btn del-btn" style="background:#ef4444; color:white; border:none;" onclick="forceEndSession('${user.email}', '${swap.partnerEmail}', '${swap.skill}', '${swap.topic || ''}')"><i class="fas fa-power-off"></i> Force End</button>`;
                    } else {
                        actionBtn = `<span style="color:var(--text-muted); font-size:12px;">Waiting...</span>`;
                    }
                    
                    tbody.innerHTML += `
                        <tr class="user-row">
                            <td><span style="font-weight: 800; color: #fff;">${swap.skill}</span><br><small style="color: var(--primary-color);">${swap.topic || 'General'}</small></td>
                            <td>${user.name}<br><small style="color: var(--text-muted);">${user.email}</small></td>
                            <td>${swap.partner}<br><small style="color: var(--text-muted);">${swap.partnerEmail}</small></td>
                            <td style="color: #10b981; font-weight:600;">${scheduleText}</td>
                            <td><span class="badge-role" style="${swap.status === 'Active' ? 'background:rgba(16,185,129,0.2); color:#10b981;' : 'background:rgba(245,158,11,0.2); color:#f59e0b;'}">${swap.status}</span></td>
                            <td>${actionBtn}</td>
                        </tr>
                    `;
                }
            });
        }
    });

    if(!hasSessions) {
        tbody.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--text-muted); padding:30px;'>No live or scheduled sessions available.</td></tr>";
    }
}

// 🟢 NEW: ADMIN FORCE END SESSION
async function forceEndSession(providerEmail, requesterEmail, skill, topic) {
    if(confirm(`🚨 ADMIN OVERRIDE 🚨\nAre you sure you want to FORCE END this session? The Mentor will receive 1 credit and the session will be closed for both users.`)) {
        try {
            const res = await fetch(API_BASE_URL + '/admin/force-end-swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                body: JSON.stringify({ providerEmail, requesterEmail, skill, topic })
            });
            if(res.ok) {
                alert("✅ Session forcefully ended and credits transferred!");
                fetchAllUsers();
            } else {
                alert("❌ Failed to end session.");
            }
        } catch(e) {
            alert("❌ Connection Error.");
        }
    }
}


// 🟢 SEARCH FUNCTION (Local filtering for table)
function filterAdminTable() {
    let input = document.getElementById("adminSearch").value.toLowerCase();
    let rows = document.querySelectorAll(".user-row");
    
    rows.forEach(row => {
        let text = row.innerText.toLowerCase();
        if(text.includes(input)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

// 🟢 PUT: Kisi bhi user ke credits change karna (Admin Power)
async function editCredits(email, currentCredits) {
    let newCredits = prompt(`Manage Credits for ${email}\n\nEnter new credit amount:`, currentCredits);
    
    if(newCredits !== null && newCredits.trim() !== "" && !isNaN(newCredits)) {
        try {
            const response = await fetch(`${API_BASE_URL}/update-user/${email}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                body: JSON.stringify({ credits: parseInt(newCredits) })
            });
            if(response.ok) {
                alert("✅ System Update: User credits modified successfully!");
                fetchAllUsers(); 
            } else {
                alert("❌ Database Error: Failed to update credits.");
            }
        } catch(err) {
            alert("❌ Connection Error: Unable to reach the server.");
        }
    }
}

// 🟢 DELETE: Kisi fake user ko database se uda dena (Admin Power)
async function deleteUser(email, name) {
    if(confirm(`🚨 DANGER ZONE 🚨\n\nAre you 100% sure you want to permanently delete '${name}' (${email})?\nThis action cannot be undone!`)) {
        try {
            const response = await fetch(`${API_BASE_URL}/delete-user/${email}`, {
                method: 'DELETE',
                headers: { 'ngrok-skip-browser-warning': '69420' }
            });
            if(response.ok) {
                alert("✅ Target Eliminated: User account deleted successfully!");
                fetchAllUsers(); 
            } else {
                alert("❌ Database Error: Failed to delete user.");
            }
        } catch(err) {
            alert("❌ Connection Error: Unable to reach the server.");
        }
    }
}

// 🟢 REAL MAINTENANCE MODE LOGIC
async function toggleMaintenance() {
    let isChecked = document.getElementById('maintenanceToggle').checked;
    try {
        const res = await fetch(API_BASE_URL + '/admin/toggle-maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify({ isMaintenance: isChecked })
        });
        const data = await res.json();
        
        if(data.isMaintenance) {
            alert("🚧 MAINTENANCE MODE ON: The platform is now locked. All active users are being safely logged out.");
        } else {
            alert("✅ MAINTENANCE MODE OFF: The platform is live again for all users.");
        }
    } catch(err) {
        alert("❌ Error connecting to server. The switch will be reverted.");
        document.getElementById('maintenanceToggle').checked = !isChecked; 
    }
}

// Page load hote hi data fetch karna start karo
fetchAllUsers();
