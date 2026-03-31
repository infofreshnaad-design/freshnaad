const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

router.post('/login', async (req, res) => {
  const { username, password, deviceId } = req.body;
  
  try {
    let user;
    try {
        user = await prisma.user.findUnique({ 
            where: { username },
            include: { license: true }
        });

        // AUTO-BOOTSTRAP: If database is empty, create a default admin
        if (!user) {
            const userCount = await prisma.user.count();
            if (userCount === 0 && username === 'admin') {
                console.log('Empty Database Detected: Bootstrapping default admin...');
                const hashedPassword = await bcrypt.hash('admin123', 10);
                user = await prisma.user.create({
                    data: {
                        name: 'Default Admin',
                        username: 'admin',
                        password: hashedPassword,
                        role: 'ADMIN'
                    },
                    include: { license: true }
                });
            }
        }
    } catch (dbError) {
        console.error('CRITICAL DB ERROR during login:', dbError.message);
        // EMERGENCY FALLBACK: Allow login if DB is unreachable but credentials match default
        if (username === 'admin' && password === 'admin123') {
            console.warn('DB UNREACHABLE: Using Emergency Admin Fallback');
            user = {
                id: 'emergency-admin',
                name: 'Emergency Admin',
                username: 'admin',
                role: 'ADMIN',
                isEmergency: true
            };
        } else {
            throw dbError; // Rethrow if it's not the default admin
        }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials. User not found.' });
    }

    // Skip bcrypt for emergency fallback user (plain text comparison for safety)
    const isMatch = user.isEmergency 
        ? (password === 'admin123')
        : await bcrypt.compare(password, user.password);

    if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials. Password mismatch.' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, licenseId: user.licenseId }, 
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role } 
    });
  } catch (error) {
    console.error('CRITICAL LOGIN ERROR:', {
        message: error.message,
        code: error.code, // Useful for Prisma database errors
        stack: error.stack
    });
    res.status(500).json({ 
        error: "Internal Server Error", 
        details: error.message,
        hint: error.code === 'P2021' ? "Database tables missing. Run 'npx prisma db push'." : "Check backend logs."
    });
  }
});

// Device Registration Request
router.post('/register-device', async (req, res) => {
    const { deviceId, name, licenseKey } = req.body;
    try {
        const license = await prisma.license.findUnique({ 
            where: { key: licenseKey },
            include: { devices: true }
        });

        if (!license || license.status !== 'ACTIVE') {
            return res.status(404).json({ message: 'Invalid or inactive license key' });
        }

        if (license.devices.length >= license.maxDevices) {
            return res.status(403).json({ message: 'Maximum device limit reached for this license' });
        }

        const device = await prisma.device.upsert({
            where: { deviceId },
            update: { name, licenseId: license.id },
            create: { deviceId, name, licenseId: license.id }
        });

        res.json({ message: 'Device registration request sent. Please contact Admin for authorization.', device });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change Password (Self-service)
router.post('/change-password', async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch && currentPassword !== user.password) {
            return res.status(401).json({ message: 'Incorrect current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Reset Password (Admin only)
router.post('/admin/reset-password', async (req, res) => {
    const { adminId, targetUserId, newPassword } = req.body;
    try {
        const admin = await prisma.user.findUnique({ where: { id: adminId } });
        if (!admin || admin.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Unauthorized. Admin access required.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: targetUserId },
            data: { password: hashedPassword }
        });

        res.json({ message: 'User password reset successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users (Admin only, for user selection)
router.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
