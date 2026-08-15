// =========================================================================
// 1. FIREBASE CONFIGURATION
// =========================================================================
// INSTRUCTIONS:
// 1. Go to the Firebase Console: https://console.firebase.google.com/
// 2. Create a new Firebase project (e.g., "Employee-Management-System").
// 3. Register a Web Application inside the project.
// 4. Copy the config values provided by Firebase and replace the placeholders below.
// 5. Enable Email/Password Sign-In: Build > Authentication > Sign-in method.
// 6. Create a Firestore Database: Build > Firestore Database > Create Database.
// 7. Ensure Firestore Rules allow read/write access to authenticated users.

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// =========================================================================
// 2. FIREBASE SDK IMPORTS (Using ES Modules from CDN)
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    doc, 
    setDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================================
// 3. STATE MANAGEMENT & INITIALIZATION
// =========================================================================
let authInstance = null;
let dbInstance = null;
let isDemoMode = false;
let employeesList = [];
let currentUser = null;
let activeSection = "section-overview";
let unsubscribeFirestore = null;

// DOM Elements Cache
const appLoading = document.getElementById("app-loading");
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const userEmailDisplay = document.getElementById("user-email-display");
const pageTitleDisplay = document.getElementById("page-title-display");
const pageDescDisplay = document.getElementById("page-desc-display");
const quickAddBtn = document.getElementById("quick-add-btn");
const toastContainer = document.getElementById("toast-container");

// Modals
const employeeModal = document.getElementById("employee-modal");
const employeeForm = document.getElementById("employee-form");
const modalTitle = document.getElementById("modal-title");
const formModeInput = document.getElementById("form-mode");
const editDocIdInput = document.getElementById("edit-doc-id");

const detailsModal = document.getElementById("details-modal");
const confirmModal = document.getElementById("confirm-modal");

// Statistics Indicators
const statTotal = document.getElementById("stat-total-employees");
const statActive = document.getElementById("stat-active-employees");
const statInactive = document.getElementById("stat-inactive-employees");
const statDepartments = document.getElementById("stat-departments");
const statManagers = document.getElementById("stat-managers");

// Search & Filters
const searchInput = document.getElementById("employee-search");
const clearSearchBtn = document.getElementById("clear-search-btn");
const filterDept = document.getElementById("filter-department");
const filterStatus = document.getElementById("filter-status");
const tableBody = document.getElementById("employee-table-body");
const tableEmptyState = document.getElementById("table-empty-state");

// Initialize Firebase or Fallback to Demo Mode
function initApp() {
    const isConfigDefault = !firebaseConfig.apiKey || 
                            firebaseConfig.apiKey === "YOUR_API_KEY" || 
                            firebaseConfig.apiKey.startsWith("YOUR_");

    if (isConfigDefault) {
        isDemoMode = true;
        console.warn("Using Default Credentials: Running in Client-Side Demo Mode.");
        setupDemoEnvironment();
    } else {
        try {
            const app = initializeApp(firebaseConfig);
            authInstance = getAuth(app);
            dbInstance = getFirestore(app);
            setupFirebaseEnvironment();
        } catch (error) {
            console.error("Firebase Initialization Failed:", error);
            showToast("Initialization Error", "Failed to connect to Firebase Cloud. Reverting to Demo Mode.", "error");
            isDemoMode = true;
            setupDemoEnvironment();
        }
    }
}

// =========================================================================
// 4. FIREBASE MODE ENVIRONMENT
// =========================================================================
function setupFirebaseEnvironment() {
    // Session State Listener
    onAuthStateChanged(authInstance, (user) => {
        appLoading.classList.add("hidden");
        if (user) {
            currentUser = user;
            userEmailDisplay.textContent = user.email;
            loginView.classList.add("hidden");
            dashboardView.classList.remove("hidden");
            showToast("Login Success", `Welcome back, ${user.email}`, "success");
            
            // Connect Database Snapshots
            bindFirestoreRealtimeStream();
        } else {
            cleanupSession();
            loginView.classList.remove("hidden");
            dashboardView.classList.add("hidden");
        }
    });

    // Form Submissions
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;

        if (validateLoginForm(email, password)) {
            setBtnLoading("login-btn", true, "Signing In...");
            signInWithEmailAndPassword(authInstance, email, password)
                .catch((error) => {
                    setBtnLoading("login-btn", false, "Sign In");
                    handleAuthError(error);
                });
        }
    });

    logoutBtn.addEventListener("click", () => {
        signOut(authInstance).then(() => {
            showToast("Logged Out", "You have signed out successfully.", "info");
        });
    });
}

function bindFirestoreRealtimeStream() {
    if (unsubscribeFirestore) unsubscribeFirestore();

    const employeesRef = collection(dbInstance, "employees");
    const q = query(employeesRef, orderBy("createdAt", "desc"));

    unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        employeesList = [];
        snapshot.forEach((docSnap) => {
            employeesList.push({
                docId: docSnap.id,
                ...docSnap.data()
            });
        });
        updateDashboardStats();
        renderEmployeeTable();
        renderDepartmentChart();
    }, (error) => {
        console.error("Firestore error:", error);
        showToast("Database Sync Error", "Unable to stream updates. Check rules.", "error");
    });
}

// =========================================================================
// 5. OFFLINE MOCK / DEMO ENVIRONMENT
// =========================================================================
const DEMO_LOCAL_KEY = "cloud_ems_demo_employees";
const DEMO_USER_KEY = "cloud_ems_demo_user";

const defaultDemoEmployees = [
    {
        docId: "demo-1",
        employeeId: "EMP001",
        fullName: "Sriram Ramaswamy",
        email: "sriram@organization.com",
        phone: "+91 98765 43210",
        department: "IT",
        designation: "Software Developer",
        gender: "Male",
        dateOfJoining: "2024-01-15",
        salary: 75000,
        status: "Active",
        address: "12, Cloud Street, Tech Park, Chennai, India",
        createdAt: new Date().toISOString(),
        createdBy: "demo-admin-uid"
    },
    {
        docId: "demo-2",
        employeeId: "EMP002",
        fullName: "Priya Sharma",
        email: "priya.s@organization.com",
        phone: "+91 81234 56789",
        department: "HR",
        designation: "HR Manager",
        gender: "Female",
        dateOfJoining: "2023-06-10",
        salary: 62000,
        status: "Active",
        address: "Suite 4B, Emerald Towers, Bangalore, India",
        createdAt: new Date().toISOString(),
        createdBy: "demo-admin-uid"
    },
    {
        docId: "demo-3",
        employeeId: "EMP003",
        fullName: "Vikram Malhotra",
        email: "vikram.m@organization.com",
        phone: "+91 90012 34567",
        department: "Finance",
        designation: "Financial Analyst",
        gender: "Male",
        dateOfJoining: "2024-03-22",
        salary: 68000,
        status: "Inactive",
        address: "712, Money Market Road, Mumbai, India",
        createdAt: new Date().toISOString(),
        createdBy: "demo-admin-uid"
    }
];

function setupDemoEnvironment() {
    // Add banner warning to UI
    const banner = document.createElement("div");
    banner.className = "cloud-status-badge warning";
    banner.style.cursor = "pointer";
    banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Demo Mode (No Config)`;
    banner.title = "Click to see instructions for setting up Firebase Database connection";
    banner.addEventListener("click", () => navigateToSection("section-viva"));
    
    const headerActions = document.querySelector(".header-actions");
    const oldBadge = headerActions.querySelector(".cloud-status-badge");
    if (oldBadge) {
        headerActions.replaceChild(banner, oldBadge);
    } else {
        headerActions.prepend(banner);
    }

    // Load Demo User Session
    const savedUser = localStorage.getItem(DEMO_USER_KEY);
    appLoading.classList.add("hidden");
    if (savedUser) {
        currentUser = { email: savedUser, uid: "demo-admin-uid" };
        userEmailDisplay.textContent = currentUser.email;
        loginView.classList.add("hidden");
        dashboardView.classList.remove("hidden");
        loadDemoData();
    } else {
        cleanupSession();
        loginView.classList.remove("hidden");
        dashboardView.classList.add("hidden");
    }

    // Handle Mock Login
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;

        if (validateLoginForm(email, password)) {
            setBtnLoading("login-btn", true, "Signing In (Demo)...");
            setTimeout(() => {
                setBtnLoading("login-btn", false, "Sign In");
                if (email === "admin@cloudems.com" && password === "admin123") {
                    localStorage.setItem(DEMO_USER_KEY, email);
                    currentUser = { email: email, uid: "demo-admin-uid" };
                    userEmailDisplay.textContent = email;
                    loginView.classList.add("hidden");
                    dashboardView.classList.remove("hidden");
                    showToast("Login Success", "Demonstration Mode Active.", "success");
                    loadDemoData();
                } else {
                    showToast("Auth Failed", "Invalid email or password. Use demo credentials (admin@cloudems.com / admin123)", "error");
                }
            }, 800);
        }
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem(DEMO_USER_KEY);
        cleanupSession();
        loginView.classList.remove("hidden");
        dashboardView.classList.add("hidden");
        showToast("Logged Out", "Demo session ended.", "info");
    });
}

function loadDemoData() {
    let raw = localStorage.getItem(DEMO_LOCAL_KEY);
    if (!raw) {
        localStorage.setItem(DEMO_LOCAL_KEY, JSON.stringify(defaultDemoEmployees));
        employeesList = [...defaultDemoEmployees];
    } else {
        employeesList = JSON.parse(raw);
    }
    updateDashboardStats();
    renderEmployeeTable();
    renderDepartmentChart();
}

function saveDemoData() {
    localStorage.setItem(DEMO_LOCAL_KEY, JSON.stringify(employeesList));
    updateDashboardStats();
    renderEmployeeTable();
    renderDepartmentChart();
}

// =========================================================================
// 6. FORM VALIDATIONS
// =========================================================================
function validateLoginForm(email, password) {
    let isValid = true;
    const emailErr = document.getElementById("email-error");
    const passErr = document.getElementById("password-error");

    emailErr.textContent = "";
    passErr.textContent = "";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
        emailErr.textContent = "Email address is required.";
        isValid = false;
    } else if (!emailRegex.test(email)) {
        emailErr.textContent = "Please enter a valid email address.";
        isValid = false;
    }

    if (!password) {
        passErr.textContent = "Password is required.";
        isValid = false;
    } else if (password.length < 6) {
        passErr.textContent = "Password must be at least 6 characters.";
        isValid = false;
    }

    return isValid;
}

function validateEmployeeForm(data, docId) {
    let isValid = true;

    // Reset errors
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");

    // ID Validation (EMPXXX)
    if (!data.employeeId.trim()) {
        document.getElementById("emp-id-error").textContent = "Employee ID is required.";
        isValid = false;
    } else if (!/^[A-Za-z0-9-]+$/.test(data.employeeId)) {
        document.getElementById("emp-id-error").textContent = "Special characters & spaces are not allowed.";
        isValid = false;
    } else {
        // Unique Check
        const match = employeesList.find(e => e.employeeId.toUpperCase() === data.employeeId.toUpperCase() && e.docId !== docId);
        if (match) {
            document.getElementById("emp-id-error").textContent = "This Employee ID is already assigned.";
            isValid = false;
        }
    }

    // Name Validation
    if (!data.fullName.trim()) {
        document.getElementById("emp-fullname-error").textContent = "Full name is required.";
        isValid = false;
    } else if (!/^[A-Za-z\s.]+$/.test(data.fullName)) {
        document.getElementById("emp-fullname-error").textContent = "Names can only contain letters, dots, and spaces.";
        isValid = false;
    }

    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email.trim()) {
        document.getElementById("emp-email-error").textContent = "Email is required.";
        isValid = false;
    } else if (!emailRegex.test(data.email)) {
        document.getElementById("emp-email-error").textContent = "Invalid email format.";
        isValid = false;
    }

    // Phone Validation
    if (!data.phone.trim()) {
        document.getElementById("emp-phone-error").textContent = "Phone number is required.";
        isValid = false;
    } else if (!/^[0-9+\s-()]{10,15}$/.test(data.phone)) {
        document.getElementById("emp-phone-error").textContent = "Enter a valid phone number (10-15 digits).";
        isValid = false;
    }

    // Department Validation
    if (!data.department) {
        document.getElementById("emp-department-error").textContent = "Select a department.";
        isValid = false;
    }

    // Designation Validation
    if (!data.designation.trim()) {
        document.getElementById("emp-designation-error").textContent = "Designation is required.";
        isValid = false;
    }

    // Gender Validation
    if (!data.gender) {
        document.getElementById("emp-gender-error").textContent = "Select gender.";
        isValid = false;
    }

    // Joining Date Validation
    if (!data.dateOfJoining) {
        document.getElementById("emp-joining-error").textContent = "Select date of joining.";
        isValid = false;
    }

    // Salary Validation
    if (!data.salary || isNaN(data.salary) || data.salary <= 0) {
        document.getElementById("emp-salary-error").textContent = "Salary must be a positive number.";
        isValid = false;
    }

    // Address Validation
    if (!data.address.trim()) {
        document.getElementById("emp-address-error").textContent = "Address is required.";
        isValid = false;
    }

    return isValid;
}

// =========================================================================
// 7. OPERATIONS: ADD / EDIT / DELETE
// =========================================================================
function handleSaveEmployee(e) {
    e.preventDefault();

    const mode = formModeInput.value;
    const docId = editDocIdInput.value;

    const data = {
        employeeId: document.getElementById("emp-id").value.trim().toUpperCase(),
        fullName: document.getElementById("emp-fullname").value.trim(),
        email: document.getElementById("emp-email").value.trim(),
        phone: document.getElementById("emp-phone").value.trim(),
        department: document.getElementById("emp-department").value,
        designation: document.getElementById("emp-designation").value.trim(),
        gender: document.getElementById("emp-gender").value,
        dateOfJoining: document.getElementById("emp-joining").value,
        salary: parseFloat(document.getElementById("emp-salary").value),
        status: document.getElementById("emp-status").value,
        address: document.getElementById("emp-address").value.trim()
    };

    if (!validateEmployeeForm(data, docId)) {
        return;
    }

    setBtnLoading("save-employee-btn", true, "Saving Record...");

    if (isDemoMode) {
        setTimeout(() => {
            setBtnLoading("save-employee-btn", false, "Save Record");
            if (mode === "add") {
                data.docId = "demo-" + Date.now();
                data.createdAt = new Date().toISOString();
                data.createdBy = currentUser.uid;
                employeesList.unshift(data);
                showToast("Record Added", `${data.fullName} registered successfully (Demo).`, "success");
            } else {
                const index = employeesList.findIndex(e => e.docId === docId);
                if (index !== -1) {
                    employeesList[index] = { ...employeesList[index], ...data };
                    showToast("Record Updated", `Changes saved for ${data.fullName} (Demo).`, "success");
                }
            }
            saveDemoData();
            closeModal(employeeModal);
        }, 600);
    } else {
        // Real Firebase Operation
        if (mode === "add") {
            data.createdAt = serverTimestamp();
            data.createdBy = currentUser.uid;
            
            addDoc(collection(dbInstance, "employees"), data)
                .then(() => {
                    setBtnLoading("save-employee-btn", false, "Save Record");
                    showToast("Cloud Synced", `${data.fullName} stored in Firestore.`, "success");
                    closeModal(employeeModal);
                })
                .catch((err) => {
                    setBtnLoading("save-employee-btn", false, "Save Record");
                    showToast("Cloud Error", err.message, "error");
                });
        } else {
            // Edit update doc
            const docRef = doc(dbInstance, "employees", docId);
            setDoc(docRef, data, { merge: true })
                .then(() => {
                    setBtnLoading("save-employee-btn", false, "Save Record");
                    showToast("Cloud Updated", `${data.fullName} profile synced.`, "success");
                    closeModal(employeeModal);
                })
                .catch((err) => {
                    setBtnLoading("save-employee-btn", false, "Save Record");
                    showToast("Cloud Error", err.message, "error");
                });
        }
    }
}

function handleConfirmDelete(docId, name, empId) {
    document.getElementById("delete-name-display").textContent = name;
    document.getElementById("delete-id-display").textContent = empId;
    
    const confirmBtn = document.getElementById("confirm-delete-btn");
    
    // Clear old click listener using clone method
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    openModal(confirmModal);

    newConfirmBtn.addEventListener("click", () => {
        setBtnLoading(newConfirmBtn, true, "Deleting...");
        if (isDemoMode) {
            setTimeout(() => {
                employeesList = employeesList.filter(e => e.docId !== docId);
                saveDemoData();
                setBtnLoading(newConfirmBtn, false, "Delete Record");
                closeModal(confirmModal);
                showToast("Record Deleted", `${name} has been removed.`, "info");
            }, 600);
        } else {
            const docRef = doc(dbInstance, "employees", docId);
            deleteDoc(docRef)
                .then(() => {
                    setBtnLoading(newConfirmBtn, false, "Delete Record");
                    closeModal(confirmModal);
                    showToast("Cloud Deleted", "Record deleted from Firestore.", "info");
                })
                .catch((err) => {
                    setBtnLoading(newConfirmBtn, false, "Delete Record");
                    showToast("Delete Error", err.message, "error");
                });
        }
    });
}

// =========================================================================
// 8. RENDERERS & LAYOUT CONTROLLERS
// =========================================================================
function updateDashboardStats() {
    const total = employeesList.length;
    const active = employeesList.filter(e => e.status === "Active").length;
    const inactive = total - active;
    
    // Unique departments
    const depts = new Set(employeesList.map(e => e.department).filter(Boolean));
    const deptCount = depts.size;

    // Managers count (Designation contains "Manager", "Lead", "Director", "Head")
    const managerCount = employeesList.filter(e => {
        const role = (e.designation || "").toLowerCase();
        return role.includes("manager") || role.includes("lead") || role.includes("director") || role.includes("head") || role.includes("president");
    }).length;

    // Trigger odometer effect or set text
    statTotal.textContent = total;
    statActive.textContent = active;
    statInactive.textContent = inactive;
    statDepartments.textContent = deptCount;
    statManagers.textContent = managerCount;
}

function renderEmployeeTable() {
    const queryStr = searchInput.value.toLowerCase().trim();
    const deptFilter = filterDept.value;
    const statusFilter = filterStatus.value;

    let filtered = employeesList.filter(emp => {
        // Search matches
        const matchesQuery = !queryStr || 
            emp.employeeId.toLowerCase().includes(queryStr) ||
            emp.fullName.toLowerCase().includes(queryStr) ||
            emp.email.toLowerCase().includes(queryStr) ||
            emp.department.toLowerCase().includes(queryStr) ||
            emp.designation.toLowerCase().includes(queryStr);

        // Filters match
        const matchesDept = deptFilter === "All" || emp.department === deptFilter;
        const matchesStatus = statusFilter === "All" || emp.status === statusFilter;

        return matchesQuery && matchesDept && matchesStatus;
    });

    tableBody.innerHTML = "";

    if (filtered.length === 0) {
        tableEmptyState.classList.remove("hidden");
        document.getElementById("employee-table").classList.add("hidden");
    } else {
        tableEmptyState.classList.add("hidden");
        document.getElementById("employee-table").classList.remove("hidden");

        filtered.forEach(emp => {
            const row = document.createElement("tr");
            
            const statusClass = emp.status === "Active" ? "active-badge" : "inactive-badge";
            const statusIcon = emp.status === "Active" ? "fa-circle-check" : "fa-circle-xmark";

            row.innerHTML = `
                <td><span class="emp-id-badge">${escapeHtml(emp.employeeId)}</span></td>
                <td style="font-weight:600;">${escapeHtml(emp.fullName)}</td>
                <td><span class="dept-text">${escapeHtml(emp.department)}</span></td>
                <td>${escapeHtml(emp.designation)}</td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${escapeHtml(emp.email)}</td>
                <td>${escapeHtml(emp.phone)}</td>
                <td>${escapeHtml(emp.dateOfJoining)}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <i class="fa-solid ${statusIcon}"></i> ${emp.status}
                    </span>
                </td>
                <td class="actions-column">
                    <div class="actions-cell">
                        <button class="action-btn view-btn" title="View Profile" data-id="${emp.docId}">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                        <button class="action-btn edit-btn" title="Edit Employee" data-id="${emp.docId}">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete Record" data-id="${emp.docId}">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;

            // Bind actions dynamically to avoid inline JS handlers
            row.querySelector(".view-btn").addEventListener("click", () => showEmployeeDetails(emp));
            row.querySelector(".edit-btn").addEventListener("click", () => openEditForm(emp));
            row.querySelector(".delete-btn").addEventListener("click", () => handleConfirmDelete(emp.docId, emp.fullName, emp.employeeId));

            tableBody.appendChild(row);
        });
    }

    // Toggle clear search button
    if (queryStr) {
        clearSearchBtn.classList.remove("hidden");
    } else {
        clearSearchBtn.classList.add("hidden");
    }
}

function renderDepartmentChart() {
    const chartContainer = document.getElementById("dept-bar-chart");
    chartContainer.innerHTML = "";

    if (employeesList.length === 0) {
        chartContainer.innerHTML = `<p class="placeholder-text">Add employees to see department allocation</p>`;
        return;
    }

    // Group counts
    const deptTotals = {};
    employeesList.forEach(e => {
        deptTotals[e.department] = (deptTotals[e.department] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(deptTotals));

    Object.entries(deptTotals).sort((a,b) => b[1] - a[1]).forEach(([dept, count]) => {
        const percentage = (count / maxCount) * 100;
        
        const row = document.createElement("div");
        row.className = "chart-row";
        row.innerHTML = `
            <span class="chart-label">${dept}</span>
            <div class="chart-progress-wrapper">
                <div class="chart-progress-bar" style="width: 0%;"></div>
            </div>
            <span class="chart-value">${count}</span>
        `;
        
        chartContainer.appendChild(row);

        // Slide in bar for animation
        setTimeout(() => {
            const bar = row.querySelector(".chart-progress-bar");
            if (bar) bar.style.width = `${percentage}%`;
        }, 100);
    });
}

function showEmployeeDetails(emp) {
    // Generate initials for avatar
    const names = emp.fullName.split(" ");
    const initials = names.map(n => n[0]).slice(0, 2).join("").toUpperCase();
    
    document.getElementById("detail-avatar").textContent = initials;
    document.getElementById("detail-fullname").textContent = emp.fullName;
    document.getElementById("detail-designation").textContent = emp.designation;
    
    const statusBadge = document.getElementById("detail-status-badge");
    statusBadge.className = `status-badge ${emp.status === "Active" ? "active-badge" : "inactive-badge"}`;
    statusBadge.textContent = emp.status;

    document.getElementById("detail-id").textContent = emp.employeeId;
    document.getElementById("detail-department").textContent = emp.department;
    document.getElementById("detail-email").textContent = emp.email;
    document.getElementById("detail-phone").textContent = emp.phone;
    document.getElementById("detail-joining").textContent = formatDate(emp.dateOfJoining);
    document.getElementById("detail-salary").textContent = `$${parseFloat(emp.salary).toLocaleString()}`;
    document.getElementById("detail-gender").textContent = emp.gender;
    document.getElementById("detail-address").textContent = emp.address;

    // Attach profile edit shortcut button
    const editShortcut = document.getElementById("detail-edit-shortcut-btn");
    const newEditShortcut = editShortcut.cloneNode(true);
    editShortcut.parentNode.replaceChild(newEditShortcut, editShortcut);
    
    newEditShortcut.addEventListener("click", () => {
        closeModal(detailsModal);
        openEditForm(emp);
    });

    openModal(detailsModal);
}

function openEditForm(emp) {
    modalTitle.textContent = "Edit Employee Profile";
    formModeInput.value = "edit";
    editDocIdInput.value = emp.docId;

    document.getElementById("emp-id").value = emp.employeeId;
    document.getElementById("emp-id").disabled = true; // Lock unique ID on edits
    document.getElementById("emp-fullname").value = emp.fullName;
    document.getElementById("emp-email").value = emp.email;
    document.getElementById("emp-phone").value = emp.phone;
    document.getElementById("emp-department").value = emp.department;
    document.getElementById("emp-designation").value = emp.designation;
    document.getElementById("emp-gender").value = emp.gender;
    document.getElementById("emp-joining").value = emp.dateOfJoining;
    document.getElementById("emp-salary").value = emp.salary;
    document.getElementById("emp-status").value = emp.status;
    document.getElementById("emp-address").value = emp.address;

    // Clear form error warnings
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");

    openModal(employeeModal);
}

function openAddForm() {
    modalTitle.textContent = "Register New Employee";
    formModeInput.value = "add";
    editDocIdInput.value = "";
    employeeForm.reset();
    
    document.getElementById("emp-id").disabled = false;
    document.getElementById("emp-status").value = "Active";

    // Clear form error warnings
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");

    openModal(employeeModal);
}

// =========================================================================
// 9. GENERAL UI HELPERS & LISTENERS
// =========================================================================
function navigateToSection(targetId) {
    document.querySelectorAll(".content-section").forEach(sec => {
        sec.classList.add("hidden");
    });
    
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
        if (item.getAttribute("data-target") === targetId) {
            item.classList.add("active");
        }
    });

    const targetSection = document.getElementById(targetId);
    targetSection.classList.remove("hidden");
    activeSection = targetId;

    // Update Header Title depending on view
    if (targetId === "section-overview") {
        pageTitleDisplay.textContent = "Dashboard Overview";
        pageDescDisplay.textContent = "Real-time statistics & organization summary";
    } else if (targetId === "section-employees") {
        pageTitleDisplay.textContent = "Employees Directory";
        pageDescDisplay.textContent = "Search, filter, view and manage staffing records";
    } else if (targetId === "section-viva") {
        pageTitleDisplay.textContent = "Viva Presentation Helper";
        pageDescDisplay.textContent = "Cloud computing concepts, security rules, and architectures";
    }
}

function openModal(modalEl) {
    modalEl.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // Prevent background scroll
}

function closeModal(modalEl) {
    modalEl.classList.add("hidden");
    document.body.style.overflow = "auto";
}

function cleanupSession() {
    currentUser = null;
    employeesList = [];
    userEmailDisplay.textContent = "-";
    if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
    }
    // Clear inputs
    loginForm.reset();
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
}

// Custom Toast Builder
function showToast(title, message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    if (type === "error") icon = "fa-circle-xmark";

    toast.innerHTML = `
        <i class="fa-solid ${icon} toast-icon"></i>
        <div class="toast-content">
            <h4 class="toast-title">${escapeHtml(title)}</h4>
            <p class="toast-message">${escapeHtml(message)}</p>
        </div>
        <button class="toast-close-btn"><i class="fa-solid fa-xmark"></i></button>
    `;

    toast.querySelector(".toast-close-btn").addEventListener("click", () => {
        toast.classList.add("toast-fadeout");
        setTimeout(() => toast.remove(), 250);
    });

    toastContainer.appendChild(toast);

    // Auto dismiss
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add("toast-fadeout");
            setTimeout(() => toast.remove(), 250);
        }
    }, 4500);
}

// Utils
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' });
}

function setBtnLoading(btnIdOrEl, isLoading, text) {
    const btn = typeof btnIdOrEl === "string" ? document.getElementById(btnIdOrEl) : btnIdOrEl;
    if (!btn) return;
    
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${text}</span>`;
    } else {
        btn.disabled = false;
        if (btnIdOrEl === "login-btn") {
            btn.innerHTML = `<span>${text}</span> <i class="fa-solid fa-arrow-right-to-bracket"></i>`;
        } else if (btnIdOrEl === "save-employee-btn") {
            btn.innerHTML = `<span>${text}</span> <i class="fa-regular fa-floppy-disk"></i>`;
        } else if (btn.id === "confirm-delete-btn") {
            btn.innerHTML = `<span>${text}</span> <i class="fa-regular fa-trash-can"></i>`;
        } else {
            btn.innerHTML = `<span>${text}</span>`;
        }
    }
}

// Event Bindings setup
function setupEventBindings() {
    // Navigation Tabs
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const target = item.getAttribute("data-target");
            navigateToSection(target);
        });
    });

    // View Password Toggle
    document.getElementById("toggle-password").addEventListener("click", function() {
        const passInput = document.getElementById("login-password");
        const icon = this.querySelector("i");
        if (passInput.type === "password") {
            passInput.type = "text";
            icon.className = "fa-regular fa-eye-slash";
        } else {
            passInput.type = "password";
            icon.className = "fa-regular fa-eye";
        }
    });

    // Add triggers
    quickAddBtn.addEventListener("click", openAddForm);

    // Modal Cancels
    document.getElementById("close-employee-modal-btn").addEventListener("click", () => closeModal(employeeModal));
    document.getElementById("cancel-employee-modal-btn").addEventListener("click", () => closeModal(employeeModal));
    
    document.getElementById("close-details-modal-btn").addEventListener("click", () => closeModal(detailsModal));
    document.getElementById("close-details-footer-btn").addEventListener("click", () => closeModal(detailsModal));
    
    document.getElementById("close-confirm-modal-btn").addEventListener("click", () => closeModal(confirmModal));
    document.getElementById("cancel-delete-btn").addEventListener("click", () => closeModal(confirmModal));

    // Submit Employee Form
    employeeForm.addEventListener("submit", handleSaveEmployee);

    // Search and Filters
    searchInput.addEventListener("input", renderEmployeeTable);
    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        renderEmployeeTable();
    });
    filterDept.addEventListener("change", renderEmployeeTable);
    filterStatus.addEventListener("change", renderEmployeeTable);

    document.getElementById("reset-filters-btn").addEventListener("click", () => {
        searchInput.value = "";
        filterDept.value = "All";
        filterStatus.value = "All";
        renderEmployeeTable();
    });

    // Viva Helper accordion toggles
    document.querySelectorAll(".accordion-header").forEach(hdr => {
        hdr.addEventListener("click", () => {
            const item = hdr.parentElement;
            const body = item.querySelector(".accordion-body");
            const isOpen = item.classList.contains("active");

            // Close all
            document.querySelectorAll(".accordion-item").forEach(acc => {
                acc.classList.remove("active");
                acc.querySelector(".accordion-body").style.display = "none";
            });

            if (!isOpen) {
                item.classList.add("active");
                body.style.display = "block";
            }
        });
    });

    // Viva Helper tabs
    document.querySelectorAll(".viva-topic-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".viva-topic-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const targetId = btn.getAttribute("data-viva");
            document.querySelectorAll(".viva-tab-content").forEach(tc => tc.classList.add("hidden"));
            document.getElementById(targetId).classList.remove("hidden");
        });
    });
}

// START APPLICATION
setupEventBindings();
initApp();
