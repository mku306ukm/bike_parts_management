// This file is intentionally left blank.

// Robust main page logic: safe DOM checks, total calc, purchases/sales, stock update
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const dateEl = document.getElementById('date');
    const nameEl = document.getElementById('partName');
    const numberEl = document.getElementById('partNumber');
    const qtyEl = document.getElementById('quantity');
    const priceEl = document.getElementById('price');
    const totalEl = document.getElementById('totalPrice');
    const btnAddPurchase = document.getElementById('btnAddPurchase');
    const btnAddSale = document.getElementById('btnAddSale');

    const readJSON = (k) => {
        try { return JSON.parse(localStorage.getItem(k) || '[]'); }
        catch (e) { return []; }
    };
    const writeJSON = (k, v) => {
        try { localStorage.setItem(k, JSON.stringify(v || [])); }
        catch (e) { console.warn('storage write failed', e); }
    };

    function nowDate() { return new Date().toISOString().split('T')[0]; }

    function calculateTotal() {
        if (!qtyEl || !priceEl || !totalEl) return;
        const q = parseFloat(qtyEl.value) || 0;
        const p = parseFloat(priceEl.value) || 0;
        totalEl.value = (q * p) ? (q * p).toFixed(2) : '';
    }
    if (qtyEl) qtyEl.addEventListener('input', calculateTotal);
    if (priceEl) priceEl.addEventListener('input', calculateTotal);

    function getFormData() {
        const q = qtyEl ? (parseInt(qtyEl.value, 10) || 0) : 0;
        const p = priceEl ? (parseFloat(priceEl.value) || 0) : 0;
        return {
            date: (dateEl && dateEl.value) || nowDate(),
            partName: (nameEl && (nameEl.value || '')).trim(),
            partNumber: (numberEl && (numberEl.value || '')).trim(),
            quantity: q,
            price: Number.isFinite(p) ? Number(p.toFixed(2)) : 0,
            totalPrice: Number((q * p).toFixed(2))
        };
    }

    function saveTo(key, item) {
        const arr = readJSON(key);
        arr.push(item);
        writeJSON(key, arr);
    }

    // strict match: both partNumber and partName must match same record
    function findStockByBoth(partNumber, partName) {
        const stock = readJSON('stock');
        if (!partNumber || !partName) return -1;
        const nameLower = partName.toLowerCase();
        return stock.findIndex(s => (s.partNumber || '').toString() === partNumber.toString() && (s.partName || '').toLowerCase() === nameLower);
    }

    // fallback find (used for purchase stock updates etc.)
    function findStockIndexLoose(stock, partNumber, partName) {
        if (!Array.isArray(stock)) return -1;
        if (partNumber) {
            const i = stock.findIndex(s => (s.partNumber || '').toString() === partNumber.toString());
            if (i >= 0) return i;
        }
        if (partName) {
            const target = partName.toLowerCase();
            return stock.findIndex(s => (s.partName || '').toLowerCase() === target);
        }
        return -1;
    }

    function updateStockRecord(partNumber, partName, qty, isAddition, date) {
        const stock = readJSON('stock');
        const idx = findStockIndexLoose(stock, partNumber, partName);
        const stamp = date || nowDate();

        if (idx >= 0) {
            const rec = stock[idx];
            rec.quantity = isAddition ? (rec.quantity + qty) : (rec.quantity - qty);
            if (rec.quantity < 0) rec.quantity = 0;
            rec.lastUpdated = stamp;
            if (partName && partName.length > (rec.partName || '').length) rec.partName = partName;
            if (partNumber && !rec.partNumber) rec.partNumber = partNumber;
        } else if (isAddition) {
            const pn = (partNumber && partNumber.length) ? partNumber : `PN-${Date.now()}`;
            stock.push({
                partName: partName || `Unnamed ${pn}`,
                partNumber: pn,
                quantity: qty,
                lastUpdated: stamp
            });
        } else {
            // sale of unknown item -> fail silently (caller should handle)
            return false;
        }

        const cleaned = stock.filter(s => (s.quantity || 0) > 0);
        writeJSON('stock', cleaned);
        return true;
    }

    function clearForm() {
        const form = document.getElementById('partsForm');
        if (form) form.reset();
        if (totalEl) totalEl.value = '';
        calculateTotal();
    }

    // Purchase handler (creates/updates stock)
    if (btnAddPurchase) {
        btnAddPurchase.addEventListener('click', () => {
            const data = getFormData();
            if (!data.partName) { alert('Enter Part Name'); return; }
            if (data.quantity <= 0) { alert('Enter valid Quantity'); return; }
            if (isNaN(data.price) || data.price < 0) { alert('Enter valid Price'); return; }

            saveTo('purchases', data);
            updateStockRecord(data.partNumber, data.partName, data.quantity, true, data.date);
            alert('Purchase saved.');
            clearForm();
        });
    }

    // Sale handler (strict: both name & number must match same stock record)
    if (btnAddSale) {
        btnAddSale.addEventListener('click', () => {
            const data = getFormData();
            if (data.quantity <= 0) { alert('Enter valid Quantity'); return; }
            if (!data.partNumber || !data.partName) { alert('Enter both Part Number and Part Name to sell'); return; }

            const idxStrict = findStockByBoth(data.partNumber, data.partName);
            if (idxStrict < 0) {
                alert('Item not found in stock (part name and part number do not match).');
                return;
            }

            const stock = readJSON('stock');
            if ((stock[idxStrict].quantity || 0) < data.quantity) {
                alert('Not enough stock available for this sale.');
                return;
            }

            // ensure partName consistent
            if (!data.partName) data.partName = stock[idxStrict].partName || '';

            saveTo('sales', data);
            // reduce stock using exact partNumber from matched record
            updateStockRecord(stock[idxStrict].partNumber, stock[idxStrict].partName, data.quantity, false, data.date);
            alert('Sale recorded.');
            clearForm();
        });
    }
});