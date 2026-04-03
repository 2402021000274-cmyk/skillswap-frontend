let currentTempUser = {}; 
let userSkillsArray = []; 
let currentProfilePic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
let pendingLoginUser = null;
let generatedOTP = null;
let resetTargetEmail = null;
let resetGeneratedOTP = null;
let regGeneratedOTP = null;

const messageBox = document.getElementById('messageBox');

function switchAuthView(viewId, element) {
    document.querySelectorAll('.auth-view').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if(element) {
        document.querySelectorAll('.auth-nav-link').forEach(link => link.classList.remove('active'));
        element.classList.add('active');
    }
    messageBox.innerText = "";
    if(viewId === 'homeView') showSubForm('loginForm');
}

function showSubForm(formId) {
    const forms = ['loginForm', 'registerForm', 'regOtpForm', 'profileSetupForm', 'otpForm', 'forgotPasswordForm', 'verifyForgotOTPForm'];
    forms.forEach(id => {
        let el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    let target = document.getElementById(formId);
    if(target) target.classList.remove('hidden');
    messageBox.innerText = ""; 
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim(); 
    const pass = document.getElementById('loginPass').value;
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "Checking Database..."; 
    btn.disabled = true;

    try {
        const response = await fetch(API_BASE_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: pass })
        });
        const data = await response.json();

        if (response.ok) {
            const currentUser = data.user;
            
            let localDB = JSON.parse(localStorage.getItem('skillSwapUsers')) || [];
            let existingIdx = localDB.findIndex(u => u.email === currentUser.email);
            if (existingIdx === -1) {
                localDB.push(currentUser);
            } else {
                localDB[existingIdx] = currentUser;
            }
            localStorage.setItem('skillSwapUsers', JSON.stringify(localDB));

            if(currentUser.is2FAEnabled) {
                pendingLoginUser = currentUser;
                generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); 
                btn.innerText = "Sending OTP...";
                sendRealEmailOTP(currentUser.email, generatedOTP, () => {
                    showSubForm('otpForm'); btn.innerText = "Login"; btn.disabled = false;
                });
            } else { 
                finalizeLogin(currentUser); 
            }

        } else {
            messageBox.innerHTML = `<span class='error-msg'>${data.message}</span>`;
            btn.innerText = "Login"; 
            btn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        messageBox.innerHTML = "<span class='error-msg'>Server connect nahi ho raha.</span>";
        btn.innerText = "Login"; 
        btn.disabled = false;
    }
}

function handleVerifyOTP(e) {
    e.preventDefault();
    if (document.getElementById('otpInput').value.trim() === generatedOTP) { finalizeLogin(pendingLoginUser); } 
    else { messageBox.innerHTML = "<span class='error-msg'>Invalid OTP!</span>"; }
}

function finalizeLogin(userFound) {
    sessionStorage.setItem('loggedInUserEmail', userFound.email);
    window.location.href = "dashboard.html"; 
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const pass = document.getElementById('regPass').value;

    currentTempUser = { name: name, email: email, phone: phone, pass: pass, is2FAEnabled: false, isPublic: true, swaps: [], inbox: [], notifications: [], credits: 5 };
    userSkillsArray = []; 
    currentProfilePic = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; 
    
    regGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Sending OTP..."; btn.disabled = true;
    sendRealEmailOTP(email, regGeneratedOTP, () => {
        showSubForm('regOtpForm'); btn.innerText = originalText; btn.disabled = false;
    });
}

function handleVerifyRegOTP(e) {
    e.preventDefault();
    const enteredOTP = document.getElementById('regOtpInput').value.trim();
    if (enteredOTP === regGeneratedOTP) {
        renderSkills(); showSubForm('profileSetupForm');
        document.getElementById('profName').value = currentTempUser.name;
        document.getElementById('profEmail').value = currentTempUser.email;
        document.getElementById('regOtpInput').value = '';
    } else { messageBox.innerHTML = "<span class='error-msg'>Invalid OTP! Please try again.</span>"; }
}

// 🟢 BUG FIX: IMAGE COMPRESSOR ADDED HERE
function previewImage(event, targetId) {
    const file = event.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Photo resize karne ka logic taaki save ho sake
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 250; // profile pic ke liye 250px kaafi hai
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Compress karke wapas code me dena
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            document.getElementById(targetId).src = compressedBase64;
            currentProfilePic = compressedBase64;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function selectRole(role) {
    document.querySelectorAll('.role-box').forEach(box => box.classList.remove('active'));
    const selectedInput = document.querySelector(`input[value="${role}"]`);
    selectedInput.parentElement.classList.add('active');
    selectedInput.checked = true;

    const skillContainer = document.getElementById('skillInputContainer');
    if(role === 'learn') {
        skillContainer.style.display = 'none'; 
    } else {
        skillContainer.style.display = 'block'; 
    }
}

if(document.getElementById('skillInput')){
    document.getElementById('skillInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            const skillValue = this.value.trim();
            if (skillValue !== '' && !userSkillsArray.includes(skillValue)) {
                userSkillsArray.push(skillValue); renderSkills();
            }
            this.value = ''; 
        }
    });
}

function renderSkills() {
    const skillsList = document.getElementById('skillsList');
    skillsList.innerHTML = '';
    userSkillsArray.forEach((skill, index) => {
        skillsList.innerHTML += `<div class="skill-tag">${skill} <i class="fas fa-times" onclick="removeSkill(${index})"></i></div>`;
    });
}
function removeSkill(index) { userSkillsArray.splice(index, 1); renderSkills(); }

async function handleProfileSave(e) {
    e.preventDefault();
    const selectedRole = document.querySelector('input[name="userRole"]:checked').value;
    const userAddress = document.getElementById('profAddress').value.trim();
    
    if(selectedRole === 'teach' && userSkillsArray.length === 0) { 
        alert("Please add at least one skill to teach!"); 
        return; 
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Saving to Database..."; btn.disabled = true;

    let finalSkill = selectedRole === 'teach' ? userSkillsArray[0] : "Learner Only";

    try {
        const response = await fetch(API_BASE_URL + '/register', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '69420'
            },
            body: JSON.stringify({
                name: currentTempUser.name,
                email: currentTempUser.email,
                password: currentTempUser.pass, 
                phone: currentTempUser.phone,
                address: userAddress, 
                role: selectedRole, 
                skill: finalSkill,
                skills: userSkillsArray, 
                profilePic: currentProfilePic
            })
        });
        
        const data = await response.json();
        
        if(!response.ok) {
            messageBox.innerHTML = `<span class='error-msg'>${data.message}</span>`;
            btn.innerText = originalText; btn.disabled = false;
            return;
        }

        messageBox.innerHTML = "<span class='success-msg'>Profile Saved! Please Login.</span>";
        setTimeout(() => { 
            showSubForm('loginForm'); 
            document.getElementById('loginEmail').value = currentTempUser.email; 
            btn.innerText = originalText; btn.disabled = false;
        }, 1500);

    } catch (err) {
        console.log("⚠️ Database error: Server chalu nahi hai.", err);
        messageBox.innerHTML = "<span class='error-msg'>Server Error. Try again.</span>";
        btn.innerText = originalText; btn.disabled = false;
    }
}

async function handleSendForgotOTP(e) {
    e.preventDefault();
    const identifier = document.getElementById('forgotIdentifier').value.trim();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "Checking Database..."; btn.disabled = true;

    try {
        const response = await fetch(API_BASE_URL + '/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: identifier })
        });
        const data = await response.json();

        if(response.ok) {
            resetTargetEmail = identifier;
            resetGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
            btn.innerText = "Sending Email..."; 
            sendRealEmailOTP(resetTargetEmail, resetGeneratedOTP, () => {
                showSubForm('verifyForgotOTPForm'); btn.innerText = "Send OTP"; btn.disabled = false;
            });
        } else { 
            messageBox.innerHTML = `<span class='error-msg'>${data.message}</span>`; 
            btn.innerText = "Send OTP"; btn.disabled = false;
        }
    } catch(err) {
        messageBox.innerHTML = "<span class='error-msg'>Server Error</span>";
        btn.innerText = "Send OTP"; btn.disabled = false;
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const enteredOTP = document.getElementById('forgotOTPInput').value.trim();
    const newPass = document.getElementById('forgotNewPassInput').value;
    if(enteredOTP !== resetGeneratedOTP) { messageBox.innerHTML = "<span class='error-msg'>Invalid OTP!</span>"; return; }
    if(newPass.length < 4) { messageBox.innerHTML = "<span class='error-msg'>Password too short!</span>"; return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "Updating..."; btn.disabled = true;

    try {
        const response = await fetch(API_BASE_URL + '/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetTargetEmail, newPassword: newPass })
        });
        const data = await response.json();

        if(response.ok) {
            messageBox.innerHTML = "<span class='success-msg'>Password Reset Successfully!</span>";
            setTimeout(() => { showSubForm('loginForm'); btn.innerText = "Reset Password"; btn.disabled = false; }, 1500);
        } else {
            messageBox.innerHTML = `<span class='error-msg'>${data.message}</span>`;
            btn.innerText = "Reset Password"; btn.disabled = false;
        }
    } catch(err) {
        messageBox.innerHTML = "<span class='error-msg'>Server Error</span>";
        btn.innerText = "Reset Password"; btn.disabled = false;
    }
}
