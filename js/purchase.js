// This file handles the logic for displaying purchase records. 
// It retrieves purchase data from local storage and populates the purchase table in purchase.html.

document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('purchaseTableBody');
    const prevBtn = document.getElementById('purchasePrev');
    const nextBtn = document.getElementById('purchaseNext');
    const pageInfo = document.getElementById('purchasePageInfo');

    const pageSize = 10;
    let currentPage = 1;
    let items = JSON.parse(localStorage.getItem('purchases') || '[]');

    function totalPages() { return Math.max(1, Math.ceil(items.length / pageSize)); }
    function saveAll() { localStorage.setItem('purchases', JSON.stringify(items)); }

    function read(key){ return JSON.parse(localStorage.getItem(key) || '[]'); }
    function write(key, v){ localStorage.setItem(key, JSON.stringify(v || [])); }

    // Rebuild stock from purchases - sales (ensures global consistency)
    function rebuildStockFromTransactions() {
        const purchases = read('purchases');
        const sales = read('sales');
        const map = {};
        purchases.forEach(p => {
            const key = (p.partNumber || p.partName || '').toString();
            if (!map[key]) map[key] = { partNumber: p.partNumber||'', partName: p.partName||'', quantity:0, lastUpdated: p.date || new Date().toISOString().split('T')[0] };
            map[key].quantity += Number(p.quantity || 0);
            map[key].lastUpdated = p.date || map[key].lastUpdated;
            if (!map[key].partName && p.partName) map[key].partName = p.partName;
        });
        sales.forEach(s => {
            const key = (s.partNumber || s.partName || '').toString();
            if (!map[key]) map[key] = { partNumber: s.partNumber||'', partName: s.partName||'', quantity:0, lastUpdated: s.date || new Date().toISOString().split('T')[0] };
            map[key].quantity -= Number(s.quantity || 0);
            map[key].lastUpdated = s.date || map[key].lastUpdated;
            if (!map[key].partName && s.partName) map[key].partName = s.partName;
        });
        const stock = Object.keys(map).map(k => ({ partName: map[k].partName || (`Unnamed ${map[k].partNumber||k}`), partNumber: map[k].partNumber||k, quantity: Math.max(0, map[k].quantity), lastUpdated: map[k].lastUpdated }));
        write('stock', stock);
    }

    function findStockIndex(stock, partNumber, partName){
        if (partNumber) {
            const i = stock.findIndex(s => (s.partNumber||'').toString() === partNumber.toString());
            if (i>=0) return i;
        }
        if (partName) {
            const t = partName.toLowerCase();
            return stock.findIndex(s => (s.partName||'').toLowerCase() === t);
        }
        return -1;
    }

    function adjustStockByDelta(partNumber, partName, delta){
        const stock = read('stock');
        const idx = findStockIndex(stock, partNumber, partName);
        if (idx>=0){
            stock[idx].quantity = Math.max(0, (stock[idx].quantity||0) + delta);
            stock[idx].lastUpdated = new Date().toISOString().split('T')[0];
        } else if (delta>0){
            const pn = partNumber && partNumber.length ? partNumber : `PN-${Date.now()}`;
            stock.push({ partName: partName || (`Unnamed ${pn}`), partNumber: pn, quantity: delta, lastUpdated: new Date().toISOString().split('T')[0] });
        }
        write('stock', stock);
    }

    function render() {
        if (!tbody) return;
        items = JSON.parse(localStorage.getItem('purchases') || '[]');
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="muted">No purchase records</td></tr>';
        } else {
            const start = (currentPage - 1) * pageSize;
            const pageItems = items.slice(start, start + pageSize);
            tbody.innerHTML = pageItems.map((p, i) => {
                const globalIndex = start + i;
                return `
                <tr>
                    <td>${escapeHtml(p.date)}</td>
                    <td>${escapeHtml(p.partNumber)}</td>
                    <td>${escapeHtml(p.partName)}</td>
                    <td class="num">${p.quantity}</td>
                    <td class="num">₹${(p.price||0).toFixed(2)}</td>
                    <td class="num">₹${(p.totalPrice||0).toFixed(2)}</td>
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
        attachRowEvents();
    }

    function attachRowEvents() {
        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(idx)) return;
                if (!confirm('Delete this purchase record?')) return;
                const rec = items[idx];
                items.splice(idx,1);
                saveAll();
                // rebuild stock from transactions to keep consistency
                rebuildStockFromTransactions();
                if (currentPage > totalPages()) currentPage = totalPages();
                render();
            };
        });
        tbody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(idx)) return;
                const rec = items[idx];
                const newDate = prompt('Date (YYYY-MM-DD):', rec.date) || rec.date;
                const newName = prompt('Part Name:', rec.partName) || rec.partName;
                const newNumber = prompt('Part Number:', rec.partNumber) || rec.partNumber;
                const newQtyStr = prompt('Quantity:', rec.quantity);
                const newQty = parseInt(newQtyStr,10);
                if (isNaN(newQty) || newQty <= 0) { alert('Invalid quantity. Edit cancelled.'); return; }
                const newPriceStr = prompt('Price:', rec.price);
                const newPrice = parseFloat(newPriceStr);
                if (isNaN(newPrice) || newPrice < 0) { alert('Invalid price. Edit cancelled.'); return; }

                // update purchase record
                rec.date = newDate;
                rec.partName = newName;
                rec.partNumber = newNumber;
                rec.quantity = newQty;
                rec.price = Number(newPrice.toFixed(2));
                rec.totalPrice = Number((newQty * newPrice).toFixed(2));
                saveAll();

                // After editing purchases, rebuild stock from transactions (purchases/sales)
                rebuildStockFromTransactions();

                // Also update sales entries' names/partNumbers where they match old pn/name
                const sales = read('sales');
                let changed = false;
                sales.forEach(s => {
                    if ((s.partNumber||'') === (rec.partNumber||'') || (s.partName||'').toLowerCase() === (rec.partName||'').toLowerCase()) {
                        s.partName = rec.partName;
                        s.partNumber = rec.partNumber;
                        changed = true;
                    }
                });
                if (changed) write('sales', sales);

                render();
            };
        });
    }

    prevBtn && (prevBtn.onclick = () => { if (currentPage>1) { currentPage--; render(); }});
    nextBtn && (nextBtn.onclick = () => { if (currentPage<totalPages()) { currentPage++; render(); }});

    // initial rebuild to ensure stock consistent on load
    rebuildStockFromTransactions();
    render();
});

function escapeHtml(s){ if (s===undefined||s===null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }