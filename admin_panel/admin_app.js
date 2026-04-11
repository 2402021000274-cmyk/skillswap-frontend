// 🟢 Security Check (Koi direct link kholne ki koshish kare toh rok dega)
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

// 🟢 GET: Saare users ka data backend se lana
async function fetchAllUsers() {
    try {
        const response = await fetch(API_BASE_URL + '/users', {
            headers: { 'ngrok-skip-browser-warning': '69420' } // Render/Ngrok ke liye bypass
        });
        allUsers = await response.json();
        
        // Stats update karna
        document.getElementById('totalUsersCount').innerText = allUsers.length;
        
        let activeSwaps = 0;
        allUsers.forEach(u => {
            if(u.swaps) {
                activeSwaps += u.swaps.filter(s => s.status === 'Active').length;
            }
        });
        // Har swap 2 users me dikhta hai (requester aur provider), isliye 2 se divide kiya
        document.getElementById('totalSwapsCount').innerText = Math.floor(activeSwaps / 2); 
        
        renderUserTable();
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
        tbody.innerHTML = "<tr><td colspan='5' style='text-align: center; color: #94a3b8;'>No registered users found in the database.</td></tr>";
        return;
    }

    allUsers.forEach((user) => {
        let creds = user.credits !== undefined ? user.credits : 5;
        let roleName = user.role === 'teach' ? 'Teacher & Learner' : 'Only Learner';
        
        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 800; color: #fff;">${user.name}</td>
                <td style="color: #cbd5e1;">${user.email}</td>
                <td><span class="badge-role">${roleName}</span></td>
                <td><span class="badge-credits">${creds}</span></td>
                <td>
                    <button class="action-btn edit-btn" onclick="editCredits('${user.email}', ${creds})"><i class="fas fa-coins"></i> Manage Credits</button>
                    <button class="action-btn del-btn" onclick="deleteUser('${user.email}', '${user.name}')"><i class="fas fa-trash-alt"></i> Delete Account</button>
                </td>
            </tr>
        `;
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
                fetchAllUsers(); // Table ko turant refresh karega naye credits dikhane ke liye
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
                fetchAllUsers(); // Table refresh karega
            } else {
                alert("❌ Database Error: Failed to delete user.");
            }
        } catch(err) {
            alert("❌ Connection Error: Unable to reach the server.");
        }
    }
}

// Page load hote hi data fetch karna start karo
fetchAllUsers();