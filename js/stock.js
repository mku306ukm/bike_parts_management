// stock.js
document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('stockTableBody');
    const searchInput = document.getElementById('searchInput');
    const prevBtn = document.getElementById('stockPrev');
    const nextBtn = document.getElementById('stockNext');
    const pageInfo = document.getElementById('stockPageInfo');

    const pageSize = 10;
    let currentPage = 1;
    let allItems = JSON.parse(localStorage.getItem('stock') || '[]');
    let filtered = allItems.slice();

    function totalPages() { return Math.max(1, Math.ceil(filtered.length / pageSize)); }
    function saveStock(a) { localStorage.setItem('stock', JSON.stringify(a || [])); }
    function read(key){ return JSON.parse(localStorage.getItem(key) || '[]'); }
    function write(key, v){ localStorage.setItem(key, JSON.stringify(v || [])); }

    function getLatestPrices(partNumber, partName) {
        const purchases = read('purchases');
        const sales = read('sales');
        
        // Find latest purchase
        const latestPurchase = [...purchases]
            .filter(p => (p.partNumber === partNumber || p.partName === partName))
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            
        // Find latest sale
        const latestSale = [...sales]
            .filter(s => (s.partNumber === partNumber || s.partName === partName))
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            
        return {
            purchasePrice: latestPurchase ? latestPurchase.price : 0,
            salePrice: latestSale ? latestSale.price : 0
        };
    }

    function render() {
        if (!tbody) return;
        allItems = JSON.parse(localStorage.getItem('stock') || '[]');
        const start = (currentPage - 1) * pageSize;
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="muted">No stock available</td></tr>';
        } else {
            const pageItems = filtered.slice(start, start + pageSize);
            tbody.innerHTML = pageItems.map((s, i) => {
                const globalIndex = start + i;
                const prices = getLatestPrices(s.partNumber, s.partName);
                return `
                <tr>
                    <td>${escapeHtml(s.partNumber)}</td>
                    <td>${escapeHtml(s.partName)}</td>
                    <td class="num">${s.quantity}</td>
                    <td class="num">₹${prices.purchasePrice.toFixed(2)}</td>
                    <td class="num">₹${prices.salePrice.toFixed(2)}</td>
                    <td>${escapeHtml(s.lastUpdated||'')}</td>
                    <td>
                        <div class="row-actions">
                            <button class="page-btn edit-btn" data-index="${globalIndex}"><i class="fas fa-edit"></i> Edit</button>
                            <button class="page-btn delete-btn" data-index="${globalIndex}"><i class="fas fa-trash-alt"></i> Delete</button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }
        pageInfo.textContent = `Page ${currentPage} / ${totalPages()}`;
        prevBtn && (prevBtn.disabled = currentPage <= 1);
        nextBtn && (nextBtn.disabled = currentPage >= totalPages());
        attachEvents();
    }

    function attachEvents() {
        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(idx)) return;
                if (!confirm('Delete this stock item?')) return;
                const stock = JSON.parse(localStorage.getItem('stock') || '[]');
                const rec = stock[idx];
                stock.splice(idx,1);
                saveStock(stock);
                // also remove matching purchases/sales? we will keep transactions but rebuild
                // rebuild from transactions to reflect any mismatches
                rebuildStockFromTransactions();
                applySearch(searchInput ? searchInput.value : '');
            };
        });

        tbody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(idx)) return;
                const stock = JSON.parse(localStorage.getItem('stock') || '[]');
                const rec = stock[idx];
                if (!rec) return;
                const oldPN = rec.partNumber;
                const oldName = rec.partName;
                const newName = prompt('Part Name:', rec.partName) || rec.partName;
                const newPN = prompt('Part Number:', rec.partNumber) || rec.partNumber;
                const newQtyStr = prompt('Quantity:', rec.quantity);
                const newQty = parseInt(newQtyStr,10);
                if (isNaN(newQty) || newQty < 0) { alert('Invalid quantity. Edit cancelled.'); return; }
                const newDate = prompt('Last Updated (YYYY-MM-DD):', rec.lastUpdated || new Date().toISOString().split('T')[0]) || rec.lastUpdated;

                // update stock record directly
                rec.partName = newName;
                rec.partNumber = newPN;
                rec.quantity = newQty;
                rec.lastUpdated = newDate;
                saveStock(stock);

                // propagate name/partNumber changes into purchases and sales where they matched old values
                const purchases = read('purchases');
                let pChanged = false;
                purchases.forEach(p => {
                    if ((p.partNumber||'') === oldPN || (p.partName||'').toLowerCase() === oldName.toLowerCase()) {
                        p.partName = newName;
                        p.partNumber = newPN;
                        pChanged = true;
                    }
                });
                if (pChanged) write('purchases', purchases);

                const sales = read('sales');
                let sChanged = false;
                sales.forEach(s => {
                    if ((s.partNumber||'') === oldPN || (s.partName||'').toLowerCase() === oldName.toLowerCase()) {
                        s.partName = newName;
                        s.partNumber = newPN;
                        sChanged = true;
                    }
                });
                if (sChanged) write('sales', sales);

                // After manual quantity change, ensure transactions reflect new stock:
                // compute delta between sum(purchases)-sum(sales) and newQty; if delta != 0, create a synthetic adjustment purchase/sale
                const key = newPN || newName;
                const totalPurch = read('purchases').filter(p=>((p.partNumber||p.partName||'').toString()===key.toString())).reduce((a,b)=>a+Number(b.quantity||0),0);
                const totalSales = read('sales').filter(s=>((s.partNumber||s.partName||'').toString()===key.toString())).reduce((a,b)=>a+Number(b.quantity||0),0);
                const derived = Math.max(0, totalPurch - totalSales);
                const delta = newQty - derived;
                if (delta !== 0) {
                    // create synthetic transaction to balance stock
                    if (delta > 0) {
                        // add a purchase to match
                        const adj = { date: new Date().toISOString().split('T')[0], partName: newName, partNumber: newPN, quantity: delta, price: 0, totalPrice: 0 };
                        const purchasesAll = read('purchases');
                        purchasesAll.push(adj);
                        write('purchases', purchasesAll);
                    } else {
                        // add a sale to match (-delta)
                        const adj = { date: new Date().toISOString().split('T')[0], partName: newName, partNumber: newPN, quantity: -delta, price: 0, totalPrice: 0 };
                        const salesAll = read('sales');
                        salesAll.push(adj);
                        write('sales', salesAll);
                    }
                    // after creating adjustment, rebuild stock from transactions
                    rebuildStockFromTransactions();
                }

                applySearch(searchInput ? searchInput.value : '');
            };
        });
    }

    function applySearch(query) {
        const q = (query || '').toLowerCase().trim();
        allItems = JSON.parse(localStorage.getItem('stock') || '[]');
        filtered = q ? allItems.filter(i => (i.partNumber||'').toLowerCase().includes(q) || (i.partName||'').toLowerCase().includes(q)) : allItems.slice();
        currentPage = 1;
        render();
    }

    // helper used by stock edits/deletes to recompute stock
    function rebuildStockFromTransactions() {
        const purchases = read('purchases');
        const sales = read('sales');
        const map = {};
        purchases.forEach(p => {
            const key = (p.partNumber || p.partName || '').toString();
            if (!map[key]) map[key] = { partNumber: p.partNumber||'', partName: p.partName||'', quantity:0, lastUpdated: p.date || new Date().toISOString().split('T')[0] };
            map[key].quantity += Number(p.quantity || 0);
            map[key].lastUpdated = p.date || map[key].lastUpdated;
        });
        sales.forEach(s => {
            const key = (s.partNumber || s.partName || '').toString();
            if (!map[key]) map[key] = { partNumber: s.partNumber||'', partName: s.partName||'', quantity:0, lastUpdated: s.date || new Date().toISOString().split('T')[0] };
            map[key].quantity -= Number(s.quantity || 0);
            map[key].lastUpdated = s.date || map[key].lastUpdated;
        });
        const stock = Object.keys(map).map(k => ({ partName: map[k].partName || (`Unnamed ${map[k].partNumber||k}`), partNumber: map[k].partNumber||k, quantity: Math.max(0, map[k].quantity), lastUpdated: map[k].lastUpdated }));
        write('stock', stock);
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => applySearch(e.target.value));
    }

    prevBtn && prevBtn.addEventListener('click', () => { if (currentPage>1) { currentPage--; render(); } });
    nextBtn && nextBtn.addEventListener('click', () => { if (currentPage<totalPages()) { currentPage++; render(); } });

    applySearch('');
});

function escapeHtml(s){ if (s===undefined||s===null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }