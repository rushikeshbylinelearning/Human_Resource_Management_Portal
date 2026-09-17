// backend/routes/admin/holidays.js
// Legacy unscoped holiday CRUD used by AdminLeavesPage (/api/admin/holidays).
// Year-scoped holiday management lives in routes/holidayRoutes.js (/api/holidays/admin).

const express = require('express');
const router = express.Router();

const authenticateToken = require('../../middleware/authenticateToken');
const isAdminOrHr = require('../../middleware/requireAdminOrHr');
const Holiday = require('../../models/Holiday');

router.get('/holidays', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const holidays = await Holiday.find().lean();
        // Sort: valid dates first (ASC), then tentative holidays at bottom (alphabetically)
        const sortedHolidays = holidays.sort((a, b) => {
            const aIsTentative = !a.date || a.isTentative;
            const bIsTentative = !b.date || b.isTentative;

            if (aIsTentative && bIsTentative) {
                return a.name.localeCompare(b.name);
            }
            if (aIsTentative) return 1;
            if (bIsTentative) return -1;
            return new Date(a.date) - new Date(b.date);
        });
        res.json(sortedHolidays);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch holidays.' });
    }
});
router.post('/holidays', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { name, date } = req.body;
    if (!name || !date) {
        return res.status(400).json({ error: 'Holiday name and date are required.' });
    }
    try {
        const newHoliday = new Holiday({ name, date });
        await newHoliday.save();
        res.status(201).json(newHoliday);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'A holiday on this date already exists.' });
        }
        res.status(500).json({ error: 'Failed to add holiday.' });
    }
});
router.delete('/holidays/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const holiday = await Holiday.findByIdAndDelete(req.params.id);
        if (!holiday) {
            return res.status(404).json({ error: 'Holiday not found.' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete holiday.' });
    }
});

// POST /api/admin/holidays/bulk-upload
// Bulk upload holidays from Excel file
router.post('/holidays/bulk-upload', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { holidays } = req.body;

    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
        return res.status(400).json({ error: 'Holidays array is required and must not be empty.' });
    }

    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
        const results = {
            successCount: 0,
            failureCount: 0,
            errors: []
        };

        // Helper function to parse flexible date (same logic as frontend)
        const parseFlexibleDate = (dateStr, currentYear = new Date().getFullYear()) => {
            if (!dateStr) return null;

            const normalized = String(dateStr).trim();

            // Check for "Not Yet decided" (case-insensitive)
            if (/not\s+yet\s+decided/i.test(normalized)) {
                return { date: null, isTentative: true };
            }

            // Try Excel serial date first
            if (!isNaN(normalized) && parseFloat(normalized) > 25569) {
                const excelEpoch = new Date(1900, 0, 1);
                const days = parseFloat(normalized) - 2;
                const parsedDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
                if (!isNaN(parsedDate.getTime())) {
                    return { date: parsedDate, isTentative: false };
                }
            }

            // Try parsing as full date
            let parsedDate = new Date(normalized);
            if (!isNaN(parsedDate.getTime())) {
                return { date: parsedDate, isTentative: false };
            }

            // Try parsing as "DD-MMM" format (e.g., "26-Jan", "3-Mar")
            const dayMonthMatch = normalized.match(/^(\d{1,2})[-/](\w{3,})$/i);
            if (dayMonthMatch) {
                const day = parseInt(dayMonthMatch[1]);
                const monthStr = dayMonthMatch[2].toLowerCase();
                const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const monthIndex = monthNames.findIndex(m => monthStr.startsWith(m));

                if (monthIndex !== -1 && day >= 1 && day <= 31) {
                    const date = new Date(currentYear, monthIndex, day);
                    if (date.getDate() === day && date.getMonth() === monthIndex) {
                        return { date: date, isTentative: false };
                    }
                }
            }

            return null; // Invalid format
        };

        // Get existing holidays to check for duplicates
        const existingHolidays = await Holiday.find({}, 'date name isTentative').session(session);
        const existingDates = new Set(
            existingHolidays
                .filter(h => h.date && !h.isTentative)
                .map(h => {
                    const d = new Date(h.date);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                })
        );
        const existingTentativeHolidays = new Set(
            existingHolidays
                .filter(h => h.isTentative)
                .map(h => h.name.toLowerCase().trim())
        );

        // Validate and process each holiday
        const holidaysToInsert = [];
        const seenDatesInBatch = new Set();
        const seenTentativeInBatch = new Set();
        const currentYear = new Date().getFullYear();

        for (let i = 0; i < holidays.length; i++) {
            const holiday = holidays[i];
            const rowNum = i + 1;
            const errors = [];

            // Validate holiday name
            const holidayName = String(holiday.name || '').trim();
            if (holidayName.length === 0) {
                errors.push('Holiday name is required');
            } else if (holidayName.length > 100) {
                errors.push('Holiday name exceeds 100 characters');
            }

            // Parse date (can be null for tentative)
            const isTentative = holiday.isTentative || false;
            let dateResult = null;
            let formattedDate = null;
            let parsedDate = null;

            if (holiday.date) {
                dateResult = parseFlexibleDate(holiday.date, currentYear);
                if (!dateResult) {
                    errors.push('Invalid date format');
                } else if (dateResult.isTentative) {
                    // "Not Yet decided" - date is null
                    formattedDate = null;
                    parsedDate = null;
                } else {
                    parsedDate = dateResult.date;
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    formattedDate = `${year}-${month}-${day}`;
                }
            } else if (!isTentative) {
                errors.push('Date is required for non-tentative holidays');
            }

            if (errors.length > 0) {
                results.failureCount++;
                results.errors.push({
                    row: rowNum,
                    errors: errors
                });
                continue;
            }

            // Handle tentative holidays
            if (isTentative || !formattedDate) {
                const nameKey = holidayName.toLowerCase();

                // Check for duplicate tentative in batch
                if (seenTentativeInBatch.has(nameKey)) {
                    results.failureCount++;
                    results.errors.push({
                        row: rowNum,
                        errors: [`Duplicate tentative holiday in upload: ${holidayName}`]
                    });
                    continue;
                }

                // Check for duplicate tentative in database
                if (existingTentativeHolidays.has(nameKey)) {
                    results.failureCount++;
                    results.errors.push({
                        row: rowNum,
                        errors: [`Tentative holiday already exists: ${holidayName}`]
                    });
                    continue;
                }

                seenTentativeInBatch.add(nameKey);
                holidaysToInsert.push({
                    name: holidayName,
                    date: null,
                    isTentative: true,
                    day: holiday.day ? String(holiday.day).trim() : null
                });
                continue;
            }

            // Handle regular holidays with dates
            // Check for duplicates in batch
            if (seenDatesInBatch.has(formattedDate)) {
                results.failureCount++;
                results.errors.push({
                    row: rowNum,
                    errors: [`Duplicate date in upload: ${formattedDate}`]
                });
                continue;
            }

            // Check for duplicates in database
            if (existingDates.has(formattedDate)) {
                results.failureCount++;
                results.errors.push({
                    row: rowNum,
                    errors: [`Holiday already exists for date: ${formattedDate}`]
                });
                continue;
            }

            // Day validation (optional, allow multiple days)
            // Don't strictly validate day for flexibility

            // Add to insert batch
            seenDatesInBatch.add(formattedDate);
            holidaysToInsert.push({
                name: holidayName,
                date: parsedDate,
                isTentative: false,
                day: holiday.day ? String(holiday.day).trim() : null
            });
        }

        // If there are any errors, reject the entire batch
        if (results.errors.length > 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                error: 'Validation failed. Please fix all errors before uploading.',
                successCount: 0,
                failureCount: results.failureCount,
                errors: results.errors
            });
        }

        // Insert all holidays in a transaction
        if (holidaysToInsert.length > 0) {
            try {
                await Holiday.insertMany(holidaysToInsert, { session });
                results.successCount = holidaysToInsert.length;
            } catch (insertError) {
                // Handle unique constraint violations
                if (insertError.code === 11000) {
                    const duplicateField = Object.keys(insertError.keyPattern || {})[0];
                    throw new Error(`Duplicate holiday detected: ${duplicateField}`);
                }
                throw insertError;
            }
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: `Successfully uploaded ${results.successCount} holiday(s).`,
            successCount: results.successCount,
            failureCount: results.failureCount,
            errors: results.errors
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error('Error in bulk upload holidays:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: 'One or more holidays already exist in the database.',
                successCount: 0,
                failureCount: holidays.length,
                errors: []
            });
        }

        res.status(500).json({
            error: 'Failed to upload holidays.',
            successCount: 0,
            failureCount: holidays.length,
            errors: []
        });
    }
});
module.exports = router;
