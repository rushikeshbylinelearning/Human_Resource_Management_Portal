// backend/models/EmployeeResourceRequest.js
const mongoose = require('mongoose');

const CATEGORIES = ['IT_Hardware', 'Stationery', 'Office Supplies', 'Furniture', 'Other'];
const STATUSES = ['Pending', 'In Progress', 'Fulfilled', 'Rejected', 'Cancelled'];
const PRIORITIES = ['low', 'medium', 'high'];

const employeeResourceRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeName: { type: String, required: true },
    employeeCode: { type: String },
    department: { type: String },
    category: { type: String, enum: CATEGORIES, required: true },
    customCategory: { type: String, trim: true, maxlength: 100 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    quantity: { type: Number, default: 1, min: 1, max: 999 },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    status: { type: String, enum: STATUSES, default: 'Pending', index: true },
    adminNotes: { type: String, trim: true, maxlength: 1000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
}, { timestamps: true });

employeeResourceRequestSchema.index({ createdAt: -1 });
employeeResourceRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmployeeResourceRequest', employeeResourceRequestSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
