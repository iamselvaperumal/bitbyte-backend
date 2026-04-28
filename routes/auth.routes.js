const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.post('/login', validate(schemas.login), authController.login);
router.post('/register', validate(schemas.registerEmployee), authController.registerEmployee);
router.patch('/reset-password', protect, validate(schemas.resetPassword), authController.resetPassword);
router.get('/me', protect, authController.getMe);

module.exports = router;
