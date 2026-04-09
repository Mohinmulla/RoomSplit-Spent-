// ===============================================
// Firebase Configuration
// ===============================================
// ⚠️ IMPORTANT: Replace with your own Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCXtQKoItGkdjCYfh5vUQcPTVMwSoIHgGI",
  authDomain: "room-split-3bd78.firebaseapp.com",
  projectId: "room-split-3bd78",
  storageBucket: "room-split-3bd78.firebasestorage.app",
  messagingSenderId: "769271717143",
  appId: "1:769271717143:web:6da18247b0ce6006a6ab52"
};

// ===============================================
// Admin Email Configuration
// ===============================================
// ⚠️ CHANGE THIS TO YOUR ADMIN EMAIL
const ADMIN_EMAIL = "admin@m2.com";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===============================================
// Global State
// ===============================================
let currentUser = null;
let isAdmin = false;
let users = {};
let expenses = [];
let settlements = [];
let unsubscribeExpenses = null;
let unsubscribeSettlements = null;

// Category icons mapping
const categoryIcons = {
    'Grocery': '🛒',
    'Rent': '🏠',
    'Utilities': '💡',
    'Food': '🍕',
    'Transport': '🚗',
    'Entertainment': '🎬',
    'Medical': '💊',
    'Other': '📦'
};

// ===============================================
// DOM Elements
// ===============================================
const elements = {
    // Pages
    loadingScreen: document.getElementById('loadingScreen'),
    loginPage: document.getElementById('loginPage'),
    mainApp: document.getElementById('mainApp'),
    adminView: document.getElementById('adminView'),
    
    // Login
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),
    
    // Header
    currentUserName: document.getElementById('currentUserName'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Dashboard Cards
    totalExpenses: document.getElementById('totalExpenses'),
    yourExpenses: document.getElementById('yourExpenses'),
    partnerExpenses: document.getElementById('partnerExpenses'),
    balanceAmount: document.getElementById('balanceAmount'),
    balanceText: document.getElementById('balanceText'),
    balanceCard: document.getElementById('balanceCard'),
    
    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    bottomNavBtns: document.querySelectorAll('.bottom-nav-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Expense Form
    expenseForm: document.getElementById('expenseForm'),
    expenseAmount: document.getElementById('expenseAmount'),
    expenseCategory: document.getElementById('expenseCategory'),
    expenseDescription: document.getElementById('expenseDescription'),
    paidByDisplay: document.getElementById('paidByDisplay'),
    
    // Quick Add
    quickBtns: document.querySelectorAll('.quick-btn'),
    
    // Expenses List
    expensesList: document.getElementById('expensesList'),
    filterCategory: document.getElementById('filterCategory'),
    
    // Settle
    settleUserAName: document.getElementById('settleUserAName'),
    settleUserBName: document.getElementById('settleUserBName'),
    settleUserAPaid: document.getElementById('settleUserAPaid'),
    settleUserBPaid: document.getElementById('settleUserBPaid'),
    settleResult: document.getElementById('settleResult'),
    settleTotal: document.getElementById('settleTotal'),
    settleEachShare: document.getElementById('settleEachShare'),
    settleNowBtn: document.getElementById('settleNowBtn'),
    
    // History
    settlementHistory: document.getElementById('settlementHistory'),
    
    // Toast & Modal
    toast: document.getElementById('toast'),
    confirmModal: document.getElementById('confirmModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalCancel: document.getElementById('modalCancel'),
    modalConfirm: document.getElementById('modalConfirm')
};

// ===============================================
// Authentication
// ===============================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        // Check if admin
        isAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        
        await loadUsers();
        
        if (isAdmin) {
            showAdminView();
        } else {
            showApp();
        }
        
        initializeRealTimeListeners();
    } else {
        currentUser = null;
        isAdmin = false;
        showLogin();
    }
});

// Login form submission
elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;
    
    try {
        showLoginError('');
        elements.loginForm.querySelector('button').disabled = true;
        elements.loginForm.querySelector('button').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. Please try again.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many attempts. Please try later.';
                break;
        }
        
        showLoginError(errorMessage);
    } finally {
        elements.loginForm.querySelector('button').disabled = false;
        elements.loginForm.querySelector('button').innerHTML = '<span>Login</span><i class="fas fa-arrow-right"></i>';
    }
});

// Logout for regular users
elements.logoutBtn.addEventListener('click', async () => {
    try {
        if (unsubscribeExpenses) unsubscribeExpenses();
        if (unsubscribeSettlements) unsubscribeSettlements();
        await auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed', 'error');
    }
});

// Logout for admin
document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    try {
        if (unsubscribeExpenses) unsubscribeExpenses();
        if (unsubscribeSettlements) unsubscribeSettlements();
        await auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed', 'error');
    }
});

// ===============================================
// Load Users
// ===============================================
async function loadUsers() {
    try {
        const usersSnapshot = await db.collection('users').get();
        users = {};
        usersSnapshot.forEach(doc => {
            users[doc.id] = { id: doc.id, ...doc.data() };
        });
        
        // Update UI with user name (for regular users)
        if (!isAdmin && users[currentUser.uid]) {
            elements.currentUserName.textContent = users[currentUser.uid].name || 'User';
            elements.paidByDisplay.innerHTML = `
                <i class="fas fa-user-circle"></i>
                <span>${users[currentUser.uid].name || 'You'}</span>
            `;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// ===============================================
// Real-Time Listeners
// ===============================================
function initializeRealTimeListeners() {
    // Listen to expenses (only unsettled ones)
    unsubscribeExpenses = db.collection('expenses')
        .where('settled', '==', false)
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            expenses = [];
            snapshot.forEach(doc => {
                expenses.push({ id: doc.id, ...doc.data() });
            });
            updateUI();
        }, (error) => {
            console.error('Expenses listener error:', error);
        });
    
    // Listen to settlements
    unsubscribeSettlements = db.collection('settlements')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            settlements = [];
            snapshot.forEach(doc => {
                settlements.push({ id: doc.id, ...doc.data() });
            });
            
            if (isAdmin) {
                renderAdminSettlements();
                document.getElementById('adminSettlementCount').textContent = settlements.length;
                document.getElementById('adminSettlementBadge').textContent = settlements.length;
            } else {
                renderSettlementHistory();
            }
        }, (error) => {
            console.error('Settlements listener error:', error);
        });
}

// ===============================================
// UI Updates
// ===============================================
function updateUI() {
    if (isAdmin) {
        updateAdminStats();
        renderAdminUsers();
        renderAdminExpenses();
    } else {
        updateDashboard();
        renderExpenses();
        updateSettleSection();
    }
}
function updateDashboard() {
    const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    const yourTotal = expenses
        .filter(exp => exp.paidBy === currentUser.uid)
        .reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    const partnerTotal = total - yourTotal;
    
    // Get partner's name
    let partnerName = 'Partner';
    const userIds = Object.keys(users).filter(id => 
        users[id].email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
    );
    for (let id of userIds) {
        if (id !== currentUser.uid) {
            partnerName = users[id]?.name || 'Partner';
            break;
        }
    }
    
    // Get current user's name
    const currentUserName = users[currentUser.uid]?.name || 'You';
    
    // Calculate balance
    const eachShare = total / 2;
    const balance = yourTotal - eachShare;
    const balanceAmount = Math.abs(balance);
    
    // Update cards
    elements.totalExpenses.textContent = formatCurrency(total);
    elements.yourExpenses.textContent = formatCurrency(yourTotal);
    elements.partnerExpenses.textContent = formatCurrency(partnerTotal);
    elements.balanceAmount.textContent = formatCurrency(balanceAmount);
    
    // Update balance card with specific names
    elements.balanceCard.classList.remove('balance-positive', 'balance-negative');
    
    if (Math.abs(balance) < 0.01 || total === 0) {
        elements.balanceText.textContent = 'All settled! ✓';
    } else if (balance > 0) {
        // Current user paid more, partner owes them
        elements.balanceCard.classList.add('balance-positive');
        elements.balanceText.textContent = `${partnerName} tumhe ₹${balanceAmount.toLocaleString('en-IN')} dega`;
    } else {
        // Current user paid less, they owe partner
        elements.balanceCard.classList.add('balance-negative');
        elements.balanceText.textContent = `${partnerName} ko ₹${balanceAmount.toLocaleString('en-IN')} dena hai`;
    }
}

function renderExpenses() {
    const filterValue = elements.filterCategory.value;
    
    let filteredExpenses = expenses;
    if (filterValue !== 'all') {
        filteredExpenses = expenses.filter(exp => exp.category === filterValue);
    }
    
    if (filteredExpenses.length === 0) {
        elements.expensesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-receipt"></i>
                <p>No expenses found.</p>
            </div>
        `;
        return;
    }
    
    elements.expensesList.innerHTML = filteredExpenses.map(expense => {
        const isOwn = expense.paidBy === currentUser.uid;
        const paidByName = users[expense.paidBy]?.name || 'Unknown';
        const icon = categoryIcons[expense.category] || '📦';
        const date = expense.timestamp ? formatDate(expense.timestamp.toDate()) : 'N/A';
        const time = expense.timestamp ? formatTime(expense.timestamp.toDate()) : '';
        
        return `
            <div class="expense-item ${isOwn ? 'own-expense' : 'partner-expense'}">
                <div class="expense-category-icon category-${expense.category}">
                    ${icon}
                </div>
                <div class="expense-details">
                    <div class="expense-header">
                        <span class="expense-category">${expense.category}</span>
                        <span class="expense-amount">${formatCurrency(expense.amount)}</span>
                    </div>
                    <div class="expense-description">${expense.description || 'No description'}</div>
                    <div class="expense-meta">
                        <span><i class="fas fa-user"></i> ${paidByName}</span>
                        <span><i class="fas fa-calendar"></i> ${date}</span>
                        <span><i class="fas fa-clock"></i> ${time}</span>
                    </div>
                </div>
                <div class="expense-actions">
                    <button class="delete-btn" onclick="deleteExpense('${expense.id}')" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateSettleSection() {
    // Get user IDs (excluding admin)
    const userIds = Object.keys(users).filter(id => {
        return users[id].email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase();
    });
    
    if (userIds.length < 2) return;
    
    const userA = userIds[0];
    const userB = userIds[1];
    
    // Calculate totals for each user
    const userATotals = expenses
        .filter(exp => exp.paidBy === userA)
        .reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    const userBTotals = expenses
        .filter(exp => exp.paidBy === userB)
        .reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    
    const total = userATotals + userBTotals;
    const eachShare = total / 2;
    
    // Update names
    elements.settleUserAName.textContent = users[userA]?.name || 'User A';
    elements.settleUserBName.textContent = users[userB]?.name || 'User B';
    
    // Update amounts
    elements.settleUserAPaid.textContent = formatCurrency(userATotals);
    elements.settleUserBPaid.textContent = formatCurrency(userBTotals);
    elements.settleTotal.textContent = formatCurrency(total);
    elements.settleEachShare.textContent = formatCurrency(eachShare);
    
    // Calculate who owes whom
    const balanceA = userATotals - eachShare;
    
    // Update result
    if (Math.abs(balanceA) < 0.01 || total === 0) {
        elements.settleResult.className = 'settle-result settled';
        elements.settleResult.innerHTML = `
            <div class="result-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <p class="result-text">All expenses are settled!</p>
        `;
        elements.settleNowBtn.disabled = true;
    } else {
        const fromUser = balanceA > 0 ? userB : userA;
        const toUser = balanceA > 0 ? userA : userB;
        const amount = Math.abs(balanceA);
        
        elements.settleResult.className = 'settle-result needs-payment';
        elements.settleResult.innerHTML = `
            <div class="result-icon">
                <i class="fas fa-exchange-alt"></i>
            </div>
            <p class="result-text">
                <strong>${users[fromUser]?.name || 'User'}</strong> needs to pay 
                <strong>${users[toUser]?.name || 'User'}</strong> 
                <br><span style="font-size: 1.5rem; color: var(--primary);">${formatCurrency(amount)}</span>
            </p>
        `;
        
        // Store settlement data
        elements.settleNowBtn.dataset.fromUser = fromUser;
        elements.settleNowBtn.dataset.toUser = toUser;
        elements.settleNowBtn.dataset.amount = amount;
        elements.settleNowBtn.disabled = false;
    }
}

function renderSettlementHistory() {
    if (settlements.length === 0) {
        elements.settlementHistory.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No settlements yet.</p>
            </div>
        `;
        return;
    }
    
    elements.settlementHistory.innerHTML = settlements.map(settlement => {
        const fromUserName = users[settlement.fromUser]?.name || 'Unknown';
        const toUserName = users[settlement.toUser]?.name || 'Unknown';
        const date = settlement.timestamp ? formatDate(settlement.timestamp.toDate()) : 'N/A';
        const time = settlement.timestamp ? formatTime(settlement.timestamp.toDate()) : '';
        
        return `
            <div class="settlement-item">
                <div class="settlement-icon">
                    <i class="fas fa-check"></i>
                </div>
                <div class="settlement-details">
                    <div class="settlement-text">
                        ${fromUserName} paid ${toUserName}
                    </div>
                    <div class="settlement-date">
                        <i class="fas fa-calendar"></i> ${date} at ${time}
                    </div>
                </div>
                <div class="settlement-amount">
                    ${formatCurrency(settlement.amount)}
                </div>
            </div>
        `;
    }).join('');
}

// ===============================================
// Admin Functions
// ===============================================
function updateAdminStats() {
    let tarunTotal = 0;
    let fazalTotal = 0;
    
    expenses.forEach(exp => {
        const name = users[exp.paidBy]?.name?.toLowerCase() || '';
        if (name === 'tarun') {
            tarunTotal += parseFloat(exp.amount);
        } else if (name === 'fazal') {
            fazalTotal += parseFloat(exp.amount);
        }
    });
    
    const total = tarunTotal + fazalTotal;
    const eachShare = total / 2;
    const balance = tarunTotal - eachShare;
    
    // Update stats
    document.getElementById('adminTotalExpenses').textContent = formatCurrency(total);
    document.getElementById('adminExpenseCount').textContent = expenses.length + ' transactions';
    document.getElementById('adminTarunTotal').textContent = formatCurrency(tarunTotal);
    document.getElementById('adminFazalTotal').textContent = formatCurrency(fazalTotal);
    document.getElementById('adminEachShare').textContent = formatCurrency(eachShare);
    document.getElementById('adminBalance').textContent = formatCurrency(Math.abs(balance));
    document.getElementById('adminExpenseBadge').textContent = expenses.length;
    
    const balanceText = document.getElementById('adminBalanceText');
    if (Math.abs(balance) < 0.01 || total === 0) {
        balanceText.textContent = 'All settled ✓';
        balanceText.style.color = '#4ade80';
    } else if (balance > 0) {
        balanceText.textContent = 'Fazal owes Tarun';
        balanceText.style.color = '#f87171';
    } else {
        balanceText.textContent = 'Tarun owes Fazal';
        balanceText.style.color = '#f87171';
    }
}

function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    const userList = Object.values(users).filter(u => 
        u.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
    );
    
    if (userList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No users found.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = userList.map(user => {
        const nameClass = user.name?.toLowerCase() || '';
        const initial = user.name?.charAt(0).toUpperCase() || '?';
        
        return `
            <div class="admin-user-item">
                <div class="admin-user-avatar ${nameClass}">${initial}</div>
                <div class="admin-user-info">
                    <div class="admin-user-name">${user.name || 'Unknown'}</div>
                    <div class="admin-user-email">${user.email || '-'}</div>
                </div>
                <div class="admin-user-uid">${user.id.substring(0, 8)}...</div>
            </div>
        `;
    }).join('');
}

function renderAdminExpenses() {
    const container = document.getElementById('adminExpensesList');
    
    if (expenses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-receipt"></i>
                <p>No expenses yet.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = expenses.map(expense => {
        const paidByName = users[expense.paidBy]?.name || 'Unknown';
        const nameClass = paidByName.toLowerCase();
        const icon = categoryIcons[expense.category] || '📦';
        const date = expense.timestamp ? formatDate(expense.timestamp.toDate()) : 'N/A';
        const time = expense.timestamp ? formatTime(expense.timestamp.toDate()) : '';
        
        return `
            <div class="expense-item ${nameClass}-expense">
                <div class="expense-category-icon category-${expense.category}">
                    ${icon}
                </div>
                <div class="expense-details">
                    <div class="expense-header">
                        <span class="expense-category">${expense.category}</span>
                        <span class="expense-amount">${formatCurrency(expense.amount)}</span>
                    </div>
                    <div class="expense-description">${expense.description || 'No description'}</div>
                    <div class="expense-meta">
                        <span><span class="user-tag ${nameClass}">${paidByName}</span></span>
                        <span><i class="fas fa-calendar"></i> ${date}</span>
                        <span><i class="fas fa-clock"></i> ${time}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderAdminSettlements() {
    const container = document.getElementById('adminSettlementsList');
    
    if (settlements.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No settlements yet.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = settlements.map(settlement => {
        const fromUserName = users[settlement.fromUser]?.name || 'Unknown';
        const toUserName = users[settlement.toUser]?.name || 'Unknown';
        const fromClass = fromUserName.toLowerCase();
        const toClass = toUserName.toLowerCase();
        const date = settlement.timestamp ? formatDate(settlement.timestamp.toDate()) : 'N/A';
        const time = settlement.timestamp ? formatTime(settlement.timestamp.toDate()) : '';
        
        return `
            <div class="settlement-item">
                <div class="settlement-icon">
                    <i class="fas fa-check"></i>
                </div>
                <div class="settlement-details">
                    <div class="settlement-text">
                        <span class="user-tag ${fromClass}">${fromUserName}</span> 
                        paid 
                        <span class="user-tag ${toClass}">${toUserName}</span>
                    </div>
                    <div class="settlement-date">
                        <i class="fas fa-calendar"></i> ${date} at ${time}
                    </div>
                </div>
                <div class="settlement-amount">
                    ${formatCurrency(settlement.amount)}
                </div>
            </div>
        `;
    }).join('');
}

// ===============================================
// Expense Actions
// ===============================================
elements.expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const amount = parseFloat(elements.expenseAmount.value);
    const category = elements.expenseCategory.value;
    const description = elements.expenseDescription.value.trim();
    
    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    
    if (!category) {
        showToast('Please select a category', 'error');
        return;
    }
    
    try {
        const submitBtn = elements.expenseForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        
        await db.collection('expenses').add({
            amount: amount,
            category: category,
            description: description,
            paidBy: currentUser.uid,
            settled: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reset form
        elements.expenseForm.reset();
        
        // Switch to expenses tab
        switchTab('expenses');
        
        showToast('Expense added successfully!', 'success');
    } catch (error) {
        console.error('Error adding expense:', error);
        showToast('Failed to add expense', 'error');
    } finally {
        elements.expenseForm.querySelector('button[type="submit"]').disabled = false;
    }
});

// Delete expense function
async function deleteExpense(expenseId) {
    showConfirmModal(
        'Delete Expense',
        'Are you sure you want to delete this expense? This action cannot be undone.',
        async () => {
            try {
                await db.collection('expenses').doc(expenseId).delete();
                showToast('Expense deleted', 'success');
            } catch (error) {
                console.error('Error deleting expense:', error);
                showToast('Failed to delete expense', 'error');
            }
        }
    );
}

// Quick add buttons
elements.quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const amount = btn.dataset.amount;
        const category = btn.dataset.category;
        
        elements.expenseAmount.value = amount;
        elements.expenseCategory.value = category;
        elements.expenseDescription.focus();
    });
});

// Filter expenses
elements.filterCategory.addEventListener('change', () => {
    renderExpenses();
});

// ===============================================
// Settlement Actions
// ===============================================
elements.settleNowBtn.addEventListener('click', () => {
    const fromUser = elements.settleNowBtn.dataset.fromUser;
    const toUser = elements.settleNowBtn.dataset.toUser;
    const amount = parseFloat(elements.settleNowBtn.dataset.amount);
    
    const fromUserName = users[fromUser]?.name || 'User';
    const toUserName = users[toUser]?.name || 'User';
    
    showConfirmModal(
        'Confirm Settlement',
        `${fromUserName} will pay ${toUserName} ${formatCurrency(amount)}. This will mark all current expenses as settled.`,
        async () => {
            try {
                elements.settleNowBtn.disabled = true;
                
                // Create settlement record
                await db.collection('settlements').add({
                    amount: amount,
                    fromUser: fromUser,
                    toUser: toUser,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Mark all current expenses as settled
                const batch = db.batch();
                expenses.forEach(expense => {
                    const expenseRef = db.collection('expenses').doc(expense.id);
                    batch.update(expenseRef, { settled: true });
                });
                await batch.commit();
                
                showToast('Settlement completed!', 'success');
                
                // Switch to history tab
                switchTab('history');
            } catch (error) {
                console.error('Error settling:', error);
                showToast('Settlement failed', 'error');
            } finally {
                elements.settleNowBtn.disabled = false;
            }
        },
        'Settle',
        'btn-success'
    );
});

// ===============================================
// Tab Navigation
// ===============================================
function switchTab(tabName) {
    // Update tab buttons
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update bottom nav buttons
    elements.bottomNavBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab contents
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

elements.bottomNavBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ===============================================
// Page Visibility
// ===============================================
function showLogin() {
    elements.loadingScreen.classList.add('hidden');
    elements.loginPage.classList.remove('hidden');
    elements.mainApp.classList.add('hidden');
    elements.adminView.classList.add('hidden');
    
    // Reset form
    elements.loginForm.reset();
    showLoginError('');
}

function showApp() {
    elements.loadingScreen.classList.add('hidden');
    elements.loginPage.classList.add('hidden');
    elements.mainApp.classList.remove('hidden');
    elements.adminView.classList.add('hidden');
}

function showAdminView() {
    elements.loadingScreen.classList.add('hidden');
    elements.loginPage.classList.add('hidden');
    elements.mainApp.classList.add('hidden');
    elements.adminView.classList.remove('hidden');
}

function showLoginError(message) {
    if (message) {
        elements.loginError.textContent = message;
        elements.loginError.classList.remove('hidden');
    } else {
        elements.loginError.classList.add('hidden');
    }
}

// ===============================================
// Toast Notifications
// ===============================================
function showToast(message, type = 'success') {
    const toast = elements.toast;
    toast.className = `toast ${type}`;
    toast.querySelector('.toast-message').textContent = message;
    toast.querySelector('.toast-icon').className = `toast-icon fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
    
    toast.classList.remove('hidden');
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

// ===============================================
// Confirm Modal
// ===============================================
let confirmCallback = null;

function showConfirmModal(title, message, callback, confirmText = 'Confirm', confirmClass = 'btn-danger') {
    confirmCallback = callback;
    
    elements.modalTitle.textContent = title;
    elements.modalMessage.textContent = message;
    elements.modalConfirm.textContent = confirmText;
    elements.modalConfirm.className = `btn ${confirmClass}`;
    
    elements.confirmModal.classList.remove('hidden');
}

elements.modalCancel.addEventListener('click', () => {
    elements.confirmModal.classList.add('hidden');
    confirmCallback = null;
});

elements.modalConfirm.addEventListener('click', () => {
    elements.confirmModal.classList.add('hidden');
    if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
    }
});

elements.confirmModal.querySelector('.modal-overlay').addEventListener('click', () => {
    elements.confirmModal.classList.add('hidden');
    confirmCallback = null;
});

// ===============================================
// Utility Functions
// ===============================================
function formatCurrency(amount) {
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Password visibility toggle
function togglePassword() {
    const passwordInput = elements.loginPassword;
    const icon = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Make functions available globally
window.deleteExpense = deleteExpense;
window.togglePassword = togglePassword;