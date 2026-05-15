// ==========================================
// 1. FIREBASE ARCHITECTURE ENVIRONMENT SETUP
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    getDocs, 
    deleteDoc, 
    addDoc,
    updateDoc,
    query, 
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// !!! FIREBASE DASHBOARD KEY CONFIG PIPELINE !!!
const firebaseConfig = {
    apiKey: "AIzaSyBCl7XcyNmV0nCh3hQX61QaeCdBLLlFho4",
    authDomain: "noteapp-25b28.firebaseapp.com",
    projectId: "noteapp-25b28",
    storageBucket: "noteapp-25b28.appspot.com",
    messagingSenderId: "861264300582",
    appId: "1:861264300582:web:ac960c901782aa1a2ff4e7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. DOM INTERFACE COMPONENT SELECTORS
// ==========================================
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const logoutBtn = document.getElementById("logout-btn");

const adminPanel = document.getElementById("admin-panel");
const userListContainer = document.getElementById("user-list");

const newNoteBtn = document.getElementById("new-note-btn");
const sidebarNotesList = document.getElementById("sidebar-notes-list");
const noteTitleInput = document.getElementById("note-title-input");
const noteContentInput = document.getElementById("note-content-input");
const deleteNoteBtn = document.getElementById("delete-note-btn");
const saveStatus = document.getElementById("save-status");

// Global Instance Trackers
let currentActiveUserId = null;
let currentActiveNoteId = null;
let unsubscribeNotesListener = null;
let saveDebounceTimeout = null;

// ==========================================
// 3. CORE SERVICE DISPATCHER (AUTH WATCHER)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // --- REJECT BANNED ACCOUNTS INSTANTLY ---
        const banRef = doc(db, "bannedUsers", user.uid);
        const banSnap = await getDoc(banRef);

        if (banSnap.exists()) {
            alert("🔒 Operational Access Error: This account profile has been terminated by the administrator.");
            await signOut(auth);
            resetAppViewLayout();
            showAuthScreen();
            return;
        }

        // --- AUTHORIZED SESSION ENGAGED ---
        currentActiveUserId = user.uid;
        showAppScreen();

        if (user.email === "admin@noteapp.com") {
            adminPanel.classList.remove("hidden");
            loadRegisteredUsersDirectory();
        } else {
            adminPanel.classList.add("hidden");
        }

        // Initialize Realtime Notes Stream
        attachRealtimeNotesSync(user.uid);

    } else {
        // --- NO RUNNING SESSION ---
        currentActiveUserId = null;
        resetAppViewLayout();
        showAuthScreen();
    }
});

// ==========================================
// 4. CLIENT AUTHENTICATION HANDLERS
// ==========================================
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authToggleLink = document.getElementById("auth-toggle-link");
const authToggleText = document.getElementById("auth-toggle-text");

let isSignUpMode = false; 

// Toggle between Login and Sign Up views
authToggleLink.addEventListener("click", (e) => {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;

    if (isSignUpMode) {
        authTitle.textContent = "Create Account";
        authSubtitle.textContent = "Sign up to start writing notes";
        authSubmitBtn.textContent = "Sign Up";
        authToggleText.textContent = "Already have an account?";
        authToggleLink.textContent = "Sign In";
        
        emailInput.placeholder = "Choose a username";
        passwordInput.placeholder = "Password";
    } else {
        authTitle.textContent = "Welcome to NoteApp";
        authSubtitle.textContent = "Sign in to sync your personal notebook";
        authSubmitBtn.textContent = "Sign In";
        authToggleText.textContent = "Don't have an account?";
        authToggleLink.textContent = "Sign Up";
        
        emailInput.placeholder = "Enter your username";
        passwordInput.placeholder = "Password";
    }
});

// Submission handler converting username to backend email format
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = emailInput.value.trim().toLowerCase();
    const firebaseEmail = `${username}@noteapp.internal`; 
    const password = passwordInput.value;

    try {
        if (isSignUpMode) {
            // ---- CREATE NEW USER ----
            if (username === "admin") {
                throw new Error("The username 'admin' is reserved by the system.");
            }

            const userCredential = await createUserWithEmailAndPassword(auth, firebaseEmail, password);
            const newUser = userCredential.user;

            // Save username map reference to database
            await setDoc(doc(db, "users", newUser.uid), {
                email: username,
                createdAt: new Date().toISOString()
            });

            alert(`🎉 Account created successfully! Welcome, ${username}.`);
        } else {
            // ---- SIGN IN EXISTING USER ----
            const loginCredential = username === "admin" ? "admin@noteapp.com" : firebaseEmail;
            await signInWithEmailAndPassword(auth, loginCredential, password);
        }
        loginForm.reset();
    } catch (error) {
        alert("Authentication Blocked: " + error.message);
    }
});

logoutBtn.addEventListener("click", async () => {
    if (unsubscribeNotesListener) unsubscribeNotesListener();
    await signOut(auth);
});

// ==========================================
// 5. NOTEBOOK WORKSPACE SYSTEM ENGINES
// ==========================================

function attachRealtimeNotesSync(userId) {
    if (unsubscribeNotesListener) unsubscribeNotesListener();

    const notesQuery = query(
        collection(db, "notes"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc")
    );

    unsubscribeNotesListener = onSnapshot(notesQuery, (snapshot) => {
        sidebarNotesList.innerHTML = "";
        if (snapshot.empty) {
            sidebarNotesList.innerHTML = `<p class="subtitle" style="margin-top:1rem;">Empty Notebook.</p>`;
            return;
        }

        snapshot.forEach((noteDoc) => {
            const data = noteDoc.data();
            const noteItem = document.createElement("div");
            noteItem.className = `sidebar-note-item ${noteDoc.id === currentActiveNoteId ? 'active' : ''}`;
            noteItem.textContent = data.title || "Untitled Note";
            noteItem.addEventListener("click", () => loadTargetNoteToWorkspace(noteDoc.id, data));
            sidebarNotesList.appendChild(noteItem);
        });
    }, (error) => {
        console.error("Notes synchronization pipeline failure:", error);
    });
}

function loadTargetNoteToWorkspace(noteId, data) {
    currentActiveNoteId = noteId;
    document.querySelectorAll(".sidebar-note-item").forEach(el => el.classList.remove("active"));
    
    noteTitleInput.removeAttribute("disabled");
    noteContentInput.removeAttribute("disabled");
    deleteNoteBtn.classList.remove("hidden");

    noteTitleInput.value = data.title || "";
    noteContentInput.value = data.content || "";
    saveStatus.textContent = "All changes loaded from cloud";
}

newNoteBtn.addEventListener("click", async () => {
    if (!currentActiveUserId) return;
    try {
        const newDocRef = await addDoc(collection(db, "notes"), {
            userId: currentActiveUserId,
            title: "",
            content: "",
            updatedAt: new Date().toISOString()
        });
        currentActiveNoteId = newDocRef.id;
        saveStatus.textContent = "Blank document prepared";
    } catch (error) {
        console.error("Failed to generate document workspace entry:", error);
    }
});

noteTitleInput.addEventListener("input", queueDocumentAutoSave);
noteContentInput.addEventListener("input", queueDocumentAutoSave);

function queueDocumentAutoSave() {
    if (!currentActiveNoteId) return;
    saveStatus.textContent = "Writing to cloud sync engine...";
    
    clearTimeout(saveDebounceTimeout);
    saveDebounceTimeout = setTimeout(async () => {
        try {
            const noteRef = doc(db, "notes", currentActiveNoteId);
            await updateDoc(noteRef, {
                title: noteTitleInput.value,
                content: noteContentInput.value,
                updatedAt: new Date().toISOString()
            });
            saveStatus.textContent = "Cloud Sync Verified (Saved)";
        } catch (error) {
            saveStatus.textContent = "Connection Sync Interrupted";
            console.error("Database writing error:", error);
        }
    }, 800);
}

deleteNoteBtn.addEventListener("click", async () => {
    if (!currentActiveNoteId) return;
    if (confirm("Delete this note permanently?")) {
        try {
            await deleteDoc(doc(db, "notes", currentActiveNoteId));
            resetAppViewLayout();
        } catch (error) {
            alert("Deletion Error: " + error.message);
        }
    }
});

// ==========================================
// 6. MASTER ADMIN CONTROL SYSTEM (CARD-FREE WIPE)
// ==========================================

async function loadRegisteredUsersDirectory() {
    userListContainer.innerHTML = "<p>Scanning access directories...</p>";
    try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        userListContainer.innerHTML = "";

        if (usersSnapshot.empty) {
            userListContainer.innerHTML = "<p>No application profiles found in directory database.</p>";
            return;
        }

        usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            const userId = userDoc.id;

            if (userData.email === "admin") return;

            const userRow = document.createElement("div");
            userRow.className = "user-row";
            userRow.innerHTML = `
                <span><strong>${userData.email}</strong> [UID: ${userId}]</span>
                <button class="delete-user-btn danger-btn" data-id="${userId}">Drop Database & Ban</button>
            `;
            userListContainer.appendChild(userRow);
        });

        document.querySelectorAll(".delete-user-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const targetUid = e.target.getAttribute("data-id");
                adminExecutionPurgeUser(targetUid);
            });
        });

    } catch (error) {
        userListContainer.innerHTML = `<p style="color:var(--danger)">Directory view error. Confirm Firestore rules match database configurations.</p>`;
    }
}

async function adminExecutionPurgeUser(targetUserId) {
    const doubleCheck = confirm("🚨 WARNING: IRREVERSIBLE OPERATION ACTION!\n\nAre you sure you want to drop all database documents matching this user ID and banish their active login session privileges?");
    if (!doubleCheck) return;

    try {
        const notesQuery = query(collection(db, "notes"), where("userId", "==", targetUserId));
        const notesSnapshot = await getDocs(notesQuery);
        
        const deleteTasks = [];
        notesSnapshot.forEach((noteDoc) => {
            deleteTasks.push(deleteDoc(noteDoc.ref));
        });
        
        await Promise.all(deleteTasks);

        await setDoc(doc(db, "bannedUsers", targetUserId), {
            bannedAt: new Date().toISOString(),
            status: "Terminated",
            reason: "Account structural termination applied by network supervisor"
        });

        alert("🎯 Operation Execution Finished. Cloud database files purged and entry token flagged on blacklist.");
        loadRegisteredUsersDirectory();

    } catch (error) {
        console.error("Process execution error:", error);
        alert("Action Denied: Rules authorization missing. Details: " + error.message);
    }
}

// ==========================================
// 7. DISPLAY PORT INTERFACE TOGGLES
// ==========================================
function showAuthScreen() {
    authContainer.classList.remove("hidden");
    appContainer.classList.add("hidden");
}

function showAppScreen() {
    authContainer.classList.add("hidden");
    appContainer.classList.remove("hidden");
}

function resetAppViewLayout() {
    currentActiveNoteId = null;
    noteTitleInput.value = "";
    noteContentInput.value = "";
    noteTitleInput.setAttribute("disabled", "true");
    noteContentInput.setAttribute("disabled", "true");
    saveStatus.textContent = "Select or create a note to begin editing";
    deleteNoteBtn.classList.add("hidden");
    sidebarNotesList.innerHTML = "";
}
