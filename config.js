// ==========================================
// 🔑 API, GOOGLE SCRIPT & FIREBASE SETUP
// ==========================================
const API_BASE_URL = "https://skillswap-backend-yexk.onrender.com"; // Backend ka address (Cloud Live)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRuReO-rxWTnQEQLRaaYkqb05z2hSw833TjLIx5Dd9dY8AAWVofH1iFLPkjTpLO4o-/exec";
// 🟢 FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyDUhSdw6XbhNi1oTe4cOPLA_Ma1Vmg0fe8", // Navin API key yithe taka
  authDomain: "skillhub-app-7ca09.firebaseapp.com",
  projectId: "skillhub-app-7ca09",
  storageBucket: "skillhub-app-7ca09.firebasestorage.app",
  messagingSenderId: "422746633837",
  appId: "1:422746633837:web:8cfe18f8ac282ec836b164",
  measurementId: "G-H14JBLT470"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
auth.useDeviceLanguage(); // Set SMS language

let usersDB = JSON.parse(localStorage.getItem('skillSwapUsers')) || [];

function sendRealEmailOTP(targetEmail, otp, successCallback) {
    const requestUrl = GOOGLE_SCRIPT_URL + "?email=" + encodeURIComponent(targetEmail) + "&otp=" + encodeURIComponent(otp);
    fetch(requestUrl, { mode: 'no-cors' })
        .then(() => { alert("OTP sent to your email"); successCallback(); })
        .catch(() => { alert("OTP sent to your email"); successCallback(); });
}

function togglePass(inputId, iconElement) {
    var x = document.getElementById(inputId);
    if (x.type === "password") {
        x.type = "text";
        iconElement.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        x.type = "password";
        iconElement.classList.replace("fa-eye-slash", "fa-eye");
    }
}

window.onload = function() {
    const savedTheme = localStorage.getItem('skillSwapTheme');
    if(savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if(document.getElementById('darkModeToggle')) document.getElementById('darkModeToggle').checked = true;
    }
    const savedColor = localStorage.getItem('skillSwapColor');
    if(savedColor) {
        changeThemeColor(savedColor, localStorage.getItem('skillSwapHover'), localStorage.getItem('skillSwapLight'));
    }
    
    if (document.getElementById('dashboardWrapper') && !sessionStorage.getItem('loggedInUserEmail')) {
        window.location.href = "index.html"; 
    }
    
    if (document.getElementById('authWrapper')) {
        sessionStorage.removeItem('loggedInUserEmail'); 
    }
    
    if(document.getElementById('dashboardWrapper')){
        refreshDynamicData();
    }
}

function changeThemeColor(mainColor, hoverColor, lightColor) {
    document.documentElement.style.setProperty('--primary-color', mainColor);
    document.documentElement.style.setProperty('--primary-hover', hoverColor);
    document.documentElement.style.setProperty('--primary-light', lightColor);
    localStorage.setItem('skillSwapColor', mainColor);
    localStorage.setItem('skillSwapHover', hoverColor);
    localStorage.setItem('skillSwapLight', lightColor);
}
