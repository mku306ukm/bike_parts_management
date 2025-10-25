document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('salesTableBody');
    const prevBtn = document.getElementById('salesPrev');
    const nextBtn = document.getElementById('salesNext');
    const pageInfo = document.getElementById('salesPageInfo');

    const pageSize = 10;
    let currentPage = 1;
    let items = JSON.parse(localStorage.getItem('sales') || '[]');

    function totalPages() { return Math.max(1, Math.ceil(items.length / pageSize)); }
    function saveAll(){ localStorage.setItem('sales', JSON.stringify(items)); }

    function read(key){ return JSON.parse(localStorage.getItem(key) || '[]'); }
    function write(key, v){ localStorage.setItem(key, JSON.stringify(v || [])); }

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

    function render(){
        if (!tbody) return;
        items = JSON.parse(localStorage.getItem('sales') || '[]');
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="muted">No sales records</td></tr>';
        } else {
            const start = (currentPage - 1) * pageSize;
            const pageItems = items.slice(start, start + pageSize);
            tbody.innerHTML = pageItems.map((s, i) => {
                const globalIndex = start + i;
                return `
                <tr>
                    <td>${escapeHtml(s.date)}</td>
                    <td>${escapeHtml(s.partNumber)}</td>
                    <td>${escapeHtml(s.partName)}</td>
                    <td class="num">${s.quantity}</td>
                    <td class="num">₹${(s.price||0).toFixed(2)}</td>
                    <td class="num">₹${(s.totalPrice||0).toFixed(2)}</td>
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

    function attachRowEvents(){
        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(idx)) return;
                if (!confirm('Delete this sales record?')) return;
                items.splice(idx,1);
                saveAll();
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

                // update record
                rec.date = newDate;
                rec.partName = newName;
                rec.partNumber = newNumber;
                rec.quantity = newQty;
                rec.price = Number(newPrice.toFixed(2));
                rec.totalPrice = Number((newQty * newPrice).toFixed(2));
                saveAll();

                // rebuild stock so purchases/sales consistency maintained
                rebuildStockFromTransactions();

                // also update purchases' names/partNumbers where they match old (to keep naming consistent)
                const purchases = read('purchases');
                let changed = false;
                purchases.forEach(p => {
                    if ((p.partNumber||'') === (rec.partNumber||'') || (p.partName||'').toLowerCase() === (rec.partName||'').toLowerCase()) {
                        p.partName = rec.partName;
                        p.partNumber = rec.partNumber;
                        changed = true;
                    }
                });
                if (changed) write('purchases', purchases);

                render();
            };
        });
    }

    prevBtn && (prevBtn.onclick = () => { if (currentPage>1) { currentPage--; render(); }});
    nextBtn && (nextBtn.onclick = () => { if (currentPage<totalPages()) { currentPage++; render(); }});

    // initial rebuild
    rebuildStockFromTransactions();
    render();
});

function escapeHtml(s){ if (s===undefined||s===null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }