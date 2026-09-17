// backend/routes/admin/index.js
// Composes admin domain routers. server.js mounts this at /api/admin.

const express = require('express');
const router = express.Router();

router.use(require('./leaves'));
router.use(require('./attendance'));
router.use(require('./dashboard'));
router.use(require('./holidays'));
router.use(require('./requests'));

module.exports = router;
