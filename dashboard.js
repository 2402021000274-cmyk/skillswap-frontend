let editSkillsArray = [];
let editProfilePic = "";
let currentChatPartnerEmail = null;
let currentSearchQuery = ""; 

let lastDiscoverHTML = "";
let lastSwapsHTML = "";
let lastNotisHTML = "";

let notifiedItems = new Set();
let isFirstDataLoad = true;

let isSyncPaused = false;
let cloudUpdateTimeout = null;

// ==========================================
// 🟢 WEBRTC VIDEO CALL VARIABLES (LAG FIX)
// ==========================================
let peerConnection;
let localStream;
let remoteStream;
let incomingCallPartner = null;
let isCalling = false;

// 🟢 FIXED: Multiple STUN servers for better connectivity
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// 🟢 FIXED: Video constraints to prevent Lag (Set to smooth HD instead of heavy 4K)
const mediaConstraints = {
    video: {
        width: { ideal: 640 }, // Keeps it light and fast
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 }
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
};
// ==========================================

const socket = typeof io !== 'undefined' ? io(API_BASE_URL) : null;
if(socket) {
    socket.on('connect', () => {
        let myEmail = sessionStorage.getItem('loggedInUserEmail');
        if(myEmail) { socket.emit('register-user', myEmail); }
    });

    socket.on('receive-msg', (data) => {
        syncWithDatabase(); 
        if (currentChatPartnerEmail !== data.from) {
            let senderName = usersDB.find(u => u.email === data.from)?.name || "User";
            showToast(`💬 Naya message: ${senderName} ne bheja`);
        }
    });

    socket.on('user-status-update', (data) => {
        syncWithDatabase(); 
    });

    socket.on('call-made', async (data) => {
        incomingCallPartner = data.from;
        let callerUser = usersDB.find(u => u.email === data.from);
        document.getElementById('callerNameText').innerText = (callerUser ? callerUser.name : "User") + " is calling...";
        document.getElementById('incomingCallModal').style.display = "flex";
        window.incomingOffer = data.offer;
        try {
            let audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play();
        } catch(e){}
    });

    socket.on('answer-made', async (data) => {
        document.getElementById('callStatusText').innerText = "Connected";
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('call-rejected', () => {
        document.getElementById('callStatusText').innerText = "Call Declined";
        setTimeout(() => endCall(false), 2000);
    });

    socket.on('call-ended', () => {
        endCall(false); 
    });

    socket.on('ice-candidate', async (data) => {
        if(peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch(e) { console.error("Error adding ice candidate", e); }
        }
    });
}

const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
`;
document.head.appendChild(style);

function showToast(message) {
    let toastBox = document.getElementById('toastBox');
    if(!toastBox) {
        toastBox = document.createElement('div');
        toastBox.id = 'toastBox';
        toastBox.style.cssText = "position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px;";
        document.body.appendChild(toastBox);
    }
    let toast = document.createElement('div');
    toast.style.cssText = "background: var(--bg-card); color: var(--text-main); border-left: 4px solid var(--primary-color); padding: 15px 20px; border-radius: 10px; box-shadow: 0 5px 20px rgba(0,0,0,0.15); animation: slideInRight 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; display:flex; align-items:center; gap:12px; font-size: 14px; font-weight: 600;";
    toast.innerHTML = `
        <div style="background:var(--primary-light); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--primary-color);">
            <i class="fas fa-bell"></i>
        </div>
        <span style="flex:1;">${message}</span>
    `;
    toastBox.appendChild(toast);
    
    try {
        let audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play();
    } catch(e){}

    setTimeout(() => {
        toast.style.animation = "slideOutRight 0.3s forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

async function updateCloudUser(userObj) {
    isSyncPaused = true; 
    clearTimeout(cloudUpdateTimeout);
    try {
        await fetch(API_BASE_URL + '/update-user/' + userObj.email, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify(userObj),
            keepalive: true 
        });
    } catch (err) { console.error("Cloud Sync Failed", err); }
    
    cloudUpdateTimeout = setTimeout(() => { isSyncPaused = false; }, 1500);
}

async function syncWithDatabase() {
    if(isSyncPaused) return; 

    try {
        const response = await fetch(API_BASE_URL + '/users', { headers: { "ngrok-skip-browser-warning": "69420" } });
        if (response.ok) {
            const mongoUsers = await response.json();
            localStorage.setItem('skillSwapUsers', JSON.stringify(mongoUsers));
            usersDB = mongoUsers;
            refreshDynamicData(true);
        }
    } catch (error) { console.log("Backend offline. Using LocalStorage.", error); }
}

if (document.getElementById('dashboardWrapper')) {
    syncWithDatabase();
}

setInterval(() => {
    if(document.getElementById('dashboardWrapper') && sessionStorage.getItem('loggedInUserEmail')) {
        syncWithDatabase(); 
    }
}, 2500); 

function setOnlineStatus(status) {
    let email = sessionStorage.getItem('loggedInUserEmail');
    if(email) {
        let db = JSON.parse(localStorage.getItem('skillSwapUsers')) || [];
        let idx = db.findIndex(u => u.email === email);
        if(idx > -1) {
            db[idx].isOnline = status;
            localStorage.setItem('skillSwapUsers', JSON.stringify(db));
            updateCloudUser(db[idx]); 
        }
    }
}
setOnlineStatus(true);
window.addEventListener('beforeunload', () => setOnlineStatus(false)); 

function switchDashView(viewId, element) {
    document.querySelectorAll('#dashboardWrapper .view-section').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    if(element) {
        document.querySelectorAll('.sidebar-menu a').forEach(link => link.classList.remove('active'));
        element.classList.add('active');
    }

    if(viewId === 'view-notifications') {
        const myEmail = sessionStorage.getItem('loggedInUserEmail');
        let db = JSON.parse(localStorage.getItem('skillSwapUsers')) || [];
        const idx = db.findIndex(u => u.email === myEmail);
        if(db[idx].notifications) {
            db[idx].notifications.forEach(n => n.isRead = true); 
            localStorage.setItem('skillSwapUsers', JSON.stringify(db));
            updateCloudUser(db[idx]); 
        }
    }
    refreshDynamicData();
}

function getSkillIcon(skill) {
    let s = skill.toLowerCase();
    if(s.includes('html') || s.includes('css') || s.includes('web')) return "fa-html5";
    if(s.includes('python') || s.includes('java') || s.includes('code')) return "fa-python";
    if(s.includes('design') || s.includes('ui') || s.includes('art')) return "fa-paint-brush";
    if(s.includes('lang') || s.includes('english') || s.includes('speak')) return "fa-language";
    return "fa-laptop-code";
}

function fuzzyMatch(pattern, str) {
    pattern = pattern.toLowerCase().replace(/\s+/g, '');
    str = str.toLowerCase();
    let patternIdx = 0; let strIdx = 0;
    while (patternIdx < pattern.length && strIdx < str.length) {
        if (pattern[patternIdx] === str[strIdx]) { patternIdx++; }
        strIdx++;
    }
    return patternIdx === pattern.length;
}

function refreshDynamicData(isLiveUpdate = false) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    if(!myEmail) return;
    usersDB = JSON.parse(localStorage.getItem('skillSwapUsers')) || []; 
    const me = usersDB.find(u => u.email === myEmail);
    if(!me) { logout(); return; }

    if(me.credits === undefined) me.credits = 5;

    if(me.notifications) {
        if(isFirstDataLoad) {
            me.notifications.forEach(n => notifiedItems.add(n.id || n.text));
            isFirstDataLoad = false;
        } else if (isLiveUpdate) {
            me.notifications.forEach(n => {
                let uid = n.id || n.text;
                if(!notifiedItems.has(uid)) {
                    showToast(n.text);
                    notifiedItems.add(uid);
                }
            });
        } else {
            me.notifications.forEach(n => notifiedItems.add(n.id || n.text));
        }
    }

    if(!isLiveUpdate) {
        document.getElementById('dashUserName').innerText = me.name;
        document.getElementById('dashUserPic').src = me.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        const twoFAToggle = document.getElementById('toggle2FA');
        if(twoFAToggle) twoFAToggle.checked = me.is2FAEnabled || false;
        const publicToggle = document.getElementById('publicProfileToggle');
        if(publicToggle) publicToggle.checked = me.isPublic !== false;

        document.getElementById('statUsers').innerText = usersDB.length;
        document.getElementById('statSwaps').innerText = me.swaps ? me.swaps.length : 0;
        document.getElementById('statCredits').innerText = me.credits; 
    }

    let unreadNotis = me.notifications ? me.notifications.filter(n => !n.isRead) : [];
    const badge = document.getElementById('notiBadge');
    if(unreadNotis.length > 0) {
        badge.style.display = "flex"; badge.innerText = unreadNotis.length;
    } else { badge.style.display = "none"; }

    let newDiscoverHTML = "";
    let foundSkills = false;
    let allSkills = {}; 

    usersDB.forEach(otherUser => {
        if(otherUser.email !== myEmail && otherUser.isPublic !== false) {
            let uSkills = otherUser.skills ? [...otherUser.skills] : [];
            if(otherUser.skill && uSkills.length === 0) uSkills.push(otherUser.skill);
            if(uSkills.length === 0) uSkills.push("Learner Only"); 

            uSkills.forEach(skill => {
                let sk = skill.toUpperCase();
                allSkills[sk] = (allSkills[sk] || 0) + 1;
                foundSkills = true;
                let icon = getSkillIcon(skill);
                
                let isSwapAccepted = false;
                if (me.swaps) {
                    let existingSwap = me.swaps.find(s => s.partnerEmail === otherUser.email && s.status === 'Active');
                    if (existingSwap) isSwapAccepted = true;
                }

                let messageBtnHTML = isSwapAccepted 
                    ? `<button class="btn-outline" onclick="openChatFromDiscover('${otherUser.email}')">Message</button>`
                    : `<button class="btn-outline" style="opacity:0.6; cursor:not-allowed; border-color:var(--text-muted); color:var(--text-muted);" onclick="showToast('🔒 Swap accept hone ke baad hi message kar sakte ho!')"><i class="fas fa-lock"></i> Message</button>`;

                newDiscoverHTML += `
                    <div class="crisp-card discover-card">
                        <div class="top-badge">Available</div>
                        <div class="card-icon"><i class="fab ${icon} fas"></i></div>
                        <h3>${skill}</h3>
                        <p style="margin-bottom: 20px;">User: <strong>${otherUser.name}</strong></p>
                        <div class="card-buttons">
                            <button class="btn-solid" onclick="requestSwap('${otherUser.email}', '${skill}')">Swap</button>
                            ${messageBtnHTML}
                        </div>
                    </div>`;
            });
        }
    });

    if(!foundSkills) { newDiscoverHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">No users/skills available right now.</p>`; }

    if(lastDiscoverHTML !== newDiscoverHTML) {
        lastDiscoverHTML = newDiscoverHTML;
        const discoverGrid = document.getElementById('discoverGrid');
        if(discoverGrid) { 
            discoverGrid.innerHTML = newDiscoverHTML; 
            applySearchFilter(); 
        }
    }

    if(!isLiveUpdate) {
        let sortedSkills = Object.keys(allSkills).sort((a,b) => allSkills[b] - allSkills[a]).slice(0, 8); 
        const trendList = document.getElementById('trendingSkillsList');
        if(trendList) {
            trendList.innerHTML = "";
            sortedSkills.forEach(skill => {
                trendList.innerHTML += `<div class="skill-tag" style="background: var(--primary-light); color: var(--primary-color); border:none;"><i class="fas fa-fire" style="color:#f59e0b;"></i> ${skill}</div>`;
            });
            if(sortedSkills.length === 0) trendList.innerHTML = "<p style='color:var(--text-muted); font-size:13px;'>No skills trending yet.</p>";
        }
    }

    let newSwapsHTML = "";
    if(me.swaps && me.swaps.length > 0) {
        me.swaps.forEach((swap, idx) => {
            let bClass = swap.status === 'Pending' ? 'badge-yellow' : (swap.status === 'Active' ? 'badge-green' : 'badge-purple');
            let actionBtns = '';
            if(swap.status === 'Requested') { 
                actionBtns = `<button class="btn-solid" style="padding: 6px 12px; font-size: 12px; margin: 0;" onclick="acceptSwap(${idx}, '${swap.partner}', '${swap.skill}')">Accept</button>
                              <button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">Decline</button>`;
            } else if(swap.status === 'Pending') { 
                actionBtns = `<button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">Cancel Request</button>`;
            } else { 
                actionBtns = `<button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">End Swap</button>`;
            }
            newSwapsHTML += `<div class="list-item">
                                <div><h4>${swap.skill}</h4><p>Partner: ${swap.partner}</p></div>
                                <div style="display:flex; align-items:center; gap:15px;">
                                    <span class="${bClass}">${swap.status}</span>
                                    <div style="display:flex; gap:10px;">${actionBtns}</div>
                                </div>
                             </div>`;
        });
    } else { newSwapsHTML = `<div class="crisp-card" style="padding: 40px;"><p>No active swaps. Go request one!</p></div>`; }

    if(lastSwapsHTML !== newSwapsHTML) {
        lastSwapsHTML = newSwapsHTML;
        const swapsList = document.getElementById('mySwapsList');
        if(swapsList) swapsList.innerHTML = newSwapsHTML;
    }

    let newNotisHTML = "";
    if(me.notifications && me.notifications.length > 0) {
        [...me.notifications].reverse().forEach((noti, idx) => {
            let unreadClass = noti.isRead ? "" : "unread-noti"; 
            newNotisHTML += `<div class="list-item ${unreadClass}" style="cursor:pointer;" onclick="deleteNotification(${me.notifications.length - 1 - idx})">
                                <div><h4><i class="fas fa-bell" style="color:var(--primary-color); margin-right:8px;"></i> System Alert</h4><p>${noti.text}</p></div>
                                <span style="font-size:11px; color:#ef4444;">Clear</span>
                             </div>`;
        });
    } else { newNotisHTML = `<div class="crisp-card" style="padding: 60px 20px;"><p style="color: var(--text-muted);">You have 0 notifications.</p></div>`; }

    if(lastNotisHTML !== newNotisHTML) {
        lastNotisHTML = newNotisHTML;
        const notiList = document.getElementById('notificationsList');
        if(notiList) notiList.innerHTML = newNotisHTML;
    }

    renderChatSidebar();
    if(currentChatPartnerEmail) { renderChatWindow(); }
}

function handleGlobalSearch(query) {
    currentSearchQuery = query.toLowerCase().trim();
    if(currentSearchQuery !== "" && !document.getElementById('view-find-skills').classList.contains('active')) {
        switchDashView('view-find-skills', document.querySelectorAll('.sidebar-menu a')[1]);
    }
    applySearchFilter();
}

function applySearchFilter() {
    const grid = document.getElementById('discoverGrid');
    if(!grid) return;
    const cards = grid.querySelectorAll('.discover-card');
    if(cards.length === 0) return;

    let foundAny = false;
    cards.forEach(card => {
        const skillName = card.querySelector('h3').innerText.toLowerCase();
        const tutorName = card.querySelector('p strong').innerText.toLowerCase();
        
        if (currentSearchQuery === "") {
            card.style.display = 'block';
            foundAny = true;
        } else {
            let isSkillMatch = skillName.includes(currentSearchQuery) || fuzzyMatch(currentSearchQuery, skillName);
            let isTutorMatch = tutorName.includes(currentSearchQuery) || fuzzyMatch(currentSearchQuery, tutorName);

            if (isSkillMatch || isTutorMatch) {
                card.style.display = 'block';
                foundAny = true;
            } else {
                card.style.display = 'none';
            }
        }
    });

    let noResultMsg = document.getElementById('noSearchMsg');
    if (!foundAny && currentSearchQuery !== "") {
        if (!noResultMsg) {
            grid.insertAdjacentHTML('beforeend', `<p id="noSearchMsg" style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding: 20px; font-weight: 600;">No matching skills or users found for "${currentSearchQuery}".</p>`);
        } else {
            noResultMsg.innerText = `No matching skills or users found for "${currentSearchQuery}".`;
            noResultMsg.style.display = 'block';
        }
    } else if (noResultMsg) { noResultMsg.style.display = 'none'; }
}

function requestSwap(targetEmail, skill) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const meIndex = usersDB.findIndex(u => u.email === myEmail);
    const targetIndex = usersDB.findIndex(u => u.email === targetEmail);

    if(targetIndex === -1) return;
    if(usersDB[meIndex].credits === undefined) usersDB[meIndex].credits = 5;
    if(usersDB[meIndex].credits < 1) { alert("❌ You don't have enough credits to request a swap!"); return; }

    usersDB[meIndex].swaps = usersDB[meIndex].swaps || [];
    usersDB[targetIndex].notifications = usersDB[targetIndex].notifications || [];
    usersDB[targetIndex].swaps = usersDB[targetIndex].swaps || [];
    
    if(usersDB[meIndex].swaps.find(s => s.skill === skill && s.partnerEmail === usersDB[targetIndex].email)) { alert("You have already requested this swap!"); return; }

    usersDB[meIndex].swaps.push({ skill: skill, partner: usersDB[targetIndex].name, partnerEmail: usersDB[targetIndex].email, status: 'Pending' });
    usersDB[targetIndex].swaps.push({ skill: skill, partner: usersDB[meIndex].name, partnerEmail: usersDB[meIndex].email, status: 'Requested' });
    
    usersDB[targetIndex].notifications.push({ 
        text: `🤝 ${usersDB[meIndex].name} requested to swap '${skill}' with you.`, 
        isRead: false, 
        id: Date.now() + Math.random() 
    });

    localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
    updateCloudUser(usersDB[meIndex]); 
    updateCloudUser(usersDB[targetIndex]); 

    alert("✅ Swap Request sent! They will get a notification instantly.");
    switchDashView('view-active-swaps', document.querySelectorAll('.sidebar-menu a')[2]);
}

function acceptSwap(mySwapIndex, partnerName, skill) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const meIndex = usersDB.findIndex(u => u.email === myEmail);
    
    let mySwap = usersDB[meIndex].swaps[mySwapIndex];
    let targetIndex = usersDB.findIndex(u => u.email === mySwap.partnerEmail);
    if(targetIndex === -1) targetIndex = usersDB.findIndex(u => u.name === partnerName); 

    if(targetIndex !== -1) {
        if(usersDB[targetIndex].credits === undefined) usersDB[targetIndex].credits = 5;
        if(usersDB[targetIndex].credits < 1) { alert("The requester doesn't have enough credits anymore."); return; }

        usersDB[targetIndex].credits -= 1;
        let partnerSwapIndex = usersDB[targetIndex].swaps.findIndex(s => s.partnerEmail === usersDB[meIndex].email && s.skill === skill);
        if(partnerSwapIndex !== -1) { usersDB[targetIndex].swaps[partnerSwapIndex].status = 'Active'; }
        usersDB[meIndex].swaps[mySwapIndex].status = 'Active';

        usersDB[targetIndex].notifications = usersDB[targetIndex].notifications || [];
        
        usersDB[targetIndex].notifications.push({ 
            text: `🎉 ${usersDB[meIndex].name} accepted your request for '${skill}'! (1 Credit deducted)`, 
            isRead: false, 
            id: Date.now() + Math.random() 
        });
        
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
        updateCloudUser(usersDB[meIndex]); 
        updateCloudUser(usersDB[targetIndex]); 

        refreshDynamicData();
        alert("✅ Swap Accepted! You can now message them in Live Chat.");
    }
}

function cancelSwap(mySwapIndex, partnerName, skill) {
    if(!confirm("Are you sure you want to cancel/decline this swap?")) return;
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const meIndex = usersDB.findIndex(u => u.email === myEmail);
    
    let mySwap = usersDB[meIndex].swaps[mySwapIndex];
    let targetIndex = usersDB.findIndex(u => u.email === mySwap.partnerEmail);
    if(targetIndex === -1) targetIndex = usersDB.findIndex(u => u.name === partnerName); 

    if(targetIndex !== -1) {
        usersDB[targetIndex].swaps = usersDB[targetIndex].swaps.filter(s => !(s.partnerEmail === usersDB[meIndex].email && s.skill === skill));
        usersDB[targetIndex].notifications = usersDB[targetIndex].notifications || [];
        
        let notiText = "";
        if(mySwap.status === 'Requested') { notiText = `❌ ${usersDB[meIndex].name} declined your swap for '${skill}'.`; } 
        else if (mySwap.status === 'Active') { notiText = `🛑 ${usersDB[meIndex].name} ended the active swap for '${skill}'.`; } 
        else { notiText = `❌ ${usersDB[meIndex].name} cancelled their swap request for '${skill}'.`; }
        
        usersDB[targetIndex].notifications.push({ text: notiText, isRead: false, id: Date.now() + Math.random() });
        updateCloudUser(usersDB[targetIndex]); 
    }
    
    usersDB[meIndex].swaps.splice(mySwapIndex, 1);
    localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
    updateCloudUser(usersDB[meIndex]); 
    
    if(currentChatPartnerEmail && usersDB[targetIndex] && currentChatPartnerEmail === usersDB[targetIndex].email) {
        currentChatPartnerEmail = null;
    }
    
    refreshDynamicData();
}

function openChatFromDiscover(targetEmail) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const me = usersDB.find(u => u.email === myEmail);
    
    let isSwapAccepted = false;
    if (me.swaps) {
        let existingSwap = me.swaps.find(s => s.partnerEmail === targetEmail && s.status === 'Active');
        if (existingSwap) isSwapAccepted = true;
    }
    
    if (!isSwapAccepted) {
        showToast('🔒 Swap accept hone ke baad hi message kar sakte ho!');
        return;
    }

    currentChatPartnerEmail = targetEmail;
    switchDashView('view-messages', document.querySelectorAll('.sidebar-menu a')[3]);
}

function renderChatSidebar() {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const me = usersDB.find(u => u.email === myEmail);
    const chatList = document.getElementById('chatList');
    
    let chatPartners = new Set();
    
    if(me.swaps) {
        me.swaps.forEach(s => {
            if(s.status === 'Active') {
                let p = usersDB.find(u => u.email === s.partnerEmail || u.name === s.partner);
                if(p) chatPartners.add(p.email);
            }
        });
    }

    if(chatPartners.size === 0) {
        chatList.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">No active swaps yet. Request a swap to start messaging!</p>`;
        return;
    }

    chatList.innerHTML = "";
    chatPartners.forEach(partnerEmail => {
        let partnerUser = usersDB.find(u => u.email === partnerEmail);
        if(!partnerUser) return;
        
        let history = (me.chatHistory && me.chatHistory[partnerEmail]) ? me.chatHistory[partnerEmail] : [];
        let lastMsg = history.length > 0 ? history[history.length-1].text : "Start a conversation...";
        
        let activeClass = (currentChatPartnerEmail === partnerEmail) ? "active" : "";
        let onlineDot = partnerUser.isOnline ? '<div style="width:10px; height:10px; background:#10b981; border-radius:50%; box-shadow: 0 0 5px rgba(16, 185, 129, 0.5);"></div>' : '';
        
        chatList.innerHTML += `
            <div class="chat-user-item ${activeClass}" onclick="openLiveChat('${partnerEmail}')">
                <img src="${partnerUser.profilePic || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
                <div style="flex:1; overflow:hidden;">
                    <h4>${partnerUser.name}</h4>
                    <p>${lastMsg}</p>
                </div>
                ${onlineDot}
            </div>
        `;
    });
}

function openLiveChat(partnerEmail) {
    currentChatPartnerEmail = partnerEmail;
    refreshDynamicData();
    setTimeout(() => {
        const msgBox = document.getElementById('chatMessages');
        if(msgBox) msgBox.scrollTop = msgBox.scrollHeight;
    }, 50);
}

function renderChatWindow() {
    const partnerUser = usersDB.find(u => u.email === currentChatPartnerEmail);
    if(!partnerUser) return;

    document.getElementById('chatPartnerPic').src = partnerUser.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    document.getElementById('chatPartnerPic').style.display = "block";
    document.getElementById('chatPartnerName').innerText = partnerUser.name;
    document.getElementById('chatPartnerStatus').innerText = partnerUser.isOnline ? "Online" : "Offline";
    document.getElementById('chatPartnerStatus').style.color = partnerUser.isOnline ? "#10b981" : "var(--text-muted)";
    document.getElementById('chatInputArea').style.display = "flex";
    
    document.getElementById('videoCallBtn').style.display = "block";

    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const me = usersDB.find(u => u.email === myEmail);
    const history = (me.chatHistory && me.chatHistory[currentChatPartnerEmail]) ? me.chatHistory[currentChatPartnerEmail] : [];

    const chatMessages = document.getElementById('chatMessages');
    
    if(chatMessages.children.length !== history.length) {
        chatMessages.innerHTML = "";
        if(history.length === 0) {
            chatMessages.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin:auto;">Say hi to ${partnerUser.name}!</div>`;
        } else {
            history.forEach((msg, index) => {
                let isSent = msg.sender === myEmail; 
                let msgClass = isSent ? "sent" : "received";
                let iconColor = isSent ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
                let hoverColor = isSent ? "#ffffff" : "#ef4444";
                let hoverText = isSent ? "Delete for Everyone" : "Delete for Me";
                
                let deleteBtn = `<i class="fas fa-trash" title="${hoverText}" 
                    style="font-size: 11px; margin-left: 15px; cursor: pointer; color: ${iconColor}; transition: 0.2s;" 
                    onmouseover="this.style.color='${hoverColor}'" 
                    onmouseout="this.style.color='${iconColor}'"
                    onclick="deleteChatMessage(${index})"></i>`;

                chatMessages.innerHTML += `
                    <div class="chat-bubble ${msgClass}" style="display:flex; align-items:flex-end; justify-content:space-between; gap:10px;">
                        <span style="word-break: break-word;">${msg.text}</span>
                        ${deleteBtn}
                    </div>`;
            });
        }
        chatMessages.scrollTop = chatMessages.scrollHeight; 
    }
}

function sendLiveMessage() {
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if(!text || !currentChatPartnerEmail) return;

    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const myIndex = usersDB.findIndex(u => u.email === myEmail);
    const partnerIndex = usersDB.findIndex(u => u.email === currentChatPartnerEmail);

    let isSwapAccepted = false;
    if (usersDB[myIndex].swaps) {
        let existingSwap = usersDB[myIndex].swaps.find(s => s.partnerEmail === currentChatPartnerEmail && s.status === 'Active');
        if (existingSwap) isSwapAccepted = true;
    }

    if (!isSwapAccepted) {
        showToast('🔒 You can only send messages if the swap is Active!');
        return;
    }

    if(!usersDB[myIndex].chatHistory) usersDB[myIndex].chatHistory = {};
    if(!usersDB[partnerIndex].chatHistory) usersDB[partnerIndex].chatHistory = {};

    if(!usersDB[myIndex].chatHistory[currentChatPartnerEmail]) usersDB[myIndex].chatHistory[currentChatPartnerEmail] = [];
    if(!usersDB[partnerIndex].chatHistory[myEmail]) usersDB[partnerIndex].chatHistory[myEmail] = [];

    const msgObj = { sender: myEmail, text: text };

    usersDB[myIndex].chatHistory[currentChatPartnerEmail].push(msgObj);
    usersDB[partnerIndex].chatHistory[myEmail].push(msgObj); 

    usersDB[partnerIndex].notifications = usersDB[partnerIndex].notifications || [];
    usersDB[partnerIndex].notifications.push({ text: `💬 New message from ${usersDB[myIndex].name}`, isRead: false, id: Date.now() + Math.random() });

    localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
    updateCloudUser(usersDB[myIndex]); 
    updateCloudUser(usersDB[partnerIndex]); 

    if(socket) {
        socket.emit('send-msg', { to: currentChatPartnerEmail, from: myEmail, text: text });
    }

    input.value = ""; 
    refreshDynamicData(); 
    setTimeout(() => {
        const msgBox = document.getElementById('chatMessages');
        msgBox.scrollTop = msgBox.scrollHeight;
    }, 50);
}

function deleteChatMessage(msgIndex) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const myIndex = usersDB.findIndex(u => u.email === myEmail);
    const partnerIndex = usersDB.findIndex(u => u.email === currentChatPartnerEmail);

    if(myIndex !== -1 && currentChatPartnerEmail) {
        let msgToDelete = usersDB[myIndex].chatHistory[currentChatPartnerEmail][msgIndex];
        let isMyMessage = msgToDelete.sender === myEmail; 

        if (isMyMessage) {
            if(!confirm("Delete this message for everyone?")) return;
            usersDB[myIndex].chatHistory[currentChatPartnerEmail].splice(msgIndex, 1);
            if(partnerIndex !== -1 && usersDB[partnerIndex].chatHistory && usersDB[partnerIndex].chatHistory[myEmail]) {
                let partnerHistory = usersDB[partnerIndex].chatHistory[myEmail];
                let pMsgIndex = partnerHistory.findIndex(m => m.text === msgToDelete.text && m.sender === msgToDelete.sender);
                if(pMsgIndex !== -1) { partnerHistory.splice(pMsgIndex, 1); }
            }
        } else {
            if(!confirm("Delete this message just for you?")) return;
            usersDB[myIndex].chatHistory[currentChatPartnerEmail].splice(msgIndex, 1);
        }
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
        updateCloudUser(usersDB[myIndex]); 
        if(partnerIndex !== -1) updateCloudUser(usersDB[partnerIndex]); 

        document.getElementById('chatMessages').innerHTML = ""; 
        refreshDynamicData();
    }
}

function deleteNotification(idx) {
    const meIndex = usersDB.findIndex(u => u.email === sessionStorage.getItem('loggedInUserEmail'));
    usersDB[meIndex].notifications.splice(idx, 1);
    localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
    updateCloudUser(usersDB[meIndex]); 
    refreshDynamicData();
}

function openMyProfile(element) {
    switchDashView('view-profile', element);
    const currentEmail = sessionStorage.getItem('loggedInUserEmail');
    const user = usersDB.find(u => u.email === currentEmail);
    if(user) {
        document.getElementById('editName').value = user.name;
        document.getElementById('editEmail').value = user.email; 
        document.getElementById('editPhone').value = user.phone || "";
        document.getElementById('editAddress').value = user.address || "";
        editProfilePic = user.profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        document.getElementById('editProfilePreview').src = editProfilePic;
        
        if (user.skills && user.skills.length > 0) {
            editSkillsArray = [...user.skills];
        } else if (user.skill && user.skill !== "Learner Only") {
            editSkillsArray = [user.skill]; 
        } else {
            editSkillsArray = [];
        }
        
        renderEditSkills();
    }
}

function previewEditImage(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 250;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            document.getElementById('editProfilePreview').src = compressedBase64;
            editProfilePic = compressedBase64;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

if(document.getElementById('editSkillInput')){
    document.getElementById('editSkillInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            const skillValue = this.value.trim();
            if (skillValue !== '' && !editSkillsArray.includes(skillValue)) {
                editSkillsArray.push(skillValue); renderEditSkills();
            }
            this.value = ''; 
        }
    });
}

function renderEditSkills() {
    const list = document.getElementById('editSkillsList');
    list.innerHTML = '';
    editSkillsArray.forEach((skill, index) => { list.innerHTML += `<div class="skill-tag">${skill} <i class="fas fa-times" onclick="removeEditSkill(${index})"></i></div>`; });
}

function removeEditSkill(index) { editSkillsArray.splice(index, 1); renderEditSkills(); }

function handleProfileUpdate(e) {
    e.preventDefault();
    const currentEmail = sessionStorage.getItem('loggedInUserEmail');
    const userIndex = usersDB.findIndex(u => u.email === currentEmail);
    const newEmail = document.getElementById('editEmail').value.trim();
    if(newEmail !== currentEmail && usersDB.some(u => u.email === newEmail)) { alert("❌ Email is already in use by another account!"); return; }

    if(userIndex !== -1) {
        usersDB[userIndex].name = document.getElementById('editName').value;
        usersDB[userIndex].email = newEmail;
        usersDB[userIndex].phone = document.getElementById('editPhone').value;
        usersDB[userIndex].address = document.getElementById('editAddress').value;
        usersDB[userIndex].skills = [...editSkillsArray];
        usersDB[userIndex].profilePic = editProfilePic;
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
        updateCloudUser(usersDB[userIndex]); 

        if(newEmail !== currentEmail) { sessionStorage.setItem('loggedInUserEmail', newEmail); }
        alert("🎉 Profile Updated Successfully!"); refreshDynamicData();
    }
}

function toggleDarkMode() {
    const isDark = document.getElementById('darkModeToggle').checked;
    if(isDark) { document.body.classList.add('dark-theme'); localStorage.setItem('skillSwapTheme', 'dark'); } 
    else { document.body.classList.remove('dark-theme'); localStorage.setItem('skillSwapTheme', 'light'); }
}

function update2FASetting(isChecked) {
    const idx = usersDB.findIndex(u => u.email === sessionStorage.getItem('loggedInUserEmail'));
    if(idx !== -1) { 
        usersDB[idx].is2FAEnabled = isChecked; 
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB)); 
        updateCloudUser(usersDB[idx]); 
    }
}

function togglePublicProfile(isChecked) {
    const idx = usersDB.findIndex(u => u.email === sessionStorage.getItem('loggedInUserEmail'));
    if(idx !== -1) { 
        usersDB[idx].isPublic = isChecked; 
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB)); 
        updateCloudUser(usersDB[idx]); 
        refreshDynamicData(); 
    }
}

async function deleteAccount() {
    const code = prompt("Type 'DELETE' to confirm account deletion:");
    if(code === 'DELETE') {
        const userEmail = sessionStorage.getItem('loggedInUserEmail');

        try {
            const response = await fetch(`${API_BASE_URL}/delete-user/${userEmail}`, {
                method: 'DELETE',
                headers: { "ngrok-skip-browser-warning": "69420" }
            });

            if (response.ok) {
                usersDB = usersDB.filter(u => u.email !== userEmail);
                localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
                
                alert("🎉 Account MongoDB aur Local se permanently delete ho gaya!");
                logout();
            } else { alert("❌ Database se delete nahi ho paya."); }
        } catch (error) {
            console.error("Delete Error:", error);
            alert("Server connect nahi ho raha.");
        }
    }
}

let passwordChangeOTP = null;
function initiatePasswordChange() {
    const currentEmail = sessionStorage.getItem('loggedInUserEmail');
    passwordChangeOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const btn = document.getElementById('startPassChangeBtn');
    btn.innerText = "Sending..."; btn.disabled = true;
    sendRealEmailOTP(currentEmail, passwordChangeOTP, () => {
        document.getElementById('passwordChangeForm').classList.remove('hidden');
        btn.classList.add('hidden'); btn.innerText = "Send Email OTP"; btn.disabled = false;
    });
}

function verifyAndChangePassword() {
    const enteredOTP = document.getElementById('passChangeOTP').value.trim();
    const newPassword = document.getElementById('newPassInput').value;
    const msgBox = document.getElementById('passChangeMsg');
    if(enteredOTP !== passwordChangeOTP) { msgBox.innerText = "❌ Incorrect OTP."; msgBox.style.color = "#ef4444"; return; }
    if(newPassword.length < 4) { msgBox.innerText = "❌ Password too short."; msgBox.style.color = "#ef4444"; return; }
    const userIndex = usersDB.findIndex(u => u.email === sessionStorage.getItem('loggedInUserEmail'));
    if(userIndex !== -1) {
        usersDB[userIndex].password = newPassword; 
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
        updateCloudUser(usersDB[userIndex]); 

        msgBox.innerText = "✅ Password updated successfully!"; msgBox.style.color = "#10b981";
        setTimeout(() => {
            document.getElementById('passwordChangeForm').classList.add('hidden');
            document.getElementById('startPassChangeBtn').classList.remove('hidden');
            document.getElementById('passChangeOTP').value = ""; document.getElementById('newPassInput').value = ""; msgBox.innerText = "";
        }, 2000);
    }
}

function logout() {
    setOnlineStatus(false); 
    sessionStorage.removeItem('loggedInUserEmail');
    setTimeout(() => { window.location.href = "index.html"; }, 300);
}

let cameraStream = null;

async function startCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraFeed');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        video.srcObject = cameraStream;
    } catch (err) {
        alert("❌ Camera access denied!");
        stopCamera();
    }
}

function stopCamera() {
    const modal = document.getElementById('cameraModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

function takeSnapshot() {
    const video = document.getElementById('cameraFeed');
    const canvas = document.createElement('canvas');
    const SIZE = 250;
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    
    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - minDim) / 2;
    const startY = (video.videoHeight - minDim) / 2;
    
    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, SIZE, SIZE);
    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
    document.getElementById('editProfilePreview').src = compressedBase64;
    editProfilePic = compressedBase64;
    stopCamera(); 
}

function showLogoutConfirm(e) {
    e.preventDefault(); 
    document.getElementById('logoutConfirmBox').style.display = 'flex';
}

function hideLogoutConfirm() {
    document.getElementById('logoutConfirmBox').style.display = 'none';
}


// ==========================================
// 🟢 WEBRTC VIDEO CALL ENGINE
// ==========================================
async function startVideoCall() {
    if(!currentChatPartnerEmail) return;
    
    document.getElementById('videoCallModal').style.display = "flex";
    document.getElementById('callStatusText').innerText = "Calling " + usersDB.find(u => u.email === currentChatPartnerEmail).name + "...";
    isCalling = true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        document.getElementById('localVideo').srcObject = localStream;
        
        setupPeerConnection();

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const myEmail = sessionStorage.getItem('loggedInUserEmail');
        socket.emit('call-user', {
            to: currentChatPartnerEmail,
            from: myEmail,
            offer: offer
        });

    } catch (err) {
        alert("Camera ya Mic ki permission nahi mili! URL bar me Lock icon pe click karke Allow karein.");
        endCall(true);
    }
}

async function acceptCall() {
    document.getElementById('incomingCallModal').style.display = "none";
    document.getElementById('videoCallModal').style.display = "flex";
    document.getElementById('callStatusText').innerText = "Connecting...";
    
    currentChatPartnerEmail = incomingCallPartner;
    switchDashView('view-messages', document.querySelectorAll('.sidebar-menu a')[3]); 

    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        document.getElementById('localVideo').srcObject = localStream;
        
        setupPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('make-answer', {
            to: incomingCallPartner,
            answer: answer
        });

    } catch (err) {
        alert("Camera ya Mic ki permission nahi mili! URL bar me Lock icon pe click karke Allow karein.");
        rejectCall();
    }
}

function rejectCall() {
    document.getElementById('incomingCallModal').style.display = "none";
    if(incomingCallPartner) {
        socket.emit('reject-call', { to: incomingCallPartner });
    }
    incomingCallPartner = null;
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const myEmail = sessionStorage.getItem('loggedInUserEmail');
            socket.emit('ice-candidate', {
                to: currentChatPartnerEmail || incomingCallPartner,
                candidate: event.candidate,
                from: myEmail
            });
        }
    };
}

function endCall(isLocalAction = true) {
    document.getElementById('videoCallModal').style.display = "none";
    document.getElementById('incomingCallModal').style.display = "none";
    
    if(isLocalAction && (currentChatPartnerEmail || incomingCallPartner)) {
        socket.emit('end-call', { to: currentChatPartnerEmail || incomingCallPartner });
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    
    isCalling = false;
    incomingCallPartner = null;
    stopAiTranslator(); // End call par AI bhi band kar do
}

function toggleMic() {
    if(localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        const btn = document.getElementById('toggleMicBtn');
        if(audioTrack.enabled) {
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
            btn.style.background = "var(--bg-card)";
            btn.style.color = "var(--primary-color)";
        } else {
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            btn.style.background = "#ef4444";
            btn.style.color = "white";
        }
    }
}

function toggleCamera() {
    if(localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        const btn = document.getElementById('toggleCamBtn');
        if(videoTrack.enabled) {
            btn.innerHTML = '<i class="fas fa-video"></i>';
            btn.style.background = "var(--bg-card)";
            btn.style.color = "var(--primary-color)";
        } else {
            btn.innerHTML = '<i class="fas fa-video-slash"></i>';
            btn.style.background = "#ef4444";
            btn.style.color = "white";
        }
    }
}


// ==========================================
// 🚀 AI REAL-TIME TRANSLATOR ENGINE
// ==========================================
let recognition;
let isAiActive = false;
let myCurrentLanguage = 'en-US';

const toggleAiBtn = document.getElementById('toggle-ai-btn');
const aiLangSelect = document.getElementById('ai-lang-select');
const aiCaptionBox = document.getElementById('ai-caption-box');
const captionText = document.getElementById('caption-text');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const spokenText = event.results[lastResultIndex][0].transcript;
        
        console.log("AI Heard:", spokenText);
        
        if (currentChatPartnerEmail || incomingCallPartner) {
            const targetEmail = currentChatPartnerEmail || incomingCallPartner;
            socket.emit('send-ai-caption', {
                to: targetEmail,
                text: spokenText,
                fromLang: myCurrentLanguage
            });
            showAiCaption(`You: ${spokenText}`);
        }
    };

    recognition.onerror = (event) => {
        console.log("AI Listening Error:", event.error);
        if (event.error === 'not-allowed') {
            alert("Microphone permission needed for AI Translator! Please allow it from the URL bar.");
            stopAiTranslator();
        }
    };
} else {
    console.log("Browser doesn't support SpeechRecognition.");
}

if(toggleAiBtn) {
    toggleAiBtn.addEventListener('click', () => {
        if (!isAiActive) startAiTranslator();
        else stopAiTranslator();
    });
}

function startAiTranslator() {
    if (!recognition) {
        alert("Your browser doesn't support AI Translation. Please use Google Chrome.");
        return;
    }
    myCurrentLanguage = aiLangSelect.value;
    recognition.lang = myCurrentLanguage;
    recognition.start();
    isAiActive = true;
    toggleAiBtn.classList.add('active');
    showAiCaption("✨ AI Translator Active... Speak now!");
}

function stopAiTranslator() {
    if (!recognition) return;
    recognition.stop();
    isAiActive = false;
    toggleAiBtn.classList.remove('active');
    hideAiCaption();
}

let captionTimeout;
function showAiCaption(text) {
    if(!aiCaptionBox) return;
    aiCaptionBox.classList.remove('hidden');
    captionText.innerText = text;
    
    clearTimeout(captionTimeout);
    captionTimeout = setTimeout(() => hideAiCaption(), 5000);
}

function hideAiCaption() {
    if(!aiCaptionBox) return;
    aiCaptionBox.classList.add('hidden');
    captionText.innerText = "";
}

// ==========================================
// 🌐 RECEIVE & SPEAK TRANSLATED TEXT
// ==========================================
if(socket) {
    socket.on('receive-ai-caption', async (data) => {
        const originalText = data.text;
        const fromLang = data.fromLang;
        const myLang = aiLangSelect.value; 
        
        showAiCaption(`Translating... ✨`);

        try {
            let translatedText = originalText;
            
            if (fromLang !== myLang) {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText)}&langpair=${fromLang}|${myLang}`);
                const result = await response.json();
                translatedText = result.responseData.translatedText;
            }

            showAiCaption(`Partner: ${translatedText}`);
            speakTranslatedText(translatedText, myLang);
            
        } catch (error) {
            console.log("Translation failed:", error);
            showAiCaption(`Partner: ${originalText} (Translation Error)`);
        }
    });
}

function speakTranslatedText(text, lang) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang; 
        
        const remoteVideo = document.getElementById('remoteVideo');
        utterance.onstart = () => { if(remoteVideo) remoteVideo.volume = 0.1; };
        utterance.onend = () => { if(remoteVideo) remoteVideo.volume = 1.0; };
        
        window.speechSynthesis.speak(utterance);
    }
}
