import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

let currentUserId = null;
let currentUsername = null; // New variable to store the text username
let currentNoteId = null;
let autoSaveTimeout = null;
let unsubscribeNotesListener = null;
let unsubscribeAdminListener = null;

const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const authForm = document.getElementById("auth-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const authTitle = document.getElementById("auth-title");
const switchAuth = document.getElementById("switch-auth");
const toggleText = document.getElementById("toggle-text");
const errorMessage = document.getElementById("error-message");
const userEmailDisplay = document.getElementById("user-email-display");
const logoutBtn = document.getElementById("logout-btn");
const newNoteBtn = document.getElementById("new-note-btn");
const notesList = document.getElementById("notes-list");
const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");
const saveStatus = document.getElementById("save-status");
const deleteNoteBtn = document.getElementById("delete-note-btn");
const adminPanel = document.getElementById("admin-panel");
const adminUsersList = document.getElementById("admin-users-list");

let isRegisterMode = true;

// --- 1. MONITOR LOGIN STATE CHANGES ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        currentUsername = user.email.split("@")[0]; // Extract clean username string
        userEmailDisplay.textContent = currentUsername;
        
        authScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");

        if (currentUsername === "admin") {
            adminPanel.classList.remove("hidden");
            startAdminDashboard();
        } else {
            adminPanel.classList.add("hidden");
            startListeningToNotes(user.uid);
        }
    } else {
        currentUserId = null;
        currentUsername = null;
        resetEditorView();
        if (unsubscribeNotesListener) unsubscribeNotesListener();
        if (unsubscribeAdminListener) unsubscribeAdminListener();
        
        adminPanel.classList.add("hidden");
        appScreen.classList.add("hidden");
        authScreen.classList.remove("hidden");
    }
});

function resetEditorView() {
    currentNoteId = null;
    noteTitleInput.value = "";
    noteContentInput.value = "";
    noteTitleInput.disabled = true;
    noteContentInput.disabled = true;
    saveStatus.textContent = "Select or create a note to begin";
    deleteNoteBtn.classList.add("hidden");
}

// --- 2. REGISTRATION & LOGIN ACTIONS ---
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMessage.textContent = "";
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const fakeEmail = `${username}@noteapp.com`;

    try {
        if (isRegisterMode) {
            await createUserWithEmailAndPassword(auth, fakeEmail, password);
        } else {
            await signInWithEmailAndPassword(auth, fakeEmail, password);
        }
        authForm.reset();
    } catch (error) {
        if (error.code === "auth/email-already-in-use" || error.code === "auth/invalid-email") {
            errorMessage.textContent = "Username is already taken or invalid.";
        } else if (error.code === "auth/weak-password") {
            errorMessage.textContent = "Password must be at least 6 characters.";
        } else if (error.code === "auth/invalid-credential") {
            errorMessage.textContent = "Incorrect username or password.";
        } else {
            errorMessage.textContent = error.message;
        }
    }
});

switchAuth.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    errorMessage.textContent = "";
    if (isRegisterMode) {
        authTitle.textContent = "Create Account";
        submitBtn.textContent = "Register";
        toggleText.innerHTML = 'Already have an account? <span id="switch-auth">Log In</span>';
    } else {
        authTitle.textContent = "Welcome Back";
        submitBtn.textContent = "Log In";
        toggleText.innerHTML = 'Need an account? <span id="switch-auth">Register</span>';
    }
    document.getElementById("switch-auth").addEventListener("click", () => switchAuth.click());
});

logoutBtn.addEventListener("click", () => signOut(auth));

// --- 3. STANDARD USER NOTE LISTENER ---
function startListeningToNotes(userId) {
    const q = query(collection(db, "notes"), where("userId", "==", userId), orderBy("updatedAt", "desc"));
    setupNoteRender(q);
}

// --- 4. ADMIN COMMAND CENTER LOGIC ---
function startAdminDashboard() {
    const q = query(collection(db, "notes"), orderBy("updatedAt", "desc"));
    setupNoteRender(q);

    unsubscribeAdminListener = onSnapshot(collection(db, "notes"), (snapshot) => {
        adminUsersList.innerHTML = "";
        
        // Use a Map tracking structure to pair unique user IDs with their exact usernames
        const userMap = new Map();
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId && data.userId !== currentUserId) {
                // Fallback to "Anonymous User" if old test notes lack a recorded username field
                const loggedName = data.username ? data.username : "unknown_old_account";
                userMap.set(data.userId, loggedName);
            }
        });

        if (userMap.size === 0) {
            adminUsersList.innerHTML = '<p class="empty-history-text">No other active user accounts found.</p>';
            return;
        }

        // Render the clear user profile cards using clean text names
        userMap.forEach((username, uid) => {
            const card = document.createElement("div");
            card.classList.add("admin-user-card");
            
            card.innerHTML = `
                <div class="admin-user-name" style="font-family: inherit; color: #007acc; font-size: 1rem;">@${username}</div>
                <button class="admin-delete-user-btn" data-uid="${uid}">Wipe User Data</button>
            `;
            
            card.querySelector(".admin-delete-user-btn").addEventListener("click", async (e) => {
                const targetUid = e.target.getAttribute("data-uid");
                const confirmWipe = confirm(`Are you sure you want to delete all notes belonging to @${username}?`);
                if (!confirmWipe) return;

                const userNotesQuery = query(collection(db, "notes"), where("userId", "==", targetUid));
                const querySnapshot = await getDocs(userNotesQuery);
                
                querySnapshot.forEach(async (noteDoc) => {
                    await deleteDoc(doc(db, "notes", noteDoc.id));
                });
                
                alert(`All notes for @${username} have been wiped.`);
            });

            adminUsersList.appendChild(card);
        });
    });
}

function setupNoteRender(firebaseQuery) {
    if (unsubscribeNotesListener) unsubscribeNotesListener();

    unsubscribeNotesListener = onSnapshot(firebaseQuery, (snapshot) => {
        notesList.innerHTML = "";
        let currentlyActiveNoteStillExists = false;

        snapshot.forEach((doc) => {
            const note = doc.data();
            const noteId = doc.id;
            const item = document.createElement("div");
            item.classList.add("note-item");
            
            if (noteId === currentNoteId) {
                item.classList.add("active");
                currentlyActiveNoteStillExists = true;
            }
            
            // If admin view is loaded, display the creator name right next to the note title header
            const titleDisplay = note.title.trim() === "" ? "Untitled Note" : note.title;
            if (currentUsername === "admin" && note.username) {
                item.innerHTML = `${titleDisplay} <span style="color: #ff4a4a; font-size: 11px; float: right; margin-top: 2px;">@${note.username}</span>`;
            } else {
                item.textContent = titleDisplay;
            }
            
            item.addEventListener("click", () => {
                currentNoteId = noteId;
                noteTitleInput.disabled = false;
                noteContentInput.disabled = false;
                noteTitleInput.value = note.title;
                noteContentInput.value = note.content;
                saveStatus.textContent = "All changes saved";
                deleteNoteBtn.classList.remove("hidden");
                
                document.querySelectorAll(".note-item").forEach(el => el.classList.remove("active"));
                item.classList.add("active");
            });
            notesList.appendChild(item);
        });

        if (!currentlyActiveNoteStillExists && currentNoteId !== null) {
            resetEditorView();
        }
    });
}

// CRITICAL FIX: The creation path now flags notes explicitly with the owner's explicit textual username
newNoteBtn.addEventListener("click", async () => {
    if (!currentUserId || !currentUsername) return;
    try {
        const docRef = await addDoc(collection(db, "notes"), {
            userId: currentUserId,
            username: currentUsername, // Saves the text username directly inside the document metadata object
            title: "",
            content: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        currentNoteId = docRef.id;
        noteTitleInput.disabled = false;
        noteContentInput.disabled = false;
        noteTitleInput.value = "";
        noteContentInput.value = "";
        deleteNoteBtn.classList.remove("hidden");
        noteTitleInput.focus();
    } catch (error) {
        console.error("Failed creating note:", error);
    }
});

function triggerAutoSave() {
    if (!currentNoteId) return;
    saveStatus.textContent = "Saving changes...";
    clearTimeout(autoSaveTimeout);

    autoSaveTimeout = setTimeout(async () => {
        const noteRef = doc(db, "notes", currentNoteId);
        try {
            await updateDoc(noteRef, {
                title: noteTitleInput.value,
                content: noteContentInput.value,
                updatedAt: serverTimestamp()
            });
            saveStatus.textContent = "All changes saved";
        } catch (error) {
            saveStatus.textContent = "Error auto-saving changes";
        }
    }, 800);
}

deleteNoteBtn.addEventListener("click", async () => {
    if (!currentNoteId) return;
    const confirmDelete = confirm("Are you sure you want to permanently delete this note?");
    if (!confirmDelete) return;

    try {
        saveStatus.textContent = "Deleting note...";
        await deleteDoc(doc(db, "notes", currentNoteId));
    } catch (error) {
        saveStatus.textContent = "Error deleting note";
    }
});

noteTitleInput.addEventListener("input", triggerAutoSave);
noteContentInput.addEventListener("input", triggerAutoSave);