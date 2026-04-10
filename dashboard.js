let editSkillsArray = [];
let editTopicsObj = {}; 
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
let pendingIceCandidates = []; 

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

const mediaConstraints = {
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
};

const socket = typeof io !== 'undefined' ? io(API_BASE_URL) : null;
if(socket) {
    socket.on('connect', () => {
        let myEmail = sessionStorage.getItem('loggedInUserEmail');
        let isNewLogin = sessionStorage.getItem('justLoggedIn') === 'true'; 
        
        if(myEmail) { 
            socket.emit('register-user', { email: myEmail, isNewLogin: isNewLogin }); 
            sessionStorage.removeItem('justLoggedIn'); 
        }
    });

    socket.on('visitor-update', (count) => {
        const visitorEl = document.getElementById('statVisitors');
        if(visitorEl) visitorEl.innerText = count;
    });

    socket.on('receive-msg', (data) => {
        syncWithDatabase(); 
        if (currentChatPartnerEmail !== data.from) {
            let senderName = usersDB.find(u => u.email === data.from)?.name || "User";
            showToast(`💬 New message from ${senderName}`);
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
        try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch(e){}
    });

    socket.on('answer-made', async (data) => {
        document.getElementById('callStatusText').innerText = "Connected";
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        
        for (let candidate of pendingIceCandidates) {
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
        }
        pendingIceCandidates = [];
    });

    socket.on('call-rejected', () => {
        document.getElementById('callStatusText').innerText = "Call Declined";
        setTimeout(() => endCall(false), 2000);
    });

    socket.on('call-ended', () => { endCall(false); });

    socket.on('ice-candidate', async (data) => {
        if(peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) { console.error("Error adding ice candidate", e); }
        } else {
            pendingIceCandidates.push(data.candidate);
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
    toast.innerHTML = `<div style="background:var(--primary-light); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--primary-color);"><i class="fas fa-bell"></i></div><span style="flex:1;">${message}</span>`;
    toastBox.appendChild(toast);
    try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch(e){}
    setTimeout(() => { toast.style.animation = "slideOutRight 0.3s forwards"; setTimeout(() => toast.remove(), 300); }, 4500);
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

if (document.getElementById('dashboardWrapper')) syncWithDatabase();
setInterval(() => { if(document.getElementById('dashboardWrapper') && sessionStorage.getItem('loggedInUserEmail')) syncWithDatabase(); }, 2500); 

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
    if(me.acquiredSkills === undefined) me.acquiredSkills = []; 

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
        document.getElementById('statSwaps').innerText = me.swaps ? me.swaps.filter(s => s.status === 'Active' || s.status === 'Pending Confirmation').length : 0;
        document.getElementById('statCredits').innerText = me.credits; 
        
        const statAcquired = document.getElementById('statAcquired');
        if(statAcquired) statAcquired.innerText = me.acquiredSkills.length; 
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
                    : `<button class="btn-outline" style="opacity:0.6; cursor:not-allowed; border-color:var(--text-muted); color:var(--text-muted);" onclick="showToast('🔒 You can only send messages if the swap is Active!')"><i class="fas fa-lock"></i> Message</button>`;

                newDiscoverHTML += `
                    <div class="crisp-card discover-card">
                        <div class="top-badge">Available</div>
                        <div class="card-icon"><i class="fab ${icon} fas"></i></div>
                        <h3>${skill}</h3>
                        <p style="margin-bottom: 20px;">User: <strong>${otherUser.name}</strong></p>
                        <div class="card-buttons">
                            <button class="btn-solid" onclick="openTopicSelection('${otherUser.email}', '${skill}')">Swap</button>
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
            
            let bClass = 'badge-purple';
            if (swap.status === 'Pending') bClass = 'badge-yellow';
            else if (swap.status === 'Active') bClass = 'badge-green';
            else if (swap.status === 'Pending Confirmation') bClass = 'badge-orange'; 

            let actionBtns = '';
            
            if(swap.status === 'Requested') { 
                actionBtns = `<button class="btn-solid" style="padding: 6px 12px; font-size: 12px; margin: 0;" onclick="openScheduleModal(${idx}, '${swap.partner}', '${swap.skill}')">Accept & Schedule</button>
                              <button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">Decline</button>`;
            } 
            else if(swap.status === 'Pending') { 
                actionBtns = `<button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">Cancel Request</button>`;
            } 
            else if (swap.status === 'Pending Confirmation') {
                if (swap.role === 'Requester') { 
                    actionBtns = `<button class="btn-solid" style="background:#10b981; padding: 6px 12px; font-size: 12px; margin: 0; box-shadow: 0 4px 10px rgba(16,185,129,0.3);" onclick="confirmSwapSchedule(${idx}, '${swap.partner}', '${swap.skill}')"><i class="fas fa-check-circle"></i> Confirm Time (OK)</button>
                                  <button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">Cancel</button>`;
                } else { 
                    actionBtns = `<button class="btn-outline" style="padding: 6px 12px; font-size: 12px; margin: 0; cursor:not-allowed; opacity:0.6; border-color:var(--text-muted); color:var(--text-muted);"><i class="fas fa-hourglass-half"></i> Waiting for OK...</button>
                                  <button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">Cancel</button>`;
                }
            }
            else { 
                actionBtns = `<button class="btn-cancel" onclick="cancelSwap(${idx}, '${swap.partner}', '${swap.skill}')">End Swap</button>`;
            }
            
            let topicDisplay = swap.topic && swap.topic !== "General (Full Skill)" 
                ? `<br><small style="color:var(--primary-color); font-weight:600;"><i class="fas fa-bullseye"></i> Topic: ${swap.topic}</small>` 
                : "";

            let scheduleDisplay = swap.scheduledTime 
                ? `<br><small style="color:#10b981; font-weight:600; margin-top:4px; display:inline-block;"><i class="far fa-calendar-alt"></i> ${new Date(swap.scheduledTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</small>` 
                : "";

            newSwapsHTML += `<div class="list-item">
                                <div><h4>${swap.skill} ${topicDisplay}</h4><p>Partner: ${swap.partner}</p>${scheduleDisplay}</div>
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


let pendingScheduleSwapIndex = -1;
let pendingSchedulePartner = "";
let pendingScheduleSkill = "";

function openScheduleModal(mySwapIndex, partnerName, skill) {
    pendingScheduleSwapIndex = mySwapIndex;
    pendingSchedulePartner = partnerName;
    pendingScheduleSkill = skill;

    let today = new Date().toISOString().split('T')[0];
    document.getElementById('scheduleDate').setAttribute('min', today);

    const modal = document.getElementById('scheduleModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = "flex";
    }
}

function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = "none";
    }
}

function confirmSchedule() {
    let dateVal = document.getElementById('scheduleDate').value;
    let timeVal = document.getElementById('scheduleTime').value;

    if(!dateVal || !timeVal) { alert("❌ Please select both Date and Time!"); return; }

    let scheduledTimestamp = new Date(`${dateVal}T${timeVal}`).getTime();
    if(scheduledTimestamp < Date.now()) { alert("❌ Please select a future time!"); return; }

    closeScheduleModal();
    acceptSwapWithSchedule(pendingScheduleSwapIndex, pendingSchedulePartner, pendingScheduleSkill, scheduledTimestamp);
}

function acceptSwapWithSchedule(mySwapIndex, partnerName, skill, scheduledTimestamp) {
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
        
        if(partnerSwapIndex !== -1) { 
            usersDB[targetIndex].swaps[partnerSwapIndex].status = 'Pending Confirmation'; 
            usersDB[targetIndex].swaps[partnerSwapIndex].scheduledTime = scheduledTimestamp;
        }
        
        usersDB[meIndex].swaps[mySwapIndex].status = 'Pending Confirmation';
        usersDB[meIndex].swaps[mySwapIndex].scheduledTime = scheduledTimestamp;

        let dateObj = new Date(scheduledTimestamp);
        let formattedDate = dateObj.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

        usersDB[targetIndex].notifications = usersDB[targetIndex].notifications || [];
        usersDB[targetIndex].notifications.push({ 
            text: `📅 ${usersDB[meIndex].name} proposed a time for '${skill}' (${formattedDate}). Please confirm to make it Active!`, 
            isRead: false, 
            id: Date.now() + Math.random() 
        });
        
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
        updateCloudUser(usersDB[meIndex]); 
        updateCloudUser(usersDB[targetIndex]); 

        refreshDynamicData();
        alert("✅ Time proposed! Waiting for Learner to confirm.");
    }
}

function confirmSwapSchedule(mySwapIndex, partnerName, skill) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const meIndex = usersDB.findIndex(u => u.email === myEmail);
    let mySwap = usersDB[meIndex].swaps[mySwapIndex];
    
    let targetIndex = usersDB.findIndex(u => u.email === mySwap.partnerEmail);
    if(targetIndex === -1) targetIndex = usersDB.findIndex(u => u.name === partnerName); 

    if(targetIndex !== -1) {
        let partnerSwapIndex = usersDB[targetIndex].swaps.findIndex(s => s.partnerEmail === usersDB[meIndex].email && s.skill === skill);
        
        if(partnerSwapIndex !== -1) { 
            usersDB[targetIndex].swaps[partnerSwapIndex].status = 'Active'; 
        }
        usersDB[meIndex].swaps[mySwapIndex].status = 'Active';

        let formattedDate = new Date(mySwap.scheduledTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

        usersDB[targetIndex].notifications = usersDB[targetIndex].notifications || [];
        usersDB[targetIndex].notifications.push({ 
            text: `✅ ${usersDB[meIndex].name} confirmed the schedule for '${skill}' at ${formattedDate}! Swap is now Active.`, 
            isRead: false, 
            id: Date.now() + Math.random() 
        });
        
        localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
        updateCloudUser(usersDB[meIndex]); 
        updateCloudUser(usersDB[targetIndex]); 

        refreshDynamicData();
        alert("✅ Schedule Confirmed! Swap is now Active. You can message them.");
    }
}


function openTopicSelection(targetEmail, skill) {
    const targetUser = usersDB.find(u => u.email === targetEmail);
    if(!targetUser) return;

    let topics = (targetUser.topics && targetUser.topics[skill]) ? targetUser.topics[skill] : [];
    
    if (topics.length === 0) {
        topics = ["General (Full Skill)"];
    }

    document.getElementById('modalSkillName').innerText = skill;
    const container = document.getElementById('topicListContainer');
    container.innerHTML = "";

    topics.forEach(t => {
        container.innerHTML += `
            <div class="list-item" style="cursor:pointer; border:1px solid var(--border-color); transition:0.2s;" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='var(--border-color)'" onclick="requestSwap('${targetEmail}', '${skill}', '${t}')">
                <div style="display:flex; align-items:center; gap:12px;">
                    <i class="fas fa-book-open" style="color:var(--primary-color)"></i>
                    <span style="font-weight:600;">${t}</span>
                </div>
                <i class="fas fa-chevron-right" style="font-size:12px; color:var(--text-muted)"></i>
            </div>`;
    });

    const modal = document.getElementById('topicSelectionModal');
    if(modal) {
        modal.classList.remove('hidden'); 
        modal.style.display = "flex";
    } else {
        console.error("Modal block missing from HTML!");
    }
}

function closeTopicModal() {
    const modal = document.getElementById('topicSelectionModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = "none";
    }
}

function requestSwap(targetEmail, skill, topic = "General (Full Skill)") {
    closeTopicModal(); 
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

    usersDB[meIndex].swaps.push({ skill: skill, topic: topic, partner: usersDB[targetIndex].name, partnerEmail: usersDB[targetIndex].email, status: 'Pending', role: 'Requester' });
    usersDB[targetIndex].swaps.push({ skill: skill, topic: topic, partner: usersDB[meIndex].name, partnerEmail: usersDB[meIndex].email, status: 'Requested', role: 'Provider' });
    
    let detailText = topic === "General (Full Skill)" ? "" : ` ('${topic}')`;
    usersDB[targetIndex].notifications.push({ 
        text: `🤝 ${usersDB[meIndex].name} requested to learn ${skill}${detailText} from you.`, 
        isRead: false, 
        id: Date.now() + Math.random() 
    });

    localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
    updateCloudUser(usersDB[meIndex]); 
    updateCloudUser(usersDB[targetIndex]); 

    alert(`✅ Swap Request sent for ${skill} - ${topic}!`);
    switchDashView('view-active-swaps', document.querySelectorAll('.sidebar-menu a')[2]);
}

function cancelSwap(mySwapIndex, partnerName, skill) {
    if(!confirm("Are you sure you want to cancel/decline/end this swap?")) return;
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const meIndex = usersDB.findIndex(u => u.email === myEmail);
    
    let mySwap = usersDB[meIndex].swaps[mySwapIndex];
    let targetIndex = usersDB.findIndex(u => u.email === mySwap.partnerEmail);
    if(targetIndex === -1) targetIndex = usersDB.findIndex(u => u.name === partnerName); 

    if(targetIndex !== -1) {
        
        if (mySwap.status === 'Active') {
            let providerIndex = mySwap.role === 'Provider' ? meIndex : targetIndex;
            let requesterIndex = mySwap.role === 'Requester' ? meIndex : targetIndex;

            if (providerIndex !== -1) {
                if (usersDB[providerIndex].credits === undefined) usersDB[providerIndex].credits = 5;
                usersDB[providerIndex].credits += 1;
                usersDB[providerIndex].notifications = usersDB[providerIndex].notifications || [];
                usersDB[providerIndex].notifications.push({ 
                    text: `🎉 Swap completed! You received 1 Credit for teaching '${skill}'.`, 
                    isRead: false, 
                    id: Date.now() + Math.random() 
                });
            }

            if (requesterIndex !== -1) {
                if (usersDB[requesterIndex].acquiredSkills === undefined) usersDB[requesterIndex].acquiredSkills = [];
                let learnedTopic = mySwap.topic || "General (Full Skill)";
                let alreadyLearned = usersDB[requesterIndex].acquiredSkills.some(item => 
                    (typeof item === 'object' && item.skill === skill && item.topic === learnedTopic) || 
                    (typeof item === 'string' && item === skill && learnedTopic === "General (Full Skill)")
                );

                if (!alreadyLearned) {
                    usersDB[requesterIndex].acquiredSkills.push({ skill: skill, topic: learnedTopic });
                    usersDB[requesterIndex].notifications = usersDB[requesterIndex].notifications || [];
                    usersDB[requesterIndex].notifications.push({
                        text: `🎓 You successfully learned '${learnedTopic}' in ${skill}! Check your Acquired Skills box.`,
                        isRead: false,
                        id: Date.now() + Math.random()
                    });
                }
            }
        } 
        else if (mySwap.status === 'Pending Confirmation') {
            let reqIdx = mySwap.role === 'Requester' ? meIndex : targetIndex;
            usersDB[reqIdx].credits += 1;
            usersDB[reqIdx].notifications = usersDB[reqIdx].notifications || [];
            usersDB[reqIdx].notifications.push({ text: `💰 Swap was not confirmed. 1 Credit refunded!`, isRead: false, id: Date.now() + Math.random() });
        }

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

function openAcquiredSkillsModal() {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const me = usersDB.find(u => u.email === myEmail);
    if(!me) return;

    let acquired = me.acquiredSkills || [];
    let myCurrentSkills = me.skills || [];
    let myCurrentTopics = me.topics || {};

    const container = document.getElementById('acquiredListContainer');
    container.innerHTML = "";

    if (acquired.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">You haven't learned any new skills yet. Complete a swap as a learner to add skills here!</p>`;
    } else {
        acquired.forEach(item => {
            let skName = typeof item === 'string' ? item : item.skill;
            let tpName = typeof item === 'string' ? "General (Full Skill)" : item.topic;

            let isAlreadyAdded = myCurrentSkills.includes(skName) && 
                                 (myCurrentTopics[skName] && myCurrentTopics[skName].includes(tpName));

            let btnHTML = isAlreadyAdded 
                ? `<button class="btn-outline" style="padding:8px 15px; font-size:12px; cursor:not-allowed; opacity:0.5; width:auto; margin:0; border-radius:8px;">Added</button>`
                : `<button class="btn-solid" style="padding:8px 15px; font-size:12px; margin:0; width:auto; border-radius:8px;" onclick="addAcquiredToProfile('${skName}', '${tpName}')">Add to Profile</button>`;

            container.innerHTML += `
                <div class="list-item" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:15px 20px; border-radius:12px; border:2px solid var(--border-color); box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                    <div style="flex:1; margin-right:15px;">
                        <h4 style="margin:0; font-size:16px; color:var(--text-main); font-weight:800;">${skName}</h4>
                        <p style="margin:4px 0 0 0; font-size:13px; color:var(--primary-color); font-weight:600;"><i class="fas fa-bullseye"></i> ${tpName}</p>
                    </div>
                    <div>${btnHTML}</div>
                </div>`;
        });
    }

    const modal = document.getElementById('acquiredSkillsModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = "flex";
    }
}

function closeAcquiredSkillsModal() {
    const modal = document.getElementById('acquiredSkillsModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = "none";
    }
}

function addAcquiredToProfile(skill, topic) {
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const meIndex = usersDB.findIndex(u => u.email === myEmail);
    if(meIndex === -1) return;

    if(!usersDB[meIndex].skills) usersDB[meIndex].skills = [];
    if(!usersDB[meIndex].topics) usersDB[meIndex].topics = {};

    if(!usersDB[meIndex].skills.includes(skill)) {
        usersDB[meIndex].skills.push(skill);
    }
    
    if(!usersDB[meIndex].topics[skill]) {
        usersDB[meIndex].topics[skill] = [];
    }
    
    if(!usersDB[meIndex].topics[skill].includes(topic)) {
        usersDB[meIndex].topics[skill].push(topic);
    }
    
    if (usersDB[meIndex].role === 'learn') {
        usersDB[meIndex].role = 'teach'; 
    }

    localStorage.setItem('skillSwapUsers', JSON.stringify(usersDB));
    updateCloudUser(usersDB[meIndex]);
    
    showToast(`🎉 Congratulations! You are now ready to teach '${topic}' in ${skill}!`);
    openAcquiredSkillsModal(); 
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
        showToast('🔒 You can only send messages if the swap is Active!');
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
    
    const myEmail = sessionStorage.getItem('loggedInUserEmail');
    const me = usersDB.find(u => u.email === myEmail);
    const history = (me.chatHistory && me.chatHistory[currentChatPartnerEmail]) ? me.chatHistory[currentChatPartnerEmail] : [];

    const videoBtn = document.getElementById('videoCallBtn');
    let activeSwap = me.swaps.find(s => s.partnerEmail === currentChatPartnerEmail && s.status === 'Active');
    
    if (activeSwap) {
        videoBtn.style.display = "block";
        let scheduledTime = activeSwap.scheduledTime;
        
        if (scheduledTime) {
            let currentTime = Date.now();
            if (currentTime >= scheduledTime) {
                if (activeSwap.role === 'Provider') {
                    videoBtn.innerHTML = `<i class="fas fa-video"></i> Video Call`;
                    videoBtn.style.background = "var(--primary-gradient)";
                    videoBtn.style.color = "white";
                    videoBtn.onclick = startVideoCall;
                } else {
                    videoBtn.innerHTML = `<i class="fas fa-lock"></i> Locked`;
                    videoBtn.style.background = "var(--bg-input)";
                    videoBtn.style.color = "var(--text-muted)";
                    videoBtn.onclick = () => showToast('🔒 Only the Mentor (Provider) can start the call.');
                }
            } else {
                let dateObj = new Date(scheduledTime);
                let formattedDate = dateObj.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
                videoBtn.innerHTML = `<i class="far fa-clock"></i> Scheduled`;
                videoBtn.style.background = "var(--bg-input)";
                videoBtn.style.color = "var(--text-muted)";
                videoBtn.onclick = () => showToast(`⏳ Call unlocks on: ${formattedDate}`);
            }
        } else {
            videoBtn.innerHTML = `<i class="fas fa-video"></i> Video Call`;
            videoBtn.style.background = "var(--primary-gradient)";
            videoBtn.style.color = "white";
            videoBtn.onclick = startVideoCall;
        }
    } else {
        videoBtn.style.display = "none";
    }

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
        
        if(user.topics) {
            editTopicsObj = JSON.parse(JSON.stringify(user.topics));
        } else {
            editTopicsObj = {};
        }
        
        editSkillsArray.forEach(sk => { if(!editTopicsObj[sk]) editTopicsObj[sk] = []; });
        
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
                editSkillsArray.push(skillValue); 
                editTopicsObj[skillValue] = []; 
                renderEditSkills();
            }
            this.value = ''; 
        }
    });
}

function renderEditSkills() {
    const list = document.getElementById('editSkillsList');
    list.innerHTML = '';
    
    editSkillsArray.forEach((skill, index) => {
        let tHTML = (editTopicsObj[skill] || []).map((t, tIdx) =>
            `<span style="font-size:11px; background:var(--primary-light); color:var(--primary-color); padding:4px 8px; border-radius:12px; margin-right:5px; margin-bottom:5px; display:inline-block; font-weight:600;">${t} <i class="fas fa-times" onclick="removeEditTopic('${skill}', ${tIdx})" style="cursor:pointer; margin-left:5px;"></i></span>`
        ).join('');

        list.innerHTML += `
        <div style="background:var(--bg-input); border:1px solid var(--border-color); padding:15px; border-radius:10px; margin-bottom:15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <div class="skill-tag" style="margin-bottom:10px; display:inline-block; font-size:14px;">${skill} <i class="fas fa-times" onclick="removeEditSkill(${index})"></i></div>
            <div style="margin-bottom:10px; display:flex; flex-wrap:wrap;">${tHTML}</div>
            <input type="text" placeholder="Add topic for ${skill} & Press Enter" onkeydown="handleEditTopicInput(event, '${skill}')" style="width:100%; padding:10px 12px; font-size:13px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-card); color:var(--text-main); outline:none;">
        </div>`;
    });
}

function handleEditTopicInput(e, skill) {
    if(e.key === 'Enter') {
        e.preventDefault();
        let val = e.target.value.trim();
        if(val !== '' && !editTopicsObj[skill].includes(val)) {
            editTopicsObj[skill].push(val);
            renderEditSkills();
        }
    }
}

function removeEditTopic(skill, tIdx) {
    editTopicsObj[skill].splice(tIdx, 1);
    renderEditSkills();
}

function removeEditSkill(index) { 
    let sk = editSkillsArray[index];
    delete editTopicsObj[sk];
    editSkillsArray.splice(index, 1); 
    renderEditSkills(); 
}

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
        usersDB[userIndex].topics = editTopicsObj; 
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
                
                alert("🎉 Your account has been permanently deleted!");
                logout();
            } else { alert("❌ Failed to delete account from the database."); }
        } catch (error) {
            console.error("Delete Error:", error);
            alert("Unable to connect to the server.");
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
        alert("Camera or Microphone permission denied! Please ensure no other app is using them.");
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

        for (let candidate of pendingIceCandidates) {
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
        }
        pendingIceCandidates = [];

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('make-answer', {
            to: incomingCallPartner,
            answer: answer
        });

    } catch (err) {
        alert("Camera or Microphone permission denied! Please ensure no other app is using them.");
        rejectCall();
    }
}

function rejectCall() {
    document.getElementById('incomingCallModal').style.display = "none";
    document.getElementById('videoCallModal').style.display = "none"; 
    if(incomingCallPartner) {
        socket.emit('reject-call', { to: incomingCallPartner });
    }
    incomingCallPartner = null;
    pendingIceCandidates = []; 
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        } else {
            if (!remoteStream) {
                remoteStream = new MediaStream();
            }
            remoteStream.addTrack(event.track);
            remoteVideo.srcObject = remoteStream;
        }
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
    }
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
    
    const localVid = document.getElementById('localVideo');
    if (localVid) localVid.srcObject = null;
    
    const remoteVid = document.getElementById('remoteVideo');
    if (remoteVid) remoteVid.srcObject = null;
    
    isCalling = false;
    incomingCallPartner = null;
    pendingIceCandidates = []; 
    document.getElementById('callStatusText').innerText = "Calling..."; 
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

let isAIOn = false;
let recognition;
const synth = window.speechSynthesis;

function toggleAITranslator() {
    isAIOn = !isAIOn;
    const btn = document.getElementById('toggleAIBtn');
    
    if (isAIOn) {
        btn.innerHTML = '<i class="fas fa-robot"></i> AI ON';
        btn.style.background = "#10b981"; 
        startAITranslationProcess();
    } else {
        btn.innerHTML = '<i class="fas fa-robot"></i> AI OFF';
        btn.style.background = "var(--primary-color)";
        if(recognition) recognition.stop();
    }
}

function startAITranslationProcess() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!window.SpeechRecognition) {
        alert("Your browser doesn't support AI Translation. Please use Google Chrome.");
        toggleAITranslator(); 
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    
    recognition.lang = document.getElementById('myLanguage').value || 'hi-IN'; 

    recognition.onresult = async (event) => {
        const lastIndex = event.results.length - 1;
        const spokenText = event.results[lastIndex][0].transcript;
        const targetLang = document.getElementById('targetLanguage').value || 'en-US';

        try {
            const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang.split('-')[0]}&dt=t&q=${encodeURI(spokenText)}`);
            const data = await response.json();
            const translatedText = data[0][0][0];

            let partnerEmail = incomingCallPartner || currentChatPartnerEmail; 
            
            if (partnerEmail) {
                socket.emit('send-translation', {
                    to: partnerEmail,
                    text: translatedText,
                    lang: targetLang
                });
            }
        } catch (error) { console.error("AI Translation Error:", error); }
    };

    recognition.onend = () => { if (isAIOn) { try { recognition.start(); } catch(e) {} } };
    try { recognition.start(); } catch(e) {}
}

socket.on('receive-translation', (data) => {
    const utterance = new SpeechSynthesisUtterance(data.text);
    utterance.lang = data.lang;
    utterance.rate = 1.0; 
    synth.speak(utterance);
    
    const statusText = document.getElementById('callStatusText');
    if(statusText) { statusText.innerText = `💬 Translation: ${data.text}`; }
});

// ==========================================
// 🟢 AI TROUBLESHOOTER LOGIC (NEW)
// ==========================================
function addAIMessage(text, type) {
    let chat = document.getElementById("aiChatBox");
    let div = document.createElement("div");
    div.className = "chat-bubble " + (type === 'user' ? 'sent' : 'received');
    
    if (type === 'user') {
        div.style.cssText = "align-self: flex-end; background: var(--primary-gradient); color: #fff; padding: 10px 15px; border-radius: 14px; font-size: 14px; max-width: 80%; word-wrap: break-word;";
    } else {
        div.style.cssText = "align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); padding: 10px 15px; border-radius: 14px; font-size: 14px; max-width: 80%; word-wrap: break-word;";
    }
    
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function quickAIMsg(text) {
    document.getElementById("aiUserInput").value = text;
    sendAIMessage();
}

function fallbackAI(msg) {
    msg = msg.toLowerCase();
    if (msg.includes("login")) return "Check your email and password. If you forgot it, use the 'Forgot Password' option on the login page.";
    if (msg.includes("video") || msg.includes("camera")) return "Make sure you have granted camera and microphone permissions in your browser. Also check if the other user is online.";
    if (msg.includes("code") || msg.includes("error")) return "Code errors usually happen due to missing semicolons, typos, or wrong logic. Try checking the browser console (F12) for exact error lines.";
    if (msg.includes("credit") || msg.includes("earn")) return "You earn 1 credit when you teach someone, and spend 1 credit when you learn. If you are out of credits, try accepting a swap request to teach!";
    return null;
}

async function sendAIMessage() {
    let input = document.getElementById("aiUserInput");
    let message = input.value.trim();
    if (!message) return;

    addAIMessage(message, "user");
    input.value = "";

    let fb = fallbackAI(message);
    if (fb) {
        setTimeout(() => addAIMessage(fb, "bot"), 600);
        return;
    }

    addAIMessage("Thinking...", "bot");
    let chatBox = document.getElementById("aiChatBox");

    try {
        let res = await fetch(`${API_BASE_URL}/api/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "69420" },
            body: JSON.stringify({ message })
        });
        
        let data = await res.json();
        chatBox.removeChild(chatBox.lastChild); 
        addAIMessage(data.reply, "bot");
        
    } catch (err) {
        console.error(err);
        chatBox.removeChild(chatBox.lastChild);
        addAIMessage("Sorry, my AI servers are currently resting. Please try again later!", "bot");
    }
}
