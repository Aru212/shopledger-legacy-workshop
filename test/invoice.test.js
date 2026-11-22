'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');

// Deliberately constructed in memory; these tests never access data/db.json.
function riceOrder(overrides) {
  return Object.assign({
    id: 77,
    date: '2026-01-02',
    status: 'completed',
    customer: 'Test Customer',
    paymentMode: 'cash',
    coupon: '',
    items: [{ id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 1000, qty: 1 }]
  }, overrides || {});
}

test('invoice uses the HSN GST slab and matches order pricing when gstRate is absent', function () {
  var order = riceOrder();
  var billed = pricing.computeTotals(order.items, '');
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.tax, 50);
  assert.equal(billed.total, 1050);
  assert.equal(invoiced.rows[0].gstPercent, 5);
  assert.equal(invoiced.tax, 50);
  assert.equal(invoiced.total, 1050);
});

test('CURRENT BEHAVIOUR: explicit gstRate overrides the HSN slab in invoice and order pricing', function () {
  var order = riceOrder({ items: [{ id: 1, name: 'Rice', hsn: '1006', gstRate: 12, price: 1000, qty: 1 }] });
  var billed = pricing.computeTotals(order.items, '');
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.tax, 120);
  assert.equal(invoiced.rows[0].gstPercent, 12);
  assert.equal(invoiced.tax, 120);
});

test('invoice applies the same capped percent coupon and post-discount GST as order pricing', function () {
  var order = riceOrder({ coupon: 'SAVE10', items: [{ id: 1, name: 'Rice', hsn: '1006', price: 5000, qty: 1 }] });
  var billed = pricing.computeTotals(order.items, order.coupon);
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: invoiced.discount, tax: invoiced.tax, total: invoiced.total },
    { discount: billed.discount, tax: billed.tax, total: billed.total }
  );
  assert.equal(invoiced.rows[0].lineTax, billed.lines[0].tax);
});

test('invoice follows order pricing eligibility for an inactive coupon below its minimum', function () {
  var order = riceOrder({ coupon: 'DIWALI20', items: [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }] });
  var billed = pricing.computeTotals(order.items, order.coupon);
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 0);
  assert.equal(invoiced.discount, billed.discount);
  assert.equal(invoiced.total, billed.total);
});

test('invoice render shows separate CGST and SGST and no variance when order totals match', function () {
  var order = riceOrder();
  var billed = pricing.computeTotals(order.items, order.coupon);
  order.total = billed.total;
  var html = invoice.render(order);

  assert.match(html, /<td>CGST<\/td><td class="r">₹25\.00<\/td>/);
  assert.match(html, /<td>SGST<\/td><td class="r">₹25\.00<\/td>/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹1050\.00<\/td>/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice figures and line GST match the order pricing calculation', function () {
  var order = riceOrder({
    coupon: 'SAVE10',
    items: [{ id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 5000, qty: 1 }]
  });
  var billed = pricing.computeTotals(order.items, order.coupon);
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: invoiced.subtotal, discount: invoiced.discount, tax: invoiced.tax, cgst: invoiced.cgst, sgst: invoiced.sgst, total: invoiced.total },
    { subtotal: billed.subtotal, discount: billed.discount, tax: billed.tax, cgst: billed.cgst, sgst: billed.sgst, total: billed.total }
  );
  assert.equal(invoiced.rows[0].gstPercent, billed.lines[0].gstPercent);
  assert.equal(invoiced.rows[0].lineTax, billed.lines[0].tax);
});
