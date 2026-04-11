document.getElementById('adminLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPass').value.trim();
    const errorBox = document.getElementById('loginError');

    // 🟢 ADMIN CREDENTIALS (Aap isse apne hisaab se change kar sakte hain)
    const ADMIN_ID = "admin@skillhub.com";
    const ADMIN_PASS = "Admin@123";

    if (email === ADMIN_ID && pass === ADMIN_PASS) {
        errorBox.style.color = "#10b981"; // Green color
        errorBox.innerText = "Access Granted! Redirecting...";
        
        // Session save karke dashboard pe bhejenge
        sessionStorage.setItem('isAdminLoggedIn', 'true');
        
        setTimeout(() => {
            window.location.href = "admin_dashboard.html";
        }, 1000);
    } else {
        errorBox.style.color = "#ef4444"; // Red color
        errorBox.innerText = "Invalid Admin Credentials!";
    }
});

// Agar pehle se login hai toh seedha dashboard pe bhej do
window.onload = function() {
    if(sessionStorage.getItem('isAdminLoggedIn') === 'true') {
        window.location.href = "admin_dashboard.html";
    }
}