document.getElementById('adminLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPass').value.trim();
    const errorBox = document.getElementById('loginError');

    // 🟢 ADMIN MASTER CREDENTIALS
    const ADMIN_ID = "jainamgoswami2209";
    const ADMIN_PASS = "jainamgoswami";

    if (email === ADMIN_ID && pass === ADMIN_PASS) {
        // Success State
        errorBox.style.color = "#10b981"; // Vibrant Green
        errorBox.innerText = "Access Granted! Initializing Dashboard...";
        
        // Session storage for security check
        sessionStorage.setItem('isAdminLoggedIn', 'true');
        
        // Short delay for the success message to show
        setTimeout(() => {
            window.location.href = "admin_dashboard.html";
        }, 1200);
    } else {
        // Failure State
        errorBox.style.color = "#ef4444"; // Error Red
        errorBox.innerText = "Access Denied: Invalid Master Credentials!";
        
        // Shake animation effect for input fields could be added here
    }
});

// 🟢 Auto-redirect if already logged in during current session
window.onload = function() {
    if(sessionStorage.getItem('isAdminLoggedIn') === 'true') {
        window.location.href = "admin_dashboard.html";
    }
}
